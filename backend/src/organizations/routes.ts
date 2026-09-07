import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auditActorContext } from "../common/audit.js";
import { guard } from "../common/auth.js";
import { ApiError } from "../common/errors.js";
import { paginationMeta, paginationSchema } from "../common/pagination.js";
import { contentDispositionFilename, CrmAttachmentService } from "../crm-leads/attachments.js";
import { nurtureCreateSchema, nurturePatchSchema, organizationCreateSchema, organizationLifecycleSchema, organizationPatchSchema, organizationRoleSchema } from "./schemas.js";
import { OrganizationNurtureService, OrganizationService } from "./service.js";
import { CITIES, COUNTRIES, INDUSTRY_TAXONOMY, REGIONS } from "./reference-data.js";

const listQuerySchema = paginationSchema.extend({
  view: z.enum(["all", "mine", "priority", "opportunity", "customer", "reactivation", "dormant"]).default("all"),
  keyword: z.string().trim().max(200).optional(),
  role: organizationRoleSchema.optional(),
  lifecycleStage: organizationLifecycleSchema.optional(),
  ownerUserId: z.string().trim().min(1).max(32).optional(),
  industry: z.string().trim().max(160).optional(),
  fitLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  engagementLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  engagementState: z.enum(["ACTIVE", "COOLING", "DORMANT"]).optional(),
});

const duplicateQuerySchema = z.object({
  name: z.string().trim().min(1).max(240),
  website: z.string().trim().max(500).optional(),
}).strict();
const batchAssignSchema = z.object({ ids: z.array(z.string().trim().min(1).max(32)).min(1).max(500), ownerUserId: z.string().trim().min(1).max(32) }).strict();

function requireAdditionalPermission(appPermission: string, permissions: Set<string>): void {
  if (!permissions.has(appPermission)) throw new ApiError(403, "PERMISSION_DENIED", "当前账户没有此操作权限");
}

export async function organizationRoutes(app: FastifyInstance): Promise<void> {
  const organizations = new OrganizationService(app.prisma, app.config);
  const nurtures = new OrganizationNurtureService(app.prisma);
  const attachments = new CrmAttachmentService(app.prisma, app.config.storageDir, app.config.maxAttachmentBytes);

  app.get("/api/v1/crm/reference-data/company", { preHandler: guard() }, async () => ({
    data: { industries: INDUSTRY_TAXONOMY, countries: COUNTRIES, regions: REGIONS, cities: CITIES },
  }));

  app.get("/api/v1/crm/organizations", { preHandler: guard("crm.organization.view") }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const result = await organizations.list({ ...query, currentUserId: request.auth!.userId });
    return { data: result.rows, meta: paginationMeta(query.page, query.pageSize, result.total) };
  });

  app.get("/api/v1/crm/organizations/duplicate-candidates", { preHandler: guard("crm.organization.view") }, async (request) => {
    const query = duplicateQuerySchema.parse(request.query);
    return { data: await organizations.duplicateCandidates(query.name, query.website) };
  });

  app.post("/api/v1/crm/organizations", { preHandler: guard("crm.organization.create") }, async (request, reply) => {
    const body = organizationCreateSchema.parse(request.body);
    const row = await organizations.create(body, request.auth!.userId, auditActorContext(request));
    return reply.status(201).send({ data: row });
  });

  app.post("/api/v1/crm/organizations/batch-assign", { preHandler: guard("crm.organization.edit") }, async (request) => {
    const body = batchAssignSchema.parse(request.body);
    return { data: await organizations.batchAssign([...new Set(body.ids)], body.ownerUserId, auditActorContext(request)) };
  });

  app.get<{ Params: { id: string } }>("/api/v1/crm/organizations/:id", { preHandler: guard("crm.organization.view") }, async (request) => ({
    data: await organizations.detail(request.params.id),
  }));

  app.patch<{ Params: { id: string } }>("/api/v1/crm/organizations/:id", { preHandler: guard("crm.organization.edit") }, async (request) => {
    const body = organizationPatchSchema.parse(request.body);
    if (body.fitScore !== undefined || body.fitReason !== undefined) requireAdditionalPermission("crm.organization.score.edit", request.auth!.permissions);
    return { data: await organizations.update(request.params.id, body, auditActorContext(request)) };
  });

  app.delete<{ Params: { id: string } }>("/api/v1/crm/organizations/:id", { preHandler: guard("crm.organization.delete") }, async (request) => ({
    data: await organizations.remove(request.params.id, auditActorContext(request)),
  }));

  app.get<{ Params: { id: string } }>("/api/v1/crm/organizations/:id/journey", { preHandler: guard("crm.organization.view") }, async (request) => ({
    data: await organizations.journey(request.params.id),
  }));

  app.get("/api/v1/crm/nurtures", { preHandler: guard("crm.organization.view") }, async (request) => {
    const query = z.object({ organizationId: z.string().max(32).optional(), ownerUserId: z.string().max(32).optional(), status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]).optional() }).parse(request.query);
    return { data: await nurtures.list(query.organizationId, query.ownerUserId, query.status) };
  });

  app.post<{ Params: { id: string } }>("/api/v1/crm/organizations/:id/nurtures", { preHandler: guard("crm.organization.nurture.manage") }, async (request, reply) => {
    const body = nurtureCreateSchema.parse(request.body);
    return reply.status(201).send({ data: await nurtures.create(request.params.id, body, request.auth!.userId, auditActorContext(request)) });
  });

  app.patch<{ Params: { id: string } }>("/api/v1/crm/nurtures/:id", { preHandler: guard("crm.organization.nurture.manage") }, async (request) => {
    const body = nurturePatchSchema.parse(request.body);
    return { data: await nurtures.update(request.params.id, body, auditActorContext(request)) };
  });

  app.post<{ Params: { id: string; fieldKey: string } }>("/api/v1/crm/organizations/:id/attachments/:fieldKey", { preHandler: guard("crm.organization.edit") }, async (request, reply) => {
    const upload = await request.file();
    const row = await attachments.create("ORGANIZATION", request.params.id, request.params.fieldKey, upload, request.auth!.userId, auditActorContext(request));
    if (request.params.fieldKey === "logo") {
      const all = await attachments.list("ORGANIZATION", request.params.id);
      await Promise.all(all.filter((item) => item.fieldKey === "logo" && item.id !== row.id).map((item) => attachments.remove("ORGANIZATION", request.params.id, item.id, auditActorContext(request))));
    }
    return reply.status(201).send({ data: row });
  });

  app.get<{ Params: { id: string; attachmentId: string } }>("/api/v1/crm/organizations/:id/attachments/:attachmentId/download", { preHandler: guard("crm.organization.view") }, async (request, reply) => {
    const result = await attachments.findForDownload("ORGANIZATION", request.params.id, request.params.attachmentId, auditActorContext(request));
    if (result.externalUrl) return reply.redirect(result.externalUrl);
    reply.type(result.row.mimeType || "application/octet-stream").header("content-disposition", contentDispositionFilename(result.row.originalName));
    if (result.row.fileSize !== null) reply.header("content-length", result.row.fileSize);
    return reply.send(result.stream);
  });

  app.delete<{ Params: { id: string; attachmentId: string } }>("/api/v1/crm/organizations/:id/attachments/:attachmentId", { preHandler: guard("crm.organization.edit") }, async (request) => ({
    data: await attachments.remove("ORGANIZATION", request.params.id, request.params.attachmentId, auditActorContext(request)),
  }));
}
