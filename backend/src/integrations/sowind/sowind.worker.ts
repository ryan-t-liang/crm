import type { FastifyBaseLogger } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "../../common/config.js";
import { SowindGatewayClient } from "./sowind.gateway-client.js";
import { MinuteRateLimiter, retryDecision } from "./sowind.retry-policy.js";
import { redactGatewayResponse } from "./sowind.errors.js";
import type { SowindBrandCode, SowindBusinessPayload } from "./sowind.types.js";

export class SowindOutboxWorker {
  private readonly rateLimiter: MinuteRateLimiter;
  private running = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig,
    private readonly client: SowindGatewayClient,
    private readonly log: FastifyBaseLogger,
  ) {
    this.rateLimiter = new MinuteRateLimiter(config.sowindGatewayMaxPerMinute);
  }

  async runOnce(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      const now = new Date();
      const event = await this.prisma.integrationOutbox.findFirst({
        where: { status: { in: ["PENDING", "RETRY_WAITING"] }, nextAttemptAt: { lte: now } },
        orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
        include: { brand: true },
      });
      if (!event) return false;
      if (!this.rateLimiter.tryAcquire()) return false;
      const claimed = await this.prisma.integrationOutbox.updateMany({
        where: { id: event.id, status: { in: ["PENDING", "RETRY_WAITING"] } },
        data: { status: "PROCESSING", lockedAt: now },
      });
      if (claimed.count !== 1) return false;

      const lead = await this.prisma.lead.findUnique({ where: { id: event.aggregateId } });
      if (!lead) {
        await this.prisma.integrationOutbox.update({ where: { id: event.id }, data: { status: "FAILED", lastError: "Lead not found", lockedAt: null } });
        return true;
      }
      const attemptNumber = event.attempts + 1;
      const startedAt = new Date();
      const brandCode = event.brand.code as SowindBrandCode;
      const result = await this.client.deliver(brandCode, event.payload as unknown as SowindBusinessPayload);
      const completedAt = new Date();
      const decision = retryDecision(result, attemptNumber, this.config.sowindGatewayMaxAttempts);
      const responseJson = redactGatewayResponse(result.body) as never;
      const endpoint = this.client.endpointFor(brandCode);

      await this.prisma.$transaction(async (tx) => {
        await tx.integrationAttempt.create({
          data: {
            outboxId: event.id,
            leadId: lead.id,
            attemptNumber,
            endpoint,
            brandCode,
            httpStatus: result.httpStatus,
            responseJson,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            startedAt,
            completedAt,
            durationMs: result.durationMs,
          },
        });
        if (result.ok) {
          const gatewayRef = typeof result.body.ref === "string" ? result.body.ref : null;
          await tx.integrationOutbox.update({
            where: { id: event.id },
            data: { status: "SUCCEEDED", attempts: attemptNumber, lastHttpStatus: result.httpStatus, lastResponse: responseJson, lastError: null, lockedAt: null, processedAt: completedAt },
          });
          await tx.lead.update({
            where: { id: lead.id },
            data: { syncStatus: "GATEWAY_QUEUED", gatewayHttpStatus: 202, gatewayRef, retryCount: attemptNumber, lastSyncedAt: completedAt, lastSyncError: null },
          });
          await tx.auditLog.create({ data: { actorName: "Sowind Gateway Worker", action: "GATEWAY_ACCEPTED", module: "integration", targetType: "lead", targetId: lead.id, brandId: lead.brandId, details: { gatewayRef, httpStatus: 202, gatewayStatus: "queued" } } });
          return;
        }

        const leadStatus = result.errorCode === "invalid_gateway_key"
          ? "FAILED_AUTH"
          : result.permanent
            ? "FAILED_PERMANENT"
            : ["invalid_payload", "brand_mismatch", "consent_missing"].includes(result.errorCode ?? "")
              ? "FAILED_VALIDATION"
              : "FAILED";
        const outboxStatus = decision.retry ? "RETRY_WAITING" : decision.deadLetter ? "DEAD_LETTER" : "FAILED";
        const nextAttemptAt = decision.retry ? new Date(completedAt.getTime() + decision.delayMs!) : event.nextAttemptAt;
        await tx.integrationOutbox.update({
          where: { id: event.id },
          data: { status: outboxStatus, attempts: attemptNumber, nextAttemptAt, lastHttpStatus: result.httpStatus, lastResponse: responseJson, lastError: result.errorMessage ?? result.errorCode, lockedAt: null, processedAt: decision.retry ? null : completedAt },
        });
        await tx.lead.update({
          where: { id: lead.id },
          data: { syncStatus: decision.retry ? "PENDING" : leadStatus, gatewayHttpStatus: result.httpStatus, retryCount: attemptNumber, lastSyncError: result.errorMessage ?? result.errorCode },
        });
        await tx.auditLog.create({ data: { actorName: "Sowind Gateway Worker", action: decision.retry ? "GATEWAY_RETRY_SCHEDULED" : "GATEWAY_FAILED", module: "integration", targetType: "lead", targetId: lead.id, brandId: lead.brandId, details: { httpStatus: result.httpStatus, errorCode: result.errorCode, attemptNumber, nextRetryAt: decision.retry ? nextAttemptAt.toISOString() : null } } });
      });

      if (result.errorCode === "invalid_gateway_key" || result.permanent || decision.deadLetter) {
        this.log.error({ leadId: lead.id, brand: brandCode, errorCode: result.errorCode }, "Sowind Gateway delivery requires operational attention");
      } else if (result.errorCode === "gateway_paused" && Date.now() - event.createdAt.getTime() > 60 * 60 * 1000) {
        this.log.error({ leadId: lead.id, brand: brandCode, errorCode: result.errorCode }, "Sowind Gateway has remained paused for over one hour");
      }
      return true;
    } finally {
      this.running = false;
    }
  }
}

export function startSowindWorker(worker: SowindOutboxWorker, intervalMs: number): () => void {
  const timer = setInterval(() => { void worker.runOnce(); }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
