import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendAudit } from "../common/audit.js";
import { guard } from "../common/auth.js";
import { resolveBrand, visibleBrandIds } from "../common/brand.js";
import { ApiError } from "../common/errors.js";
import { paginationMeta, paginationSchema } from "../common/pagination.js";
import { enqueueLeadForSowind, reactivateLeadOutbox } from "../integrations/sowind/sowind.outbox.js";
import { createCanonicalLead, dbLeadToSowindInput } from "./service.js";

export const leadInputSchema = z.object({
  brandCode: z.enum(["GP", "UN"]), customerId: z.string().trim().nullable().optional(),
  leadType: z.string().trim().max(80).default("PURCHASE_INTENT"), source: z.string().trim().max(80).default("ADMIN_MANUAL"),
  submissionMode: z.enum(["USER_SUBMITTED", "ADMIN_MANUAL", "EXTERNAL_API", "BATCH_IMPORT"]).default("ADMIN_MANUAL"),
  formVersion: z.string().trim().max(80).default("2.0"), sku: z.string().trim().min(1).max(160),
  email: z.string().trim().email(), salutation: z.enum(["Dr", "Mr", "Mrs", "Ms", "Prefer not to say", "博士", "先生", "太太", "女士", "不愿透露"]),
  firstname: z.string().trim().min(1).max(100), lastname: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(8).max(40), language: z.string().trim().max(32).default("zh"),
  preferredContact: z.string().trim().min(1).max(64), country: z.string().trim().min(1).max(100), city: z.string().trim().max(100).nullable().optional(),
  ownsBrandWatch: z.enum(["Yes", "No", "是", "否"]).nullable().optional(), birthday: z.coerce.date().nullable().optional(),
  purchaseMethod: z.string().trim().max(120).nullable().optional(), retailer: z.string().trim().max(191).nullable().optional(),
  processingConsent: z.literal(true), marketingOptIn: z.boolean().default(false), policyVersion: z.string().trim().max(120).optional(),
  termsVersion: z.string().trim().max(120).nullable().optional(), originalSnapshot: z.record(z.string(), z.unknown()).optional(), idempotencyKey: z.string().trim().max(191).nullable().optional(),
});

function leadScope(request: Parameters<typeof visibleBrandIds>[0]): Prisma.LeadWhereInput {
  const ids = visibleBrandIds(request);
  return ids ? { brandId: { in: ids } } : {};
}

export async function leadRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/leads", { preHandler: guard("lead.view") }, async (request) => {
    const query = paginationSchema.extend({ brandCode: z.string().optional(), brand: z.string().optional(), field: z.string().optional(), value: z.string().optional(), keyword: z.string().optional(), status: z.string().optional(), leadType: z.string().optional(), owner: z.string().optional(), syncStatus: z.string().optional(), createdFrom: z.coerce.date().optional(), createdTo: z.coerce.date().optional(), startAt: z.coerce.date().optional(), endAt: z.coerce.date().optional() }).parse(request.query);
    const where: Prisma.LeadWhereInput = leadScope(request);
    if (query.brandCode || query.brand) where.brandId = (await resolveBrand(app, request, query.brandCode ?? query.brand!)).id;
    if (query.syncStatus) where.syncStatus = query.syncStatus as never;
    if (query.status) where.status = query.status;
    if (query.leadType) where.leadType = query.leadType;
    if (query.owner) where.ownerUserId = query.owner;
    if (query.createdFrom || query.createdTo || query.startAt || query.endAt) where.createdAt = { gte: query.createdFrom ?? query.startAt, lte: query.createdTo ?? query.endAt };
    if (query.value || query.keyword) {
      const v = query.value ?? query.keyword!;
      const selected: Record<string, Prisma.LeadWhereInput> = {
        leadNo: { leadNo: { contains: v } }, email: { email: { contains: v } }, firstname: { firstname: { contains: v } },
        lastname: { lastname: { contains: v } }, phone: { phone: { contains: v } }, sku: { sku: { contains: v } },
        country: { country: { contains: v } }, city: { city: { contains: v } }, source: { source: { contains: v } },
      };
      if (query.field && selected[query.field]) Object.assign(where, selected[query.field]);
      else where.OR = [{ leadNo: { contains: v } }, { email: { contains: v } }, { firstname: { contains: v } }, { lastname: { contains: v } }, { phone: { contains: v } }, { sku: { contains: v } }];
    }
    const [total, rows] = await app.prisma.$transaction([
      app.prisma.lead.count({ where }),
      app.prisma.lead.findMany({ where, include: { brand: true, customer: { select: { id: true, customerNo: true, displayName: true } } }, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    ]);
    return { data: rows, meta: paginationMeta(query.page, query.pageSize, total) };
  });

  app.post("/api/v1/leads", { preHandler: guard("lead.create") }, async (request, reply) => {
    const body = leadInputSchema.parse(request.body);
    const brand = await resolveBrand(app, request, body.brandCode);
    if (body.customerId) {
      const customer = await app.prisma.customer.findFirst({ where: { id: body.customerId, profiles: { some: { brandId: brand.id } } } });
      if (!customer) throw new ApiError(400, "VALIDATION_ERROR", "关联会员不存在或不属于当前品牌");
    }
    const idempotencyKey = request.headers["idempotency-key"]?.toString() || body.idempotencyKey;
    const result = await app.prisma.$transaction(async (tx) => {
      const created = await createCanonicalLead(tx, app.config, { ...body, idempotencyKey, createdBy: request.auth!.userId, originalSnapshot: body.originalSnapshot ?? body });
      if (!created.duplicate) await appendAudit(tx, request, { action: "CREATE_LEAD", module: "lead", targetType: "lead", targetId: created.lead.id, brandId: brand.id, details: { source: body.source, submissionMode: body.submissionMode, outboxCreated: body.leadType === "PURCHASE_INTENT" } });
      return created;
    });
    return reply.status(result.duplicate ? 200 : 201).send({ data: result.lead, meta: { duplicate: result.duplicate } });
  });

  app.get<{ Params: { id: string } }>("/api/v1/leads/:id", { preHandler: guard("lead.view") }, async (request) => {
    const lead = await app.prisma.lead.findFirst({ where: { id: request.params.id, ...leadScope(request) }, include: { brand: true, customer: true, consents: { orderBy: { capturedAt: "desc" } }, formDefinition: true } });
    if (!lead) throw new ApiError(404, "RESOURCE_NOT_FOUND", "线索不存在或超出品牌范围");
    const [outbox, attempts, audit, creator] = await Promise.all([
      app.prisma.integrationOutbox.findFirst({ where: { aggregateType: "LEAD", aggregateId: lead.id }, orderBy: { createdAt: "desc" } }),
      app.prisma.integrationAttempt.findMany({ where: { leadId: lead.id }, orderBy: { startedAt: "desc" } }),
      app.prisma.auditLog.findMany({ where: { targetType: "lead", targetId: lead.id }, orderBy: { createdAt: "desc" } }),
      lead.createdBy ? app.prisma.user.findUnique({ where: { id: lead.createdBy }, select: { name: true } }) : null,
    ]);
    return { data: { ...lead, createdByName: creator?.name ?? null, syncRecord: { outbox, attempts, audit } } };
  });

  app.patch<{ Params: { id: string } }>("/api/v1/leads/:id", { preHandler: guard("lead.edit") }, async (request) => {
    const body = leadInputSchema.omit({ brandCode: true, processingConsent: true, submissionMode: true, source: true }).partial().parse(request.body);
    const lead = await app.prisma.lead.findFirst({ where: { id: request.params.id, ...leadScope(request) }, include: { brand: true } });
    if (!lead) throw new ApiError(404, "RESOURCE_NOT_FOUND", "线索不存在或超出品牌范围");
    if (lead.syncStatus === "GATEWAY_QUEUED" || lead.syncStatus === "SUCCEEDED") throw new ApiError(409, "CONFLICT", "Gateway 已受理的线索不可直接修改");
    const updated = await app.prisma.$transaction(async (tx) => {
      const data: Prisma.LeadUpdateInput = {
        customer: body.customerId === undefined ? undefined : body.customerId ? { connect: { id: body.customerId } } : { disconnect: true },
        leadType: body.leadType, formVersion: body.formVersion, sku: body.sku, email: body.email?.toLowerCase(), salutation: body.salutation,
        firstname: body.firstname, lastname: body.lastname, phone: body.phone, language: body.language, preferredContact: body.preferredContact,
        country: body.country, city: body.city, ownership: body.ownsBrandWatch, birthday: body.birthday, purchaseMethod: body.purchaseMethod,
        retailer: body.retailer, marketingOptIn: body.marketingOptIn,
        originalSnapshot: body.originalSnapshot ? body.originalSnapshot as Prisma.InputJsonValue : undefined,
      };
      const row = await tx.lead.update({ where: { id: lead.id }, data, include: { brand: true } });
      await enqueueLeadForSowind(tx, app.config, dbLeadToSowindInput(row));
      await tx.lead.update({ where: { id: row.id }, data: { syncStatus: "PENDING", lastSyncError: null } });
      await appendAudit(tx, request, { action: "UPDATE_LEAD", module: "lead", targetType: "lead", targetId: row.id, brandId: row.brandId, details: JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue });
      return row;
    });
    return { data: updated };
  });

  app.post<{ Params: { id: string } }>("/api/v1/leads/:id/sync", { preHandler: guard("lead.sync") }, async (request) => {
    const lead = await app.prisma.lead.findFirst({ where: { id: request.params.id, ...leadScope(request) }, include: { brand: true } });
    if (!lead) throw new ApiError(404, "RESOURCE_NOT_FOUND", "线索不存在或超出品牌范围");
    if (lead.leadType !== "PURCHASE_INTENT") throw new ApiError(400, "VALIDATION_ERROR", "只有购买意向线索支持 Sowind Gateway 同步");
    if (["GATEWAY_QUEUED", "SUCCEEDED"].includes(lead.syncStatus)) throw new ApiError(409, "ALREADY_DELIVERED", "该线索已被 Gateway 受理，不会重复提交");
    await app.prisma.$transaction(async (tx) => {
      await enqueueLeadForSowind(tx, app.config, dbLeadToSowindInput(lead));
      await reactivateLeadOutbox(tx, lead.id);
      await tx.lead.update({ where: { id: lead.id }, data: { syncStatus: "PENDING", lastSyncError: null } });
      await appendAudit(tx, request, { action: "MANUAL_SYNC_REQUESTED", module: "lead", targetType: "lead", targetId: lead.id, brandId: lead.brandId, details: { delivery: "OUTBOX", directGatewayCall: false } });
    });
    return { data: { id: lead.id, syncStatus: "PENDING" } };
  });

  app.patch<{ Params: { id: string } }>("/api/v1/leads/:id/customer", { preHandler: guard("lead.edit") }, async (request) => {
    const body = z.object({ customerId: z.string().nullable() }).parse(request.body);
    const lead = await app.prisma.lead.findFirst({ where: { id: request.params.id, ...leadScope(request) }, include: { brand: true } });
    if (!lead) throw new ApiError(404, "RESOURCE_NOT_FOUND", "线索不存在或超出品牌范围");
    if (body.customerId) {
      const customer = await app.prisma.customer.findFirst({ where: { id: body.customerId, profiles: { some: { brandId: lead.brandId } } } });
      if (!customer) throw new ApiError(400, "VALIDATION_ERROR", "关联会员不存在或不属于线索品牌");
    }
    const updated = await app.prisma.$transaction(async (tx) => {
      const row = await tx.lead.update({ where: { id: lead.id }, data: { customerId: body.customerId } });
      await appendAudit(tx, request, { action: "LINK_LEAD_CUSTOMER", module: "lead", targetType: "lead", targetId: lead.id, brandId: lead.brandId, details: { customerId: body.customerId } });
      return row;
    });
    return { data: updated };
  });
}
