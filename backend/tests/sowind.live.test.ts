import { createHash, createHmac, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/common/config.js";
import { SowindGatewayClient } from "../src/integrations/sowind/sowind.gateway-client.js";
import { SowindOutboxWorker } from "../src/integrations/sowind/sowind.worker.js";

const liveEnabled = process.env.RUN_SOWIND_LIVE_TESTS === "true";
const runKey = `LIVE-${Date.now()}-${randomUUID().slice(0, 6)}`;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

describe.skipIf(!liveEnabled)("Sowind Gateway authorized live system path", () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let config: AppConfig;

  const cases = [
    { id: "LIVE-GP-NO-MKT", brandCode: "GP", marketingOptIn: false },
    { id: "LIVE-GP-MKT", brandCode: "GP", marketingOptIn: true },
    { id: "LIVE-UN-NO-MKT", brandCode: "UN", marketingOptIn: false },
    { id: "LIVE-UN-MKT", brandCode: "UN", marketingOptIn: true },
  ] as const;

  beforeAll(async () => {
    expect(process.env.SOWIND_LIVE_TEST_AUTHORIZED, "SOWIND_LIVE_TEST_AUTHORIZED=true is required").toBe("true");
    const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    expect(databaseUrl, "An isolated migrated and seeded UAT DATABASE_URL is required").toBeTruthy();
    expect(process.env.SOWIND_GATEWAY_ACCESS_KEY, "SOWIND_GATEWAY_ACCESS_KEY is required").toBeTruthy();
    for (const brandCode of ["GP", "UN"] as const) {
      expect(process.env[`SOWIND_LIVE_${brandCode}_EMAIL`], `SOWIND_LIVE_${brandCode}_EMAIL is required`).toBeTruthy();
      expect(process.env[`SOWIND_LIVE_${brandCode}_SKU`], `SOWIND_LIVE_${brandCode}_SKU is required`).toBeTruthy();
    }

    config = {
      nodeEnv: "test", logLevel: "silent", port: 0, databaseUrl: databaseUrl!, sessionSecret: "live-harness-session-secret-at-least-32-characters",
      sessionTtlHours: 12, initialPassword: "LiveHarnessInitial@2026", superAdminAccount: "live-harness@example.invalid", superAdminName: "Live Harness",
      seedDemoData: false, cookieSecure: false, corsOrigin: "*", appBasePath: "", trustProxy: false, maxBodyBytes: 10 * 1024 * 1024,
      storageDir: resolve(process.cwd(), "../storage/live-harness"), outboxPollIntervalMs: 1000, outboxLeaseSeconds: 60, workerInstanceId: runKey,
      sowindGatewayAccessKey: process.env.SOWIND_GATEWAY_ACCESS_KEY!,
      sowindGatewayGpUrl: process.env.SOWIND_GATEWAY_GP_URL || "https://b2b.girard-perregaux.com/n8n-webhook/wechat-leads/gp",
      sowindGatewayUnUrl: process.env.SOWIND_GATEWAY_UN_URL || "https://b2b.ulysse-nardin.com/n8n-webhook/wechat-leads/un",
      sowindGatewayTimeoutMs: Number(process.env.SOWIND_GATEWAY_TIMEOUT_MS || 10_000), sowindGatewayMaxAttempts: 5, sowindGatewayMaxPerMinute: 10,
      runSowindLiveTests: true, integrationClientId: `live-${randomUUID()}`, integrationClientSecret: randomUUID(),
    };
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await prisma.$connect();
    const executableOutbox = await prisma.integrationOutbox.count({ where: { status: { in: ["PENDING", "RETRY_WAITING", "PROCESSING"] } } });
    expect(executableOutbox, "Live Harness requires an isolated UAT DB with no pre-existing executable Outbox").toBe(0);
    app = await buildApp({ config, prisma, startWorker: false, frontendRoot: resolve(process.cwd(), "../frontend") });
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  it.each(cases)("submits $id through API, DB, Outbox, Worker and the real Gateway", async ({ id, brandCode, marketingOptIn }) => {
    const email = process.env[`SOWIND_LIVE_${brandCode}_EMAIL`]!;
    const sku = process.env[`SOWIND_LIVE_${brandCode}_SKU`]!;
    const body = {
      brandCode, leadType: "PURCHASE_INTENT", source: "MINI_PROGRAM", submissionMode: "USER_SUBMITTED", formVersion: "2.0", sku,
      email: email.replace("@", `+${id.toLowerCase()}-${Date.now()}@`), salutation: "Mr", firstname: "Gateway", lastname: "UAT",
      phone: null, preferredContact: "Email", country: "China", city: "Shanghai", ownsBrandWatch: "No",
      processingConsent: true, marketingOptIn,
    };
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const bodyHash = createHash("sha256").update(canonicalJson(body)).digest("hex");
    const signature = createHmac("sha256", config.integrationClientSecret).update(`${timestamp}.${nonce}.${bodyHash}`).digest("hex");
    const accepted = await app.inject({
      method: "POST", url: "/api/integration/v1/leads",
      headers: { "x-client-id": config.integrationClientId, "x-timestamp": timestamp, "x-nonce": nonce, "x-signature": signature, "idempotency-key": `${runKey}:${id}` },
      payload: body,
    });
    expect(accepted.statusCode).toBe(202);
    const leadId = accepted.json().data.id as string;
    const beforeWorker = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(beforeWorker.syncStatus).toBe("SYNC_PENDING");
    expect(await prisma.integrationOutbox.count({ where: { aggregateId: leadId, status: "PENDING" } })).toBe(1);

    const worker = new SowindOutboxWorker(prisma, config, new SowindGatewayClient(config), app.log);
    expect(await worker.runOnce()).toBe(true);

    const [lead, outbox, attempts, consents, audit] = await Promise.all([
      prisma.lead.findUniqueOrThrow({ where: { id: leadId } }),
      prisma.integrationOutbox.findFirstOrThrow({ where: { aggregateId: leadId } }),
      prisma.integrationAttempt.findMany({ where: { leadId } }),
      prisma.consentRecord.findMany({ where: { leadId } }),
      prisma.auditLog.findMany({ where: { targetType: "lead", targetId: leadId } }),
    ]);
    expect(lead.syncStatus).toBe("GATEWAY_ACCEPTED");
    expect(outbox.status).toBe("SUCCEEDED");
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ httpStatus: 202, triggeredBy: "AUTO", gatewayRef: expect.any(String), requestSnapshot: expect.anything() });
    expect(consents).toHaveLength(2);
    expect(audit.some((entry) => entry.action === "INTEGRATION_LEAD_ACCEPTED")).toBe(true);
    expect(audit.some((entry) => entry.action === "GATEWAY_ACCEPTED")).toBe(true);
  }, 30_000);
});
