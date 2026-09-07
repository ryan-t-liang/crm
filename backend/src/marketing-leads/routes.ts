import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { auditActorContext } from "../common/audit.js";
import { guard } from "../common/auth.js";
import { ApiError } from "../common/errors.js";
import { paginationMeta, paginationSchema } from "../common/pagination.js";
import {
  marketingLeadActivityCreateSchema,
  marketingLeadConversionSchema,
  marketingLeadCreateSchema,
  marketingLeadOrderBySchema,
  marketingLeadPatchSchema,
  marketingLeadSourceSchema,
  marketingLeadStatusSchema,
  marketingLeadTransitionSchema,
  scoringRuleCreateSchema,
  scoringRulePatchSchema,
} from "./schemas.js";
import { LeadScoringRuleService, MarketingLeadService } from "./service.js";
import { MarketingAnalyticsService } from "./analytics.js";

const listQuery = paginationSchema.extend({
  keyword: z.string().trim().max(200).optional(),
  status: marketingLeadStatusSchema.optional(),
  source: marketingLeadSourceSchema.optional(),
  ownerUserId: z.string().trim().min(1).max(32).optional(),
  fitLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  engagementLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  orderBy: marketingLeadOrderBySchema.default("createdAt_desc"),
});

const duplicateQuery = z.object({
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(64).optional(),
  whatsapp: z.string().trim().max(64).optional(),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  excludeId: z.string().trim().max(32).optional(),
});

const scoreRuleQuery = z.object({ includeDisabled: z.coerce.boolean().default(false) });
const analyticsQuery = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  ownerUserId: z.string().trim().max(32).optional(),
  source: marketingLeadSourceSchema.optional(),
}).refine((value) => !value.from || !value.to || new Date(value.from) <= new Date(value.to), { path: ["to"], message: "结束时间不能早于开始时间" });

function salesScope(request: FastifyRequest): string | undefined {
  return request.auth!.roleKey === "SALES" ? request.auth!.userId : undefined;
}

function requirePermission(request: FastifyRequest, permission: string) {
  if (!request.auth!.permissions.has(permission)) throw new ApiError(403, "PERMISSION_DENIED", "当前账户没有此操作权限");
}

function marketingAnalyticsFilter(request: FastifyRequest) {
  const query = analyticsQuery.parse(request.query);
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 86_400_000);
  return { from, to, ownerUserId: salesScope(request) ?? query.ownerUserId, source: query.source };
}

export async function marketingLeadRoutes(app: FastifyInstance): Promise<void> {
  const leads = new MarketingLeadService(app.prisma, app.config);
  const rules = new LeadScoringRuleService(app.prisma);
  const analytics = new MarketingAnalyticsService(app.prisma, app.config);

  app.get("/api/v1/crm/marketing-leads", { preHandler: guard("crm.marketing_lead.view") }, async (request) => {
    const query = listQuery.parse(request.query);
    const result = await leads.list({ ...query, scopeUserId: salesScope(request) });
    return { data: result.rows, meta: paginationMeta(query.page, query.pageSize, result.total) };
  });

  app.get("/api/v1/crm/marketing-leads/duplicate-candidates", { preHandler: guard("crm.marketing_lead.view") }, async (request) => ({
    data: await leads.duplicateCandidates(duplicateQuery.parse(request.query)),
  }));

  app.post("/api/v1/crm/marketing-leads", { preHandler: guard("crm.marketing_lead.create") }, async (request, reply) => {
    const body = marketingLeadCreateSchema.parse(request.body);
    const input = request.auth!.roleKey === "SALES" && !body.ownerUserId ? { ...body, ownerUserId: request.auth!.userId } : body;
    const row = await leads.create(input, request.auth!.userId, auditActorContext(request));
    return reply.status(201).send({ data: row });
  });

  app.get<{ Params: { id: string } }>("/api/v1/crm/marketing-leads/:id", { preHandler: guard("crm.marketing_lead.view") }, async (request) => ({
    data: await leads.detail(request.params.id, salesScope(request)),
  }));

  app.patch<{ Params: { id: string } }>("/api/v1/crm/marketing-leads/:id", { preHandler: guard("crm.marketing_lead.edit") }, async (request) => {
    const body = marketingLeadPatchSchema.parse(request.body);
    if (body.ownerUserId !== undefined) requirePermission(request, "crm.marketing_lead.assign");
    return { data: await leads.update(request.params.id, body, request.auth!.userId, auditActorContext(request), { scopeUserId: salesScope(request), superAdmin: request.auth!.roleKey === "SUPER_ADMIN" }) };
  });

  app.delete<{ Params: { id: string } }>("/api/v1/crm/marketing-leads/:id", { preHandler: guard("crm.marketing_lead.delete") }, async (request) => ({
    data: await leads.remove(request.params.id, request.auth!.userId, auditActorContext(request), { scopeUserId: salesScope(request), superAdmin: request.auth!.roleKey === "SUPER_ADMIN" }),
  }));

  app.post<{ Params: { id: string } }>("/api/v1/crm/marketing-leads/:id/activities", { preHandler: guard("crm.marketing.activity.create") }, async (request, reply) => {
    const body = marketingLeadActivityCreateSchema.parse(request.body);
    const result = await leads.addActivity(request.params.id, body, request.auth!.userId, auditActorContext(request), salesScope(request));
    return reply.status(201).send({ data: result });
  });

  app.post<{ Params: { id: string } }>("/api/v1/crm/marketing-leads/:id/transition", { preHandler: guard("crm.marketing_lead.qualify") }, async (request) => {
    const body = marketingLeadTransitionSchema.parse(request.body);
    return { data: await leads.transition(request.params.id, body, request.auth!.userId, auditActorContext(request), salesScope(request)) };
  });

  app.get<{ Params: { id: string } }>("/api/v1/crm/marketing-leads/:id/conversion-preview", { preHandler: [guard("crm.marketing_lead.view"), guard("crm.marketing_lead.convert")] }, async (request) => ({
    data: await leads.conversionPreview(request.params.id, salesScope(request)),
  }));

  app.post<{ Params: { id: string } }>("/api/v1/crm/marketing-leads/:id/convert", { preHandler: guard("crm.marketing_lead.convert") }, async (request) => {
    const body = marketingLeadConversionSchema.parse(request.body);
    requirePermission(request, "crm.lead.create");
    requirePermission(request, "crm.contact.view");
    if (body.contact.mode === "create") requirePermission(request, "crm.contact.create");
    if (body.organization.mode === "existing") requirePermission(request, "crm.organization.view");
    if (body.organization.mode === "create") requirePermission(request, "crm.organization.create");
    if (body.overrideQualification && request.auth!.roleKey !== "SUPER_ADMIN") throw new ApiError(403, "QUALIFICATION_OVERRIDE_FORBIDDEN", "只有超级管理员可以越过资格状态转换");
    return { data: await leads.convert(request.params.id, body, request.auth!.userId, auditActorContext(request), { scopeUserId: salesScope(request), superAdmin: request.auth!.roleKey === "SUPER_ADMIN" }) };
  });

  app.get("/api/v1/crm/marketing/scoring-rules", { preHandler: guard("crm.marketing.score_rule.view") }, async (request) => {
    const query = scoreRuleQuery.parse(request.query);
    if (query.includeDisabled) requirePermission(request, "crm.marketing.score_rule.manage");
    return { data: await rules.list(query.includeDisabled) };
  });

  app.post("/api/v1/crm/marketing/scoring-rules", { preHandler: guard("crm.marketing.score_rule.manage") }, async (request, reply) => {
    const body = scoringRuleCreateSchema.parse(request.body);
    return reply.status(201).send({ data: await rules.create(body, auditActorContext(request)) });
  });

  app.patch<{ Params: { id: string } }>("/api/v1/crm/marketing/scoring-rules/:id", { preHandler: guard("crm.marketing.score_rule.manage") }, async (request) => {
    const body = scoringRulePatchSchema.parse(request.body);
    return { data: await rules.update(request.params.id, body, auditActorContext(request)) };
  });

  app.get("/api/v1/crm/marketing/analytics/funnel", { preHandler: guard("crm.marketing.analytics.view") }, async (request) => ({ data: await analytics.funnel(marketingAnalyticsFilter(request)) }));
  app.get("/api/v1/crm/marketing/analytics/scoring", { preHandler: guard("crm.marketing.analytics.view") }, async (request) => ({ data: await analytics.scoring(marketingAnalyticsFilter(request)) }));
  app.get("/api/v1/crm/marketing/analytics/sources", { preHandler: guard("crm.marketing.analytics.view") }, async (request) => ({ data: await analytics.sources(marketingAnalyticsFilter(request)) }));
}
