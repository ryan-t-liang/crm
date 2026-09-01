import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { SESSION_COOKIE, sessionToken, sessionTokenHash } from "../src/common/auth.js";
import type { AppConfig } from "../src/common/config.js";
import { formalImportFields } from "../src/jobs/formal-schema.js";
import { templateWorkbook } from "../src/jobs/import-export.service.js";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const runKey = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const baseMobile = `+86135${String(Date.now() % 100_000_000).padStart(8, "0")}`;

function multipart(buffer: Buffer, filename: string) {
  const boundary = `----sowind-${randomUUID()}`;
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, buffer, tail]), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

async function workbook(objectType: "CUSTOMER" | "LEAD", brand: "GP" | "UN", rows: Array<Record<string, unknown>>) {
  const buffer = await templateWorkbook(objectType, brand);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer as never); const sheet = book.worksheets[0]!; const fields = formalImportFields(objectType, brand);
  for (let rowNumber = 2; rowNumber <= Math.max(2, sheet.rowCount); rowNumber += 1) fields.forEach((_, index) => { sheet.getCell(rowNumber, index + 1).value = null; });
  rows.forEach((values, rowIndex) => fields.forEach((field, columnIndex) => { sheet.getCell(rowIndex + 2, columnIndex + 1).value = values[field.key] == null ? "" : String(values[field.key]); }));
  return Buffer.from(await book.xlsx.writeBuffer());
}

function memberRow(brand: "GP" | "UN", mobile: string, overrides: Record<string, unknown> = {}) {
  return { salutation: "女士", lastName: "导入", firstName: brand, mobile, email: `member-${brand.toLowerCase()}-${runKey}@example.test`, country: "中国大陆", language: "简体中文", preferredContact: "微信", ownsBrandWatch: "否", processingConsent: "是", marketingOptIn: "否", favoriteCollection: brand === "GP" ? "Laureato" : "FREAK", ...overrides };
}
function leadRow(brand: "GP" | "UN", suffix: string, overrides: Record<string, unknown> = {}) {
  return { brand, leadType: "PURCHASE_INTENT", status: "NEW", source: "BATCH_IMPORT", salutation: "先生", firstname: `线索${suffix}`, lastname: "导入", email: `lead-${suffix}-${runKey}@example.test`, country: "中国大陆", language: "简体中文", preferredContact: "Email", ownsBrandWatch: "否", purchaseMethod: brand === "UN" ? "品牌精品店" : "", sku: brand === "GP" ? "81010-11-3475-1CM" : "2405-500-2A/3C", marketingOptIn: "否", processingConsent: "是", ...overrides };
}

describe.skipIf(!enabled)("Remediation Round 3 Import/Export", () => {
  let prisma: PrismaClient; let app: FastifyInstance; let config: AppConfig; let cookie: string; let unCookie: string; let viewerCookie: string; let storageDir: string;
  let gpId: string; let unId: string; let userId: string;

  async function inject(options: InjectOptions, scopedCookie = cookie) { return app.inject({ ...options, headers: { cookie: scopedCookie, ...(options.headers ?? {}) } }); }
  async function upload(type: "customers" | "leads", brand: "GP" | "UN", buffer: Buffer, query = "") {
    const form = multipart(buffer, `${type}-${brand}-${randomUUID()}.xlsx`);
    return inject({ method: "POST", url: `/api/v1/imports/${type}?brandCode=${brand}${query}`, ...form });
  }
  async function execute(id: string, body: Record<string, unknown> = {}) { return inject({ method: "POST", url: `/api/v1/imports/${id}/execute`, payload: body }); }

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL; if (!databaseUrl) throw new Error("TEST_DATABASE_URL or DATABASE_URL is required");
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } }); await prisma.$connect(); storageDir = await mkdtemp(join(tmpdir(), "sowind-r3-"));
    config = { nodeEnv: "test", port: 0, databaseUrl, sessionSecret: `r3-secret-${runKey}`, sessionTtlHours: 12, initialPassword: "R3Only!Fixture_7mQ4_2026", superAdminAccount: "unused@example.test", superAdminName: "Unused", seedDemoData: false, cookieSecure: false, corsOrigin: "*", appBasePath: "", trustProxy: false, maxBodyBytes: 10 * 1024 * 1024, storageDir, outboxPollIntervalMs: 1000, sowindGatewayAccessKey: "test-key", sowindGatewayGpUrl: "https://gp.example.test", sowindGatewayUnUrl: "https://un.example.test", sowindGatewayTimeoutMs: 1000, sowindGatewayMaxAttempts: 5, sowindGatewayMaxPerMinute: 60, runSowindLiveTests: false, integrationClientId: "r3", integrationClientSecret: "r3-integration-secret", wechatGpAppId: "", wechatGpAppSecret: "", wechatUnAppId: "", wechatUnAppSecret: "", wechatContextTtlMinutes: 30 };
    const [gp, un] = await Promise.all([prisma.brand.findUniqueOrThrow({ where: { code: "GP" } }), prisma.brand.findUniqueOrThrow({ where: { code: "UN" } })]); gpId = gp.id; unId = un.id;
    const superRole = await prisma.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } }); const user = await prisma.user.create({ data: { name: `R3 Admin ${runKey}`, loginAccount: `r3-${runKey}@example.test`, passwordHash: "test-only", roleId: superRole.id, mustChangePassword: false } }); userId = user.id;
    const token = sessionToken(); await prisma.session.create({ data: { userId, tokenHash: sessionTokenHash(token, config.sessionSecret), expiresAt: new Date(Date.now() + 3_600_000) } }); cookie = `${SESSION_COOKIE}=${token}`;
    const brandRole = await prisma.role.findUniqueOrThrow({ where: { key: "BRAND_ADMIN" } }); const unUser = await prisma.user.create({ data: { name: `R3 UN ${runKey}`, loginAccount: `r3-un-${runKey}@example.test`, passwordHash: "test-only", roleId: brandRole.id, mustChangePassword: false, brandAccess: { create: { brandId: unId } } } });
    const unToken = sessionToken(); await prisma.session.create({ data: { userId: unUser.id, tokenHash: sessionTokenHash(unToken, config.sessionSecret), expiresAt: new Date(Date.now() + 3_600_000) } }); unCookie = `${SESSION_COOKIE}=${unToken}`;
    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { key: "VIEWER" } }); const viewer = await prisma.user.create({ data: { name: `R3 Viewer ${runKey}`, loginAccount: `r3-viewer-${runKey}@example.test`, passwordHash: "test-only", roleId: viewerRole.id, mustChangePassword: false, brandAccess: { createMany: { data: [{ brandId: gpId }, { brandId: unId }] } } } });
    const viewerToken = sessionToken(); await prisma.session.create({ data: { userId: viewer.id, tokenHash: sessionTokenHash(viewerToken, config.sessionSecret), expiresAt: new Date(Date.now() + 3_600_000) } }); viewerCookie = `${SESSION_COOKIE}=${viewerToken}`;
    app = await buildApp({ config, prisma, startWorker: false, frontendRoot: resolve(process.cwd(), "../frontend") }); await app.ready();
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      const users = await prisma.user.findMany({ where: { loginAccount: { contains: runKey } }, select: { id: true } }); const userIds = users.map((item) => item.id);
      const jobs = await prisma.importJob.findMany({ where: { createdBy: { in: userIds } }, select: { id: true } }); await prisma.importJob.deleteMany({ where: { id: { in: jobs.map((item) => item.id) } } }); await prisma.exportJob.deleteMany({ where: { createdBy: { in: userIds } } });
      const leads = await prisma.lead.findMany({ where: { createdBy: { in: userIds } }, select: { id: true } }); const leadIds = leads.map((item) => item.id); if (leadIds.length) { await prisma.integrationAttempt.deleteMany({ where: { leadId: { in: leadIds } } }); await prisma.integrationOutbox.deleteMany({ where: { aggregateType: "LEAD", aggregateId: { in: leadIds } } }); await prisma.consentRecord.deleteMany({ where: { leadId: { in: leadIds } } }); await prisma.lead.deleteMany({ where: { id: { in: leadIds } } }); }
      const customers = await prisma.customer.findMany({ where: { createdBy: { in: userIds } }, select: { id: true } }); const customerIds = customers.map((item) => item.id); if (customerIds.length) await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } }); await prisma.session.deleteMany({ where: { userId: { in: userIds } } }); await prisma.user.deleteMany({ where: { id: { in: userIds } } }); await prisma.$disconnect();
    }
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
  }, 30_000);

  it("MI-A/B/G/I: GP new Customer then UN profile use canonical identity, consent, audit and history", async () => {
    const gpFile = await workbook("CUSTOMER", "GP", [memberRow("GP", baseMobile, { openId: `gp-open-${runKey}`, unionId: `gp-union-${runKey}`, marketingOptIn: "是" })]);
    const preflight = await upload("customers", "GP", gpFile); expect(preflight.statusCode).toBe(201); const job = preflight.json().data; expect(job.preflight).toMatchObject({ total: 1, newCustomer: 1, error: 0 });
    const done = await execute(job.id, { conflictStrategy: "SKIP" }); expect(done.statusCode).toBe(200); expect(done.json().data.job).toMatchObject({ status: "COMPLETED", successCount: 1, createdCount: 1 });
    const customer = await prisma.customer.findUniqueOrThrow({ where: { mobileNormalized: baseMobile }, include: { profiles: true, identities: true, consents: true } }); expect(customer.profiles).toHaveLength(1); expect(customer.identities).toEqual(expect.arrayContaining([expect.objectContaining({ identityType: "OPENID", verifiedAt: null, source: "BATCH_IMPORT" })])); expect(customer.consents.some((item) => item.source === "BATCH_IMPORT")).toBe(true);
    const unFile = await workbook("CUSTOMER", "UN", [memberRow("UN", baseMobile, { openId: `un-open-${runKey}` })]); const unPreflight = await upload("customers", "UN", unFile); expect(unPreflight.json().data.preflight.newBrandProfile).toBe(1); expect((await execute(unPreflight.json().data.id)).statusCode).toBe(200); expect(await prisma.customer.count({ where: { mobileNormalized: baseMobile } })).toBe(1); expect(await prisma.customerBrandProfile.count({ where: { customerId: customer.id } })).toBe(2);
    const history = await inject({ method: "GET", url: "/api/v1/imports/history?objectType=CUSTOMER" }); expect(history.statusCode).toBe(200); expect(history.json().data).toEqual(expect.arrayContaining([expect.objectContaining({ id: job.id, operatorName: `R3 Admin ${runKey}` })])); expect(await prisma.auditLog.count({ where: { targetId: job.id, action: { in: ["IMPORT_UPLOAD", "IMPORT_PREFLIGHT", "IMPORT_EXECUTE"] } } })).toBe(3);
  });

  it("MI-C/D/E: SKIP, FILL_EMPTY and OVERWRITE are distinct", async () => {
    const skipFile = await workbook("CUSTOMER", "GP", [memberRow("GP", baseMobile, { city: "北京市", interestCenter: "SKIP" })]); const skip = await upload("customers", "GP", skipFile); const skipped = await execute(skip.json().data.id, { conflictStrategy: "SKIP" }); expect(skipped.json().data.job.skippedCount).toBe(1);
    const fillFile = await workbook("CUSTOMER", "GP", [memberRow("GP", baseMobile, { city: "上海市", interestCenter: "FILL" })]); const fill = await upload("customers", "GP", fillFile); expect((await execute(fill.json().data.id, { conflictStrategy: "FILL_EMPTY" })).statusCode).toBe(200); let profile = await prisma.customerBrandProfile.findFirstOrThrow({ where: { customer: { mobileNormalized: baseMobile }, brandId: gpId } }); expect(profile.city).toBe("上海市");
    const overwriteFile = await workbook("CUSTOMER", "GP", [memberRow("GP", baseMobile, { city: "杭州市", interestCenter: "OVERWRITE" })]); const overwrite = await upload("customers", "GP", overwriteFile); await execute(overwrite.json().data.id, { conflictStrategy: "OVERWRITE" }); profile = await prisma.customerBrandProfile.findFirstOrThrow({ where: { customer: { mobileNormalized: baseMobile }, brandId: gpId } }); expect(profile.city).toBe("杭州市"); expect(profile.interestCenter).toBe("OVERWRITE");
  });

  it("MI-F/H: file duplicate and scoped identity conflict become row errors with failure CSV", async () => {
    const duplicateFile = await workbook("CUSTOMER", "GP", [memberRow("GP", `${baseMobile.slice(0, -1)}1`), memberRow("GP", `${baseMobile.slice(0, -1)}1`, { firstName: "重复" })]); const duplicate = await upload("customers", "GP", duplicateFile); expect(duplicate.json().data.preflight.fileDuplicate).toBe(1);
    const conflictMobile = `${baseMobile.slice(0, -1)}2`; const conflictFile = await workbook("CUSTOMER", "GP", [memberRow("GP", conflictMobile, { openId: `gp-open-${runKey}` })]); const conflict = await upload("customers", "GP", conflictFile); expect(conflict.json().data.rows[0].errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "IDENTITY_CONFLICT" })])); const result = await execute(conflict.json().data.id); expect(result.json().data.job.status).toBe("FAILED");
    const failure = await inject({ method: "GET", url: `/api/v1/imports/${conflict.json().data.id}/failures` }); expect(failure.statusCode).toBe(200); expect(failure.body).toContain("original_row_number"); expect(failure.body).toContain("PREFLIGHT_ERROR"); expect((await inject({ method: "GET", url: `/api/v1/imports/${conflict.json().data.id}/failures` }, unCookie)).statusCode).toBe(404);
  });

  it("MI-J: UN-scoped operator cannot access GP templates, import jobs or exports", async () => {
    expect((await inject({ method: "GET", url: "/api/v1/templates/customers?brandCode=GP" }, unCookie)).statusCode).toBe(403);
    const gpJob = await prisma.importJob.findFirstOrThrow({ where: { brandId: gpId, createdBy: userId } });
    expect((await inject({ method: "GET", url: `/api/v1/imports/${gpJob.id}` }, unCookie)).statusCode).toBe(404);
    expect((await inject({ method: "POST", url: "/api/v1/exports/customers", payload: { scope: "ALL", brandCode: "GP" } }, unCookie)).statusCode).toBe(403);
    const viewerForm = multipart(await workbook("CUSTOMER", "UN", [memberRow("UN", `${baseMobile.slice(0, -1)}8`)]), "viewer-import.xlsx"); expect((await inject({ method: "POST", url: "/api/v1/imports/customers?brandCode=UN", ...viewerForm }, viewerCookie)).statusCode).toBe(403);
  });

  it("LI-A/C/E/K: GP Email-only lead imports locally with no member and no Outbox", async () => {
    const file = await workbook("LEAD", "GP", [leadRow("GP", "email-only")]); const preflight = await upload("leads", "GP", file); expect(preflight.statusCode).toBe(201); expect(preflight.json().data.preflight).toMatchObject({ newLead: 1, unmatchedMember: 1, error: 0 }); const done = await execute(preflight.json().data.id, { unmatchedStrategy: "IMPORT_LEAD_ONLY" }); expect(done.statusCode).toBe(200);
    const lead = await prisma.lead.findFirstOrThrow({ where: { email: `lead-email-only-${runKey}@example.test` } }); expect(lead).toMatchObject({ phone: null, customerId: null, source: "BATCH_IMPORT", submissionMode: "BATCH_IMPORT", syncStatus: "NOT_SYNCED" }); expect(await prisma.integrationOutbox.count({ where: { aggregateType: "LEAD", aggregateId: lead.id } })).toBe(0);
  });

  it("LI-B/D: UN lead phone matches the existing cross-brand Customer", async () => {
    const file = await workbook("LEAD", "UN", [leadRow("UN", "matched", { phone: baseMobile })]); const preflight = await upload("leads", "UN", file); expect(preflight.json().data.preflight.matchedMember).toBe(1); await execute(preflight.json().data.id); const lead = await prisma.lead.findFirstOrThrow({ where: { email: `lead-matched-${runKey}@example.test` } }); expect(lead.customerId).not.toBeNull(); expect(lead.syncStatus).toBe("NOT_SYNCED");
  });

  it("LI-F/G: CREATE_MEMBER requires phone and creates a reusable Customer when valid", async () => {
    const mobile = `${baseMobile.slice(0, -1)}3`; const valid = await upload("leads", "UN", await workbook("LEAD", "UN", [leadRow("UN", "create-member", { phone: mobile })]), "&unmatchedStrategy=CREATE_MEMBER"); expect(valid.json().data.preflight.error).toBe(0); const done = await execute(valid.json().data.id, { unmatchedStrategy: "CREATE_MEMBER" }); expect(done.json().data.result.createdMembers).toBe(1); expect(await prisma.customer.count({ where: { mobileNormalized: mobile } })).toBe(1);
    const invalid = await upload("leads", "UN", await workbook("LEAD", "UN", [leadRow("UN", "no-phone-member")]), "&unmatchedStrategy=CREATE_MEMBER"); expect(invalid.json().data.rows[0].errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "PHONE_REQUIRED_FOR_MEMBER" })]));
  });

  it("LI-H/I: Lead No duplicate is an error; database conflict supports SKIP and UPDATE_EXISTING without dispatch", async () => {
    const leadNo = `R3-${runKey}`; const fileDuplicate = await upload("leads", "GP", await workbook("LEAD", "GP", [leadRow("GP", "dup-a", { leadNo }), leadRow("GP", "dup-b", { leadNo })])); expect(fileDuplicate.json().data.rows[1].errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "FILE_DUPLICATE" })]));
    const databaseLeadNo = `${leadNo}-DB`; const firstFile = await upload("leads", "GP", await workbook("LEAD", "GP", [leadRow("GP", "existing", { leadNo: databaseLeadNo })])); await execute(firstFile.json().data.id); const beforeSkip = await prisma.lead.findUniqueOrThrow({ where: { leadNo: databaseLeadNo } });
    const skipFile = await upload("leads", "GP", await workbook("LEAD", "GP", [leadRow("GP", "skip-existing", { leadNo: databaseLeadNo, sku: "SHOULD-NOT-APPLY" })])); expect(skipFile.json().data.rows[0].status).toBe("EXISTING_LEAD"); const skipped = await execute(skipFile.json().data.id, { conflictStrategy: "SKIP" }); expect(skipped.json().data.job.skippedCount).toBe(1); expect((await prisma.lead.findUniqueOrThrow({ where: { leadNo: databaseLeadNo } })).sku).toBe(beforeSkip.sku);
    const updateFile = await upload("leads", "GP", await workbook("LEAD", "GP", [leadRow("GP", "updated", { leadNo: databaseLeadNo, sku: "UPDATED-SKU" })]), "&conflictStrategy=UPDATE_EXISTING"); expect(updateFile.json().data.rows[0].status).toBe("EXISTING_LEAD"); await execute(updateFile.json().data.id, { conflictStrategy: "UPDATE_EXISTING" }); const updated = await prisma.lead.findUniqueOrThrow({ where: { leadNo: databaseLeadNo } }); expect(updated.sku).toBe("UPDATED-SKU"); expect(updated.syncStatus).toBe("NOT_SYNCED"); expect(await prisma.integrationOutbox.count({ where: { aggregateType: "LEAD", aggregateId: updated.id } })).toBe(0);
  });

  it("LI-J: null-phone possible duplicate uses email fallback and does not collapse unrelated rows", async () => {
    const createdAt = "2026-08-27 10:00:00"; const first = await upload("leads", "GP", await workbook("LEAD", "GP", [leadRow("GP", "possible", { createdAt })])); await execute(first.json().data.id);
    const same = await upload("leads", "GP", await workbook("LEAD", "GP", [leadRow("GP", "possible", { createdAt })]), "&allowDuplicate=true"); expect(same.json().data.rows[0].warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "POSSIBLE_DUPLICATE" })]));
    const other = await upload("leads", "GP", await workbook("LEAD", "GP", [leadRow("GP", "unrelated", { createdAt })])); expect(other.json().data.rows[0].warnings.some((item: { code: string }) => item.code === "POSSIBLE_DUPLICATE")).toBe(false);
  });

  it("LI-L: missing UN purchase channel header is blocked before execution", async () => {
    const file = await workbook("LEAD", "UN", [leadRow("UN", "missing-header")]); const book = new ExcelJS.Workbook(); await book.xlsx.load(file as never); const sheet = book.worksheets[0]!; const fields = formalImportFields("LEAD", "UN"); const index = fields.findIndex((field) => field.key === "purchaseMethod") + 1; sheet.getCell(1, index).value = "未知字段"; const invalid = Buffer.from(await book.xlsx.writeBuffer()); const response = await upload("leads", "UN", invalid); expect(response.statusCode).toBe(400); expect(response.json().error.code).toBe("MISSING_REQUIRED_HEADERS");
  });

  it("LI-K/L: every imported Lead remains NOT_SYNCED and has no executable Outbox", async () => {
    const imported = await prisma.lead.findMany({ where: { createdBy: userId, source: "BATCH_IMPORT" }, select: { id: true, syncStatus: true } }); expect(imported.length).toBeGreaterThan(0); expect(imported.every((lead) => lead.syncStatus === "NOT_SYNCED")).toBe(true);
    expect(await prisma.integrationOutbox.count({ where: { aggregateType: "LEAD", aggregateId: { in: imported.map((lead) => lead.id) } } })).toBe(0);
  });

  it("EX-A/B/C/D/E/F: Member exports enforce CURRENT_FILTER, SELECTED_IDS, ALL and field allowlist", async () => {
    const customer = await prisma.customer.findUniqueOrThrow({ where: { mobileNormalized: baseMobile } });
    const current = await inject({ method: "POST", url: "/api/v1/exports/members", payload: { scope: "CURRENT_FILTER", filter: { value: customer.customerNo, field: "customerNo", brand: "GP" }, fields: ["customerNo", "mobile"] } }); expect(current.statusCode).toBe(201); expect(current.json().data).toMatchObject({ scope: "CURRENT_FILTER", rowCount: 1, effectiveFields: ["customerNo", "mobile"] });
    const currentDownload = await inject({ method: "GET", url: current.json().data.downloadUrl }); const currentBook = new ExcelJS.Workbook(); await currentBook.xlsx.load(currentDownload.rawPayload as never); expect(currentBook.worksheets[0]!.rowCount - 1).toBe(current.json().data.rowCount);
    const selected = await inject({ method: "POST", url: "/api/v1/exports/customers", payload: { scope: "SELECTED_IDS", selectedIds: [customer.id], fields: ["customerNo"] } }); expect(selected.statusCode).toBe(201); expect(selected.json().data.rowCount).toBe(2);
    const all = await inject({ method: "POST", url: "/api/v1/exports/customers", payload: { scope: "ALL", brandCode: "UN", fields: ["customerNo", "brand"] } }); expect(all.statusCode).toBe(201); expect(all.json().data.rowCount).toBeGreaterThanOrEqual(1);
    const allDownload = await inject({ method: "GET", url: all.json().data.downloadUrl }); const allBook = new ExcelJS.Workbook(); await allBook.xlsx.load(allDownload.rawPayload as never); expect(allBook.worksheets[0]!.getColumn(2).values.slice(2)).toEqual(expect.arrayContaining(["UN 雅典表"])); expect(allBook.worksheets[0]!.getColumn(2).values.slice(2)).not.toContain("GP 芝柏表");
    const invalid = await inject({ method: "POST", url: "/api/v1/exports/customers", payload: { scope: "ALL", fields: ["passwordHash"] } }); expect(invalid.statusCode).toBe(400); expect(invalid.json().error.code).toBe("INVALID_EXPORT_FIELDS");
    expect((await inject({ method: "POST", url: "/api/v1/exports/customers", payload: { scope: "ALL" } }, viewerCookie)).statusCode).toBe(403);
  });

  it("EX-G/H/I/J/K/L: Lead export filters full DB, protects selected IDs and authenticates download", async () => {
    const lead = await prisma.lead.findFirstOrThrow({ where: { email: `lead-email-only-${runKey}@example.test` } });
    const filtered = await inject({ method: "POST", url: "/api/v1/exports/leads", payload: { scope: "CURRENT_FILTER", filter: { value: lead.leadNo, field: "leadNo", syncStatus: "NOT_SYNCED" }, fields: ["leadNo", "syncStatus"] } }); expect(filtered.statusCode).toBe(201); expect(filtered.json().data.rowCount).toBe(1);
    const downloadUrl = filtered.json().data.downloadUrl; expect((await app.inject({ method: "GET", url: downloadUrl })).statusCode).toBe(401); const downloaded = await inject({ method: "GET", url: downloadUrl }); expect(downloaded.statusCode).toBe(200); expect(downloaded.headers["content-type"]).toContain("spreadsheetml"); const filteredBook = new ExcelJS.Workbook(); await filteredBook.xlsx.load(downloaded.rawPayload as never); expect(filteredBook.worksheets[0]!.rowCount - 1).toBe(filtered.json().data.rowCount);
    const gpSelectedByUn = await inject({ method: "POST", url: "/api/v1/exports/leads", payload: { scope: "SELECTED_IDS", selectedIds: [lead.id], fields: ["leadNo"] } }, unCookie); expect(gpSelectedByUn.statusCode).toBe(403);
    const unAll = await inject({ method: "POST", url: "/api/v1/exports/leads", payload: { scope: "ALL", fields: ["leadNo", "brand"] } }, unCookie); expect(unAll.statusCode).toBe(201); const unAllDownload = await inject({ method: "GET", url: unAll.json().data.downloadUrl }, unCookie); const unBook = new ExcelJS.Workbook(); await unBook.xlsx.load(unAllDownload.rawPayload as never); expect(unBook.worksheets[0]!.getColumn(2).values.slice(2)).not.toContain("GP 芝柏表"); const job = await prisma.exportJob.findUniqueOrThrow({ where: { id: unAll.json().data.id } }); expect(job.requestJson).toMatchObject({ scope: "ALL" }); expect(job.effectiveFields).toEqual(["leadNo", "brand"]); expect(await prisma.auditLog.count({ where: { targetId: filtered.json().data.id, action: { in: ["EXPORT_CREATE", "EXPORT_DOWNLOAD"] } } })).toBe(2);
  });
});
