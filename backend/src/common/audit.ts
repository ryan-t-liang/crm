import type { Prisma, PrismaClient } from "@prisma/client";
import type { FastifyRequest } from "fastify";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function appendAudit(
  db: DbClient,
  request: FastifyRequest,
  record: {
    action: string;
    module: string;
    targetType: string;
    targetId?: string | null;
    brandId?: string | null;
    details?: Prisma.InputJsonValue;
    actorUserId?: string | null;
    actorName?: string;
  },
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorUserId: record.actorUserId === undefined ? request.auth?.userId ?? null : record.actorUserId,
      actorName: record.actorName ?? request.auth?.name ?? "Integration Client",
      action: record.action,
      module: record.module,
      targetType: record.targetType,
      targetId: record.targetId ?? null,
      brandId: record.brandId ?? null,
      details: record.details,
      ipAddress: request.ip,
      requestId: request.id,
    },
  });
}
