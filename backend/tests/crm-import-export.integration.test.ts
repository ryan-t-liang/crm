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
import { crmImportFields, crmTemplateWorkbook } from "../src/jobs/crm-schema.js";
import { assertJobBrandInvariant, type CrmJobObjectType } from "../src/jobs/job-types.js";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const runKey = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const crmPermissions = ["crm.contact.import", "crm.contact.export", "crm.lead.import", "crm.lead.export"];

function multipart(buffer: Buffer, filename: string) {
  const boundary = `----kivisense-${randomUUID()}`;
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, buffer, tail]), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

async function workbook(objectType: CrmJobObjectType, rows: Array<Record<string, unknown>>) {
  const buffer = await crmTemplateWorkbook(objectType);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as never);
  const sheet = book.worksheets[0]!;
  const fields = crmImportFields(objectType);
  fields.forEach((_, column) => { sheet.getCell(2, column + 1).value = null; });
  rows.forEach((values, index) => fields.forEach((field, column) => {
    sheet.getCell(index + 2, column + 1).value = values[field.key] == null ? "" : String(values[field.key]);
  }));
  return Buffer.from(await book.xlsx.writeBuffer());
}

function headerValues(sheet: ExcelJS.Worksheet): string[] {
  const values: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => values.push(String(cell.value ?? "")));
  return values;
}

describe.skipIf(!enabled)("Kivisense CRM Import/Export", () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let config: AppConfig;
  let storageDir: string;
  let adminId: string;
  let adminCookie: string;
  let salesCookie: string;
  let disabledUserId: string;
  let contactId: string;

  async function inject(options: InjectOptions, cookie = adminCookie) {
    return app.inject({ ...options, headers: { cookie, ...(options.headers ?? {}) } });
  }

  async function upload(type: "contacts" | "leads", rows: Array<Record<string, unknown>>, objectType: CrmJobObjectType, cookie = adminCookie) {
    const form = multipart(await workbook(objectType, rows), `${type}-${runKey}-${randomUUID()}.xlsx`);
    return inject({ method: "POST", url: `/api/v1/crm/imports/${type}`, ...form }, cookie);
  }

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("TEST_DATABASE_URL or DATABASE_URL is required");
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    storageDir = await mkdtemp(join(tmpdir(), "kivisense-crm-jobs-"));
    config = {
      nodeEnv: "test", port: 0, databaseUrl, sessionSecret: `crm-jobs-${runKey}`, sessionTtlHours: 12,
      initialPassword: "TestOnly!Fixture_2026", superAdminAccount: "unused@example.test", superAdminName: "Unused",
      seedDemoData: false, cookieSecure: false, corsOrigin: "*", appBasePath: "", trustProxy: false,
      maxBodyBytes: 10 * 1024 * 1024, storageDir, outboxPollIntervalMs: 1000,
      sowindGatewayAccessKey: "test-key", sowindGatewayGpUrl: "https://gp.example.test", sowindGatewayUnUrl: "https://un.example.test",
      sowindGatewayTimeoutMs: 1000, sowindGatewayMaxAttempts: 5, sowindGatewayMaxPerMinute: 60, runSowindLiveTests: false,
      integrationClientId: "crm-jobs", integrationClientSecret: "crm-jobs-secret",
      wechatGpAppId: "", wechatGpAppSecret: "", wechatUnAppId: "", wechatUnAppSecret: "", wechatContextTtlMinutes: 30,
    };
    const [superRole, salesRole] = await Promise.all([
      prisma.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } }),
      prisma.role.findUniqueOrThrow({ where: { key: "SALES" } }),
    ]);
    const permissionRows = [];
    for (const key of crmPermissions) {
      permissionRows.push(await prisma.permission.upsert({ where: { key }, update: { module: "crm" }, create: { key, name: key, module: "crm" } }));
    }
    await prisma.rolePermission.createMany({ data: permissionRows.map((permission) => ({ roleId: superRole.id, permissionId: permission.id })), skipDuplicates: true });
    await prisma.rolePermission.deleteMany({ where: { roleId: salesRole.id, permissionId: { in: permissionRows.map((permission) => permission.id) } } });

    const admin = await prisma.user.create({ data: { name: `CRM Import Admin ${runKey}`, loginAccount: `crm-admin-${runKey}@example.test`, passwordHash: "test-only", roleId: superRole.id, mustChangePassword: false } });
    adminId = admin.id;
    const sales = await prisma.user.create({ data: { name: `CRM Import Sales ${runKey}`, loginAccount: `crm-sales-${runKey}@example.test`, passwordHash: "test-only", roleId: salesRole.id, mustChangePassword: false } });
    const disabled = await prisma.user.create({ data: { name: `CRM Disabled ${runKey}`, loginAccount: `crm-disabled-${runKey}@example.test`, passwordHash: "test-only", roleId: salesRole.id, status: "DISABLED", mustChangePassword: false } });
    disabledUserId = disabled.id;
    for (const [userId, setCookie] of [[admin.id, (value: string) => { adminCookie = value; }], [sales.id, (value: string) => { salesCookie = value; }]] as const) {
      const token = sessionToken();
      await prisma.session.create({ data: { userId, tokenHash: sessionTokenHash(token, config.sessionSecret), expiresAt: new Date(Date.now() + 3_600_000) } });
      setCookie(`${SESSION_COOKIE}=${token}`);
    }
    const contact = await prisma.contact.create({
      data: {
        contactName: `Existing Naderi ${runKey}`, companyShortName: "Dena", email: `existing-${runKey}@example.test`, phone: "+98 21 5555 0188",
        stage: "SOLUTION", createdByUserId: admin.id,
      },
    });
    contactId = contact.id;
    app = await buildApp({ config, prisma, startWorker: false, frontendRoot: resolve(process.cwd(), "../frontend") });
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      const users = await prisma.user.findMany({ where: { loginAccount: { contains: runKey } }, select: { id: true } });
      const userIds = users.map((user) => user.id);
      await prisma.importJob.deleteMany({ where: { createdBy: { in: userIds } } });
      await prisma.exportJob.deleteMany({ where: { createdBy: { in: userIds } } });
      await prisma.leadFollowup.deleteMany({ where: { lead: { createdByUserId: { in: userIds } } } });
      await prisma.crmLead.deleteMany({ where: { createdByUserId: { in: userIds } } });
      await prisma.contactFollowup.deleteMany({ where: { contact: { createdByUserId: { in: userIds } } } });
      await prisma.contact.deleteMany({ where: { createdByUserId: { in: userIds } } });
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.$disconnect();
    }
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
  }, 30_000);

  it("downloads strict Contact and CRM Lead templates", async () => {
    for (const [type, expected, forbidden] of [
      ["contacts", ["contactName", "companyName", "owner", "nextFollowupAt"], ["id", "relatedLeadCount"]],
      ["leads", ["contactId", "requirementSummary", "estimatedQuote", "salesOwner"], ["contactName", "email", "phone"]],
    ] as const) {
      const response = await inject({ method: "GET", url: `/api/v1/crm/templates/${type}` });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("spreadsheetml");
      const book = new ExcelJS.Workbook(); await book.xlsx.load(response.rawPayload as never);
      const headers = headerValues(book.worksheets[0]!);
      expect(headers).toEqual(expect.arrayContaining([...expected]));
      forbidden.forEach((field) => expect(headers).not.toContain(field));
      expect(book.worksheets.map((sheet) => sheet.name)).toEqual(expect.arrayContaining(["填写说明"]));
    }
  });

  it("preflights Contact required, email, empty communication, stage, owner and duplicate rules", async () => {
    const response = await upload("contacts", [
      { contactName: "", email: `missing-${runKey}@example.test` },
      { contactName: `Bad Email ${runKey}`, email: "invalid-email" },
      { contactName: `No Communication ${runKey}`, email: "", phone: "", stage: "初筛" },
      { contactName: `Bad Stage ${runKey}`, stage: "meeting" },
      { contactName: `Valid Owner ${runKey}`, owner: `crm-admin-${runKey}@example.test` },
      { contactName: `Disabled Owner ${runKey}`, owner: disabledUserId },
      { contactName: `Unknown Owner ${runKey}`, owner: "missing-user-id" },
      { contactName: `Database Duplicate ${runKey}`, email: ` EXISTING-${runKey}@EXAMPLE.TEST `, phone: "+98 (21) 5555-0188" },
      { contactName: `Workbook Duplicate A ${runKey}`, email: `workbook-${runKey}@example.test` },
      { contactName: `Workbook Duplicate B ${runKey}`, email: `WORKBOOK-${runKey}@EXAMPLE.TEST` },
    ], "CONTACT");
    expect(response.statusCode).toBe(201);
    const data = response.json().data;
    expect(data.preflight).toMatchObject({ totalRows: 10, validRows: 3, warningRows: 2, errorRows: 5, importableRows: 5 });
    expect(data.rows[0].errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: "contactName" })]));
    expect(data.rows[1].errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: "email" })]));
    expect(data.rows[2]).toMatchObject({ status: "VALID", normalizedData: { email: null, phone: null, stage: "INITIAL" } });
    expect(data.rows[3].errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: "stage" })]));
    expect(data.rows[4]).toMatchObject({ status: "VALID", normalizedData: { ownerUserId: adminId } });
    expect(data.rows[5].errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "OWNER_DISABLED" })]));
    expect(data.rows[6].errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "OWNER_NOT_FOUND" })]));
    expect(data.rows[7].warnings.filter((warning: { code: string }) => warning.code === "POTENTIAL_DUPLICATE")).toHaveLength(2);
    expect(data.rows[9].warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "POTENTIAL_DUPLICATE" })]));
    const job = await prisma.importJob.findUniqueOrThrow({ where: { id: data.id } });
    expect(job.brandId).toBeNull();
  });

  it("executes valid Contact rows, writes CREATE_CONTACT audit, failure CSV, history, and rejects a second execution", async () => {
    const response = await upload("contacts", [
      { contactName: `Imported Contact ${runKey}`, email: `imported-${runKey}@example.test`, stage: "1v1", owner: adminId },
      { contactName: "", email: `failed-${runKey}@example.test` },
    ], "CONTACT");
    const job = response.json().data;
    const executed = await inject({ method: "POST", url: `/api/v1/crm/imports/${job.id}/execute`, payload: {} });
    expect(executed.statusCode).toBe(200);
    expect(executed.json().data.job).toMatchObject({ status: "COMPLETED_WITH_ERRORS", successCount: 1, failedCount: 1, createdCount: 1 });
    const contact = await prisma.contact.findFirstOrThrow({ where: { email: `imported-${runKey}@example.test` } });
    expect(contact).toMatchObject({ stage: "ONE_TO_ONE", ownerUserId: adminId, createdByUserId: adminId });
    expect(await prisma.contactFollowup.count({ where: { contactId: contact.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { targetId: contact.id, action: "CREATE_CONTACT", actorUserId: adminId } })).toBe(1);
    const failure = await inject({ method: "GET", url: `/api/v1/crm/imports/${job.id}/failures` });
    expect(failure.statusCode).toBe(200);
    expect(failure.body).toContain("original_row_number");
    expect(failure.body).toContain("PREFLIGHT_ERROR");
    const history = await inject({ method: "GET", url: "/api/v1/crm/imports?objectType=CONTACT" });
    expect(history.statusCode).toBe(200);
    expect(history.json().data).toEqual(expect.arrayContaining([expect.objectContaining({ id: job.id, objectType: "CONTACT", operatorName: `CRM Import Admin ${runKey}` })]));
    const legacyHistory = await inject({ method: "GET", url: "/api/v1/imports/history?pageSize=100" });
    expect(legacyHistory.statusCode).toBe(200);
    expect(legacyHistory.json().data.every((item: { objectType: string }) => ["CUSTOMER", "LEAD"].includes(item.objectType))).toBe(true);
    expect((await inject({ method: "GET", url: `/api/v1/imports/${job.id}` })).statusCode).toBe(404);
    expect((await inject({ method: "GET", url: `/api/v1/imports/${job.id}/failures` })).statusCode).toBe(404);
    const second = await inject({ method: "POST", url: `/api/v1/crm/imports/${job.id}/execute`, payload: {} });
    expect(second.statusCode).toBe(409);
  });

  it("preflights CRM Lead contact, summary, enums, quote, currency and owner rules", async () => {
    const response = await upload("leads", [
      { contactId, requirementSummary: `Valid Lead ${runKey}`, status: "方案", priority: "紧急", salesOwner: adminId },
      { contactId: "", requirementSummary: `Missing Contact ${runKey}` },
      { contactId: "unknown-contact", requirementSummary: `Unknown Contact ${runKey}` },
      { contactId, requirementSummary: "" },
      { contactId, requirementSummary: `Bad Status ${runKey}`, status: "DISCOVERY" },
      { contactId, requirementSummary: `Bad Priority ${runKey}`, priority: "CRITICAL" },
      { contactId, requirementSummary: `Missing Currency ${runKey}`, estimatedQuote: "120000" },
      { contactId, requirementSummary: `Negative Quote ${runKey}`, estimatedQuote: "-1", currency: "CNY" },
      { contactId, requirementSummary: `Disabled Owner ${runKey}`, followupOwner: disabledUserId },
    ], "CRM_LEAD");
    expect(response.statusCode).toBe(201);
    const rows = response.json().data.rows;
    expect(response.json().data.preflight).toMatchObject({ totalRows: 9, validRows: 1, warningRows: 0, errorRows: 8, importableRows: 1 });
    expect(rows[0]).toMatchObject({ status: "VALID", normalizedData: { contactId, status: "SOLUTION", priority: "URGENT", salesOwnerUserId: adminId } });
    expect(rows[1].errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: "contactId" })]));
    expect(rows[2].errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "CONTACT_NOT_FOUND" })]));
    expect(rows[3].errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: "requirementSummary" })]));
    expect(rows[4].errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: "status" })]));
    expect(rows[5].errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: "priority" })]));
    expect(rows[6].errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "CURRENCY_REQUIRED" })]));
    expect(rows[7].errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "INVALID_QUOTE" })]));
    expect(rows[8].errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "OWNER_DISABLED" })]));
  });

  it("creates a related CRM Lead with Decimal precision, audit, no snapshot, no Followup and no Sowind Outbox", async () => {
    const outboxBefore = await prisma.integrationOutbox.count();
    const response = await upload("leads", [{
      contactId, requirementSummary: `AR service cooperation ${runKey}`, requirementDetail: "AR application service",
      estimatedQuote: "120000.50", currency: "CNY", status: "已确认", priority: "高",
      salesOwner: `crm-admin-${runKey}@example.test`, followupOwner: adminId,
    }], "CRM_LEAD");
    const job = response.json().data;
    const executed = await inject({ method: "POST", url: `/api/v1/crm/imports/${job.id}/execute`, payload: {} });
    expect(executed.statusCode).toBe(200);
    const lead = await prisma.crmLead.findFirstOrThrow({ where: { requirementSummary: `AR service cooperation ${runKey}` } });
    expect(lead).toMatchObject({ contactId, status: "QUALIFIED", priority: "HIGH", salesOwnerUserId: adminId, followupOwnerUserId: adminId, createdByUserId: adminId });
    expect(lead.estimatedQuote?.toString()).toBe("120000.5");
    expect(Object.keys(lead)).not.toEqual(expect.arrayContaining(["contactName", "companyName", "email", "phone", "originalSnapshot"]));
    expect(await prisma.leadFollowup.count({ where: { leadId: lead.id } })).toBe(0);
    expect(await prisma.integrationOutbox.count()).toBe(outboxBefore);
    expect(await prisma.auditLog.count({ where: { targetId: lead.id, action: "CREATE_CRM_LEAD", actorUserId: adminId } })).toBe(1);
  });

  it("exports Contacts and Leads through ExportJob with IDs and live derived Contact data", async () => {
    const contactExport = await inject({ method: "POST", url: "/api/v1/crm/exports/contacts", payload: {} });
    expect(contactExport.statusCode).toBe(201);
    expect(contactExport.json().data).toMatchObject({ objectType: "CONTACT", brandId: null, status: "COMPLETED" });
    const contactDownload = await inject({ method: "GET", url: contactExport.json().data.downloadUrl });
    const contactBook = new ExcelJS.Workbook(); await contactBook.xlsx.load(contactDownload.rawPayload as never);
    const contactSheet = contactBook.worksheets[0]!;
    const contactHeaders = headerValues(contactSheet);
    expect(contactHeaders).toEqual(expect.arrayContaining(["Contact ID", "Contact Name", "Related Lead Count"]));
    expect(contactSheet.getColumn(1).values.slice(2)).toContain(contactId);
    const contactRow = Array.from({ length: Math.max(0, contactSheet.rowCount - 1) }, (_, index) => index + 2)
      .find((row) => String(contactSheet.getCell(row, 1).value) === contactId);
    expect(contactRow).toBeDefined();
    expect(contactSheet.getCell(contactRow!, contactHeaders.indexOf("Owner") + 1).value).toBeNull();
    expect(contactSheet.getCell(contactRow!, contactHeaders.indexOf("Next Followup") + 1).value).toBeNull();

    const currentEmail = `fresh-${runKey}@example.test`;
    await prisma.contact.update({ where: { id: contactId }, data: { email: currentEmail } });
    const leadExport = await inject({ method: "POST", url: "/api/v1/crm/exports/leads", payload: {} });
    expect(leadExport.statusCode).toBe(201);
    const leadDownload = await inject({ method: "GET", url: leadExport.json().data.downloadUrl });
    expect(leadDownload.statusCode).toBe(200);
    expect((await inject({ method: "GET", url: `/api/v1/exports/${leadExport.json().data.id}/download` })).statusCode).toBe(404);
    const leadBook = new ExcelJS.Workbook(); await leadBook.xlsx.load(leadDownload.rawPayload as never);
    const leadSheet = leadBook.worksheets[0]!;
    const headers = headerValues(leadSheet);
    expect(headers).toEqual(expect.arrayContaining(["CRM Lead ID", "Contact ID", "Contact Name", "Contact Email"]));
    const contactIdColumn = headers.indexOf("Contact ID") + 1;
    const emailColumn = headers.indexOf("Contact Email") + 1;
    const exportedRows = Array.from({ length: Math.max(0, leadSheet.rowCount - 1) }, (_, index) => index + 2);
    const relatedRow = exportedRows.find((row) => String(leadSheet.getCell(row, contactIdColumn).value) === contactId);
    expect(relatedRow).toBeDefined();
    expect(leadSheet.getCell(relatedRow!, emailColumn).value).toBe(currentEmail);
    expect(leadSheet.getCell(relatedRow!, headers.indexOf("Next Followup") + 1).value).toBeNull();
    expect(leadSheet.getCell(relatedRow!, headers.indexOf("Last Followup") + 1).value).toBeNull();
    expect((await app.inject({ method: "GET", url: leadExport.json().data.downloadUrl })).statusCode).toBe(401);
    const stored = await prisma.exportJob.findUniqueOrThrow({ where: { id: leadExport.json().data.id } });
    expect(stored).toMatchObject({ objectType: "CRM_LEAD", brandId: null, status: "COMPLETED", createdBy: adminId });
  });

  it("enforces CRM governance permissions and ImportJob brand invariants", async () => {
    expect((await inject({ method: "GET", url: "/api/v1/crm/templates/contacts" }, salesCookie)).statusCode).toBe(403);
    expect((await inject({ method: "POST", url: "/api/v1/crm/exports/contacts", payload: {} }, salesCookie)).statusCode).toBe(403);
    const salesForm = multipart(await workbook("CRM_LEAD", [{ contactId, requirementSummary: `Sales denied ${runKey}` }]), "sales-denied.xlsx");
    expect((await inject({ method: "POST", url: "/api/v1/crm/imports/leads", ...salesForm }, salesCookie)).statusCode).toBe(403);
    expect((await inject({ method: "GET", url: "/api/v1/crm/templates/leads" })).statusCode).toBe(200);
    expect(() => assertJobBrandInvariant("CUSTOMER", null)).toThrowError(/必须关联品牌/);
    expect(() => assertJobBrandInvariant("LEAD", null)).toThrowError(/必须关联品牌/);
    expect(() => assertJobBrandInvariant("CONTACT", "brand-id")).toThrowError(/不能关联/);
    expect(() => assertJobBrandInvariant("CRM_LEAD", "brand-id")).toThrowError(/不能关联/);
    expect(() => assertJobBrandInvariant("CONTACT", null)).not.toThrow();
    const legacy = await prisma.importJob.findFirst({ where: { objectType: { in: ["CUSTOMER", "LEAD"] } } });
    if (legacy) expect(legacy.brandId).not.toBeNull();
  });
});
