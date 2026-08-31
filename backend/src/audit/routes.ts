import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { guard } from "../common/auth.js";
import { resolveBrand, visibleBrandIds } from "../common/brand.js";
import { paginationMeta, paginationSchema } from "../common/pagination.js";

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/audit-logs", { preHandler: guard("audit.view") }, async (request) => {
    const query = paginationSchema.extend({ brandCode: z.string().optional(), module: z.string().optional(), action: z.string().optional(), actorUserId: z.string().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }).parse(request.query);
    const ids = visibleBrandIds(request);
    const where: Prisma.AuditLogWhereInput = { module: query.module, action: query.action, actorUserId: query.actorUserId, createdAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined };
    if (query.brandCode) where.brandId = (await resolveBrand(app, request, query.brandCode)).id;
    else if (ids) where.OR = [{ brandId: null }, { brandId: { in: ids } }];
    const [total, rows] = await app.prisma.$transaction([
      app.prisma.auditLog.count({ where }),
      app.prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    ]);
    return { data: rows, meta: paginationMeta(query.page, query.pageSize, total) };
  });
}
