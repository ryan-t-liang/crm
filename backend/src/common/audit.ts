import type { Prisma, PrismaClient } from "@prisma/client";
import type { FastifyRequest } from "fastify";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type AuditActorContext = {
  actorUserId?: string | null;
  actorName: string;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  traceId?: string | null;
};

type AuditRecord = {
  action: string;
  module: string;
  targetType: string;
  targetId?: string | null;
  brandId?: string | null;
  details?: Prisma.InputJsonValue;
  actorUserId?: string | null;
  actorName?: string;
};

const sensitiveKey = /(password|passphrase|secret|access.?key|gateway.?key|app.?secret|token|authorization|cookie|auth.?code|hmac|signature)/i;

export function redactAuditDetails(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  const redact = (item: unknown): unknown => {
    if (item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean") return item;
    if (Array.isArray(item)) return item.map(redact);
    if (typeof item === "object") return Object.fromEntries(Object.entries(item as Record<string, unknown>).map(([key, nested]) => [
      key,
      sensitiveKey.test(key) ? "[REDACTED]" : redact(nested),
    ]));
    return String(item);
  };
  return redact(value) as Prisma.InputJsonValue;
}

export async function appendAuditRecord(db: DbClient, context: AuditActorContext, record: AuditRecord): Promise<void> {
  await db.auditLog.create({
    data: {
      actorUserId: record.actorUserId === undefined ? context.actorUserId ?? null : record.actorUserId,
      actorName: record.actorName ?? context.actorName,
      action: record.action,
      module: record.module,
      targetType: record.targetType,
      targetId: record.targetId ?? null,
      brandId: record.brandId ?? null,
      details: redactAuditDetails(record.details),
      ipAddress: context.ipAddress ?? null,
      requestId: context.requestId ?? null,
      userAgent: context.userAgent ?? null,
      traceId: context.traceId ?? context.requestId ?? null,
    },
  });
}

export async function appendAudit(
  db: DbClient,
  request: FastifyRequest,
  record: AuditRecord,
): Promise<void> {
  await appendAuditRecord(db, {
    actorUserId: request.auth?.userId ?? null,
    actorName: request.auth?.name ?? "Integration Client",
    ipAddress: request.ip,
    requestId: request.id,
    userAgent: request.headers["user-agent"]?.slice(0, 500) ?? null,
    traceId: request.id,
  }, record);
}
