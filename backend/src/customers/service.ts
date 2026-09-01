import type { Brand, Prisma, PrismaClient } from "@prisma/client";
import { appendAuditRecord, type AuditActorContext } from "../common/audit.js";
import { ApiError } from "../common/errors.js";
import { customerNumber } from "../common/ids.js";
import { normalizeMobile } from "../common/mobile.js";
import { bindCustomerIdentity, type IdentityBindingInput } from "./identity.service.js";
import type { MemberProfileInput, MemberProfilePatch } from "./schemas.js";

type DbClient = PrismaClient | Prisma.TransactionClient;
type BrandRef = Pick<Brand, "id" | "code" | "name">;

export type VerifiedWechatIdentity = {
  appId: string;
  appScope: string;
  verifiedAt: Date;
  openId?: string | null;
  unionId?: string | null;
  unionIdScope?: string | null;
};

export type RegisterCanonicalMemberInput = {
  brand: BrandRef;
  mobile: string;
  profile: MemberProfileInput;
  audit: AuditActorContext;
  createdBy?: string | null;
  expectedCustomerId?: string | null;
  duplicateProfilePolicy?: "REJECT" | "RETURN_EXISTING";
  verifiedWechatIdentity?: VerifiedWechatIdentity | null;
};

function profileData(
  customerId: string,
  brandId: string,
  mobile: string,
  profile: MemberProfileInput,
  verifiedWechatIdentity?: VerifiedWechatIdentity | null,
): Prisma.CustomerBrandProfileUncheckedCreateInput {
  return {
    customerId,
    brandId,
    displayName: `${profile.lastName}${profile.firstName}`,
    salutation: profile.salutation,
    lastName: profile.lastName,
    firstName: profile.firstName,
    birthday: profile.birthday,
    email: profile.email?.toLowerCase(),
    mobile: profile.mobile || mobile,
    country: profile.country,
    region: profile.region,
    city: profile.city,
    postalCode: profile.postalCode,
    addressLine: profile.addressLine,
    language: profile.language,
    preferredContact: profile.preferredContact,
    ownsBrandWatch: profile.ownsBrandWatch,
    purchaseChannel: profile.purchaseChannel,
    interestCenter: profile.interestCenter,
    favoriteCollection: profile.favoriteCollection,
    registrationSource: profile.registrationSource,
    registeredAt: new Date(),
    registrationData: (profile.registrationData ?? profile) as Prisma.InputJsonValue,
    openId: verifiedWechatIdentity?.openId ?? profile.openId,
    unionId: verifiedWechatIdentity?.unionId ?? profile.unionId,
  };
}

function identityInputs(
  customerId: string,
  brand: BrandRef,
  normalizedMobile: string,
  profile: MemberProfileInput,
  identity?: VerifiedWechatIdentity | null,
): IdentityBindingInput[] {
  if (identity) {
    return [
      {
        customerId,
        brandId: brand.id,
        identityType: "VERIFIED_MOBILE",
        scope: identity.appScope,
        appId: identity.appId,
        value: normalizedMobile,
        verifiedAt: identity.verifiedAt,
        source: "WECHAT_PHONE_RESOLVE",
      },
      ...(identity.openId ? [{
        customerId,
        brandId: brand.id,
        identityType: "OPENID" as const,
        scope: identity.appScope,
        appId: identity.appId,
        value: identity.openId,
        verifiedAt: identity.verifiedAt,
        source: "WECHAT_IDENTITY_CONTEXT",
      }] : []),
      ...(identity.unionId ? [{
        customerId,
        brandId: brand.id,
        identityType: "UNIONID" as const,
        scope: identity.unionIdScope || `OPEN_PLATFORM:${brand.code}`,
        appId: identity.appId,
        value: identity.unionId,
        verifiedAt: identity.verifiedAt,
        source: "WECHAT_IDENTITY_CONTEXT",
      }] : []),
    ];
  }
  const manualSource = profile.registrationSource === "BATCH_IMPORT" ? "BATCH_IMPORT" : "ADMIN_MANUAL";
  const appScope = profile.registrationSource === "BATCH_IMPORT" ? `IMPORT_APP:${brand.code}` : `LEGACY_APP:${brand.code}`;
  const unionScope = profile.registrationSource === "BATCH_IMPORT" ? `IMPORT_OPEN_PLATFORM:${brand.code}` : `LEGACY_OPEN_PLATFORM:${brand.code}`;
  return [
    ...(profile.openId ? [{
      customerId,
      brandId: brand.id,
      identityType: "OPENID" as const,
      scope: appScope,
      appId: null,
      value: profile.openId,
      verifiedAt: null,
      source: manualSource,
    }] : []),
    ...(profile.unionId ? [{
      customerId,
      brandId: brand.id,
      identityType: "UNIONID" as const,
      scope: unionScope,
      appId: null,
      value: profile.unionId,
      verifiedAt: null,
      source: manualSource,
    }] : []),
  ];
}

async function bindIdentities(
  db: DbClient,
  identities: IdentityBindingInput[],
  audit: AuditActorContext,
): Promise<void> {
  for (const identity of identities) {
    const row = await bindCustomerIdentity(db, identity);
    if (!row) continue;
    await appendAuditRecord(db, audit, {
      action: "IDENTITY_BIND",
      module: "identity",
      targetType: "customer_identity",
      targetId: row.id,
      brandId: identity.brandId,
      details: {
        customerId: identity.customerId,
        identityType: identity.identityType,
        scope: identity.scope,
        verified: Boolean(row.verifiedAt),
        source: identity.source,
      },
    });
  }
}

export async function registerCanonicalMember(db: DbClient, input: RegisterCanonicalMemberInput) {
  const normalizedMobile = normalizeMobile(input.mobile);
  const existingByMobile = await db.customer.findUnique({
    where: { mobileNormalized: normalizedMobile },
    include: { profiles: true },
  });
  if (input.expectedCustomerId && existingByMobile?.id !== input.expectedCustomerId) {
    throw new ApiError(409, "MOBILE_CUSTOMER_CONFLICT", "手机号已关联其他会员，不能改变现有归属");
  }
  const existingProfile = existingByMobile?.profiles.find((profile) => profile.brandId === input.brand.id);
  if (existingProfile && (input.duplicateProfilePolicy ?? "REJECT") === "REJECT") {
    throw new ApiError(409, "CONFLICT", "该手机号已存在此品牌会员关系");
  }

  const customer = existingByMobile ?? await db.customer.create({
    data: {
      customerNo: customerNumber(),
      displayName: `${input.profile.lastName}${input.profile.firstName}`,
      mobile: input.mobile,
      mobileNormalized: normalizedMobile,
      createdBy: input.createdBy ?? null,
    },
  });
  const identities = identityInputs(customer.id, input.brand, normalizedMobile, input.profile, input.verifiedWechatIdentity);
  await bindIdentities(db, identities, input.audit);

  if (existingProfile) {
    return {
      customer,
      profile: existingProfile,
      registrationStatus: "EXISTING_BRAND_PROFILE" as const,
      customerCreated: false,
      profileCreated: false,
    };
  }

  const profile = await db.customerBrandProfile.create({
    data: profileData(customer.id, input.brand.id, input.mobile, input.profile, input.verifiedWechatIdentity),
  });
  await db.consentRecord.createMany({ data: [
    {
      customerId: customer.id,
      customerBrandProfileId: profile.id,
      brandId: input.brand.id,
      purpose: "DATA_PROCESSING",
      channel: "ALL",
      status: "GRANTED",
      policyVersion: input.profile.policyVersion,
      source: input.profile.registrationSource,
      capturedAt: new Date(),
      capturedBy: input.createdBy ?? null,
    },
    {
      customerId: customer.id,
      customerBrandProfileId: profile.id,
      brandId: input.brand.id,
      purpose: "MARKETING_COMMUNICATION",
      channel: "EMAIL",
      status: input.profile.marketingOptIn ? "GRANTED" : "DENIED",
      policyVersion: input.profile.policyVersion,
      source: input.profile.registrationSource,
      capturedAt: new Date(),
      capturedBy: input.createdBy ?? null,
    },
  ] });
  await db.customerJourneyEvent.create({
    data: {
      customerId: customer.id,
      brandId: input.brand.id,
      eventType: "REGISTER",
      title: `${input.brand.name}会员登记`,
      eventAt: new Date(),
      source: input.profile.registrationSource,
    },
  });
  await appendAuditRecord(db, input.audit, {
    action: "MEMBER_REGISTER",
    module: "customer",
    targetType: "customer",
    targetId: customer.id,
    brandId: input.brand.id,
    details: {
      existingCustomer: Boolean(existingByMobile),
      profileId: profile.id,
      registrationSource: input.profile.registrationSource,
      verifiedMobile: Boolean(input.verifiedWechatIdentity),
    },
  });
  return {
    customer,
    profile,
    registrationStatus: existingByMobile ? "CREATED_BRAND_PROFILE" as const : "CREATED_CUSTOMER_AND_PROFILE" as const,
    customerCreated: !existingByMobile,
    profileCreated: true,
  };
}

export async function updateCanonicalMemberProfile(
  db: DbClient,
  input: {
    customerId: string;
    brand: BrandRef;
    patch: MemberProfilePatch;
    audit: AuditActorContext;
  },
) {
  const profile = await db.customerBrandProfile.findUnique({
    where: { customerId_brandId: { customerId: input.customerId, brandId: input.brand.id } },
  });
  if (!profile) throw new ApiError(404, "RESOURCE_NOT_FOUND", "品牌会员资料不存在");
  await bindIdentities(db, identityInputs(input.customerId, input.brand, "", {
    ...input.patch,
    brandCode: input.brand.code as "GP" | "UN",
    lastName: profile.lastName || "-",
    firstName: profile.firstName || "-",
    processingConsent: true,
    marketingOptIn: false,
    registrationSource: profile.registrationSource || "ADMIN_MANUAL",
    policyVersion: "CURRENT",
  }, null), input.audit);
  const row = await db.customerBrandProfile.update({
    where: { id: profile.id },
    data: {
      salutation: input.patch.salutation,
      lastName: input.patch.lastName,
      firstName: input.patch.firstName,
      displayName: input.patch.lastName || input.patch.firstName
        ? `${input.patch.lastName ?? profile.lastName ?? ""}${input.patch.firstName ?? profile.firstName ?? ""}`
        : undefined,
      birthday: input.patch.birthday,
      email: input.patch.email?.toLowerCase(),
      mobile: input.patch.mobile,
      country: input.patch.country,
      region: input.patch.region,
      city: input.patch.city,
      postalCode: input.patch.postalCode,
      addressLine: input.patch.addressLine,
      language: input.patch.language,
      preferredContact: input.patch.preferredContact,
      ownsBrandWatch: input.patch.ownsBrandWatch,
      purchaseChannel: input.patch.purchaseChannel,
      interestCenter: input.patch.interestCenter,
      favoriteCollection: input.patch.favoriteCollection,
      registrationSource: input.patch.registrationSource,
      registrationData: input.patch.registrationData as Prisma.InputJsonValue | undefined,
      openId: input.patch.openId,
      unionId: input.patch.unionId,
    },
  });
  await db.customerJourneyEvent.create({
    data: {
      customerId: input.customerId,
      brandId: input.brand.id,
      eventType: "PROFILE_UPDATE",
      title: `${input.brand.name}会员资料更新`,
      eventAt: new Date(),
      source: input.patch.registrationSource || profile.registrationSource || "ADMIN_MANUAL",
      metadata: { profileId: profile.id, changedFields: Object.keys(input.patch) },
    },
  });
  await appendAuditRecord(db, input.audit, {
    action: "MEMBER_PROFILE_UPDATE",
    module: "customer",
    targetType: "customer_profile",
    targetId: profile.id,
    brandId: input.brand.id,
    details: { changedFields: Object.keys(input.patch) },
  });
  return row;
}
