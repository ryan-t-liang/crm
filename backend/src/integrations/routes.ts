import { createHash, createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../common/errors.js";
import { safeEqual } from "../common/auth.js";
import { createCanonicalLead } from "../leads/service.js";
import { leadInputSchema } from "../leads/routes.js";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function integrationRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/integration/v1/leads", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    if (!app.config.integrationClientId || !app.config.integrationClientSecret) throw new ApiError(503, "INTEGRATION_DISABLED", "外部线索接入尚未配置");
    const clientId = String(request.headers["x-client-id"] ?? "");
    const timestamp = String(request.headers["x-timestamp"] ?? "");
    const nonce = String(request.headers["x-nonce"] ?? "");
    const signature = String(request.headers["x-signature"] ?? "");
    if (clientId !== app.config.integrationClientId || !timestamp || !nonce || !signature) throw new ApiError(401, "INVALID_SIGNATURE", "集成身份校验失败");
    const issuedAt = Number(timestamp);
    if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > 5 * 60 * 1000) throw new ApiError(401, "EXPIRED_SIGNATURE", "请求时间戳已失效");
    const bodyHash = createHash("sha256").update(canonicalJson(request.body)).digest("hex");
    const expected = createHmac("sha256", app.config.integrationClientSecret).update(`${timestamp}.${nonce}.${bodyHash}`).digest("hex");
    if (!safeEqual(signature, expected)) throw new ApiError(401, "INVALID_SIGNATURE", "集成身份校验失败");
    const body = leadInputSchema.parse({ ...(request.body as object), submissionMode: "EXTERNAL_API", source: (request.body as { source?: string }).source || "WECHAT_MINIPROGRAM" });
    const result = await app.prisma.$transaction(async (tx) => {
      try {
        await tx.integrationNonce.create({ data: { clientId, nonce, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
      } catch {
        throw new ApiError(409, "REPLAY_DETECTED", "重复 nonce 已被拒绝");
      }
      const created = await createCanonicalLead(tx, app.config, { ...body, idempotencyKey: request.headers["idempotency-key"]?.toString() || body.idempotencyKey, createdByService: clientId, originalSnapshot: request.body as Record<string, unknown> });
      if (!created.duplicate) await tx.auditLog.create({ data: { actorName: clientId, action: "INTEGRATION_LEAD_ACCEPTED", module: "integration", targetType: "lead", targetId: created.lead.id, brandId: created.lead.brandId, requestId: request.id, ipAddress: request.ip, details: { localAccepted: true, gatewayDirectCall: false } } });
      return created;
    });
    return reply.status(result.duplicate ? 200 : 202).send({ data: { id: result.lead.id, leadNo: result.lead.leadNo, syncStatus: result.lead.syncStatus }, meta: { duplicate: result.duplicate } });
  });
}
