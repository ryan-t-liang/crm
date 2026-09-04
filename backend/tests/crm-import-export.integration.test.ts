import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { SESSION_COOKIE, sessionTokenHash } from "../src/common/auth.js";
import type { AppConfig } from "../src/common/config.js";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const runKey = `jobs-${Date.now()}-${randomUUID().slice(0, 6)}`;

function multipart(buffer: Buffer, filename: string) {
  const boundary = `----Kivisense${randomUUID().replaceAll("-", "")}`;
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([head, buffer, tail]) };
}

async function workbook(rows: Array<Record<string, string>>): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("数据");
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(headers.map((header) => row[header] ?? "")));
  return Buffer.from(await book.xlsx.writeBuffer());
}

function headers(sheet: ExcelJS.Worksheet): string[] {
  return (sheet.getRow(1).values as unknown[]).slice(1).map(String);
}

describe.skipIf(!enabled).sequential("Kivisense CRM 2.0 import and export", () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let storageDir: string;
  let adminCookie: string;
  let salesCookie: string;
  let adminId: string;
  let contactId: string;

  const inject = (input: any, cookie = adminCookie) => app.inject({
    ...input,
    headers: { ...(input.headers || {}), cookie },
  });

  async function upload(route: "contacts" | "leads", rows: Array<Record<string, string>>, cookie = adminCookie) {
    const form = multipart(await workbook(rows), `${route}-${runKey}.xlsx`);
    return inject({ method: "POST", url: `/api/v1/crm/imports/${route}`, ...form }, cookie);
  }

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("TEST_DATABASE_URL or DATABASE_URL is required");
    storageDir = await mkdtemp(join(tmpdir(), "kivisense-crm2-jobs-"));
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    const config: AppConfig = {
      nodeEnv: "test",
      logLevel: "silent",
      port: 0,
      databaseUrl,
      sessionSecret: "kivisense-crm-jobs-session-secret-2026",
      sessionTtlHours: 12,
      initialPassword: "KivisenseInitialPassword@2026",
      superAdminAccount: "admin@kivisense.test",
      superAdminName: "测试管理员",
      cookieSecure: false,
      corsOrigin: "*",
      appBasePath: "",
      trustProxy: false,
      maxBodyBytes: 10 * 1024 * 1024,
      maxAttachmentBytes: 100 * 1024 * 1024,
      storageDir,
    };
    const [adminRole, salesRole] = await Promise.all([
      prisma.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } }),
      prisma.role.findUniqueOrThrow({ where: { key: "SALES" } }),
    ]);
    const [admin, sales] = await Promise.all([
      prisma.user.create({ data: { name: `导入管理员 ${runKey}`, loginAccount: `job-admin-${runKey}@example.test`, passwordHash: "test-only", roleId: adminRole.id, mustChangePassword: false } }),
      prisma.user.create({ data: { name: `导入销售 ${runKey}`, loginAccount: `job-sales-${runKey}@example.test`, passwordHash: "test-only", roleId: salesRole.id, mustChangePassword: false } }),
    ]);
    adminId = admin.id;
    const sessionCookie = async (userId: string) => {
      const token = `${randomUUID()}${randomUUID()}`;
      await prisma.session.create({ data: { userId, tokenHash: sessionTokenHash(token, config.sessionSecret), expiresAt: new Date(Date.now() + 3_600_000) } });
      return `${SESSION_COOKIE}=${token}`;
    };
    [adminCookie, salesCookie] = await Promise.all([sessionCookie(admin.id), sessionCookie(sales.id)]);
    const contact = await prisma.contact.create({
      data: { contactName: `Naderi ${runKey}`, companyShortName: "Dena", email: `old-${runKey}@example.test`, createdByUserId: admin.id },
    });
    contactId = contact.id;
    app = await buildApp({ config, prisma, frontendRoot: resolve(process.cwd(), "../frontend") });
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      const users = await prisma.user.findMany({ where: { loginAccount: { contains: runKey } }, select: { id: true } });
      const userIds = users.map((item) => item.id);
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

  it("下载联系人和线索导入模板", async () => {
    for (const [route, expected, forbidden] of [
      ["contacts", ["contactName", "companyName", "owner"], ["brandId", "customerId"]],
      ["leads", ["contactId", "requirementSummary", "salesOwner"], ["contactName", "email", "brandId"]],
    ] as const) {
      const response = await inject({ method: "GET", url: `/api/v1/crm/templates/${route}` });
      expect(response.statusCode).toBe(200);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(response.rawPayload as never);
      const actual = headers(book.worksheets[0]!);
      expect(actual).toEqual(expect.arrayContaining([...expected]));
      forbidden.forEach((field) => expect(actual).not.toContain(field));
    }
  });

  it("联系人导入执行预检并生成失败明细", async () => {
    const response = await upload("contacts", [
      { contactName: `导入联系人 ${runKey}`, email: `imported-${runKey}@example.test`, stage: "1v1", owner: adminId },
      { contactName: "", email: `invalid-${runKey}@example.test` },
    ]);
    expect(response.statusCode).toBe(201);
    const job = response.json().data;
    expect(job).not.toHaveProperty("brandId");
    expect(job.preflight).toMatchObject({ totalRows: 2, importableRows: 1, errorRows: 1 });
    const executed = await inject({ method: "POST", url: `/api/v1/crm/imports/${job.id}/execute`, payload: {} });
    expect(executed.statusCode).toBe(200);
    expect(executed.json().data.job).toMatchObject({ status: "COMPLETED_WITH_ERRORS", successCount: 1, failedCount: 1 });
    expect(await prisma.contact.count({ where: { email: `imported-${runKey}@example.test`, stage: "ONE_TO_ONE" } })).toBe(1);
    expect((await inject({ method: "GET", url: `/api/v1/crm/imports/${job.id}/failures` })).statusCode).toBe(200);
  });

  it("线索导入必须关联现有联系人", async () => {
    const response = await upload("leads", [
      { contactId, requirementSummary: `AR 服务合作 ${runKey}`, status: "方案", priority: "高", estimatedQuote: "120000.50", currency: "CNY", salesOwner: adminId },
      { contactId: "missing-contact", requirementSummary: `无效线索 ${runKey}` },
    ]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data.preflight).toMatchObject({ validRows: 1, errorRows: 1 });
    const executed = await inject({ method: "POST", url: `/api/v1/crm/imports/${response.json().data.id}/execute`, payload: {} });
    expect(executed.statusCode).toBe(200);
    const lead = await prisma.crmLead.findFirstOrThrow({ where: { requirementSummary: `AR 服务合作 ${runKey}` } });
    expect(lead).toMatchObject({ contactId, status: "SOLUTION", priority: "HIGH", salesOwnerUserId: adminId });
    expect(lead.estimatedQuote?.toString()).toBe("120000.5");
  });

  it("联系人和线索导出包含实时关联信息", async () => {
    const contactExport = await inject({ method: "POST", url: "/api/v1/crm/exports/contacts", payload: {} });
    expect(contactExport.statusCode).toBe(201);
    expect(contactExport.json().data).not.toHaveProperty("brandId");
    expect((await inject({ method: "GET", url: contactExport.json().data.downloadUrl })).statusCode).toBe(200);

    const newEmail = `fresh-${runKey}@example.test`;
    await prisma.contact.update({ where: { id: contactId }, data: { email: newEmail } });
    const leadExport = await inject({ method: "POST", url: "/api/v1/crm/exports/leads", payload: {} });
    const download = await inject({ method: "GET", url: leadExport.json().data.downloadUrl });
    expect(download.statusCode).toBe(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(download.rawPayload as never);
    const sheet = book.worksheets[0]!;
    const header = headers(sheet);
    const contactColumn = header.indexOf("客户联系人编号") + 1;
    const emailColumn = header.indexOf("联系人电子邮箱") + 1;
    const row = Array.from({ length: sheet.rowCount - 1 }, (_, index) => index + 2).find((number) => String(sheet.getCell(number, contactColumn).value) === contactId);
    expect(row).toBeDefined();
    expect(sheet.getCell(row!, emailColumn).value).toBe(newEmail);
  });

  it("SALES 默认不能导入或导出", async () => {
    expect((await inject({ method: "GET", url: "/api/v1/crm/templates/contacts" }, salesCookie)).statusCode).toBe(403);
    expect((await inject({ method: "POST", url: "/api/v1/crm/exports/contacts", payload: {} }, salesCookie)).statusCode).toBe(403);
    expect((await upload("leads", [{ contactId, requirementSummary: "禁止导入" }], salesCookie)).statusCode).toBe(403);
  });

  it("未注册的导入导出接口返回 404", async () => {
    for (const url of ["/api/v1/imports/history", "/api/v1/templates/customers", "/api/v1/exports/leads"]) {
      expect((await inject({ method: "GET", url })).statusCode).toBe(404);
    }
  });
});
