import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendAudit } from "../common/audit.js";
import { guard } from "../common/auth.js";
import { resolveBrand, visibleBrandIds } from "../common/brand.js";
import { ApiError } from "../common/errors.js";
import { customerNumber } from "../common/ids.js";
import { normalizeMobile } from "../common/mobile.js";
import { paginationMeta, paginationSchema } from "../common/pagination.js";

const nullableText = z.string().trim().max(500).nullable().optional();
const profileSchema = z.object({
  brandCode: z.enum(["GP", "UN"]),
  salutation: z.string().trim().max(40).optional(),
  lastName: z.string().trim().min(1).max(100),
  firstName: z.string().trim().min(1).max(100),
  birthday: z.coerce.date().nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  mobile: z.string().trim().optional(),
  country: nullableText,
  region: nullableText,
  city: nullableText,
  postalCode: nullableText,
  addressLine: nullableText,
  language: nullableText,
  preferredContact: nullableText,
  ownsBrandWatch: z.boolean().nullable().optional(),
  purchaseChannel: nullableText,
  interestCenter: nullableText,
  favoriteCollection: nullableText,
  registrationSource: z.string().trim().max(120).default("ADMIN_MANUAL"),
  openId: nullableText,
  unionId: nullableText,
  marketingOptIn: z.boolean().default(false),
  processingConsent: z.literal(true),
  policyVersion: z.string().trim().max(120).default("CURRENT"),
  registrationData: z.record(z.string(), z.unknown()).optional(),
});
const createSchema = z.object({ mobile: z.string().trim(), profile: profileSchema });
const patchCustomerSchema = z.object({ displayName: z.string().trim().min(1).max(160).optional(), mobile: z.string().trim().optional() });
const patchProfileSchema = profileSchema.omit({ brandCode: true, processingConsent: true }).partial();

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
    if (requestedBrand) {
      const brand = await resolveBrand(app, request, requestedBrand);
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
    const [total, rows] = await app.prisma.$transaction([
      app.prisma.customer.count({ where }),
      app.prisma.customer.findMany({ where, include: { profiles: { where: visibleBrandIds(request) ? { brandId: { in: visibleBrandIds(request)! } } : {}, include: { brand: true, consents: { orderBy: { capturedAt: "desc" } } }, orderBy: { brand: { displayOrder: "asc" } } } }, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    ]);
    return { data: rows, meta: paginationMeta(query.page, query.pageSize, total) };
  });

  app.post("/api/v1/customers", { preHandler: guard("customer.create") }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    const brand = await resolveBrand(app, request, body.profile.brandCode);
    const normalized = normalizeMobile(body.mobile);
    const existing = await app.prisma.customer.findUnique({ where: { mobileNormalized: normalized }, include: { profiles: true } });
    if (existing?.profiles.some((item) => item.brandId === brand.id)) throw new ApiError(409, "CONFLICT", "该手机号已存在此品牌会员关系");
    const result = await app.prisma.$transaction(async (tx) => {
      const customer = existing ?? await tx.customer.create({ data: { customerNo: customerNumber(), displayName: `${body.profile.lastName}${body.profile.firstName}`, mobile: body.mobile, mobileNormalized: normalized, createdBy: request.auth!.userId } });
      const profile = await tx.customerBrandProfile.create({
        data: {
          customerId: customer.id, brandId: brand.id, displayName: `${body.profile.lastName}${body.profile.firstName}`,
          salutation: body.profile.salutation, lastName: body.profile.lastName, firstName: body.profile.firstName,
          birthday: body.profile.birthday, email: body.profile.email?.toLowerCase(), mobile: body.profile.mobile || body.mobile,
          country: body.profile.country, region: body.profile.region, city: body.profile.city, postalCode: body.profile.postalCode,
          addressLine: body.profile.addressLine, language: body.profile.language, preferredContact: body.profile.preferredContact,
          ownsBrandWatch: body.profile.ownsBrandWatch, purchaseChannel: body.profile.purchaseChannel,
          interestCenter: body.profile.interestCenter, favoriteCollection: body.profile.favoriteCollection,
          registrationSource: body.profile.registrationSource, registeredAt: new Date(), registrationData: (body.profile.registrationData ?? body.profile) as Prisma.InputJsonValue,
          openId: body.profile.openId, unionId: body.profile.unionId,
        },
      });
      await tx.consentRecord.createMany({ data: [
        { customerId: customer.id, customerBrandProfileId: profile.id, brandId: brand.id, purpose: "DATA_PROCESSING", channel: "ALL", status: "GRANTED", policyVersion: body.profile.policyVersion, source: body.profile.registrationSource, capturedAt: new Date(), capturedBy: request.auth!.userId },
        { customerId: customer.id, customerBrandProfileId: profile.id, brandId: brand.id, purpose: "MARKETING_COMMUNICATION", channel: "EMAIL", status: body.profile.marketingOptIn ? "GRANTED" : "DENIED", policyVersion: body.profile.policyVersion, source: body.profile.registrationSource, capturedAt: new Date(), capturedBy: request.auth!.userId },
      ] });
      await tx.customerJourneyEvent.create({ data: { customerId: customer.id, brandId: brand.id, eventType: "MEMBER_REGISTERED", title: `${brand.name}会员登记`, eventAt: new Date(), source: body.profile.registrationSource } });
      await appendAudit(tx, request, { action: "CREATE_CUSTOMER_PROFILE", module: "customer", targetType: "customer", targetId: customer.id, brandId: brand.id, details: { existingCustomer: Boolean(existing), profileId: profile.id } });
      return { customer, profile };
    });
    return reply.status(201).send({ data: result });
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
    const body = patchProfileSchema.parse(request.body);
    const brand = await resolveBrand(app, request, request.params.brandCode);
    const profile = await app.prisma.customerBrandProfile.findUnique({ where: { customerId_brandId: { customerId: request.params.id, brandId: brand.id } } });
    if (!profile) throw new ApiError(404, "RESOURCE_NOT_FOUND", "品牌会员资料不存在");
    const data = { ...body, email: body.email?.toLowerCase(), registrationData: body.registrationData as Prisma.InputJsonValue | undefined };
    const updated = await app.prisma.$transaction(async (tx) => {
      const row = await tx.customerBrandProfile.update({ where: { id: profile.id }, data });
      await appendAudit(tx, request, { action: "UPDATE_CUSTOMER_PROFILE", module: "customer", targetType: "customer_profile", targetId: profile.id, brandId: brand.id, details: JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue });
      return row;
    });
    return { data: updated };
  });

  app.get<{ Params: { id: string; brandCode: string } }>("/api/v1/customers/:id/brands/:brandCode", { preHandler: guard("customer.view") }, async (request) => {
    const brand = await resolveBrand(app, request, request.params.brandCode);
    const profile = await app.prisma.customerBrandProfile.findUnique({ where: { customerId_brandId: { customerId: request.params.id, brandId: brand.id } }, include: { brand: true, consents: { orderBy: { capturedAt: "desc" } } } });
    if (!profile) throw new ApiError(404, "RESOURCE_NOT_FOUND", "品牌会员资料不存在");
    return { data: profile };
  });

  app.post<{ Params: { id: string; brandCode: string } }>("/api/v1/customers/:id/brands/:brandCode", { preHandler: guard("customer.create") }, async (request, reply) => {
    const body = profileSchema.parse({ ...(request.body as object), brandCode: request.params.brandCode.toUpperCase() });
    const brand = await resolveBrand(app, request, body.brandCode);
    const customer = await app.prisma.customer.findFirst({ where: { id: request.params.id, ...customerVisibility(request) } });
    if (!customer) throw new ApiError(404, "RESOURCE_NOT_FOUND", "会员不存在或超出品牌范围");
    if (await app.prisma.customerBrandProfile.findUnique({ where: { customerId_brandId: { customerId: customer.id, brandId: brand.id } } })) throw new ApiError(409, "CONFLICT", "该品牌会员关系已存在");
    const profile = await app.prisma.$transaction(async (tx) => {
      const row = await tx.customerBrandProfile.create({ data: { customerId: customer.id, brandId: brand.id, displayName: `${body.lastName}${body.firstName}`, salutation: body.salutation, lastName: body.lastName, firstName: body.firstName, birthday: body.birthday, email: body.email?.toLowerCase(), mobile: body.mobile || customer.mobile, country: body.country, region: body.region, city: body.city, postalCode: body.postalCode, addressLine: body.addressLine, language: body.language, preferredContact: body.preferredContact, ownsBrandWatch: body.ownsBrandWatch, purchaseChannel: body.purchaseChannel, interestCenter: body.interestCenter, favoriteCollection: body.favoriteCollection, registrationSource: body.registrationSource, registeredAt: new Date(), registrationData: JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue, openId: body.openId, unionId: body.unionId } });
      await tx.consentRecord.createMany({ data: [
        { customerId: customer.id, customerBrandProfileId: row.id, brandId: brand.id, purpose: "DATA_PROCESSING", channel: "ALL", status: "GRANTED", policyVersion: body.policyVersion, source: body.registrationSource, capturedAt: new Date(), capturedBy: request.auth!.userId },
        { customerId: customer.id, customerBrandProfileId: row.id, brandId: brand.id, purpose: "MARKETING_COMMUNICATION", channel: "EMAIL", status: body.marketingOptIn ? "GRANTED" : "DENIED", policyVersion: body.policyVersion, source: body.registrationSource, capturedAt: new Date(), capturedBy: request.auth!.userId },
      ] });
      await appendAudit(tx, request, { action: "CREATE_CUSTOMER_PROFILE", module: "customer", targetType: "customer_profile", targetId: row.id, brandId: brand.id });
      return row;
    });
    return reply.status(201).send({ data: profile });
  });

  app.patch<{ Params: { id: string; brandCode: string } }>("/api/v1/customers/:id/brands/:brandCode", { preHandler: guard("customer.edit") }, async (request) => {
    const body = patchProfileSchema.parse(request.body);
    const brand = await resolveBrand(app, request, request.params.brandCode);
    const profile = await app.prisma.customerBrandProfile.findUnique({ where: { customerId_brandId: { customerId: request.params.id, brandId: brand.id } } });
    if (!profile) throw new ApiError(404, "RESOURCE_NOT_FOUND", "品牌会员资料不存在");
    const updated = await app.prisma.$transaction(async (tx) => {
      const row = await tx.customerBrandProfile.update({ where: { id: profile.id }, data: { ...body, email: body.email?.toLowerCase(), registrationData: body.registrationData as Prisma.InputJsonValue | undefined } });
      await appendAudit(tx, request, { action: "UPDATE_CUSTOMER_PROFILE", module: "customer", targetType: "customer_profile", targetId: profile.id, brandId: brand.id, details: JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue });
      return row;
    });
    return { data: updated };
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
