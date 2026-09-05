import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { guard } from "../common/auth.js";
import { ApiError } from "../common/errors.js";
import { CrmAnalyticsService } from "./service.js";

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  ownerUserId: z.string().trim().max(32).optional(),
  organizationRole: z.enum(["PROSPECT", "CUSTOMER", "VENDOR", "PARTNER"]).optional(),
}).refine((value) => !value.from || !value.to || new Date(value.from) <= new Date(value.to), { path: ["to"], message: "结束时间不能早于开始时间" });

function filter(request: FastifyRequest, forceSelf = false) {
  const query = querySchema.parse(request.query);
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 86_400_000);
  return { from, to, ownerUserId: forceSelf ? request.auth!.userId : query.ownerUserId, organizationRole: query.organizationRole };
}

function requireAnyDashboardPermission(request: FastifyRequest) {
  if (!request.auth!.permissions.has("crm.dashboard.management.view") && !request.auth!.permissions.has("crm.dashboard.self.view")) {
    throw new ApiError(403, "PERMISSION_DENIED", "当前账户没有 Dashboard 权限");
  }
}

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  const analytics = new CrmAnalyticsService(app.prisma, app.config);

  app.get("/api/v1/crm/analytics/management", { preHandler: guard("crm.dashboard.management.view") }, async (request) => ({ data: await analytics.management(filter(request)) }));
  app.get("/api/v1/crm/analytics/self", { preHandler: guard("crm.dashboard.self.view") }, async (request) => ({ data: await analytics.management(filter(request, true)) }));
  app.get("/api/v1/crm/analytics/fit-engagement-matrix", { preHandler: guard() }, async (request) => {
    requireAnyDashboardPermission(request);
    return { data: await analytics.matrix(filter(request, !request.auth!.permissions.has("crm.dashboard.management.view"))) };
  });
  app.get("/api/v1/crm/analytics/team", { preHandler: guard("crm.dashboard.management.view") }, async (request) => ({ data: await analytics.team(filter(request)) }));
}
