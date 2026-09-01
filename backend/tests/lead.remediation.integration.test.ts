import { createHash, createHmac, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { SESSION_COOKIE, sessionTokenHash } from "../src/common/auth.js";
import type { AppConfig } from "../src/common/config.js";
import { classifyGatewayResponse, timeoutGatewayResult } from "../src/integrations/sowind/sowind.errors.js";
import { SowindGatewayClient } from "../src/integrations/sowind/sowind.gateway-client.js";
import type { GatewayDeliveryResult } from "../src/integrations/sowind/sowind.types.js";
import { SowindOutboxWorker } from "../src/integrations/sowind/sowind.worker.js";
import { createCanonicalLead } from "../src/leads/service.js";

const integrationEnabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const runKey = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const idempotencyPrefix = `R1:${runKey}`;

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

describe.skipIf(!integrationEnabled)("Remediation Round 1 Lead API/DB/Worker", () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let config: AppConfig;
  let authCookie: string;
  let testUserId: string;
  let testRoleId: string;
  let gpBrandId: string;
  let manualLeadId: string;

  const basePayload = (label: string) => ({
    brandCode: "GP" as const,
    leadType: "PURCHASE_INTENT",
    source: "ADMIN_MANUAL",
    submissionMode: "ADMIN_MANUAL" as const,
    formVersion: "2.0",
    sku: "81010-11-3475-1CM",
    email: `${label}.${runKey}@example.test`,
    salutation: "Mr" as const,
    firstname: "Round",
    lastname: "One",
    phone: "+86 138 1234 5678",
    preferredContact: "Email",
    country: "China",
    city: "Shanghai",
    ownsBrandWatch: "No" as const,
    processingConsent: true as const,
    marketingOptIn: false,
  });

  const parkRunnableOutboxes = async () => {
    await prisma.integrationOutbox.updateMany({
      where: { status: { in: ["PENDING", "RETRY_WAITING"] } },
      data: { nextAttemptAt: new Date("2099-01-01T00:00:00.000Z") },
    });
  };

  const acceptedClient = (ref: string) => new SowindGatewayClient(
    config,
    (async () => new Response(JSON.stringify({ status: "queued", ref, brand: "gp" }), { status: 202 })) as typeof fetch,
  );

  const fixedResultClient = (result: GatewayDeliveryResult) => ({
    deliver: async () => result,
    endpointFor: () => config.sowindGatewayGpUrl,
  }) as unknown as SowindGatewayClient;

  const createMiniProgramLead = async (label: string) => prisma.$transaction((tx) => createCanonicalLead(tx, config, {
    ...basePayload(label),
    source: "MINI_PROGRAM",
    submissionMode: "USER_SUBMITTED",
    idempotencyKey: `${idempotencyPrefix}:${label}`,
    createdByService: "round-1-integration-test",
  }));

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("TEST_DATABASE_URL or DATABASE_URL is required for DB integration tests");
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();

    config = {
      nodeEnv: "test",
      port: 0,
      databaseUrl,
      sessionSecret: "round-1-integration-session-secret-2026",
      sessionTtlHours: 12,
      initialPassword: "Round1InitialPassword@2026",
      superAdminAccount: "round1-admin@example.test",
      superAdminName: "Round 1 Admin",
      seedDemoData: false,
      cookieSecure: false,
      corsOrigin: "*",
      appBasePath: "",
      trustProxy: false,
      maxBodyBytes: 10 * 1024 * 1024,
      storageDir: resolve(process.cwd(), "../storage/test-round-1"),
      outboxPollIntervalMs: 1000,
      sowindGatewayAccessKey: "round-1-gateway-key",
      sowindGatewayGpUrl: "https://gp.example.test/gateway",
      sowindGatewayUnUrl: "https://un.example.test/gateway",
      sowindGatewayTimeoutMs: 10_000,
      sowindGatewayMaxAttempts: 5,
      sowindGatewayMaxPerMinute: 60,
      runSowindLiveTests: false,
      integrationClientId: "round-1-mini-program",
      integrationClientSecret: "round-1-mini-program-secret",
    };

    const gp = await prisma.brand.upsert({
      where: { code: "GP" },
      update: { active: true },
      create: { code: "GP", name: "GP 芝柏表", shortName: "GP", active: true },
    });
    gpBrandId = gp.id;
    const form = await prisma.formDefinition.findUnique({
      where: { brandId_objectType_formKey_version: { brandId: gp.id, objectType: "LEAD", formKey: "PURCHASE_INTENT", version: "2.0" } },
    });
    if (!form) {
      await prisma.formDefinition.create({
        data: {
          brandId: gp.id,
          objectType: "LEAD",
          formKey: "PURCHASE_INTENT",
          version: "2.0",
          active: true,
          schemaJson: { fields: [] },
          policyVersion: "GP-ROUND-1-TEST",
          termsVersion: "GP-ROUND-1-TEST",
          effectiveAt: new Date(),
        },
      });
    }

    const role = await prisma.role.create({ data: { key: `R1_${runKey}`.replaceAll("-", "_").slice(0, 60), name: "Round 1 Test Role" } });
    testRoleId = role.id;
    const permissionIds: string[] = [];
    for (const key of ["lead.view", "lead.create", "lead.edit", "lead.sync"]) {
      const permission = await prisma.permission.upsert({ where: { key }, update: {}, create: { key, name: key, module: "lead" } });
      permissionIds.push(permission.id);
    }
    await prisma.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })) });
    const user = await prisma.user.create({
      data: {
        name: "Round 1 Test Admin",
        loginAccount: `round1-${runKey}@example.test`,
        passwordHash: "$argon2id$round-1-test-only",
        roleId: role.id,
        status: "ACTIVE",
        mustChangePassword: false,
        brandAccess: { create: { brandId: gp.id } },
      },
    });
    testUserId = user.id;
    const token = randomUUID();
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sessionTokenHash(token, config.sessionSecret),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    authCookie = `${SESSION_COOKIE}=${token}`;

    app = await buildApp({ config, prisma, startWorker: false, frontendRoot: resolve(process.cwd(), "../frontend") });
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      const leads = await prisma.lead.findMany({ where: { idempotencyKey: { startsWith: idempotencyPrefix } }, select: { id: true } });
      const leadIds = leads.map((lead) => lead.id);
      if (leadIds.length) {
        await prisma.integrationAttempt.deleteMany({ where: { leadId: { in: leadIds } } });
        await prisma.integrationOutbox.deleteMany({ where: { aggregateType: "LEAD", aggregateId: { in: leadIds } } });
        await prisma.consentRecord.deleteMany({ where: { leadId: { in: leadIds } } });
        await prisma.auditLog.deleteMany({ where: { targetType: "lead", targetId: { in: leadIds } } });
        await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
      }
      if (testUserId) {
        await prisma.session.deleteMany({ where: { userId: testUserId } });
        await prisma.userBrandAccess.deleteMany({ where: { userId: testUserId } });
        await prisma.user.deleteMany({ where: { id: testUserId } });
      }
      if (testRoleId) {
        await prisma.rolePermission.deleteMany({ where: { roleId: testRoleId } });
        await prisma.role.deleteMany({ where: { id: testRoleId } });
      }
      await prisma.$disconnect();
    }
  }, 30_000);

  it("A: MINI_PROGRAM Lead is stored as SYNC_PENDING and automatically creates an Outbox", async () => {
    const body = { ...basePayload("mini-api"), source: "IGNORED_BY_INTEGRATION_ROUTE" };
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const bodyHash = createHash("sha256").update(canonicalJson(body)).digest("hex");
    const signature = createHmac("sha256", config.integrationClientSecret).update(`${timestamp}.${nonce}.${bodyHash}`).digest("hex");
    const response = await app.inject({
      method: "POST",
      url: "/api/integration/v1/leads",
      headers: {
        "content-type": "application/json",
        "x-client-id": config.integrationClientId,
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-signature": signature,
        "idempotency-key": `${idempotencyPrefix}:mini-api`,
      },
      payload: body,
    });
    expect(response.statusCode).toBe(202);
    const payload = response.json<{ data: { id: string; syncStatus: string } }>();
    expect(payload.data.syncStatus).toBe("SYNC_PENDING");
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: payload.data.id } });
    expect(lead.source).toBe("MINI_PROGRAM");
    expect(lead.submissionMode).toBe("EXTERNAL_API");
    const outbox = await prisma.integrationOutbox.findFirstOrThrow({ where: { aggregateType: "LEAD", aggregateId: lead.id } });
    expect(outbox.status).toBe("PENDING");
    expect(outbox.triggeredBy).toBe("AUTO");
  });

  it("B: ADMIN_MANUAL Lead stays NOT_SYNCED and cannot create an automatic Outbox", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/leads",
      headers: { cookie: authCookie, "content-type": "application/json", "idempotency-key": `${idempotencyPrefix}:admin-manual` },
      payload: { ...basePayload("admin-manual"), source: "MINI_PROGRAM", submissionMode: "USER_SUBMITTED" },
    });
    expect(response.statusCode).toBe(201);
    const payload = response.json<{ data: { id: string; source: string; submissionMode: string; syncStatus: string } }>();
    manualLeadId = payload.data.id;
    expect(payload.data).toMatchObject({ source: "ADMIN_MANUAL", submissionMode: "ADMIN_MANUAL", syncStatus: "NOT_SYNCED" });
    expect(await prisma.integrationOutbox.count({ where: { aggregateType: "LEAD", aggregateId: manualLeadId } })).toBe(0);
  });

  it("C: IMPORT Lead stays NOT_SYNCED and cannot create an automatic Outbox", async () => {
    const created = await prisma.$transaction((tx) => createCanonicalLead(tx, config, {
      ...basePayload("import"),
      source: "BATCH_IMPORT",
      submissionMode: "BATCH_IMPORT",
      idempotencyKey: `${idempotencyPrefix}:import`,
      createdBy: testUserId,
    }));
    expect(created.lead.syncStatus).toBe("NOT_SYNCED");
    expect(created.outboxCreated).toBe(false);
    expect(await prisma.integrationOutbox.count({ where: { aggregateType: "LEAD", aggregateId: created.lead.id } })).toBe(0);
  });

  it("E: an Email-only ADMIN_MANUAL Lead is accepted with a null phone", async () => {
    const { phone: _phone, ...emailOnly } = basePayload("email-only");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/leads",
      headers: { cookie: authCookie, "content-type": "application/json", "idempotency-key": `${idempotencyPrefix}:email-only` },
      payload: emailOnly,
    });
    expect(response.statusCode).toBe(201);
    const payload = response.json<{ data: { id: string; phone: string | null; syncStatus: string } }>();
    expect(payload.data.phone).toBeNull();
    expect(payload.data.syncStatus).toBe("NOT_SYNCED");
  });

  it("D: manual sync moves ADMIN_MANUAL to SYNC_PENDING and the Worker records an ADMIN attempt", async () => {
    await parkRunnableOutboxes();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/leads/${manualLeadId}/sync`,
      headers: { cookie: authCookie, "content-type": "application/json" },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ data: { syncStatus: string } }>().data.syncStatus).toBe("SYNC_PENDING");
    const queued = await prisma.integrationOutbox.findFirstOrThrow({ where: { aggregateType: "LEAD", aggregateId: manualLeadId } });
    expect(queued).toMatchObject({ status: "PENDING", triggeredBy: "ADMIN" });

    const worker = new SowindOutboxWorker(prisma, config, acceptedClient("ROUND1-MANUAL-REF"), app.log);
    expect(await worker.runOnce()).toBe(true);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: manualLeadId } });
    expect(lead.syncStatus).toBe("GATEWAY_ACCEPTED");
    const attempt = await prisma.integrationAttempt.findFirstOrThrow({ where: { leadId: manualLeadId } });
    expect(attempt.triggeredBy).toBe("ADMIN");
    expect(attempt.gatewayRef).toBe("ROUND1-MANUAL-REF");
    expect(JSON.stringify(attempt.requestSnapshot)).not.toContain("accessKey");
    expect(JSON.stringify(attempt.requestSnapshot)).not.toContain(config.sowindGatewayAccessKey);
  });

  it("G: Gateway HTTP 202 maps only to GATEWAY_ACCEPTED", async () => {
    await parkRunnableOutboxes();
    const created = await createMiniProgramLead("accepted-202");
    const worker = new SowindOutboxWorker(prisma, config, acceptedClient("ROUND1-AUTO-REF"), app.log);
    expect(await worker.runOnce()).toBe(true);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: created.lead.id } });
    expect(lead.syncStatus).toBe("GATEWAY_ACCEPTED");
    expect(lead.gatewayRef).toBe("ROUND1-AUTO-REF");
    const attempt = await prisma.integrationAttempt.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(attempt).toMatchObject({ httpStatus: 202, gatewayRef: "ROUND1-AUTO-REF", triggeredBy: "AUTO" });
    expect(["CRM_CONFIRMED", "SUCCEEDED"]).not.toContain(lead.syncStatus);
  });

  it.each([
    ["429", classifyGatewayResponse(429, { error: "queue_full" }, 1)],
    ["503", classifyGatewayResponse(503, { error: "queue_unavailable" }, 1)],
    ["timeout", timeoutGatewayResult(1)],
  ])("H: %s retries five times and sets the Lead to DEAD_LETTER", async (label, result) => {
    await parkRunnableOutboxes();
    const created = await createMiniProgramLead(`retry-${label}`);
    const worker = new SowindOutboxWorker(prisma, config, fixedResultClient(result), app.log);
    const outbox = await prisma.integrationOutbox.findFirstOrThrow({ where: { aggregateType: "LEAD", aggregateId: created.lead.id } });
    for (let attempt = 1; attempt <= config.sowindGatewayMaxAttempts; attempt += 1) {
      await prisma.integrationOutbox.update({ where: { id: outbox.id }, data: { nextAttemptAt: new Date(0) } });
      expect(await worker.runOnce()).toBe(true);
    }
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: created.lead.id } });
    expect(lead.syncStatus).toBe("DEAD_LETTER");
    expect((await prisma.integrationOutbox.findUniqueOrThrow({ where: { id: outbox.id } })).status).toBe("DEAD_LETTER");
    const attempts = await prisma.integrationAttempt.findMany({ where: { leadId: lead.id }, orderBy: { attemptNumber: "asc" } });
    expect(attempts).toHaveLength(5);
    expect(attempts.map((attempt) => attempt.triggeredBy)).toEqual(["AUTO", "RETRY_JOB", "RETRY_JOB", "RETRY_JOB", "RETRY_JOB"]);
    expect(attempts.every((attempt) => !JSON.stringify(attempt.requestSnapshot).includes("accessKey"))).toBe(true);
  });

  it("I: HTTP 400 sets SYNC_FAILED without blind retry", async () => {
    await parkRunnableOutboxes();
    const created = await createMiniProgramLead("invalid-400");
    const result = classifyGatewayResponse(400, { error: "invalid_payload", detail: "invalid field" }, 1);
    const worker = new SowindOutboxWorker(prisma, config, fixedResultClient(result), app.log);
    expect(await worker.runOnce()).toBe(true);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: created.lead.id } });
    expect(lead.syncStatus).toBe("SYNC_FAILED");
    expect((await prisma.integrationOutbox.findFirstOrThrow({ where: { aggregateType: "LEAD", aggregateId: lead.id } })).status).toBe("FAILED");
    expect(await prisma.integrationAttempt.count({ where: { leadId: lead.id } })).toBe(1);
  });
});
