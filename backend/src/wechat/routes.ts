import type { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendAuditRecord, type AuditActorContext } from "../common/audit.js";
import { ApiError } from "../common/errors.js";
import { normalizeMobile } from "../common/mobile.js";
import { bindCustomerIdentity, IdentityConflictError, identityConflictDetails } from "../customers/identity.service.js";
import { registerCanonicalMember, updateCanonicalMemberProfile, type VerifiedWechatIdentity } from "../customers/service.js";
import { patchWechatMemberProfileSchema, wechatMemberProfileSchema } from "../customers/schemas.js";
import { createWechatContextToken, requireWechatContext, resolveWechatContext, wechatContextTokenFromRequest, wechatContextTokenHash } from "./context.js";
import type { WechatClient, WechatPhoneResolution } from "./wechat.types.js";

const resolvePhoneSchema = z.object({
  brandCode: z.enum(["GP", "UN"]),
  code: z.string().trim().min(1).max(500),
  appContext: z.string().trim().max(120).nullable().optional(),
});
const registerMemberSchema = z.object({ profile: wechatMemberProfileSchema });

function wechatAudit(request: FastifyRequest): AuditActorContext {
  return { actorUserId: null, actorName: "WeChat Mini Program", requestId: request.id, traceId: request.id, ipAddress: request.ip, userAgent: request.headers["user-agent"]?.slice(0, 500) ?? null };
}

async function writeIdentityConflictAudit(app: FastifyInstance, request: FastifyRequest, error: IdentityConflictError): Promise<void> {
  await appendAuditRecord(app.prisma, wechatAudit(request), {
    action: "IDENTITY_CONFLICT",
    module: "identity",
    targetType: "customer_identity",
    targetId: error.existingCustomerId,
    brandId: error.identity.brandId,
    details: identityConflictDetails(error),
  });
}

async function findResolvedCustomer(app: FastifyInstance, brandId: string, resolution: WechatPhoneResolution, normalizedMobile: string) {
  const mobileCustomer = await app.prisma.customer.findUnique({ where: { mobileNormalized: normalizedMobile }, select: { id: true } });
  let identityMatch: { customerId: string; identityType: "OPENID" | "UNIONID"; scope: string } | null = null;
  if (resolution.openId) {
    const identity = await app.prisma.customerIdentity.findUnique({
      where: { brandId_identityType_scope_value: { brandId, identityType: "OPENID", scope: resolution.appScope, value: resolution.openId } },
    });
    if (identity?.verifiedAt) identityMatch = { customerId: identity.customerId, identityType: "OPENID", scope: resolution.appScope };
  }
  if (resolution.unionId && resolution.unionIdScope) {
    const identity = await app.prisma.customerIdentity.findUnique({
      where: { brandId_identityType_scope_value: { brandId, identityType: "UNIONID", scope: resolution.unionIdScope, value: resolution.unionId } },
    });
    if (identity?.verifiedAt && identityMatch && identity.customerId !== identityMatch.customerId) {
      throw new IdentityConflictError({ brandId, identityType: "UNIONID", scope: resolution.unionIdScope }, identityMatch.customerId, identity.customerId);
    }
    if (identity?.verifiedAt) identityMatch = { customerId: identity.customerId, identityType: "UNIONID", scope: resolution.unionIdScope };
  }
  if (mobileCustomer && identityMatch && mobileCustomer.id !== identityMatch.customerId) {
    throw new IdentityConflictError({ brandId, identityType: identityMatch.identityType, scope: identityMatch.scope }, identityMatch.customerId, mobileCustomer.id);
  }
  return identityMatch?.customerId ?? mobileCustomer?.id ?? null;
}

async function bindResolvedIdentities(
  app: FastifyInstance,
  request: FastifyRequest,
  input: { customerId: string; brandId: string; normalizedMobile: string; resolution: WechatPhoneResolution; verifiedAt: Date },
) {
  const identities = [
    {
      identityType: "VERIFIED_MOBILE" as const,
      scope: input.resolution.appScope,
      appId: input.resolution.appId,
      value: input.normalizedMobile,
      source: "WECHAT_PHONE_RESOLVE",
    },
    ...(input.resolution.openId ? [{
      identityType: "OPENID" as const,
      scope: input.resolution.appScope,
      appId: input.resolution.appId,
      value: input.resolution.openId,
      source: "WECHAT_IDENTITY_CONTEXT",
    }] : []),
    ...(input.resolution.unionId && input.resolution.unionIdScope ? [{
      identityType: "UNIONID" as const,
      scope: input.resolution.unionIdScope,
      appId: input.resolution.appId,
      value: input.resolution.unionId,
      source: "WECHAT_IDENTITY_CONTEXT",
    }] : []),
  ];
  await app.prisma.$transaction(async (tx) => {
    for (const identity of identities) {
      const row = await bindCustomerIdentity(tx, {
        customerId: input.customerId,
        brandId: input.brandId,
        verifiedAt: input.verifiedAt,
        ...identity,
      });
      if (!row) continue;
      await appendAuditRecord(tx, wechatAudit(request), {
        action: "IDENTITY_BIND",
        module: "identity",
        targetType: "customer_identity",
        targetId: row.id,
        brandId: input.brandId,
        details: { customerId: input.customerId, identityType: identity.identityType, scope: identity.scope, verified: true, source: identity.source },
      });
    }
  });
}

async function contextCustomerId(app: FastifyInstance, context: { id: string; customerId: string | null; mobileNormalized: string }): Promise<string | null> {
  if (context.customerId) return context.customerId;
  const customer = await app.prisma.customer.findUnique({ where: { mobileNormalized: context.mobileNormalized }, select: { id: true } });
  if (!customer) return null;
  await app.prisma.wechatIdentityContext.update({ where: { id: context.id }, data: { customerId: customer.id } });
  return customer.id;
}

async function currentBrandMember(app: FastifyInstance, context: { id: string; customerId: string | null; mobileNormalized: string; brandId: string; brand: { code: string; name: string } }) {
  const customerId = await contextCustomerId(app, context);
  if (!customerId) return { registered: false as const, brand: { code: context.brand.code, name: context.brand.name } };
  const profile = await app.prisma.customerBrandProfile.findUnique({
    where: { customerId_brandId: { customerId, brandId: context.brandId } },
    select: {
      id: true,
      brandId: true,
      brandMemberNo: true,
      displayName: true,
      salutation: true,
      lastName: true,
      firstName: true,
      birthday: true,
      email: true,
      mobile: true,
      country: true,
      region: true,
      city: true,
      postalCode: true,
      addressLine: true,
      language: true,
      preferredContact: true,
      ownsBrandWatch: true,
      purchaseChannel: true,
      interestCenter: true,
      favoriteCollection: true,
      membershipStatus: true,
      registrationSource: true,
      registeredAt: true,
      createdAt: true,
      updatedAt: true,
      consents: { orderBy: { capturedAt: "desc" } },
    },
  });
  if (!profile) return { registered: false as const, brand: { code: context.brand.code, name: context.brand.name } };
  return {
    registered: true as const,
    customerId,
    brand: { code: context.brand.code, name: context.brand.name },
    profile,
    consent: profile.consents.map((item) => ({ purpose: item.purpose, channel: item.channel, status: item.status, policyVersion: item.policyVersion, capturedAt: item.capturedAt })),
  };
}

export async function trustedCustomerIdForWechatLead(app: FastifyInstance, request: FastifyRequest, brandId: string): Promise<string | null> {
  const token = wechatContextTokenFromRequest(request);
  if (!token) return null;
  const context = await resolveWechatContext(app, token, brandId);
  return contextCustomerId(app, context);
}

export async function wechatRoutes(app: FastifyInstance, client: WechatClient): Promise<void> {
  app.post("/api/v1/wechat/phone/resolve", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = resolvePhoneSchema.parse(request.body);
    const brand = await app.prisma.brand.findUnique({ where: { code: body.brandCode } });
    if (!brand || !brand.active) throw new ApiError(400, "VALIDATION_ERROR", "品牌不存在或未启用");
    try {
      const resolution = await client.resolvePhone(body);
      const normalizedMobile = normalizeMobile(resolution.phoneNumber);
      const verifiedAt = new Date();
      const customerId = await findResolvedCustomer(app, brand.id, resolution, normalizedMobile);
      if (customerId) await bindResolvedIdentities(app, request, { customerId, brandId: brand.id, normalizedMobile, resolution, verifiedAt });
      const contextToken = createWechatContextToken();
      const expiresAt = new Date(Date.now() + (app.config.wechatContextTtlMinutes ?? 30) * 60_000);
      await app.prisma.wechatIdentityContext.create({
        data: {
          tokenHash: wechatContextTokenHash(contextToken, app.config.sessionSecret),
          brandId: brand.id,
          customerId,
          appId: resolution.appId,
          appScope: resolution.appScope,
          mobileNormalized: normalizedMobile,
          openId: resolution.openId ?? null,
          unionId: resolution.unionId ?? null,
          unionIdScope: resolution.unionIdScope ?? null,
          verifiedAt,
          expiresAt,
        },
      });
      return reply.send({ data: { brand: brand.code, phone: normalizedMobile, verifiedAt, contextToken, expiresAt } });
    } catch (error) {
      if (error instanceof IdentityConflictError) await writeIdentityConflictAudit(app, request, error);
      else await appendAuditRecord(app.prisma, wechatAudit(request), {
        action: "WECHAT_PHONE_RESOLVE_FAILURE",
        module: "wechat",
        targetType: "brand",
        targetId: brand.id,
        brandId: brand.id,
        details: { errorCode: error instanceof ApiError ? error.code : "WECHAT_PROVIDER_ERROR" },
      });
      throw error;
    }
  });

  app.get("/api/v1/me/member", async (request) => {
    const context = await requireWechatContext(request);
    return { data: await currentBrandMember(app, context) };
  });

  app.post("/api/v1/me/member", async (request, reply) => {
    const context = await requireWechatContext(request);
    const body = registerMemberSchema.parse(request.body);
    const profile = {
      ...body.profile,
      brandCode: context.brand.code as "GP" | "UN",
      registrationSource: "WECHAT_MINIPROGRAM",
      openId: undefined,
      unionId: undefined,
    };
    const verifiedWechatIdentity: VerifiedWechatIdentity = {
      appId: context.appId,
      appScope: context.appScope,
      verifiedAt: context.verifiedAt,
      openId: context.openId,
      unionId: context.unionId,
      unionIdScope: context.unionIdScope,
    };
    try {
      const result = await app.prisma.$transaction((tx) => registerCanonicalMember(tx, {
        brand: context.brand,
        mobile: context.mobileNormalized,
        profile,
        audit: wechatAudit(request),
        duplicateProfilePolicy: "RETURN_EXISTING",
        verifiedWechatIdentity,
      }));
      await app.prisma.wechatIdentityContext.update({ where: { id: context.id }, data: { customerId: result.customer.id } });
      const member = await currentBrandMember(app, { ...context, customerId: result.customer.id });
      return reply.status(result.profileCreated ? 201 : 200).send({ data: { ...member, registrationStatus: result.registrationStatus } });
    } catch (error) {
      if (error instanceof IdentityConflictError) await writeIdentityConflictAudit(app, request, error);
      throw error;
    }
  });

  app.patch("/api/v1/me/member", async (request) => {
    const context = await requireWechatContext(request);
    const body = patchWechatMemberProfileSchema.parse(request.body);
    const customerId = await contextCustomerId(app, context);
    if (!customerId) throw new ApiError(404, "MEMBER_NOT_REGISTERED", "当前微信用户尚未注册会员");
    await app.prisma.$transaction((tx) => updateCanonicalMemberProfile(tx, {
      customerId,
      brand: context.brand,
      patch: { ...body, registrationSource: "WECHAT_MINIPROGRAM" },
      audit: wechatAudit(request),
    }));
    return { data: await currentBrandMember(app, { ...context, customerId }) };
  });
}
