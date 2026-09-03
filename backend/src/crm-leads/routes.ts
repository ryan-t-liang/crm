import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auditActorContext } from "../common/audit.js";
import { guard } from "../common/auth.js";
import { paginationMeta, paginationSchema } from "../common/pagination.js";
import { timezoneAwareDateTimeSchema } from "../contacts/schemas.js";
import { crmLeadResponse } from "./response.js";
import { crmLeadCreateSchema, crmLeadOrderBySchema, crmLeadPatchSchema, leadFollowupCreateSchema } from "./schemas.js";
import { CrmLeadService, LeadFollowupService } from "./service.js";

const leadListQuery = paginationSchema.extend({
  keyword: z.string().trim().max(200).optional(),
  contactId: z.string().trim().min(1).max(32).optional(),
  status: z.enum(["NEW", "QUALIFIED", "SOLUTION", "QUOTATION", "WON", "LOST"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  salesOwnerUserId: z.string().trim().min(1).max(32).optional(),
  followupOwnerUserId: z.string().trim().min(1).max(32).optional(),
  nextFollowupFrom: timezoneAwareDateTimeSchema.optional(),
  nextFollowupTo: timezoneAwareDateTimeSchema.optional(),
  orderBy: crmLeadOrderBySchema.default("updatedAt_desc"),
}).refine((value) => !value.nextFollowupFrom || !value.nextFollowupTo || value.nextFollowupFrom <= value.nextFollowupTo, {
  path: ["nextFollowupTo"],
  message: "结束时间不能早于开始时间",
});

export async function crmLeadRoutes(app: FastifyInstance): Promise<void> {
  const leads = new CrmLeadService(app.prisma);
  const followups = new LeadFollowupService(app.prisma);

  app.get("/api/v1/crm/leads", { preHandler: guard("crm.lead.view") }, async (request) => {
    const query = leadListQuery.parse(request.query);
    const result = await leads.list(query);
    return { data: result.rows.map(crmLeadResponse), meta: paginationMeta(query.page, query.pageSize, result.total) };
  });

  app.post("/api/v1/crm/leads", {
    preHandler: [guard("crm.contact.view"), guard("crm.lead.create")],
  }, async (request, reply) => {
    const body = crmLeadCreateSchema.parse(request.body);
    const row = await leads.create(body, request.auth!.userId, auditActorContext(request));
    return reply.status(201).send({ data: crmLeadResponse(row) });
  });

  app.get<{ Params: { id: string } }>("/api/v1/crm/leads/:id", { preHandler: guard("crm.lead.view") }, async (request) => ({
    data: crmLeadResponse(await leads.detail(request.params.id)),
  }));

  app.patch<{ Params: { id: string } }>("/api/v1/crm/leads/:id", { preHandler: guard("crm.lead.edit") }, async (request) => {
    const body = crmLeadPatchSchema.parse(request.body);
    return { data: crmLeadResponse(await leads.update(request.params.id, body, auditActorContext(request))) };
  });

  app.get<{ Params: { id: string } }>("/api/v1/crm/leads/:id/followups", { preHandler: guard("crm.lead_followup.view") }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const result = await followups.list(request.params.id, query);
    return { data: result.rows, meta: paginationMeta(query.page, query.pageSize, result.total) };
  });

  app.post<{ Params: { id: string } }>("/api/v1/crm/leads/:id/followups", { preHandler: guard("crm.lead_followup.create") }, async (request, reply) => {
    const body = leadFollowupCreateSchema.parse(request.body);
    const row = await followups.create(request.params.id, body, request.auth!.userId, auditActorContext(request));
    return reply.status(201).send({ data: row });
  });
}
