import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auditActorContext } from "../common/audit.js";
import { guard } from "../common/auth.js";
import { paginationMeta, paginationSchema } from "../common/pagination.js";
import { ApiError } from "../common/errors.js";
import { timezoneAwareDateTimeSchema } from "../contacts/schemas.js";
import { contentDispositionFilename, CrmAttachmentService } from "./attachments.js";
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
  const attachments = new CrmAttachmentService(app.prisma, app.config.storageDir, app.config.maxAttachmentBytes);

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

  app.delete<{ Params: { id: string } }>("/api/v1/crm/leads/:id", { preHandler: guard("crm.lead.delete") }, async (request) => {
    const result = await leads.remove(request.params.id, auditActorContext(request));
    return { data: { id: result.id } };
  });

  app.post<{ Params: { id: string; fieldKey: string } }>("/api/v1/crm/leads/:id/attachments/:fieldKey", { preHandler: guard("crm.lead.edit") }, async (request, reply) => {
    const upload = await request.file();
    const row = await attachments.create("LEAD", request.params.id, request.params.fieldKey, upload, request.auth!.userId, auditActorContext(request));
    return reply.status(201).send({ data: row });
  });

  app.get<{ Params: { id: string; attachmentId: string } }>("/api/v1/crm/leads/:id/attachments/:attachmentId/download", { preHandler: guard("crm.lead.view") }, async (request, reply) => {
    const result = await attachments.findForDownload("LEAD", request.params.id, request.params.attachmentId, auditActorContext(request));
    if (result.externalUrl) return reply.redirect(result.externalUrl);
    reply.type(result.row.mimeType || "application/octet-stream");
    reply.header("content-disposition", contentDispositionFilename(result.row.originalName));
    if (result.row.fileSize !== null) reply.header("content-length", result.row.fileSize);
    return reply.send(result.stream);
  });

  app.delete<{ Params: { id: string; attachmentId: string } }>("/api/v1/crm/leads/:id/attachments/:attachmentId", { preHandler: guard("crm.lead.edit") }, async (request) => ({
    data: await attachments.remove("LEAD", request.params.id, request.params.attachmentId, auditActorContext(request)),
  }));

  app.get<{ Params: { id: string } }>("/api/v1/crm/leads/:id/followups", { preHandler: guard("crm.lead_followup.view") }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const result = await followups.list(request.params.id, query);
    return { data: result.rows, meta: paginationMeta(query.page, query.pageSize, result.total) };
  });

  app.post<{ Params: { id: string } }>("/api/v1/crm/leads/:id/followups", { preHandler: [guard("crm.lead_followup.create"), guard("crm.task.create")] }, async (request, reply) => {
    const body = leadFollowupCreateSchema.parse(request.body);
    const row = await followups.create(request.params.id, body, request.auth!.userId, auditActorContext(request));
    return reply.status(201).send({ data: row });
  });

  const requireLeadFollowup = async (leadId: string, followupId: string, allowDeletedLeadHistory = false) => {
    const row = await app.prisma.leadFollowup.findFirst({ where: { id: followupId, leadId, lead: allowDeletedLeadHistory ? { contact: { deletedAt: null } } : { deletedAt: null, contact: { deletedAt: null } } }, select: { id: true } });
    if (!row) throw new ApiError(404, "RESOURCE_NOT_FOUND", "线索跟进不存在");
  };

  app.post<{ Params: { id: string; followupId: string; fieldKey: string } }>("/api/v1/crm/leads/:id/followups/:followupId/attachments/:fieldKey", { preHandler: guard("crm.lead_followup.create") }, async (request, reply) => {
    await requireLeadFollowup(request.params.id, request.params.followupId);
    const upload = await request.file();
    const row = await attachments.create("LEAD_FOLLOWUP", request.params.followupId, request.params.fieldKey, upload, request.auth!.userId, auditActorContext(request));
    return reply.status(201).send({ data: row });
  });

  app.get<{ Params: { id: string; followupId: string; attachmentId: string } }>("/api/v1/crm/leads/:id/followups/:followupId/attachments/:attachmentId/download", { preHandler: guard("crm.lead_followup.view") }, async (request, reply) => {
    await requireLeadFollowup(request.params.id, request.params.followupId, true);
    const result = await attachments.findForDownload("LEAD_FOLLOWUP", request.params.followupId, request.params.attachmentId, auditActorContext(request));
    if (result.externalUrl) return reply.redirect(result.externalUrl);
    reply.type(result.row.mimeType || "application/octet-stream").header("content-disposition", contentDispositionFilename(result.row.originalName));
    if (result.row.fileSize !== null) reply.header("content-length", result.row.fileSize);
    return reply.send(result.stream);
  });

  app.delete<{ Params: { id: string; followupId: string; attachmentId: string } }>("/api/v1/crm/leads/:id/followups/:followupId/attachments/:attachmentId", { preHandler: guard("crm.lead_followup.create") }, async (request) => {
    await requireLeadFollowup(request.params.id, request.params.followupId);
    return { data: await attachments.remove("LEAD_FOLLOWUP", request.params.followupId, request.params.attachmentId, auditActorContext(request)) };
  });
}
