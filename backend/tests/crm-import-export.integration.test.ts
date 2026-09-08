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

  async function upload(route: "contacts" | "leads" | "marketing-leads" | "organizations", rows: Array<Record<string, string>>, cookie = adminCookie, query = "") {
    const form = multipart(await workbook(rows), `${route}-${runKey}.xlsx`);
    return inject({ method: "POST", url: `/api/v1/crm/imports/${route}${query}`, ...form }, cookie);
  }

  async function completedExport(response: Awaited<ReturnType<typeof inject>>, cookie = adminCookie) {
    expect(response.statusCode).toBe(202);
    expect(response.json().data.downloadUrl).toBeNull();
    const statusUrl = response.json().data.statusUrl as string;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const statusResponse = await inject({ method: "GET", url: statusUrl }, cookie);
      expect(statusResponse.statusCode).toBe(200);
      if (statusResponse.json().data.status === "FAILED") throw new Error(statusResponse.json().data.error || "Export failed");
      if (statusResponse.json().data.status === "COMPLETED") return statusResponse.json().data as { downloadUrl: string; rowCount: number };
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    }
    throw new Error("Export did not complete within the integration-test timeout");
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
      crmActiveDays: 30,
      crmDormantDays: 60,
      crmStaleLeadDays: 30,
      crmHighFitUntouchedDays: 30,
      crmMqlMinFitScore: 40,
      crmMqlMinEngagementScore: 70,
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
      await prisma.crmAttachment.deleteMany({ where: { uploadedByUserId: { in: userIds } } });
      await prisma.importJob.deleteMany({ where: { createdBy: { in: userIds } } });
      await prisma.exportJob.deleteMany({ where: { createdBy: { in: userIds } } });
      await prisma.crmTask.deleteMany({ where: { OR: [{ createdByUserId: { in: userIds } }, { ownerUserId: { in: userIds } }] } });
      await prisma.organizationNurture.deleteMany({ where: { createdByUserId: { in: userIds } } });
      await prisma.leadFollowup.deleteMany({ where: { lead: { createdByUserId: { in: userIds } } } });
      await prisma.crmLead.deleteMany({ where: { createdByUserId: { in: userIds } } });
      const marketingLeadIds = (await prisma.marketingLead.findMany({ where: { createdByUserId: { in: userIds } }, select: { id: true } })).map((row) => row.id);
      await prisma.leadScoreHistory.deleteMany({ where: { marketingLeadId: { in: marketingLeadIds } } });
      await prisma.leadActivityEvent.deleteMany({ where: { marketingLeadId: { in: marketingLeadIds } } });
      await prisma.leadStatusHistory.deleteMany({ where: { marketingLeadId: { in: marketingLeadIds } } });
      await prisma.marketingLead.deleteMany({ where: { id: { in: marketingLeadIds } } });
      await prisma.contactFollowup.deleteMany({ where: { contact: { createdByUserId: { in: userIds } } } });
      await prisma.contact.deleteMany({ where: { createdByUserId: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { createdByUserId: { in: userIds } } });
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
      await prisma.assignmentNotification.deleteMany({ where: { OR: [{ toUserId: { in: userIds } }, { assignedByUserId: { in: userIds } }] } });
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.$disconnect();
    }
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
  }, 30_000);

  it("下载联系人、商机、线索和公司导入模板", async () => {
    for (const [route, expected, forbidden] of [
      ["contacts", ["contactName", "contactType", "companyName", "owner", "followupAttention", "meetingMinutesFiles"], ["brandId", "customerId"]],
      ["leads", ["contactId", "requirementSummary", "salesOwner", "participantUsers", "proposalFiles", "wonAt", "nextAction", "imageRequirementNote", "quotationNote"], ["contactName", "email", "brandId"]],
      ["marketing-leads", ["fullName", "email", "phone", "whatsapp", "companyName", "countryCode", "source", "sourceChannel", "sourceDetail", "inquiryContent", "owner", "fitScore", "note"], ["scoreHistory", "engagementScore", "utmSource", "rawMetadataJson"]],
      ["organizations", ["name", "shortName", "roles", "lifecycle", "fitScore", "fitReason", "logo"], ["competitor", "amount", "revenue"]],
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

  it("营销线索导入保留来源与原始询盘且不导入评分历史", async () => {
    const response = await upload("marketing-leads", [{ fullName: `Import Naderi ${runKey}`, email: `marketing-import-${runKey}@example.test`, phone: "+98 21 5555 0188", whatsapp: "+98 912 555 0188", companyName: "Dena", title: "Manager", countryCode: "IR", source: "WEBSITE", sourceChannel: "Organic Search", sourceDetail: "Google/Bing", inquiryType: "Not sure yet", inquiryContent: "Original imported inquiry", owner: adminId, fitScore: "40", note: "Import regression" }]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data.preflight).toMatchObject({ importableRows: 1, errorRows: 0 });
    const executed = await inject({ method: "POST", url: `/api/v1/crm/imports/${response.json().data.id}/execute`, payload: {} });
    expect(executed.statusCode).toBe(200);
    const lead = await prisma.marketingLead.findFirstOrThrow({ where: { email: `marketing-import-${runKey}@example.test` } });
    expect(lead).toMatchObject({ companyName: "Dena", source: "WEBSITE", sourceChannel: "ORGANIC_SEARCH", sourceDetail: "Google/Bing", inquiryContent: "Original imported inquiry", fitScore: 40, engagementScoreCached: 0 });
    expect(await prisma.leadActivityEvent.count({ where: { marketingLeadId: lead.id } })).toBe(0);
    const exported = await inject({ method: "POST", url: "/api/v1/crm/exports/marketing-leads", payload: {} });
    const completed = await completedExport(exported);
    const download = await inject({ method: "GET", url: completed.downloadUrl });
    expect(download.statusCode).toBe(200);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(download.rawPayload as never);
    expect(headers(book.worksheets[0]!)).toEqual(expect.arrayContaining(["线索编号", "姓名", "来源", "原始询盘", "线索匹配度", "互动活跃度", "商机编号"]));
  });

  it("公司导入支持多角色且导出保持统一主档字段", async () => {
    const organizationName = `批量公司 ${runKey}`;
    const response = await upload("organizations", [{ name: organizationName, shortName: "批量公司", roles: "PROSPECT\nVENDOR", lifecycle: "TARGET", owner: adminId, fitScore: "82", fitReason: "批量导入评分" }]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data.preflight).toMatchObject({ importableRows: 1, errorRows: 0 });
    const executed = await inject({ method: "POST", url: `/api/v1/crm/imports/${response.json().data.id}/execute`, payload: {} });
    expect(executed.statusCode).toBe(200);
    const organization = await prisma.organization.findFirstOrThrow({ where: { name: organizationName }, include: { roles: true } });
    expect(organization.fitScore).toBe(82);
    expect(organization.roles.map((item) => item.role).sort()).toEqual(["PROSPECT", "VENDOR"]);

    const exported = await inject({ method: "POST", url: "/api/v1/crm/exports/organizations", payload: {} });
    const completed = await completedExport(exported);
    const download = await inject({ method: "GET", url: completed.downloadUrl });
    expect(download.statusCode).toBe(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(download.rawPayload as never);
    expect(headers(book.worksheets[0]!)).toEqual(expect.arrayContaining(["组织编号", "组织", "组织类型", "组织关系", "客户阶段", "客户匹配度", "评分原因", "Logo"]));
  });

  it("联系人导入执行预检并生成失败明细", async () => {
    const response = await upload("contacts", [
      { contactName: `导入联系人 ${runKey}`, contactType: "BUSINESS", organizationName: `批量公司 ${runKey}`, email: `imported-${runKey}@example.test`, stage: "1v1", owner: adminId, followupAttention: "持续确认素材", meetingMinutesFiles: "保密协议.pdf" },
      { contactName: "", email: `invalid-${runKey}@example.test` },
    ]);
    expect(response.statusCode).toBe(201);
    const job = response.json().data;
    expect(job).not.toHaveProperty("brandId");
    expect(job.preflight).toMatchObject({ totalRows: 2, importableRows: 1, warningRows: 1, errorRows: 1 });
    expect(job.rows[0].warnings[0].code).toBe("ATTACHMENT_FILE_NOT_AVAILABLE");
    const executed = await inject({ method: "POST", url: `/api/v1/crm/imports/${job.id}/execute`, payload: {} });
    expect(executed.statusCode).toBe(200);
    expect(executed.json().data.job).toMatchObject({ status: "COMPLETED_WITH_ERRORS", successCount: 1, failedCount: 1 });
    const importedContact = await prisma.contact.findFirstOrThrow({ where: { email: `imported-${runKey}@example.test`, stage: "ONE_TO_ONE" } });
    expect(importedContact).toMatchObject({ contactType: "BUSINESS", createdByUserId: adminId, followupAttention: "持续确认素材", organizationId: expect.any(String) });
    expect((await inject({ method: "GET", url: `/api/v1/crm/imports/${job.id}/failures` })).statusCode).toBe(200);
  });

  it("联系人导入默认不创建缺失公司，只有显式开关才允许创建", async () => {
    const blockedName = `默认禁止创建公司 ${runKey}`;
    const blocked = await upload("contacts", [{ contactName: `未关联联系人 ${runKey}`, organizationName: blockedName, email: `missing-org-${runKey}@example.test` }]);
    expect(blocked.statusCode).toBe(201);
    expect(blocked.json().data.preflight).toMatchObject({ importableRows: 0, errorRows: 1 });
    expect(blocked.json().data.rows[0].errors[0].code).toBe("ORGANIZATION_NOT_FOUND");
    expect(await prisma.organization.count({ where: { name: blockedName } })).toBe(0);

    const explicitName = `显式创建公司 ${runKey}`;
    const allowed = await upload("contacts", [{ contactName: `自动建档联系人 ${runKey}`, organizationName: explicitName, email: `created-org-${runKey}@example.test` }], adminCookie, "?createMissingOrganization=true");
    expect(allowed.statusCode).toBe(201);
    expect(allowed.json().data.rows[0].warnings[0].code).toBe("ORGANIZATION_WILL_BE_CREATED");
    expect((await inject({ method: "POST", url: `/api/v1/crm/imports/${allowed.json().data.id}/execute`, payload: {} })).statusCode).toBe(200);
    const contact = await prisma.contact.findFirstOrThrow({ where: { email: `created-org-${runKey}@example.test` }, include: { organization: true } });
    expect(contact.organization?.name).toBe(explicitName);
  });

  it("线索导入必须关联现有联系人", async () => {
    const response = await upload("leads", [
      { contactId, requirementSummary: `AR 服务合作 ${runKey}`, status: "方案", priority: "高", estimatedQuote: "120000.50", currency: "CNY", salesOwner: adminId, participantUsers: adminId, leadSource: "Kiviman", latestProgress: "历史进度", nextAction: "安排演示", imageRequirementNote: "准备产品正面图", quotationNote: "含一年运维", proposalFiles: "https://files.example.com/proposal.pptx" },
      { contactId: "missing-contact", requirementSummary: `无效线索 ${runKey}` },
    ]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data.preflight).toMatchObject({ validRows: 1, errorRows: 1 });
    const executed = await inject({ method: "POST", url: `/api/v1/crm/imports/${response.json().data.id}/execute`, payload: {} });
    expect(executed.statusCode).toBe(200);
    const lead = await prisma.crmLead.findFirstOrThrow({ where: { requirementSummary: `AR 服务合作 ${runKey}` } });
    expect(lead).toMatchObject({ contactId, status: "SOLUTION", priority: "HIGH", salesOwnerUserId: adminId, createdByUserId: adminId, leadSource: "Kiviman", latestProgress: "历史进度", nextAction: "安排演示", imageRequirementNote: "准备产品正面图", quotationNote: "含一年运维" });
    expect(lead.estimatedQuote?.toString()).toBe("120000.5");
    expect(await prisma.crmLeadParticipant.count({ where: { leadId: lead.id, userId: adminId } })).toBe(1);
    expect(await prisma.crmAttachment.count({ where: { entityType: "LEAD", entityId: lead.id, fieldKey: "proposalFiles", storageType: "EXTERNAL_URL" } })).toBe(1);
  });

  it("联系人和线索导出包含实时关联信息", async () => {
    const contactExport = await inject({ method: "POST", url: "/api/v1/crm/exports/contacts", payload: {} });
    const completedContactExport = await completedExport(contactExport);
    expect(contactExport.json().data).not.toHaveProperty("brandId");
    const contactDownload = await inject({ method: "GET", url: completedContactExport.downloadUrl });
    expect(contactDownload.statusCode).toBe(200);
    const contactBook = new ExcelJS.Workbook();
    await contactBook.xlsx.load(contactDownload.rawPayload as never);
    expect(headers(contactBook.worksheets[0]!)).toContain("联系人类型");

    const newEmail = `fresh-${runKey}@example.test`;
    await prisma.contact.update({ where: { id: contactId }, data: { email: newEmail } });
    const leadExport = await inject({ method: "POST", url: "/api/v1/crm/exports/leads", payload: {} });
    const completedLeadExport = await completedExport(leadExport);
    const download = await inject({ method: "GET", url: completedLeadExport.downloadUrl });
    expect(download.statusCode).toBe(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(download.rawPayload as never);
    const sheet = book.worksheets[0]!;
    const header = headers(sheet);
    expect(header).toEqual(expect.arrayContaining(["客户来源", "正式方案文件", "商机协作成员", "创建人", "成交日期", "下一步动作", "图片需求说明", "报价说明"]));
    const contactColumn = header.indexOf("联系人编号") + 1;
    const emailColumn = header.indexOf("联系人电子邮箱") + 1;
    const row = Array.from({ length: sheet.rowCount - 1 }, (_, index) => index + 2).find((number) => String(sheet.getCell(number, contactColumn).value) === contactId);
    expect(row).toBeDefined();
    expect(sheet.getCell(row!, emailColumn).value).toBe(newEmail);
  });

  it("异步导出支持所选、筛选、权限范围、历史与重新生成", async () => {
    const selectedRequest = { scope: "SELECTED", format: "XLSX", selectedIds: [contactId], filters: {} };
    const selectedEstimate = await inject({ method: "POST", url: "/api/v1/crm/exports/contacts/estimate", payload: selectedRequest });
    expect(selectedEstimate.statusCode).toBe(200);
    expect(selectedEstimate.json().data).toMatchObject({ count: 1, scope: "SELECTED", format: "XLSX" });
    const selectedJob = await completedExport(await inject({ method: "POST", url: "/api/v1/crm/exports/contacts", payload: selectedRequest }));
    expect(selectedJob.rowCount).toBe(1);

    const filteredRequest = { scope: "FILTERED", format: "XLSX", selectedIds: [], filters: { keyword: `no-match-${runKey}` } };
    const filteredJob = await completedExport(await inject({ method: "POST", url: "/api/v1/crm/exports/contacts", payload: filteredRequest }));
    expect(filteredJob.rowCount).toBe(0);

    const allJob = await completedExport(await inject({ method: "POST", url: "/api/v1/crm/exports/contacts", payload: { scope: "ALL_CURRENT_PERMISSION", format: "XLSX", selectedIds: [], filters: {} } }));
    expect(allJob.rowCount).toBeGreaterThanOrEqual(1);

    const history = await inject({ method: "GET", url: "/api/v1/crm/exports?objectType=CONTACT&pageSize=50" });
    expect(history.statusCode).toBe(200);
    expect(history.json().data).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "COMPLETED", scope: "SELECTED", format: "XLSX", operatorName: expect.stringMatching(/导入管理员/) }),
      expect.objectContaining({ status: "COMPLETED", scope: "FILTERED", format: "XLSX" }),
      expect.objectContaining({ status: "COMPLETED", scope: "ALL_CURRENT_PERMISSION", format: "XLSX" }),
    ]));
    expect(history.json().data.every((row: Record<string, unknown>) => !("storagePath" in row))).toBe(true);

    const regenerated = await inject({ method: "POST", url: `/api/v1/crm/exports/${history.json().data[0].id}/regenerate`, payload: {} });
    const regeneratedJob = await completedExport(regenerated);
    expect(regeneratedJob.rowCount).toBe(history.json().data[0].rowCount);
  });

  it("SALES 默认不能导入或导出", async () => {
    expect((await inject({ method: "GET", url: "/api/v1/crm/templates/contacts" }, salesCookie)).statusCode).toBe(403);
    expect((await inject({ method: "POST", url: "/api/v1/crm/exports/contacts", payload: {} }, salesCookie)).statusCode).toBe(403);
    expect((await upload("leads", [{ contactId, requirementSummary: "禁止导入" }], salesCookie)).statusCode).toBe(403);
    expect((await upload("organizations", [{ name: "禁止导入公司" }], salesCookie)).statusCode).toBe(403);
  });

  it("未注册的导入导出接口返回 404", async () => {
    for (const url of ["/api/v1/imports/history", "/api/v1/templates/customers", "/api/v1/exports/leads"]) {
      expect((await inject({ method: "GET", url })).statusCode).toBe(404);
    }
  });
});
