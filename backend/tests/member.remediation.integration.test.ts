import { createHash, createHmac, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/common/config.js";
import type { WechatClient, WechatPhoneResolution } from "../src/wechat/wechat.types.js";
import { registerCanonicalMember } from "../src/customers/service.js";

const integrationEnabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const runKey = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const numericSuffix = String(Date.now() % 100_000_000).padStart(8, "0");
const primaryMobile = `+86139${numericSuffix}`;
const conflictMobile = `+86138${numericSuffix}`;
const unknownMobile = `+86137${numericSuffix}`;
const idempotencyPrefix = `R2:${runKey}`;
const gpAppId = `round2-gp-${runKey}`;
const unAppId = `round2-un-${runKey}`;
const gpOpenId = `openid-gp-${runKey}`;
const unOpenId = `openid-un-${runKey}`;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

class FakeWechatClient implements WechatClient {
  constructor(private readonly values: Record<string, WechatPhoneResolution>) {}
  async resolvePhone(input: { brandCode: "GP" | "UN"; code: string }): Promise<WechatPhoneResolution> {
    const value = this.values[input.code];
    if (!value) throw new Error("fake phone authorization rejected");
    return value;
  }
}

describe.skipIf(!integrationEnabled)("Remediation Round 2 Member/WeChat identity closure", () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let config: AppConfig;
  let gpBrandId: string;
  let unBrandId: string;
  let customerId: string;
  let gpContextToken: string;
  let unContextToken: string;
  let unknownContextToken: string;
  let outboxCountBeforeMemberRegistration: number;

  const auditCutoff = new Date();
  const gpCode = `gp-phone-code-${runKey}`;
  const unCode = `un-phone-code-${runKey}`;
  const conflictCode = `conflict-phone-code-${runKey}`;
  const unknownCode = `unknown-phone-code-${runKey}`;
  const fakeSecretMarker = `wechat-secret-${runKey}`;

  const memberProfile = (brand: "GP" | "UN") => ({
    profile: {
      salutation: "先生",
      lastName: "测试",
      firstName: brand,
      email: `member-${brand.toLowerCase()}-${runKey}@example.test`,
      country: "中国大陆",
      region: "上海市",
      city: "上海市",
      language: "简体中文",
      preferredContact: "微信",
      ownsBrandWatch: false,
      favoriteCollection: brand === "GP" ? "Laureato" : "Freak",
      interestCenter: "制表工艺",
      marketingOptIn: false,
      processingConsent: true,
      policyVersion: `${brand}-R2-POLICY`,
    },
  });

  async function resolvePhone(brandCode: "GP" | "UN", code: string) {
    const response = await app.inject({ method: "POST", url: "/api/v1/wechat/phone/resolve", payload: { brandCode, code } });
    return { response, data: response.json<{ data: { contextToken: string; phone: string } }>().data };
  }

  async function signedMiniLead(label: string, contextToken: string, phone: string, suppliedCustomerId?: string | null) {
    const body = {
      brandCode: "GP",
      ...(suppliedCustomerId !== undefined ? { customerId: suppliedCustomerId } : {}),
      sku: "81010-11-3475-1CM",
      email: `${label}.${runKey}@example.test`,
      salutation: "先生",
      firstname: label,
      lastname: "Round2",
      phone,
      preferredContact: "Email",
      country: "China",
      city: "Shanghai",
      ownsBrandWatch: "否",
      processingConsent: true,
      marketingOptIn: false,
    };
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const bodyHash = createHash("sha256").update(canonicalJson(body)).digest("hex");
    const signature = createHmac("sha256", config.integrationClientSecret).update(`${timestamp}.${nonce}.${bodyHash}`).digest("hex");
    return app.inject({
      method: "POST",
      url: "/api/integration/v1/leads",
      headers: {
        "content-type": "application/json",
        "x-client-id": config.integrationClientId,
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-signature": signature,
        "x-wechat-context-token": contextToken,
        "idempotency-key": `${idempotencyPrefix}:${label}`,
      },
      payload: body,
    });
  }

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("TEST_DATABASE_URL or DATABASE_URL is required for DB integration tests");
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    config = {
      nodeEnv: "test",
      port: 0,
      databaseUrl,
      sessionSecret: "round-2-integration-session-secret-2026",
      sessionTtlHours: 12,
      initialPassword: "Round2InitialPassword@2026",
      superAdminAccount: "round2-admin@example.test",
      superAdminName: "Round 2 Admin",
      seedDemoData: false,
      cookieSecure: false,
      corsOrigin: "*",
      appBasePath: "",
      trustProxy: false,
      maxBodyBytes: 10 * 1024 * 1024,
      storageDir: resolve(process.cwd(), "../storage/test-round-2"),
      outboxPollIntervalMs: 1000,
      sowindGatewayAccessKey: "round-2-controlled-gateway-key",
      sowindGatewayGpUrl: "https://gp.example.test/gateway",
      sowindGatewayUnUrl: "https://un.example.test/gateway",
      sowindGatewayTimeoutMs: 10_000,
      sowindGatewayMaxAttempts: 5,
      sowindGatewayMaxPerMinute: 60,
      runSowindLiveTests: false,
      integrationClientId: "round-2-mini-program",
      integrationClientSecret: "round-2-mini-program-secret",
      wechatGpAppId: gpAppId,
      wechatGpAppSecret: fakeSecretMarker,
      wechatUnAppId: unAppId,
      wechatUnAppSecret: fakeSecretMarker,
      wechatContextTtlMinutes: 30,
    };
    const gp = await prisma.brand.upsert({ where: { code: "GP" }, update: { active: true }, create: { code: "GP", name: "GP 芝柏表", shortName: "GP", active: true } });
    const un = await prisma.brand.upsert({ where: { code: "UN" }, update: { active: true }, create: { code: "UN", name: "UN 雅典表", shortName: "UN", active: true } });
    gpBrandId = gp.id;
    unBrandId = un.id;
    for (const brand of [gp, un]) {
      await prisma.formDefinition.upsert({
        where: { brandId_objectType_formKey_version: { brandId: brand.id, objectType: "LEAD", formKey: "PURCHASE_INTENT", version: "2.0" } },
        update: { active: true },
        create: { brandId: brand.id, objectType: "LEAD", formKey: "PURCHASE_INTENT", version: "2.0", active: true, schemaJson: { fields: [] }, policyVersion: `${brand.code}-R2`, termsVersion: `${brand.code}-R2`, effectiveAt: new Date() },
      });
    }
    const fakeClient = new FakeWechatClient({
      [gpCode]: { phoneNumber: primaryMobile, appId: gpAppId, appScope: `APP:${gpAppId}`, openId: gpOpenId, unionId: `union-gp-${runKey}`, unionIdScope: "OPEN_PLATFORM:GP-R2" },
      [unCode]: { phoneNumber: primaryMobile, appId: unAppId, appScope: `APP:${unAppId}`, openId: unOpenId, unionId: `union-un-${runKey}`, unionIdScope: "OPEN_PLATFORM:UN-R2" },
      [conflictCode]: { phoneNumber: conflictMobile, appId: gpAppId, appScope: `APP:${gpAppId}`, openId: gpOpenId },
      [unknownCode]: { phoneNumber: unknownMobile, appId: gpAppId, appScope: `APP:${gpAppId}`, openId: `openid-unknown-${runKey}` },
    });
    app = await buildApp({ config, prisma, startWorker: false, frontendRoot: resolve(process.cwd(), "../frontend"), wechatClient: fakeClient });
    await app.ready();
    outboxCountBeforeMemberRegistration = await prisma.integrationOutbox.count();
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      const customers = await prisma.customer.findMany({ where: { mobileNormalized: { in: [primaryMobile, conflictMobile, unknownMobile] } }, select: { id: true } });
      const customerIds = customers.map((item) => item.id);
      const leads = await prisma.lead.findMany({ where: { idempotencyKey: { startsWith: idempotencyPrefix } }, select: { id: true } });
      const leadIds = leads.map((item) => item.id);
      const profiles = customerIds.length ? await prisma.customerBrandProfile.findMany({ where: { customerId: { in: customerIds } }, select: { id: true } }) : [];
      const identities = customerIds.length ? await prisma.customerIdentity.findMany({ where: { customerId: { in: customerIds } }, select: { id: true } }) : [];
      const targetIds = [...customerIds, ...leadIds, ...profiles.map((item) => item.id), ...identities.map((item) => item.id)];
      if (leadIds.length) {
        await prisma.integrationAttempt.deleteMany({ where: { leadId: { in: leadIds } } });
        await prisma.integrationOutbox.deleteMany({ where: { aggregateType: "LEAD", aggregateId: { in: leadIds } } });
        await prisma.consentRecord.deleteMany({ where: { leadId: { in: leadIds } } });
        await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
      }
      await prisma.wechatIdentityContext.deleteMany({ where: { appId: { in: [gpAppId, unAppId] } } });
      if (targetIds.length) await prisma.auditLog.deleteMany({ where: { targetId: { in: targetIds } } });
      if (customerIds.length) await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
      await prisma.$disconnect();
    }
  }, 30_000);

  it("A: a new verified mobile registers one GP Customer, Profile and REGISTER Journey", async () => {
    const resolved = await resolvePhone("GP", gpCode);
    expect(resolved.response.statusCode).toBe(200);
    expect(resolved.data.phone).toBe(primaryMobile);
    gpContextToken = resolved.data.contextToken;
    const response = await app.inject({ method: "POST", url: "/api/v1/me/member", headers: { "x-wechat-context-token": gpContextToken }, payload: memberProfile("GP") });
    expect(response.statusCode).toBe(201);
    const payload = response.json<{ data: { customerId: string; registered: boolean; registrationStatus: string } }>();
    customerId = payload.data.customerId;
    expect(payload.data).toMatchObject({ registered: true, registrationStatus: "CREATED_CUSTOMER_AND_PROFILE" });
    expect(await prisma.customer.count({ where: { mobileNormalized: primaryMobile } })).toBe(1);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).customerNo).toMatch(/^SW\d{8}$/);
    expect(await prisma.customerBrandProfile.count({ where: { customerId, brandId: gpBrandId } })).toBe(1);
    expect(await prisma.customerJourneyEvent.count({ where: { customerId, brandId: gpBrandId, eventType: "REGISTER" } })).toBe(1);
  });

  it("B: the same verified mobile registers UN on the same Customer with a second Profile", async () => {
    const resolved = await resolvePhone("UN", unCode);
    expect(resolved.response.statusCode).toBe(200);
    unContextToken = resolved.data.contextToken;
    const response = await app.inject({ method: "POST", url: "/api/v1/me/member", headers: { "x-wechat-context-token": unContextToken }, payload: memberProfile("UN") });
    expect(response.statusCode).toBe(201);
    expect(response.json<{ data: { customerId: string } }>().data.customerId).toBe(customerId);
    expect(await prisma.customer.count({ where: { mobileNormalized: primaryMobile } })).toBe(1);
    expect(await prisma.customerBrandProfile.count({ where: { customerId } })).toBe(2);
  });

  it("C: repeat registration returns the existing GP Profile without duplication", async () => {
    const response = await app.inject({ method: "POST", url: "/api/v1/me/member", headers: { "x-wechat-context-token": gpContextToken }, payload: memberProfile("GP") });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ data: { registrationStatus: string } }>().data.registrationStatus).toBe("EXISTING_BRAND_PROFILE");
    expect(await prisma.customerBrandProfile.count({ where: { customerId, brandId: gpBrandId } })).toBe(1);
    expect(await prisma.customerJourneyEvent.count({ where: { customerId, brandId: gpBrandId, eventType: "REGISTER" } })).toBe(1);
  });

  it("C2: an admin-style duplicate brand registration returns a specific conflict", async () => {
    await expect(prisma.$transaction((tx) => registerCanonicalMember(tx, {
      brand: { id: gpBrandId, code: "GP", name: "GP 芝柏表" },
      mobile: primaryMobile,
      profile: {
        ...memberProfile("GP").profile,
        brandCode: "GP",
        registrationSource: "ADMIN_MANUAL",
        processingConsent: true as const,
      },
      audit: { actorName: "Round 2 Test Admin" },
      duplicateProfilePolicy: "REJECT",
    }))).rejects.toMatchObject({
      statusCode: 409,
      code: "DUPLICATE_BRAND_MEMBER",
      message: "该手机号已是GP 芝柏表会员，不能重复创建同品牌会员",
    });
  });

  it("D: GP Profile update writes PROFILE_UPDATE without changing the UN Profile", async () => {
    const unBefore = await prisma.customerBrandProfile.findUniqueOrThrow({ where: { customerId_brandId: { customerId, brandId: unBrandId } } });
    const response = await app.inject({ method: "PATCH", url: "/api/v1/me/member", headers: { "x-wechat-context-token": gpContextToken }, payload: { favoriteCollection: "Bridges" } });
    expect(response.statusCode).toBe(200);
    expect((await prisma.customerBrandProfile.findUniqueOrThrow({ where: { customerId_brandId: { customerId, brandId: gpBrandId } } })).favoriteCollection).toBe("Bridges");
    const unAfter = await prisma.customerBrandProfile.findUniqueOrThrow({ where: { customerId_brandId: { customerId, brandId: unBrandId } } });
    expect(unAfter.updatedAt.getTime()).toBe(unBefore.updatedAt.getTime());
    expect(unAfter.favoriteCollection).toBe(unBefore.favoriteCollection);
    expect(await prisma.customerJourneyEvent.count({ where: { customerId, brandId: gpBrandId, eventType: "PROFILE_UPDATE" } })).toBe(1);
  });

  it("E: CustomerIdentity stores verified, brand/app-scoped OpenID and mobile bindings", async () => {
    const identities = await prisma.customerIdentity.findMany({ where: { customerId, verifiedAt: { not: null } } });
    expect(identities).toEqual(expect.arrayContaining([
      expect.objectContaining({ brandId: gpBrandId, identityType: "OPENID", scope: `APP:${gpAppId}`, value: gpOpenId }),
      expect.objectContaining({ brandId: gpBrandId, identityType: "VERIFIED_MOBILE", scope: `APP:${gpAppId}`, value: primaryMobile }),
      expect.objectContaining({ brandId: unBrandId, identityType: "OPENID", scope: `APP:${unAppId}`, value: unOpenId }),
    ]));
  });

  it("F: a scoped OpenID conflict returns 409, preserves the binding and records Audit", async () => {
    const second = await prisma.customer.create({ data: { customerNo: `R2-CONFLICT-${runKey}`, displayName: "Identity Conflict", mobile: conflictMobile, mobileNormalized: conflictMobile } });
    const response = await app.inject({ method: "POST", url: "/api/v1/wechat/phone/resolve", payload: { brandCode: "GP", code: conflictCode } });
    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: { code: string } }>().error.code).toBe("IDENTITY_CONFLICT");
    const binding = await prisma.customerIdentity.findUniqueOrThrow({ where: { brandId_identityType_scope_value: { brandId: gpBrandId, identityType: "OPENID", scope: `APP:${gpAppId}`, value: gpOpenId } } });
    expect(binding.customerId).toBe(customerId);
    expect(binding.customerId).not.toBe(second.id);
    expect(await prisma.auditLog.count({ where: { action: "IDENTITY_CONFLICT", targetId: customerId, createdAt: { gte: auditCutoff } } })).toBeGreaterThan(0);
  });

  it("G: Fake Adapter resolves and normalizes phone without persisting authorization code or secret", async () => {
    expect(primaryMobile).toMatch(/^\+861\d{10}$/);
    const audits = await prisma.auditLog.findMany({ where: { createdAt: { gte: auditCutoff } }, select: { details: true } });
    const serialized = JSON.stringify(audits);
    expect(serialized).not.toContain(gpCode);
    expect(serialized).not.toContain(unCode);
    expect(serialized).not.toContain(fakeSecretMarker);
    expect(await prisma.wechatIdentityContext.count({ where: { appId: gpAppId } })).toBeGreaterThan(0);
  });

  it("H: GET /me/member returns registered true and false for separate verified contexts", async () => {
    const registered = await app.inject({ method: "GET", url: "/api/v1/me/member", headers: { "x-wechat-context-token": gpContextToken } });
    expect(registered.statusCode).toBe(200);
    expect(registered.json<{ data: { registered: boolean; customerId: string } }>().data).toMatchObject({ registered: true, customerId });
    const unknown = await resolvePhone("GP", unknownCode);
    expect(unknown.response.statusCode).toBe(200);
    unknownContextToken = unknown.data.contextToken;
    const notRegistered = await app.inject({ method: "GET", url: "/api/v1/me/member", headers: { "x-wechat-context-token": unknownContextToken } });
    expect(notRegistered.statusCode).toBe(200);
    expect(notRegistered.json<{ data: { registered: boolean } }>().data.registered).toBe(false);
  });

  it("I: GP /me/member never returns the UN Profile", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/me/member", headers: { "x-wechat-context-token": gpContextToken } });
    const body = response.json<{ data: { brand: { code: string }; profile: { brandId: string; email: string } } }>().data;
    expect(body.brand.code).toBe("GP");
    expect(body.profile.brandId).toBe(gpBrandId);
    expect(body.profile.email).toContain("member-gp-");
    expect(JSON.stringify(body)).not.toContain("member-un-");
  });

  it("L: Member registration does not create a Sowind Outbox or call Gateway", async () => {
    expect(await prisma.integrationOutbox.count()).toBe(outboxCountBeforeMemberRegistration);
  });

  it("J: a MINI_PROGRAM Lead auto-links through the trusted WeChat context", async () => {
    const response = await signedMiniLead("known-member", gpContextToken, primaryMobile, "untrusted-client-customer-id");
    expect(response.statusCode).toBe(202);
    const id = response.json<{ data: { id: string; syncStatus: string } }>().data.id;
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id } });
    expect(lead).toMatchObject({ customerId, syncStatus: "SYNC_PENDING", source: "MINI_PROGRAM" });
    expect(await prisma.integrationOutbox.count({ where: { aggregateType: "LEAD", aggregateId: id } })).toBe(1);
    expect(await prisma.customerJourneyEvent.count({ where: { customerId, brandId: gpBrandId, eventType: "LEAD_SUBMITTED" } })).toBeGreaterThan(0);
  });

  it("K: an unknown WeChat user still creates an unlinked MINI_PROGRAM Lead and Outbox", async () => {
    const response = await signedMiniLead("unknown-member", unknownContextToken, unknownMobile);
    expect(response.statusCode).toBe(202);
    const id = response.json<{ data: { id: string; syncStatus: string } }>().data.id;
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id } });
    expect(lead.customerId).toBeNull();
    expect(lead.syncStatus).toBe("SYNC_PENDING");
    expect(await prisma.integrationOutbox.count({ where: { aggregateType: "LEAD", aggregateId: id } })).toBe(1);
  });
});
