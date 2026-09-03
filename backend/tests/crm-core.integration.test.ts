import { createHash, createHmac, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { SESSION_COOKIE, sessionTokenHash } from "../src/common/auth.js";
import type { AppConfig } from "../src/common/config.js";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const runKey = `CRM3-${Date.now()}-${randomUUID().slice(0, 6)}`;
const runKeyLower = runKey.toLowerCase();

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

describe.skipIf(!enabled).sequential("Kivisense CRM 2.0 core backend", () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let config: AppConfig;
  let superCookie: string;
  let salesCookie: string;
  let viewerCookie: string;
  let salesRoleId: string;
  let primaryContactId: string;
  let immutableLeadId: string;
  let contactFollowupId: string;
  let leadFollowupId: string;
  let salesCreatedContactId: string;
  let apiCreatedSalesUserId: string;
  let disabledOwnerUserId: string;
  let legacyIntegrationLeadId: string | undefined;

  const contactPayload = (label: string, extra: Record<string, unknown> = {}) => ({
    contactName: `${label} ${runKey}`,
    companyName: `Kivisense Test ${runKey}`,
    initialContext: runKey,
    ...extra,
  });

  const leadPayload = (contactId: string, label: string, extra: Record<string, unknown> = {}) => ({
    contactId,
    requirementSummary: `${label} ${runKey}`,
    ...extra,
  });

  const createSessionCookie = async (userId: string) => {
    const token = `${randomUUID()}${randomUUID()}`;
    await prisma.session.create({
      data: {
        userId,
        tokenHash: sessionTokenHash(token, config.sessionSecret),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    return `${SESSION_COOKIE}=${token}`;
  };

  const createActor = async (roleKey: "SUPER_ADMIN" | "SALES" | "VIEWER", label: string, brandId?: string) => {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const user = await prisma.user.create({
      data: {
        name: `${label} ${runKey}`,
        loginAccount: `${label}.${runKeyLower}@example.test`,
        passwordHash: "$argon2id$crm-step-3-test-only",
        roleId: role.id,
        mustChangePassword: false,
        brandAccess: brandId ? { create: { brandId } } : undefined,
      },
    });
    return { user, cookie: await createSessionCookie(user.id) };
  };

  const createContact = async (label: string, extra: Record<string, unknown> = {}, cookie = salesCookie) => {
    const response = await app.inject({ method: "POST", url: "/api/v1/crm/contacts", headers: { cookie }, payload: contactPayload(label, extra) });
    expect(response.statusCode).toBe(201);
    return response.json<{ data: { id: string } }>().data;
  };

  const createLead = async (contactId: string, label: string, extra: Record<string, unknown> = {}, cookie = salesCookie) => {
    const response = await app.inject({ method: "POST", url: "/api/v1/crm/leads", headers: { cookie }, payload: leadPayload(contactId, label, extra) });
    expect(response.statusCode).toBe(201);
    return response.json<{ data: { id: string; estimatedQuote: string | null } }>().data;
  };

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("TEST_DATABASE_URL or DATABASE_URL is required for CRM integration tests");
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    config = {
      nodeEnv: "test",
      logLevel: "silent",
      port: 0,
      databaseUrl,
      sessionSecret: "crm-step-3-integration-session-secret-2026",
      sessionTtlHours: 12,
      initialPassword: "CrmStep3InitialPassword@2026",
      superAdminAccount: "crm-step3-admin@example.test",
      superAdminName: "CRM Step 3 Admin",
      seedDemoData: false,
      cookieSecure: false,
      corsOrigin: "*",
      appBasePath: "",
      trustProxy: false,
      maxBodyBytes: 10 * 1024 * 1024,
      storageDir: resolve(process.cwd(), "../storage/test-crm-step-3"),
      outboxPollIntervalMs: 1000,
      outboxLeaseSeconds: 30,
      workerInstanceId: `crm-step3-${runKey}`,
      sowindGatewayAccessKey: "",
      sowindGatewayGpUrl: "https://gp.example.test/gateway",
      sowindGatewayUnUrl: "https://un.example.test/gateway",
      sowindGatewayTimeoutMs: 10_000,
      sowindGatewayMaxAttempts: 5,
      sowindGatewayMaxPerMinute: 60,
      runSowindLiveTests: false,
      integrationClientId: `crm-step3-${runKey}`,
      integrationClientSecret: "crm-step-3-integration-client-secret",
    };
    const gp = await prisma.brand.findUniqueOrThrow({ where: { code: "GP" } });
    const superActor = await createActor("SUPER_ADMIN", "super");
    const salesActor = await createActor("SALES", "sales");
    const viewerActor = await createActor("VIEWER", "viewer", gp.id);
    superCookie = superActor.cookie;
    salesCookie = salesActor.cookie;
    viewerCookie = viewerActor.cookie;
    salesRoleId = salesActor.user.roleId;
    app = await buildApp({ config, prisma, startWorker: false, frontendRoot: resolve(process.cwd(), "../frontend") });
    await app.ready();
  });

  afterAll(async () => {
    if (!prisma) return;
    const contacts = await prisma.contact.findMany({ where: { initialContext: runKey }, select: { id: true } });
    const contactIds = contacts.map((item) => item.id);
    const crmLeads = await prisma.crmLead.findMany({ where: { requirementSummary: { contains: runKey } }, select: { id: true } });
    const crmLeadIds = crmLeads.map((item) => item.id);
    await prisma.leadFollowup.deleteMany({ where: { leadId: { in: crmLeadIds } } });
    await prisma.contactFollowup.deleteMany({ where: { contactId: { in: contactIds } } });
    await prisma.crmLead.deleteMany({ where: { id: { in: crmLeadIds } } });
    await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });

    if (legacyIntegrationLeadId) {
      const outboxes = await prisma.integrationOutbox.findMany({ where: { aggregateType: "LEAD", aggregateId: legacyIntegrationLeadId }, select: { id: true } });
      await prisma.integrationAttempt.deleteMany({ where: { outboxId: { in: outboxes.map((item) => item.id) } } });
      await prisma.integrationOutbox.deleteMany({ where: { id: { in: outboxes.map((item) => item.id) } } });
      await prisma.consentRecord.deleteMany({ where: { leadId: legacyIntegrationLeadId } });
      await prisma.lead.deleteMany({ where: { id: legacyIntegrationLeadId } });
    }
    await prisma.integrationNonce.deleteMany({ where: { clientId: config.integrationClientId } });
    const users = await prisma.user.findMany({ where: { loginAccount: { contains: runKeyLower } }, select: { id: true } });
    const userIds = users.map((item) => item.id);
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { targetId: { in: [...contactIds, ...crmLeadIds] } }] } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userBrandAccess.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app?.close();
    await prisma.$disconnect();
  });

  it("TEST 1 creates a Contact", async () => {
    const response = await app.inject({ method: "POST", url: "/api/v1/crm/contacts", headers: { cookie: salesCookie }, payload: contactPayload("Primary", { email: `primary.${runKeyLower}@example.test`, phone: "+86 138 0000 0001" }) });
    expect(response.statusCode).toBe(201);
    const body = response.json<{ data: { id: string; contactName: string } }>();
    expect(body.data.contactName).toContain("Primary");
    primaryContactId = body.data.id;
  });

  it("TEST 2 allows null Contact email and phone", async () => {
    const row = await createContact("Nullable", { email: null, phone: null });
    const stored = await prisma.contact.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.email).toBeNull();
    expect(stored.phone).toBeNull();
  });

  it("TEST 3 allows duplicate Contact email", async () => {
    const email = `duplicate.${runKeyLower}@example.test`;
    await createContact("Duplicate Email A", { email });
    const second = await createContact("Duplicate Email B", { email });
    expect(await prisma.contact.count({ where: { email } })).toBe(2);
    expect(second.id).toBeTruthy();
  });

  it("TEST 4 allows duplicate Contact phone", async () => {
    const phone = `+86 139 ${String(Date.now()).slice(-8)}`;
    await createContact("Duplicate Phone A", { phone });
    const second = await createContact("Duplicate Phone B", { phone });
    expect(await prisma.contact.count({ where: { phone } })).toBe(2);
    expect(second.id).toBeTruthy();
  });

  it("TEST 5 supports Contact 1:N Lead and paged associations", async () => {
    const contact = await createContact("One To Many");
    await createLead(contact.id, "Opportunity One");
    await createLead(contact.id, "Opportunity Two");
    const detail = await app.inject({ method: "GET", url: `/api/v1/crm/contacts/${contact.id}`, headers: { cookie: salesCookie } });
    const related = await app.inject({ method: "GET", url: `/api/v1/crm/contacts/${contact.id}/leads?page=1&pageSize=1`, headers: { cookie: salesCookie } });
    expect(detail.json<{ data: { relatedLeadCount: number } }>().data.relatedLeadCount).toBe(2);
    expect(related.json<{ data: unknown[]; meta: { total: number; pageSize: number } }>()).toMatchObject({ data: [expect.any(Object)], meta: { total: 2, pageSize: 1 } });
  });

  it("TEST 6 rejects CRM Lead without contactId", async () => {
    const response = await app.inject({ method: "POST", url: "/api/v1/crm/leads", headers: { cookie: salesCookie }, payload: { requirementSummary: `Missing Contact ${runKey}` } });
    expect(response.statusCode).toBe(422);
  });

  it("TEST 7 rejects nonexistent CRM Lead contactId", async () => {
    const response = await app.inject({ method: "POST", url: "/api/v1/crm/leads", headers: { cookie: salesCookie }, payload: leadPayload("missing-contact-id", "Unknown Contact") });
    expect(response.statusCode).toBe(422);
    expect(response.json<{ error: { fieldErrors: Array<{ field: string }> } }>().error.fieldErrors[0]?.field).toBe("contactId");
  });

  it("TEST 8 reads current Contact facts from CRM Lead detail", async () => {
    const contact = await createContact("Live Relation", { email: `old.${runKeyLower}@example.test` });
    const lead = await createLead(contact.id, "Live Contact Relation");
    const newEmail = `new.${runKeyLower}@example.test`;
    expect((await app.inject({ method: "PATCH", url: `/api/v1/crm/contacts/${contact.id}`, headers: { cookie: salesCookie }, payload: { email: newEmail } })).statusCode).toBe(200);
    const detail = await app.inject({ method: "GET", url: `/api/v1/crm/leads/${lead.id}`, headers: { cookie: salesCookie } });
    expect(detail.json<{ data: { contact: { email: string } } }>().data.contact.email).toBe(newEmail);
    immutableLeadId = lead.id;
  });

  it("TEST 9 rejects contactId in CRM Lead PATCH", async () => {
    const response = await app.inject({ method: "PATCH", url: `/api/v1/crm/leads/${immutableLeadId}`, headers: { cookie: salesCookie }, payload: { contactId: primaryContactId } });
    expect(response.statusCode).toBe(422);
  });

  it("TEST 10 creates and lists Contact Followup", async () => {
    const occurredAt = "2026-09-03T14:30:00+08:00";
    const response = await app.inject({ method: "POST", url: `/api/v1/crm/contacts/${primaryContactId}/followups`, headers: { cookie: salesCookie }, payload: { occurredAt, type: "WECHAT", content: `Contact timeline ${runKey}` } });
    expect(response.statusCode).toBe(201);
    contactFollowupId = response.json<{ data: { id: string } }>().data.id;
    const timeline = await app.inject({ method: "GET", url: `/api/v1/crm/contacts/${primaryContactId}/followups`, headers: { cookie: salesCookie } });
    expect(timeline.json<{ data: Array<{ id: string }> }>().data.map((item) => item.id)).toContain(contactFollowupId);
  });

  it("TEST 11 has no Contact Followup update route", async () => {
    const response = await app.inject({ method: "PATCH", url: `/api/v1/crm/contacts/${primaryContactId}/followups/${contactFollowupId}`, headers: { cookie: salesCookie }, payload: { content: "changed" } });
    expect(response.statusCode).toBe(404);
  });

  it("TEST 12 has no Contact Followup delete route", async () => {
    const response = await app.inject({ method: "DELETE", url: `/api/v1/crm/contacts/${primaryContactId}/followups/${contactFollowupId}`, headers: { cookie: salesCookie } });
    expect(response.statusCode).toBe(404);
  });

  it("TEST 13 creates Lead Followup", async () => {
    const lead = await createLead(primaryContactId, "Followup Lead");
    const response = await app.inject({ method: "POST", url: `/api/v1/crm/leads/${lead.id}/followups`, headers: { cookie: salesCookie }, payload: { occurredAt: "2026-09-01T10:00:00Z", type: "CALL", content: `Lead timeline ${runKey}`, important: true } });
    expect(response.statusCode).toBe(201);
    leadFollowupId = response.json<{ data: { id: string; important: boolean } }>().data.id;
    expect(response.json<{ data: { important: boolean } }>().data.important).toBe(true);
  });

  it("TEST 14 does not move lastFollowupAt backward for a backfilled record", async () => {
    const lead = await createLead(primaryContactId, "Conditional Followup Cache");
    for (const [occurredAt, content] of [["2026-09-03T00:00:00Z", "newer"], ["2026-08-20T00:00:00Z", "older"]] as const) {
      const response = await app.inject({ method: "POST", url: `/api/v1/crm/leads/${lead.id}/followups`, headers: { cookie: salesCookie }, payload: { occurredAt, content: `${content} ${runKey}` } });
      expect(response.statusCode).toBe(201);
    }
    const stored = await prisma.crmLead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(stored.lastFollowupAt?.toISOString()).toBe("2026-09-03T00:00:00.000Z");
  });

  it("TEST 15 allows VIEWER to GET Contact", async () => {
    const response = await app.inject({ method: "GET", url: `/api/v1/crm/contacts/${primaryContactId}`, headers: { cookie: viewerCookie } });
    expect(response.statusCode).toBe(200);
  });

  it("TEST 16 rejects VIEWER Contact creation", async () => {
    const response = await app.inject({ method: "POST", url: "/api/v1/crm/contacts", headers: { cookie: viewerCookie }, payload: contactPayload("Viewer Forbidden") });
    expect(response.statusCode).toBe(403);
  });

  it("TEST 17 allows SUPER_ADMIN to create SALES with empty brandIds", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: superCookie },
      payload: { name: `API Sales ${runKey}`, loginAccount: `api-sales.${runKeyLower}@example.test`, roleId: salesRoleId, brandIds: [], status: "ACTIVE" },
    });
    expect(response.statusCode).toBe(201);
    apiCreatedSalesUserId = response.json<{ data: { id: string } }>().data.id;
    expect(await prisma.userBrandAccess.count({ where: { userId: apiCreatedSalesUserId } })).toBe(0);
  });

  it("TEST 18 allows SALES to create Contact", async () => {
    const row = await createContact("Sales Contact");
    salesCreatedContactId = row.id;
    expect(row.id).toBeTruthy();
  });

  it("TEST 19 allows SALES to create CRM Lead", async () => {
    const row = await createLead(salesCreatedContactId, "Sales Opportunity");
    expect(row.id).toBeTruthy();
  });

  it("TEST 20 creates no IntegrationOutbox for CRM Lead", async () => {
    const before = await prisma.integrationOutbox.count();
    await createLead(primaryContactId, "No Sowind Outbox");
    expect(await prisma.integrationOutbox.count()).toBe(before);
  });

  it("TEST 21 preserves Legacy /api/v1/leads", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/leads?page=1&pageSize=1", headers: { cookie: superCookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty("metrics.statuses");
  });

  it("TEST 22 preserves the signed Legacy Integration API", async () => {
    const payload = {
      brandCode: "GP",
      sku: "81010-11-3475-1CM",
      email: `legacy.${runKeyLower}@example.test`,
      salutation: "Mr",
      firstname: "Legacy",
      lastname: "Regression",
      phone: "+8613812345678",
      preferredContact: "Email",
      country: "China",
      city: "Shanghai",
      ownsBrandWatch: "No",
      processingConsent: true,
      marketingOptIn: false,
    };
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const bodyHash = createHash("sha256").update(canonicalJson(payload)).digest("hex");
    const signature = createHmac("sha256", config.integrationClientSecret).update(`${timestamp}.${nonce}.${bodyHash}`).digest("hex");
    const response = await app.inject({
      method: "POST",
      url: "/api/integration/v1/leads",
      headers: {
        "x-client-id": config.integrationClientId,
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-signature": signature,
        "idempotency-key": `${runKey}:legacy-integration`,
      },
      payload,
    });
    expect(response.statusCode).toBe(202);
    legacyIntegrationLeadId = response.json<{ data: { id: string } }>().data.id;
  });

  it("TEST 23 writes CREATE_CONTACT Audit without duplicated PII", async () => {
    const contact = await createContact("Audited Contact", { email: `audit.${runKeyLower}@example.test` });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "CREATE_CONTACT", targetType: "contact", targetId: contact.id } });
    expect(audit.brandId).toBeNull();
    expect(JSON.stringify(audit.details)).not.toContain(`audit.${runKeyLower}@example.test`);
  });

  it("TEST 24 writes CREATE_LEAD_FOLLOWUP Audit without content", async () => {
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "CREATE_LEAD_FOLLOWUP", targetType: "lead_followup", targetId: leadFollowupId } });
    expect(audit.brandId).toBeNull();
    expect(JSON.stringify(audit.details)).not.toContain(`Lead timeline ${runKey}`);
  });

  it("TEST 25 keeps historical Contact and Followup relations readable after User disable", async () => {
    const target = await prisma.user.create({
      data: { name: `Disabled Owner ${runKey}`, loginAccount: `disabled.${runKeyLower}@example.test`, passwordHash: "$argon2id$crm-step-3-test-only", roleId: salesRoleId, mustChangePassword: false },
    });
    disabledOwnerUserId = target.id;
    const contact = await createContact("Disabled Owner History", { ownerUserId: target.id });
    const followup = await app.inject({ method: "POST", url: `/api/v1/crm/contacts/${contact.id}/followups`, headers: { cookie: salesCookie }, payload: { occurredAt: "2026-09-03T08:00:00Z", ownerUserId: target.id, content: `Disable history ${runKey}` } });
    expect(followup.statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: `/api/v1/users/${target.id}/disable`, headers: { cookie: superCookie } })).statusCode).toBe(200);
    const detail = await app.inject({ method: "GET", url: `/api/v1/crm/contacts/${contact.id}`, headers: { cookie: viewerCookie } });
    const timeline = await app.inject({ method: "GET", url: `/api/v1/crm/contacts/${contact.id}/followups`, headers: { cookie: viewerCookie } });
    expect(detail.json<{ data: { owner: { id: string; status: string } } }>().data.owner).toMatchObject({ id: disabledOwnerUserId, status: "DISABLED" });
    expect(timeline.json<{ data: Array<{ owner: { id: string; status: string } }> }>().data[0]?.owner).toMatchObject({ id: disabledOwnerUserId, status: "DISABLED" });
  });

  it("exposes an ACTIVE-only CRM user directory to SALES without account management permission", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/crm/users", headers: { cookie: salesCookie } });
    expect(response.statusCode).toBe(200);
    const users = response.json<{ data: Array<Record<string, unknown>> }>().data;
    expect(users.some((user) => user.id === disabledOwnerUserId)).toBe(false);
    expect(users.some((user) => user.id === apiCreatedSalesUserId)).toBe(true);
    expect(Object.keys(users[0] ?? {}).sort()).toEqual(["id", "loginAccount", "name", "status"]);
  });

  it("rejects ambiguous timezone-free Followup timestamps", async () => {
    const response = await app.inject({ method: "POST", url: `/api/v1/crm/contacts/${primaryContactId}/followups`, headers: { cookie: salesCookie }, payload: { occurredAt: "2026-09-03T14:30:00", content: `Ambiguous ${runKey}` } });
    expect(response.statusCode).toBe(422);
  });

  it("requires currency with quote and serializes Decimal as a string", async () => {
    const invalid = await app.inject({ method: "POST", url: "/api/v1/crm/leads", headers: { cookie: salesCookie }, payload: leadPayload(primaryContactId, "Missing Currency", { estimatedQuote: "63000.50" }) });
    expect(invalid.statusCode).toBe(422);
    const valid = await createLead(primaryContactId, "Quoted Opportunity", { estimatedQuote: "63000.50", currency: "CNY" });
    expect(valid.estimatedQuote).toBe("63000.50");
  });
});
