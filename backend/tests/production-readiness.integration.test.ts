import { createHash, createHmac, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { appendAuditRecord } from "../src/common/audit.js";
import { SESSION_COOKIE, sessionTokenHash } from "../src/common/auth.js";
import type { AppConfig } from "../src/common/config.js";
import { SowindGatewayClient } from "../src/integrations/sowind/sowind.gateway-client.js";
import { SowindOutboxWorker } from "../src/integrations/sowind/sowind.worker.js";
import { createCanonicalLead } from "../src/leads/service.js";
import { wechatContextTokenHash } from "../src/wechat/context.js";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const runKey = `R4-${Date.now()}-${randomUUID().slice(0, 6)}`;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

describe.skipIf(!enabled)("Remediation Round 4 production readiness", () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let config: AppConfig;
  let fakeGateway: Server;
  let fakeGatewayUrl: string;
  let authCookie: string;
  let superCookie: string;
  let gpCookie: string;
  let unCookie: string;
  let actorRoleId: string;
  let targetRoleId: string;
  let actorUserId: string;
  let gpId: string;
  let unId: string;
  let customerId: string;
  const scopedUserIds: string[] = [];
  const gatewayRequests: Array<Record<string, unknown>> = [];

  const leadPayload = (brandCode: "GP" | "UN", marketingOptIn: boolean, suffix: string) => ({
    brandCode, leadType: "PURCHASE_INTENT", formVersion: "2.0", sku: brandCode === "GP" ? "81010-11-3475-1CM" : "2405-500-2A/3C",
    email: `${suffix}.${runKey}@example.test`, salutation: "Mr", firstname: "Round", lastname: "Four", phone: "+8613812345678",
    preferredContact: "Email", country: "China", city: "Shanghai", ownsBrandWatch: brandCode === "UN" ? "Yes" : "No",
    processingConsent: true as const, marketingOptIn,
  });

  const integrationRequest = async (body: Record<string, unknown>, contextToken?: string) => {
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const bodyHash = createHash("sha256").update(canonicalJson(body)).digest("hex");
    const signature = createHmac("sha256", config.integrationClientSecret).update(`${timestamp}.${nonce}.${bodyHash}`).digest("hex");
    return app.inject({ method: "POST", url: "/api/integration/v1/leads", headers: { "x-client-id": config.integrationClientId, "x-timestamp": timestamp, "x-nonce": nonce, "x-signature": signature, ...(contextToken ? { "x-wechat-context-token": contextToken } : {}), "idempotency-key": `${runKey}:${nonce}` }, payload: body });
  };

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("TEST_DATABASE_URL or DATABASE_URL is required");
    fakeGateway = createServer((request, response) => {
      let raw = "";
      request.on("data", (chunk) => { raw += String(chunk); });
      request.on("end", () => {
        const body = JSON.parse(raw) as Record<string, unknown>;
        gatewayRequests.push(body);
        response.writeHead(202, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "queued", ref: `fake-${gatewayRequests.length}`, brand: request.url?.includes("/un") ? "un" : "gp" }));
      });
    });
    await new Promise<void>((resolveListen) => fakeGateway.listen(0, "127.0.0.1", resolveListen));
    const address = fakeGateway.address();
    if (!address || typeof address === "string") throw new Error("Fake gateway did not bind");
    fakeGatewayUrl = `http://127.0.0.1:${address.port}`;

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    config = {
      nodeEnv: "test", logLevel: "silent", port: 0, databaseUrl, sessionSecret: "round-four-integration-session-secret-2026", sessionTtlHours: 12,
      initialPassword: "Round4InitialPassword@2026", superAdminAccount: "r4@example.test", superAdminName: "Round 4", seedDemoData: false,
      cookieSecure: false, corsOrigin: "*", appBasePath: "", trustProxy: false, maxBodyBytes: 10 * 1024 * 1024,
      storageDir: resolve(process.cwd(), "../storage/test-round-4"), outboxPollIntervalMs: 1000, outboxLeaseSeconds: 30, workerInstanceId: "round-4-worker",
      sowindGatewayAccessKey: "fake-gateway-key", sowindGatewayGpUrl: `${fakeGatewayUrl}/gp`, sowindGatewayUnUrl: `${fakeGatewayUrl}/un`,
      sowindGatewayTimeoutMs: 10_000, sowindGatewayMaxAttempts: 5, sowindGatewayMaxPerMinute: 60, runSowindLiveTests: false,
      integrationClientId: "round-4-mini-program", integrationClientSecret: "round-4-mini-program-secret",
    };
    const [gp, un] = await Promise.all([
      prisma.brand.findUniqueOrThrow({ where: { code: "GP" } }), prisma.brand.findUniqueOrThrow({ where: { code: "UN" } }),
    ]);
    gpId = gp.id; unId = un.id;
    const permissionKeys = ["customer.view", "customer.edit", "customer.import", "customer.export", "lead.view", "lead.create", "lead.edit", "lead.import", "lead.export", "lead.sync", "roles.view", "roles.configure", "audit.view"];
    const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } } });
    const actorRole = await prisma.role.create({ data: { key: runKey.replaceAll("-", "_").slice(0, 60), name: "Round 4 Actor" } });
    actorRoleId = actorRole.id;
    await prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: actorRole.id, permissionId: permission.id })) });
    const targetRole = await prisma.role.create({ data: { key: `${runKey}_TARGET`.replaceAll("-", "_").slice(0, 64), name: "Round 4 Target" } });
    targetRoleId = targetRole.id;
    const actor = await prisma.user.create({ data: { name: "Round 4 Operator", loginAccount: `${runKey}@example.test`.toLowerCase(), passwordHash: "$argon2id$round-four-test-only", roleId: actorRole.id, mustChangePassword: false, brandAccess: { createMany: { data: [{ brandId: gp.id }, { brandId: un.id }] } } } });
    actorUserId = actor.id;
    const token = randomUUID();
    await prisma.session.create({ data: { userId: actor.id, tokenHash: sessionTokenHash(token, config.sessionSecret), expiresAt: new Date(Date.now() + 3600_000) } });
    authCookie = `${SESSION_COOKIE}=${token}`;
    const superRole = await prisma.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
    const scopedAccounts = [
      { name: "Round 4 Super", roleId: superRole.id, brandIds: [] as string[] },
      { name: "Round 4 GP", roleId: actorRole.id, brandIds: [gp.id] },
      { name: "Round 4 UN", roleId: actorRole.id, brandIds: [un.id] },
    ];
    const scopedCookies: string[] = [];
    for (const [index, scoped] of scopedAccounts.entries()) {
      const user = await prisma.user.create({ data: { name: scoped.name, loginAccount: `${runKey}-scope-${index}@example.test`.toLowerCase(), passwordHash: "$argon2id$round-four-test-only", roleId: scoped.roleId, mustChangePassword: false, brandAccess: scoped.brandIds.length ? { createMany: { data: scoped.brandIds.map((brandId) => ({ brandId })) } } : undefined } });
      scopedUserIds.push(user.id);
      const scopedToken = randomUUID();
      await prisma.session.create({ data: { userId: user.id, tokenHash: sessionTokenHash(scopedToken, config.sessionSecret), expiresAt: new Date(Date.now() + 3600_000) } });
      scopedCookies.push(`${SESSION_COOKIE}=${scopedToken}`);
    }
    superCookie = scopedCookies[0]!;
    gpCookie = scopedCookies[1]!;
    unCookie = scopedCookies[2]!;
    app = await buildApp({ config, prisma, startWorker: false, frontendRoot: resolve(process.cwd(), "../frontend") });
    await app.ready();
    await prisma.integrationOutbox.updateMany({ where: { status: { in: ["PENDING", "RETRY_WAITING"] } }, data: { nextAttemptAt: new Date("2099-01-01T00:00:00.000Z") } });
    await prisma.integrationOutbox.updateMany({ where: { status: "PROCESSING" }, data: { leaseUntil: new Date("2099-01-01T00:00:00.000Z") } });
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      const userIds = [actorUserId, ...scopedUserIds];
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.userBrandAccess.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.rolePermission.deleteMany({ where: { roleId: { in: [actorRoleId, targetRoleId] } } });
      await prisma.role.deleteMany({ where: { id: { in: [actorRoleId, targetRoleId] } } });
      await prisma.$disconnect();
    }
    if (fakeGateway) await new Promise<void>((resolveClose) => fakeGateway.close(() => resolveClose()));
  }, 30_000);

  it("returns the unified 422 fieldErrors contract and trace ID", async () => {
    const valid = leadPayload("GP", false, "validation");
    const invalidCases = [
      { body: { ...valid, email: undefined }, field: "email" },
      { body: { ...valid, salutation: "INVALID" }, field: "salutation" },
      { body: { ...valid, processingConsent: false }, field: "processingConsent" },
    ];
    for (const invalid of invalidCases) {
      const response = await app.inject({ method: "POST", url: "/api/v1/leads", headers: { cookie: authCookie, "user-agent": "round-4-uat" }, payload: invalid.body });
      expect(response.statusCode).toBe(422);
      const payload = response.json();
      expect(payload).toMatchObject({ error: { code: "VALIDATION_ERROR", fieldErrors: expect.any(Array) }, traceId: expect.any(String) });
      expect(response.headers["x-trace-id"]).toBe(payload.traceId);
      expect(payload.error.fieldErrors.some((item: { field: string }) => item.field === invalid.field)).toBe(true);
    }
  });

  it("covers login, forced password change, logout, reset, disable and session revocation", async () => {
    const loginAccount = `${runKey}-auth@example.test`.toLowerCase();
    const created = await app.inject({ method: "POST", url: "/api/v1/users", headers: { cookie: superCookie }, payload: { name: "Round 4 Auth", loginAccount, roleId: actorRoleId, brandIds: [gpId], status: "ACTIVE" } });
    expect(created.statusCode).toBe(201);
    const userId = created.json().data.id as string;
    scopedUserIds.push(userId);

    const firstLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { loginAccount, password: config.initialPassword } });
    expect(firstLogin.statusCode).toBe(200);
    expect(firstLogin.json().data.mustChangePassword).toBe(true);
    const firstCookie = String(firstLogin.headers["set-cookie"]).split(";")[0]!;
    expect((await app.inject({ method: "GET", url: "/api/v1/customers", headers: { cookie: firstCookie } })).statusCode).toBe(403);
    const newPassword = "Round4AuthChanged!2026";
    expect((await app.inject({ method: "POST", url: "/api/v1/auth/change-password", headers: { cookie: firstCookie }, payload: { currentPassword: config.initialPassword, newPassword, confirmPassword: newPassword } })).statusCode).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: "PASSWORD_FORCE_CHANGE", targetId: userId } })).toBe(1);

    const secondLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { loginAccount, password: newPassword } });
    const secondCookie = String(secondLogin.headers["set-cookie"]).split(";")[0]!;
    expect((await app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: { cookie: secondCookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie: secondCookie } })).statusCode).toBe(401);

    const thirdLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { loginAccount, password: newPassword } });
    const thirdCookie = String(thirdLogin.headers["set-cookie"]).split(";")[0]!;
    expect((await app.inject({ method: "POST", url: `/api/v1/users/${userId}/reset-password`, headers: { cookie: superCookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie: thirdCookie } })).statusCode).toBe(401);

    const resetLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { loginAccount, password: config.initialPassword } });
    const resetCookie = String(resetLogin.headers["set-cookie"]).split(";")[0]!;
    expect((await app.inject({ method: "POST", url: `/api/v1/users/${userId}/disable`, headers: { cookie: superCookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie: resetCookie } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { loginAccount, password: config.initialPassword } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: `/api/v1/users/${userId}/enable`, headers: { cookie: superCookie } })).statusCode).toBe(200);
    expect(await prisma.auditLog.count({ where: { targetId: userId, action: { in: ["CREATE_USER", "PASSWORD_FORCE_CHANGE", "LOGOUT", "RESET_PASSWORD", "DISABLE_USER", "ENABLE_USER"] } } })).toBeGreaterThanOrEqual(6);
  }, 30_000);

  it("enforces parent-child permission dependencies server-side and does not restore children", async () => {
    const childOnly = await app.inject({ method: "PATCH", url: `/api/v1/roles/${targetRoleId}/permissions`, headers: { cookie: authCookie, "user-agent": "round-4-rbac-uat" }, payload: { permissionKeys: [
      "customer.edit", "customer.import", "customer.export",
      "lead.edit", "lead.import", "lead.export",
      "account.create", "account.edit", "account.disable", "account.reset",
      "roles.configure",
    ] } });
    expect(childOnly.statusCode).toBe(200);
    expect(childOnly.json().data.permissionKeys).toEqual([]);
    const parentRestored = await app.inject({ method: "PATCH", url: `/api/v1/roles/${targetRoleId}/permissions`, headers: { cookie: authCookie, "user-agent": "round-4-rbac-uat" }, payload: { permissionKeys: ["customer.view", "lead.view", "account.view", "roles.view"] } });
    expect(parentRestored.statusCode).toBe(200);
    expect(parentRestored.json().data.permissionKeys).toEqual(["account.view", "customer.view", "lead.view", "roles.view"]);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "UPDATE_ROLE_PERMISSIONS", targetId: targetRoleId }, orderBy: { createdAt: "desc" } });
    expect(audit.userAgent).toBe("round-4-rbac-uat");
    expect(audit.traceId).toBeTruthy();
  });

  it("computes full filtered member and lead metrics on the server without single-brand leakage", async () => {
    const customer = await prisma.customer.create({ data: { customerNo: `${runKey}-MEMBER`, displayName: `${runKey} Member`, mobile: "+8613900000001", mobileNormalized: `+86139${Date.now().toString().slice(-8)}` } });
    customerId = customer.id;
    for (const [brandId, granted] of [[gpId, true], [unId, false]] as const) {
      const profile = await prisma.customerBrandProfile.create({ data: { customerId: customer.id, brandId, displayName: customer.displayName, lastName: "Round", firstName: "Four" } });
      await prisma.consentRecord.create({ data: { customerId: customer.id, customerBrandProfileId: profile.id, brandId, purpose: "MARKETING_COMMUNICATION", channel: "EMAIL", status: granted ? "GRANTED" : "DENIED", policyVersion: "R4", source: "TEST", capturedAt: new Date() } });
    }
    const gpOnlyCustomer = await prisma.customer.create({ data: { customerNo: `${runKey}-MEMBER-GP`, displayName: `${runKey} GP Member`, mobile: "+8613900000002", mobileNormalized: `+86138${Date.now().toString().slice(-8)}` } });
    const gpOnlyProfile = await prisma.customerBrandProfile.create({ data: { customerId: gpOnlyCustomer.id, brandId: gpId, displayName: gpOnlyCustomer.displayName, lastName: "GP", firstName: "Only" } });
    await prisma.consentRecord.create({ data: { customerId: gpOnlyCustomer.id, customerBrandProfileId: gpOnlyProfile.id, brandId: gpId, purpose: "MARKETING_COMMUNICATION", channel: "EMAIL", status: "DENIED", policyVersion: "R4", source: "TEST", capturedAt: new Date() } });
    const superMemberMetrics = (await app.inject({ method: "GET", url: `/api/v1/customers?keyword=${encodeURIComponent(runKey)}&pageSize=1`, headers: { cookie: superCookie } })).json().metrics;
    expect(superMemberMetrics).toEqual({ memberTotal: 2, dualBrandMembers: 1, marketingCoverage: { numerator: 1, denominator: 3, percentage: 33 } });
    const gpMemberMetrics = (await app.inject({ method: "GET", url: `/api/v1/customers?keyword=${encodeURIComponent(runKey)}&pageSize=1`, headers: { cookie: gpCookie } })).json().metrics;
    expect(gpMemberMetrics).toEqual({ memberTotal: 2, dualBrandMembers: 0, marketingCoverage: { numerator: 1, denominator: 2, percentage: 50 } });
    const unMemberMetrics = (await app.inject({ method: "GET", url: `/api/v1/customers?keyword=${encodeURIComponent(runKey)}&pageSize=1`, headers: { cookie: unCookie } })).json().metrics;
    expect(unMemberMetrics).toEqual({ memberTotal: 1, dualBrandMembers: 0, marketingCoverage: { numerator: 0, denominator: 1, percentage: 0 } });

    const statuses = ["NOT_SYNCED", "SYNC_PENDING", "SYNCING", "GATEWAY_ACCEPTED", "SYNC_FAILED", "DEAD_LETTER"] as const;
    for (const brandCode of ["GP", "UN"] as const) {
      for (const [index, syncStatus] of statuses.entries()) {
        const created = await createCanonicalLead(prisma, config, { ...leadPayload(brandCode, false, `metric-${brandCode}-${index}`), source: "BATCH_IMPORT", submissionMode: "BATCH_IMPORT", idempotencyKey: `${runKey}:metric:${brandCode}:${index}` });
        await prisma.lead.update({ where: { id: created.lead.id }, data: { syncStatus } });
      }
    }
    const superLeadMetrics = (await app.inject({ method: "GET", url: `/api/v1/leads?keyword=${encodeURIComponent(runKey)}&pageSize=1`, headers: { cookie: superCookie } })).json().metrics;
    expect(superLeadMetrics).toMatchObject({ leadTotal: 12, pending: 6, gatewayAccepted: 2, syncExceptions: 4, statuses: { NOT_SYNCED: 2, SYNC_PENDING: 2, SYNCING: 2, GATEWAY_ACCEPTED: 2, SYNC_FAILED: 2, DEAD_LETTER: 2 } });
    for (const cookie of [gpCookie, unCookie]) {
      const scopedMetrics = (await app.inject({ method: "GET", url: `/api/v1/leads?keyword=${encodeURIComponent(runKey)}&pageSize=1`, headers: { cookie } })).json().metrics;
      expect(scopedMetrics).toMatchObject({ leadTotal: 6, pending: 3, gatewayAccepted: 1, syncExceptions: 2, statuses: { NOT_SYNCED: 1, SYNC_PENDING: 1, SYNCING: 1, GATEWAY_ACCEPTED: 1, SYNC_FAILED: 1, DEAD_LETTER: 1 } });
    }
  });

  it("stores append-only redacted audit details with trace and user agent", async () => {
    await appendAuditRecord(prisma, { actorUserId, actorName: "Round 4 Operator", traceId: `${runKey}-trace`, userAgent: "round-4-agent", ipAddress: "127.0.0.1" }, { action: "SECURITY_REDACTION_TEST", module: "audit", targetType: "test", targetId: runKey, details: { password: "never", gatewayKey: "never", appSecret: "never", token: "never", authCode: "never", hmac: "never", safe: "retained" } });
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "SECURITY_REDACTION_TEST", targetId: runKey } });
    expect(row).toMatchObject({ traceId: `${runKey}-trace`, userAgent: "round-4-agent" });
    expect(row.details).toEqual({ password: "[REDACTED]", gatewayKey: "[REDACTED]", appSecret: "[REDACTED]", token: "[REDACTED]", authCode: "[REDACTED]", hmac: "[REDACTED]", safe: "retained" });
  });

  it("recovers stale PROCESSING work, does not steal live leases, and never resends DEAD_LETTER", async () => {
    const stale = await createCanonicalLead(prisma, config, { ...leadPayload("GP", false, "stale"), source: "MINI_PROGRAM", submissionMode: "USER_SUBMITTED", idempotencyKey: `${runKey}:stale`, customerId });
    const staleOutbox = await prisma.integrationOutbox.findFirstOrThrow({ where: { aggregateId: stale.lead.id } });
    await prisma.integrationOutbox.update({ where: { id: staleOutbox.id }, data: { status: "PROCESSING", lockedAt: new Date(Date.now() - 120_000), leaseUntil: new Date(Date.now() - 60_000), lockOwner: "dead-worker" } });
    await prisma.lead.update({ where: { id: stale.lead.id }, data: { syncStatus: "SYNCING" } });
    const worker = new SowindOutboxWorker(prisma, config, new SowindGatewayClient(config), app.log);
    expect(await worker.runOnce()).toBe(true);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: stale.lead.id } })).syncStatus).toBe("GATEWAY_ACCEPTED");
    expect(await prisma.auditLog.count({ where: { action: "GATEWAY_STALE_RECOVERED", targetId: stale.lead.id } })).toBe(1);

    const liveLease = await createCanonicalLead(prisma, config, { ...leadPayload("GP", false, "live-lease"), source: "MINI_PROGRAM", submissionMode: "USER_SUBMITTED", idempotencyKey: `${runKey}:live-lease` });
    const liveOutbox = await prisma.integrationOutbox.findFirstOrThrow({ where: { aggregateId: liveLease.lead.id } });
    await prisma.integrationOutbox.update({ where: { id: liveOutbox.id }, data: { status: "PROCESSING", lockedAt: new Date(), leaseUntil: new Date(Date.now() + 60_000), lockOwner: "live-worker" } });
    expect(await worker.runOnce()).toBe(false);
    expect(await prisma.integrationAttempt.count({ where: { leadId: liveLease.lead.id } })).toBe(0);

    const dead = await createCanonicalLead(prisma, config, { ...leadPayload("GP", false, "dead"), source: "MINI_PROGRAM", submissionMode: "USER_SUBMITTED", idempotencyKey: `${runKey}:dead` });
    await prisma.integrationOutbox.updateMany({ where: { aggregateId: dead.lead.id }, data: { status: "DEAD_LETTER", leaseUntil: null, lockOwner: null } });
    await prisma.lead.update({ where: { id: dead.lead.id }, data: { syncStatus: "DEAD_LETTER" } });
    expect(await worker.runOnce()).toBe(false);
    expect(await prisma.integrationAttempt.count({ where: { leadId: dead.lead.id } })).toBe(0);
  });

  it.each([
    ["SYS-GP-NO-MKT", "GP", false, 370626181],
    ["SYS-GP-MKT", "GP", true, 370626181],
    ["SYS-UN-NO-MKT", "UN", false, 5186585],
    ["SYS-UN-MKT", "UN", true, 5186585],
  ] as const)("%s closes API to fake Gateway with consent, journey, attempt and audit", async (caseId, brandCode, marketingOptIn, subscriptionTypeId) => {
    const brandId = brandCode === "GP" ? gpId : unId;
    const contextToken = `${runKey}-${caseId}`;
    await prisma.wechatIdentityContext.create({ data: { tokenHash: wechatContextTokenHash(contextToken, config.sessionSecret), brandId, customerId, appId: `${caseId}-app`, appScope: `${caseId}-scope`, mobileNormalized: (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).mobileNormalized, verifiedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) } });
    const accepted = await integrationRequest(leadPayload(brandCode, marketingOptIn, caseId.toLowerCase()), contextToken);
    expect(accepted.statusCode).toBe(202);
    const leadId = accepted.json().data.id as string;
    const before = gatewayRequests.length;
    const workerA = new SowindOutboxWorker(prisma, { ...config, workerInstanceId: `${caseId}-A` }, new SowindGatewayClient(config), app.log);
    const workerB = new SowindOutboxWorker(prisma, { ...config, workerInstanceId: `${caseId}-B` }, new SowindGatewayClient(config), app.log);
    await Promise.all([workerA.runOnce(), workerB.runOnce()]);
    expect(gatewayRequests.length - before).toBe(1);
    const [lead, outbox, attempts, consents, journey, audits] = await Promise.all([
      prisma.lead.findUniqueOrThrow({ where: { id: leadId } }), prisma.integrationOutbox.findFirstOrThrow({ where: { aggregateId: leadId } }),
      prisma.integrationAttempt.findMany({ where: { leadId } }), prisma.consentRecord.findMany({ where: { leadId } }),
      prisma.customerJourneyEvent.findMany({ where: { customerId, metadata: { path: "$.leadId", equals: leadId } } }), prisma.auditLog.findMany({ where: { targetType: "lead", targetId: leadId } }),
    ]);
    expect(lead).toMatchObject({ customerId, syncStatus: "GATEWAY_ACCEPTED" });
    expect(outbox.status).toBe("SUCCEEDED");
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ httpStatus: 202, triggeredBy: "AUTO", gatewayRef: expect.any(String) });
    expect(consents).toHaveLength(2);
    expect(journey).toHaveLength(1);
    expect(audits.some((audit) => audit.action === "INTEGRATION_LEAD_ACCEPTED")).toBe(true);
    expect(audits.some((audit) => audit.action === "GATEWAY_ACCEPTED")).toBe(true);
    const request = gatewayRequests.at(-1)!;
    const legal = request.legalConsentOptions as { consent?: { communications?: Array<{ subscriptionTypeId?: number }> } };
    if (marketingOptIn) expect(legal.consent?.communications?.[0]?.subscriptionTypeId).toBe(subscriptionTypeId);
    else expect(legal.consent?.communications).toBeUndefined();
    expect((request.context as { pageName?: string; pageUri?: string }).pageName).toContain(lead.sku!);
    expect((request.fields as Array<{ name: string; value: string }>).find((field) => field.name === "business_unit_forms")?.value).toBe(brandCode === "GP" ? "girard_perregaux" : "ulysse_nardin");
  });
});
