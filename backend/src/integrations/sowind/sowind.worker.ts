import type { FastifyBaseLogger } from "fastify";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "../../common/config.js";
import { SowindGatewayClient } from "./sowind.gateway-client.js";
import { MinuteRateLimiter, retryDecision } from "./sowind.retry-policy.js";
import { redactGatewayResponse } from "./sowind.errors.js";
import type { SowindBrandCode, SowindBusinessPayload } from "./sowind.types.js";
import { appendAuditRecord } from "../../common/audit.js";

export class SowindOutboxWorker {
  private readonly rateLimiter: MinuteRateLimiter;
  private readonly workerId: string;
  private running = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig,
    private readonly client: SowindGatewayClient,
    private readonly log: FastifyBaseLogger,
  ) {
    this.rateLimiter = new MinuteRateLimiter(config.sowindGatewayMaxPerMinute);
    this.workerId = config.workerInstanceId || `worker-${randomUUID().slice(0, 8)}`;
  }

  private async recoverStale(now: Date): Promise<number> {
    const leaseMs = (this.config.outboxLeaseSeconds ?? 60) * 1000;
    const stale = await this.prisma.integrationOutbox.findMany({
      where: {
        status: "PROCESSING",
        OR: [{ leaseUntil: { lte: now } }, { leaseUntil: null, lockedAt: { lte: new Date(now.getTime() - leaseMs) } }],
      },
      select: { id: true, aggregateId: true, brandId: true },
    });
    let recovered = 0;
    for (const event of stale) {
      const result = await this.prisma.integrationOutbox.updateMany({
        where: { id: event.id, status: "PROCESSING", OR: [{ leaseUntil: { lte: now } }, { leaseUntil: null, lockedAt: { lte: new Date(now.getTime() - leaseMs) } }] },
        data: { status: "RETRY_WAITING", nextAttemptAt: now, lockedAt: null, lockOwner: null, leaseUntil: null, lastError: "STALE_PROCESSING_RECOVERED" },
      });
      if (result.count !== 1) continue;
      recovered += 1;
      await this.prisma.lead.updateMany({ where: { id: event.aggregateId, syncStatus: "SYNCING" }, data: { syncStatus: "SYNC_PENDING", lastSyncError: "STALE_PROCESSING_RECOVERED" } });
      await appendAuditRecord(this.prisma, { actorName: "Sowind Gateway Worker", traceId: `worker:${event.id}:recovery`, userAgent: this.workerId }, {
        action: "GATEWAY_STALE_RECOVERED", module: "integration", targetType: "lead", targetId: event.aggregateId, brandId: event.brandId,
        details: { outboxId: event.id, workerId: this.workerId },
      });
    }
    if (recovered) this.log.warn({ workerId: this.workerId, recovered }, "recovered stale outbox leases");
    return recovered;
  }

  async runOnce(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      const now = new Date();
      await this.recoverStale(now);
      const event = await this.prisma.integrationOutbox.findFirst({
        where: { status: { in: ["PENDING", "RETRY_WAITING"] }, nextAttemptAt: { lte: now } },
        orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
        include: { brand: true },
      });
      if (!event) return false;
      if (!this.rateLimiter.tryAcquire()) return false;
      const claimed = await this.prisma.integrationOutbox.updateMany({
        where: { id: event.id, status: { in: ["PENDING", "RETRY_WAITING"] } },
        data: { status: "PROCESSING", lockedAt: now, lockOwner: this.workerId, leaseUntil: new Date(now.getTime() + (this.config.outboxLeaseSeconds ?? 60) * 1000) },
      });
      if (claimed.count !== 1) return false;

      this.log.info({ workerId: this.workerId, outboxId: event.id, leadId: event.aggregateId, brand: event.brand.code }, "outbox delivery started");

      const lead = await this.prisma.lead.findUnique({ where: { id: event.aggregateId } });
      if (!lead) {
        await this.prisma.integrationOutbox.update({ where: { id: event.id }, data: { status: "FAILED", lastError: "Lead not found", lockedAt: null, lockOwner: null, leaseUntil: null } });
        return true;
      }
      await this.prisma.lead.update({ where: { id: lead.id }, data: { syncStatus: "SYNCING" } });
      const attemptNumber = event.attempts + 1;
      const startedAt = new Date();
      const brandCode = event.brand.code as SowindBrandCode;
      const result = await this.client.deliver(brandCode, event.payload as unknown as SowindBusinessPayload);
      const completedAt = new Date();
      const decision = retryDecision(result, attemptNumber, this.config.sowindGatewayMaxAttempts);
      const responseJson = redactGatewayResponse(result.body) as never;
      const requestSnapshot = redactGatewayResponse(event.payload) as never;
      const endpoint = this.client.endpointFor(brandCode);
      const gatewayRef = typeof result.body.ref === "string" ? result.body.ref : null;
      const triggeredBy = attemptNumber === 1 ? event.triggeredBy : "RETRY_JOB";

      await this.prisma.$transaction(async (tx) => {
        await tx.integrationAttempt.create({
          data: {
            outboxId: event.id,
            leadId: lead.id,
            attemptNumber,
            endpoint,
            brandCode,
            httpStatus: result.httpStatus,
            gatewayRef,
            triggeredBy,
            requestSnapshot,
            responseJson,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            startedAt,
            completedAt,
            durationMs: result.durationMs,
          },
        });
        if (result.ok) {
          await tx.integrationOutbox.update({
            where: { id: event.id },
            data: { status: "SUCCEEDED", attempts: attemptNumber, lastHttpStatus: result.httpStatus, lastResponse: responseJson, lastError: null, lockedAt: null, lockOwner: null, leaseUntil: null, processedAt: completedAt },
          });
          await tx.lead.update({
            where: { id: lead.id },
            data: { syncStatus: "GATEWAY_ACCEPTED", gatewayHttpStatus: 202, gatewayRef, retryCount: attemptNumber, lastSyncedAt: completedAt, lastSyncError: null },
          });
          await appendAuditRecord(tx, { actorName: "Sowind Gateway Worker", traceId: `worker:${event.id}:${attemptNumber}`, userAgent: this.workerId }, { action: "GATEWAY_ACCEPTED", module: "integration", targetType: "lead", targetId: lead.id, brandId: lead.brandId, details: { gatewayRef, httpStatus: 202, gatewayStatus: "accepted", triggeredBy, outboxId: event.id } });
          return;
        }

        const outboxStatus = decision.retry ? "RETRY_WAITING" : decision.deadLetter ? "DEAD_LETTER" : "FAILED";
        const leadStatus = decision.retry ? "SYNC_PENDING" : decision.deadLetter ? "DEAD_LETTER" : "SYNC_FAILED";
        const nextAttemptAt = decision.retry ? new Date(completedAt.getTime() + decision.delayMs!) : event.nextAttemptAt;
        await tx.integrationOutbox.update({
          where: { id: event.id },
          data: { status: outboxStatus, attempts: attemptNumber, nextAttemptAt, lastHttpStatus: result.httpStatus, lastResponse: responseJson, lastError: result.errorMessage ?? result.errorCode, lockedAt: null, lockOwner: null, leaseUntil: null, processedAt: decision.retry ? null : completedAt },
        });
        await tx.lead.update({
          where: { id: lead.id },
          data: { syncStatus: leadStatus, gatewayHttpStatus: result.httpStatus, retryCount: attemptNumber, lastSyncError: result.errorMessage ?? result.errorCode },
        });
        await appendAuditRecord(tx, { actorName: "Sowind Gateway Worker", traceId: `worker:${event.id}:${attemptNumber}`, userAgent: this.workerId }, { action: decision.retry ? "GATEWAY_RETRY_SCHEDULED" : decision.deadLetter ? "GATEWAY_DEAD_LETTER" : "GATEWAY_FAILED", module: "integration", targetType: "lead", targetId: lead.id, brandId: lead.brandId, details: { httpStatus: result.httpStatus, errorCode: result.errorCode, attemptNumber, nextRetryAt: decision.retry ? nextAttemptAt.toISOString() : null, triggeredBy, outboxId: event.id } });
      });

      if (result.errorCode === "invalid_gateway_key" || result.permanent || decision.deadLetter) {
        this.log.error({ leadId: lead.id, brand: brandCode, errorCode: result.errorCode }, "Sowind Gateway delivery requires operational attention");
      } else if (result.errorCode === "gateway_paused" && Date.now() - event.createdAt.getTime() > 60 * 60 * 1000) {
        this.log.error({ leadId: lead.id, brand: brandCode, errorCode: result.errorCode }, "Sowind Gateway has remained paused for over one hour");
      }
      this.log.info({ workerId: this.workerId, outboxId: event.id, leadId: lead.id, status: result.ok ? "GATEWAY_ACCEPTED" : decision.deadLetter ? "DEAD_LETTER" : decision.retry ? "RETRY_WAITING" : "SYNC_FAILED", durationMs: result.durationMs }, "outbox delivery completed");
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
