import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendAudit, type AuditActorContext } from "../common/audit.js";
import { guard } from "../common/auth.js";
import { resolveBrand, visibleBrandIds } from "../common/brand.js";
import { ApiError } from "../common/errors.js";
import { normalizeMobile } from "../common/mobile.js";
import { paginationMeta, paginationSchema } from "../common/pagination.js";
import { IdentityConflictError, identityConflictDetails } from "./identity.service.js";
import { createMemberSchema, memberProfileSchema, patchCustomerSchema, patchMemberProfileSchema } from "./schemas.js";
import { registerCanonicalMember, updateCanonicalMemberProfile } from "./service.js";

function requestAuditContext(request: Parameters<typeof visibleBrandIds>[0]): AuditActorContext {
  return { actorUserId: request.auth?.userId ?? null, actorName: request.auth?.name ?? "Integration Client", requestId: request.id, traceId: request.id, ipAddress: request.ip, userAgent: request.headers["user-agent"]?.slice(0, 500) ?? null };
}

async function recordIdentityConflict(app: FastifyInstance, request: Parameters<typeof visibleBrandIds>[0], error: IdentityConflictError): Promise<void> {
  await appendAudit(app.prisma, request, {
    action: "IDENTITY_CONFLICT",
    module: "identity",
    targetType: "customer_identity",
    targetId: error.existingCustomerId,
    brandId: error.identity.brandId,
    details: identityConflictDetails(error),
  });
}

function customerVisibility(request: Parameters<typeof visibleBrandIds>[0]): Prisma.CustomerWhereInput {
  const brandIds = visibleBrandIds(request);
  return brandIds ? { profiles: { some: { brandId: { in: brandIds } } } } : {};
}

function scopedDetailInclude(brandIds?: string[]): Prisma.CustomerInclude {
  const brandFilter = brandIds ? { brandId: { in: brandIds } } : {};
  return {
    profiles: { where: brandFilter, include: { brand: true, consents: { orderBy: { capturedAt: "desc" } } }, orderBy: { brand: { displayOrder: "asc" } } },
    identities: { where: brandFilter, include: { brand: true } },
    consents: { where: brandFilter, include: { brand: true }, orderBy: { capturedAt: "desc" } },
    leads: { where: brandFilter, include: { brand: true }, orderBy: { createdAt: "desc" } },
    notes: { orderBy: { createdAt: "desc" } },
    journeyEvents: { where: brandIds ? { OR: [{ brandId: null }, { brandId: { in: brandIds } }] } : {}, include: { brand: true }, orderBy: { eventAt: "desc" } },
    hqLinks: { where: brandFilter, include: { brand: true } },
  };
}

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/customers", { preHandler: guard("customer.view") }, async (request) => {
    const query = paginationSchema.extend({
      brandCode: z.string().trim().optional(), brand: z.string().trim().optional(), field: z.string().trim().optional(), value: z.string().trim().optional(), keyword: z.string().trim().optional(), mobile: z.string().trim().optional(), email: z.string().trim().optional(), status: z.string().trim().optional(),
      createdFrom: z.coerce.date().optional(), createdTo: z.coerce.date().optional(),
    }).parse(request.query);
    const where: Prisma.CustomerWhereInput = customerVisibility(request);
    const requestedBrand = query.brandCode ?? query.brand;
    let requestedBrandId: string | undefined;
    if (requestedBrand) {
      const brand = await resolveBrand(app, request, requestedBrand);
      requestedBrandId = brand.id;
      where.profiles = { some: { brandId: brand.id } };
    }
    if (query.status) where.status = query.status;
    if (query.mobile) where.mobileNormalized = { contains: query.mobile.replace(/[\s\-()]/g, "") };
    if (query.email) where.profiles = { some: { email: { contains: query.email }, ...(requestedBrand ? {} : visibleBrandIds(request) ? { brandId: { in: visibleBrandIds(request)! } } : {}) } };
    if (query.createdFrom || query.createdTo) where.createdAt = { gte: query.createdFrom, lte: query.createdTo };
    if (query.value || query.keyword) {
      const v = query.value ?? query.keyword!;
      const profileStringFields: Record<string, keyof Prisma.CustomerBrandProfileWhereInput> = {
        email: "email", firstName: "firstName", lastName: "lastName", country: "country", region: "region", city: "city",
        language: "language", preferredContact: "preferredContact", interestCenter: "interestCenter", favoriteCollection: "favoriteCollection",
      };
      if (query.field === "customerNo") where.customerNo = { contains: v };
      else if (query.field === "mobile") where.mobileNormalized = { contains: v.replace(/[\s\-()]/g, "") };
      else if (query.field === "displayName") where.displayName = { contains: v };
      else if (query.field && profileStringFields[query.field]) {
        where.profiles = { some: { [profileStringFields[query.field]!]: { contains: v }, ...(query.brandCode ? {} : visibleBrandIds(request) ? { brandId: { in: visibleBrandIds(request)! } } : {}) } };
      } else {
        where.OR = [
          { customerNo: { contains: v } }, { displayName: { contains: v } }, { mobileNormalized: { contains: v.replace(/[\s\-()]/g, "") } },
          { profiles: { some: { ...(visibleBrandIds(request) ? { brandId: { in: visibleBrandIds(request)! } } : {}), OR: [{ email: { contains: v } }, { firstName: { contains: v } }, { lastName: { contains: v } }, { country: { contains: v } }, { city: { contains: v } }, { interestCenter: { contains: v } }, { favoriteCollection: { contains: v } }] } } },
        ];
      }
    }
    const profileBrandWhere = requestedBrandId ? requestedBrandId : visibleBrandIds(request) ? { in: visibleBrandIds(request)! } : undefined;
    const [total, rows, metricProfiles] = await app.prisma.$transaction([
      app.prisma.customer.count({ where }),
      app.prisma.customer.findMany({ where, include: { profiles: { where: visibleBrandIds(request) ? { brandId: { in: visibleBrandIds(request)! } } : {}, include: { brand: true, consents: { orderBy: { capturedAt: "desc" } } }, orderBy: { brand: { displayOrder: "asc" } } } }, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      app.prisma.customerBrandProfile.findMany({
        where: { customer: where, brandId: profileBrandWhere },
        select: { customerId: true, consents: { where: { purpose: "MARKETING_COMMUNICATION" }, orderBy: { capturedAt: "desc" }, take: 1, select: { status: true } } },
      }),
    ]);
    const marketingNumerator = metricProfiles.filter((profile) => profile.consents[0]?.status === "GRANTED").length;
    const marketingDenominator = metricProfiles.length;
    const profileCounts = new Map<string, number>();
    if (!requestedBrandId) metricProfiles.forEach((profile) => profileCounts.set(profile.customerId, (profileCounts.get(profile.customerId) ?? 0) + 1));
    const dualBrandMembers = requestedBrandId ? 0 : [...profileCounts.values()].filter((count) => count >= 2).length;
    return {
      data: rows,
      meta: paginationMeta(query.page, query.pageSize, total),
      metrics: { memberTotal: total, dualBrandMembers, marketingCoverage: { numerator: marketingNumerator, denominator: marketingDenominator, percentage: marketingDenominator ? Math.round(marketingNumerator / marketingDenominator * 100) : 0 } },
    };
  });

  app.post("/api/v1/customers", { preHandler: guard("customer.create") }, async (request, reply) => {
    const body = createMemberSchema.parse(request.body);
    const brand = await resolveBrand(app, request, body.profile.brandCode);
    try {
      const result = await app.prisma.$transaction((tx) => registerCanonicalMember(tx, {
        brand,
        mobile: body.mobile,
        profile: body.profile,
        audit: requestAuditContext(request),
        createdBy: request.auth!.userId,
        duplicateProfilePolicy: "REJECT",
      }));
      return reply.status(201).send({ data: result });
    } catch (error) {
      if (error instanceof IdentityConflictError) await recordIdentityConflict(app, request, error);
      throw error;
    }
  });

  app.get<{ Params: { id: string } }>("/api/v1/customers/:id", { preHandler: guard("customer.view") }, async (request) => {
    const customer = await app.prisma.customer.findFirst({ where: { id: request.params.id, ...customerVisibility(request) }, include: scopedDetailInclude(visibleBrandIds(request)) });
    if (!customer) throw new ApiError(404, "RESOURCE_NOT_FOUND", "会员不存在或超出品牌范围");
    return { data: customer };
  });

  app.patch<{ Params: { id: string } }>("/api/v1/customers/:id", { preHandler: guard("customer.edit") }, async (request) => {
    const body = patchCustomerSchema.parse(request.body);
    const customer = await app.prisma.customer.findFirst({ where: { id: request.params.id, ...customerVisibility(request) } });
    if (!customer) throw new ApiError(404, "RESOURCE_NOT_FOUND", "会员不存在或超出品牌范围");
    const data: Prisma.CustomerUpdateInput = { displayName: body.displayName };
    if (body.mobile) { data.mobile = body.mobile; data.mobileNormalized = normalizeMobile(body.mobile); }
    const updated = await app.prisma.$transaction(async (tx) => {
      const row = await tx.customer.update({ where: { id: customer.id }, data });
      await appendAudit(tx, request, { action: "UPDATE_CUSTOMER", module: "customer", targetType: "customer", targetId: customer.id, details: body });
      return row;
    });
    return { data: updated };
  });

  app.patch<{ Params: { id: string; brandCode: string } }>("/api/v1/customers/:id/profiles/:brandCode", { preHandler: guard("customer.edit") }, async (request) => {
    const body = patchMemberProfileSchema.parse(request.body);
    const brand = await resolveBrand(app, request, request.params.brandCode);
    const profile = await app.prisma.customerBrandProfile.findUnique({ where: { customerId_brandId: { customerId: request.params.id, brandId: brand.id } } });
    if (!profile) throw new ApiError(404, "RESOURCE_NOT_FOUND", "品牌会员资料不存在");
    try {
      const updated = await app.prisma.$transaction((tx) => updateCanonicalMemberProfile(tx, { customerId: request.params.id, brand, patch: body, audit: requestAuditContext(request) }));
      return { data: updated };
    } catch (error) {
      if (error instanceof IdentityConflictError) await recordIdentityConflict(app, request, error);
      throw error;
    }
  });

  app.get<{ Params: { id: string; brandCode: string } }>("/api/v1/customers/:id/brands/:brandCode", { preHandler: guard("customer.view") }, async (request) => {
    const brand = await resolveBrand(app, request, request.params.brandCode);
    const profile = await app.prisma.customerBrandProfile.findUnique({ where: { customerId_brandId: { customerId: request.params.id, brandId: brand.id } }, include: { brand: true, consents: { orderBy: { capturedAt: "desc" } } } });
    if (!profile) throw new ApiError(404, "RESOURCE_NOT_FOUND", "品牌会员资料不存在");
    return { data: profile };
  });

  app.post<{ Params: { id: string; brandCode: string } }>("/api/v1/customers/:id/brands/:brandCode", { preHandler: guard("customer.create") }, async (request, reply) => {
    const body = memberProfileSchema.parse({ ...(request.body as object), brandCode: request.params.brandCode.toUpperCase() });
    const brand = await resolveBrand(app, request, body.brandCode);
    const customer = await app.prisma.customer.findFirst({ where: { id: request.params.id, ...customerVisibility(request) } });
    if (!customer) throw new ApiError(404, "RESOURCE_NOT_FOUND", "会员不存在或超出品牌范围");
    try {
      const result = await app.prisma.$transaction((tx) => registerCanonicalMember(tx, {
        brand,
        mobile: customer.mobile,
        profile: body,
        audit: requestAuditContext(request),
        createdBy: request.auth!.userId,
        expectedCustomerId: customer.id,
        duplicateProfilePolicy: "REJECT",
      }));
      return reply.status(201).send({ data: result.profile });
    } catch (error) {
      if (error instanceof IdentityConflictError) await recordIdentityConflict(app, request, error);
      throw error;
    }
  });

  app.patch<{ Params: { id: string; brandCode: string } }>("/api/v1/customers/:id/brands/:brandCode", { preHandler: guard("customer.edit") }, async (request) => {
    const body = patchMemberProfileSchema.parse(request.body);
    const brand = await resolveBrand(app, request, request.params.brandCode);
    const profile = await app.prisma.customerBrandProfile.findUnique({ where: { customerId_brandId: { customerId: request.params.id, brandId: brand.id } } });
    if (!profile) throw new ApiError(404, "RESOURCE_NOT_FOUND", "品牌会员资料不存在");
    try {
      const updated = await app.prisma.$transaction((tx) => updateCanonicalMemberProfile(tx, { customerId: request.params.id, brand, patch: body, audit: requestAuditContext(request) }));
      return { data: updated };
    } catch (error) {
      if (error instanceof IdentityConflictError) await recordIdentityConflict(app, request, error);
      throw error;
    }
  });

  app.get<{ Params: { id: string } }>("/api/v1/customers/:id/notes", { preHandler: guard("customer.view") }, async (request) => {
    const customer = await app.prisma.customer.findFirst({ where: { id: request.params.id, ...customerVisibility(request) } });
    if (!customer) throw new ApiError(404, "RESOURCE_NOT_FOUND", "会员不存在或超出品牌范围");
    return { data: await app.prisma.customerNote.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" } }) };
  });

  app.get<{ Params: { id: string } }>("/api/v1/customers/:id/journey", { preHandler: guard("customer.view") }, async (request) => {
    const customer = await app.prisma.customer.findFirst({ where: { id: request.params.id, ...customerVisibility(request) } });
    if (!customer) throw new ApiError(404, "RESOURCE_NOT_FOUND", "会员不存在或超出品牌范围");
    const ids = visibleBrandIds(request);
    return { data: await app.prisma.customerJourneyEvent.findMany({ where: { customerId: customer.id, ...(ids ? { OR: [{ brandId: null }, { brandId: { in: ids } }] } : {}) }, include: { brand: true }, orderBy: { eventAt: "desc" } }) };
  });

  app.get<{ Params: { id: string } }>("/api/v1/customers/:id/activity", { preHandler: guard("customer.view") }, async (request) => {
    const customer = await app.prisma.customer.findFirst({ where: { id: request.params.id, ...customerVisibility(request) } });
    if (!customer) throw new ApiError(404, "RESOURCE_NOT_FOUND", "会员不存在或超出品牌范围");
    const ids = visibleBrandIds(request);
    return { data: await app.prisma.auditLog.findMany({ where: { targetId: customer.id, ...(ids ? { OR: [{ brandId: null }, { brandId: { in: ids } }] } : {}) }, orderBy: { createdAt: "desc" } }) };
  });

  app.post<{ Params: { id: string } }>("/api/v1/customers/:id/notes", { preHandler: guard("customer.edit") }, async (request, reply) => {
    const body = z.object({ body: z.string().trim().min(1).max(10000) }).parse(request.body);
    const customer = await app.prisma.customer.findFirst({ where: { id: request.params.id, ...customerVisibility(request) } });
    if (!customer) throw new ApiError(404, "RESOURCE_NOT_FOUND", "会员不存在或超出品牌范围");
    const note = await app.prisma.$transaction(async (tx) => {
      const row = await tx.customerNote.create({ data: { customerId: customer.id, body: body.body, createdBy: request.auth!.userId } });
      await appendAudit(tx, request, { action: "CREATE_NOTE", module: "customer", targetType: "customer", targetId: customer.id, details: { noteId: row.id } });
      return row;
    });
    return reply.status(201).send({ data: note });
  });
}
