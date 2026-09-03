import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auditActorContext } from "../common/audit.js";
import { guard } from "../common/auth.js";
import { paginationMeta, paginationSchema } from "../common/pagination.js";
import { CrmLeadService } from "../crm-leads/service.js";
import { crmLeadResponse } from "../crm-leads/response.js";
import {
  contactCreateSchema,
  contactFollowupCreateSchema,
  contactOrderBySchema,
  contactPatchSchema,
  timezoneAwareDateTimeSchema,
} from "./schemas.js";
import { ContactFollowupService, ContactService } from "./service.js";

const contactListQuery = paginationSchema.extend({
  keyword: z.string().trim().max(200).optional(),
  stage: z.enum(["INITIAL", "ONE_TO_ONE", "SOLUTION", "CONVENTION"]).optional(),
  ownerUserId: z.string().trim().min(1).max(32).optional(),
  nextFollowupFrom: timezoneAwareDateTimeSchema.optional(),
  nextFollowupTo: timezoneAwareDateTimeSchema.optional(),
  orderBy: contactOrderBySchema.default("updatedAt_desc"),
}).refine((value) => !value.nextFollowupFrom || !value.nextFollowupTo || value.nextFollowupFrom <= value.nextFollowupTo, {
  path: ["nextFollowupTo"],
  message: "结束时间不能早于开始时间",
});

function contactResponse<T extends { _count: { leads: number } }>(row: T) {
  const { _count, ...contact } = row;
  return { ...contact, relatedLeadCount: _count.leads };
}

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  const contacts = new ContactService(app.prisma);
  const followups = new ContactFollowupService(app.prisma);
  const leads = new CrmLeadService(app.prisma);

  app.get("/api/v1/crm/contacts", { preHandler: guard("crm.contact.view") }, async (request) => {
    const query = contactListQuery.parse(request.query);
    const result = await contacts.list(query);
    return { data: result.rows.map(contactResponse), meta: paginationMeta(query.page, query.pageSize, result.total) };
  });

  app.post("/api/v1/crm/contacts", { preHandler: guard("crm.contact.create") }, async (request, reply) => {
    const body = contactCreateSchema.parse(request.body);
    const row = await contacts.create(body, request.auth!.userId, auditActorContext(request));
    return reply.status(201).send({ data: contactResponse(row) });
  });

  app.get<{ Params: { id: string } }>("/api/v1/crm/contacts/:id", { preHandler: guard("crm.contact.view") }, async (request) => ({
    data: contactResponse(await contacts.detail(request.params.id)),
  }));

  app.patch<{ Params: { id: string } }>("/api/v1/crm/contacts/:id", { preHandler: guard("crm.contact.edit") }, async (request) => {
    const body = contactPatchSchema.parse(request.body);
    return { data: contactResponse(await contacts.update(request.params.id, body, auditActorContext(request))) };
  });

  app.get<{ Params: { id: string } }>("/api/v1/crm/contacts/:id/followups", { preHandler: guard("crm.contact_followup.view") }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const result = await followups.list(request.params.id, query);
    return { data: result.rows, meta: paginationMeta(query.page, query.pageSize, result.total) };
  });

  app.post<{ Params: { id: string } }>("/api/v1/crm/contacts/:id/followups", { preHandler: guard("crm.contact_followup.create") }, async (request, reply) => {
    const body = contactFollowupCreateSchema.parse(request.body);
    const row = await followups.create(request.params.id, body, request.auth!.userId, auditActorContext(request));
    return reply.status(201).send({ data: row });
  });

  app.get<{ Params: { id: string } }>("/api/v1/crm/contacts/:id/leads", {
    preHandler: [guard("crm.contact.view"), guard("crm.lead.view")],
  }, async (request) => {
    await contacts.require(request.params.id);
    const query = paginationSchema.parse(request.query);
    const result = await leads.listForContact(request.params.id, query);
    return { data: result.rows.map(crmLeadResponse), meta: paginationMeta(query.page, query.pageSize, result.total) };
  });
}
