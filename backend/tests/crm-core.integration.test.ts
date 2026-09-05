import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { SESSION_COOKIE, sessionTokenHash } from "../src/common/auth.js";
import type { AppConfig } from "../src/common/config.js";
import { hashPassword } from "../src/common/password.js";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const runKey = `crm2-${Date.now()}-${randomUUID().slice(0, 6)}`;
const password = "Crm2IntegrationPassword@2026";

function multipart(buffer: Buffer, filename: string, mimeType: string) {
  const boundary = `----Kivisense${randomUUID().replaceAll("-", "")}`;
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([head, buffer, tail]) };
}

describe.skipIf(!enabled).sequential("Kivisense CRM 2.0 core", () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let config: AppConfig;
  let adminCookie: string;
  let salesCookie: string;
  let viewerCookie: string;
  let adminId: string;
  let salesId: string;
  let viewerId: string;
  let contactId: string;
  let contactFollowupId: string;
  let leadId: string;
  let secondLeadId: string;
  let storageDir: string;
  let preservedAttachmentPath: string;
  let preservedAttachmentId: string;

  const inject = (input: any, cookie = salesCookie) => app.inject({
    ...input,
    headers: { ...(input.headers || {}), cookie },
  });

  async function directSession(userId: string): Promise<string> {
    const token = `${randomUUID()}${randomUUID()}`;
    await prisma.session.create({
      data: { userId, tokenHash: sessionTokenHash(token, config.sessionSecret), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    return `${SESSION_COOKIE}=${token}`;
  }

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("TEST_DATABASE_URL or DATABASE_URL is required");
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    storageDir = await mkdtemp(join(tmpdir(), "kivisense-crm2-core-"));
    config = {
      nodeEnv: "test",
      logLevel: "silent",
      port: 0,
      databaseUrl,
      sessionSecret: "kivisense-crm-2-integration-session-secret",
      sessionTtlHours: 12,
      initialPassword: "KivisenseInitialPassword@2026",
      superAdminAccount: "admin@kivisense.test",
      superAdminName: "测试管理员",
      cookieSecure: false,
      corsOrigin: "*",
      appBasePath: "",
      trustProxy: false,
      maxBodyBytes: 10 * 1024 * 1024,
      maxAttachmentBytes: 1024 * 1024,
      storageDir,
    };
    const [adminRole, salesRole, viewerRole] = await Promise.all([
      prisma.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } }),
      prisma.role.findUniqueOrThrow({ where: { key: "SALES" } }),
      prisma.role.findUniqueOrThrow({ where: { key: "VIEWER" } }),
    ]);
    const passwordHash = await hashPassword(password);
    const [admin, sales, viewer] = await Promise.all([
      prisma.user.create({ data: { name: `管理员 ${runKey}`, loginAccount: `admin-${runKey}@example.test`, passwordHash, roleId: adminRole.id, mustChangePassword: false } }),
      prisma.user.create({ data: { name: `销售 ${runKey}`, loginAccount: `sales-${runKey}@example.test`, passwordHash, roleId: salesRole.id, mustChangePassword: false } }),
      prisma.user.create({ data: { name: `只读 ${runKey}`, loginAccount: `viewer-${runKey}@example.test`, passwordHash, roleId: viewerRole.id, mustChangePassword: false } }),
    ]);
    adminId = admin.id;
    salesId = sales.id;
    viewerId = viewer.id;
    [salesCookie, viewerCookie] = await Promise.all([directSession(salesId), directSession(viewerId)]);
    app = await buildApp({ config, prisma, frontendRoot: resolve(process.cwd(), "../frontend") });
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    const users = await prisma.user.findMany({ where: { loginAccount: { contains: runKey } }, select: { id: true } });
    const userIds = users.map((item) => item.id);
    const contacts = await prisma.contact.findMany({ where: { createdByUserId: { in: userIds } }, select: { id: true } });
    const contactIds = contacts.map((item) => item.id);
    const leads = await prisma.crmLead.findMany({ where: { createdByUserId: { in: userIds } }, select: { id: true } });
    const leadIds = leads.map((item) => item.id);
    await prisma.crmAttachment.deleteMany({ where: { uploadedByUserId: { in: userIds } } });
    await prisma.leadFollowup.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.contactFollowup.deleteMany({ where: { contactId: { in: contactIds } } });
    await prisma.crmLead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { targetId: { in: [...contactIds, ...leadIds] } }] } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app?.close();
    await prisma.$disconnect();
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
  }, 30_000);

  it("登录后仅返回 Kivisense 角色和权限信息", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { loginAccount: `admin-${runKey}@example.test`, password },
    });
    expect(response.statusCode).toBe(200);
    expect(response.cookies[0]?.name).toBe(SESSION_COOKIE);
    expect(response.json().data).not.toHaveProperty("brandIds");
    expect(response.json().data).not.toHaveProperty("allBrands");
    adminCookie = `${SESSION_COOKIE}=${response.cookies[0]!.value}`;
    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.json()).toMatchObject({ status: "ok", release: "Kivisense CRM 2.0" });
  });

  it("销售可创建和编辑客户联系人", async () => {
    const created = await inject({
      method: "POST",
      url: "/api/v1/crm/contacts",
      payload: {
        contactName: `Naderi ${runKey}`,
        companyShortName: "Dena",
        email: `naderi-${runKey}@example.test`,
        phone: "+98 21 5555 0188",
        stage: "INITIAL",
        ownerUserId: salesId,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.createdBy.id).toBe(salesId);
    contactId = created.json().data.id;
    const updated = await inject({ method: "PATCH", url: `/api/v1/crm/contacts/${contactId}`, payload: { stage: "ONE_TO_ONE", title: "业务发展总监", followupAttention: "持续关注交付时间" } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data).toMatchObject({ stage: "ONE_TO_ONE", title: "业务发展总监", followupAttention: "持续关注交付时间" });
  });

  it("联系人跟进只能追加，不能编辑或删除", async () => {
    const created = await inject({
      method: "POST",
      url: `/api/v1/crm/contacts/${contactId}/followups`,
      payload: { occurredAt: "2026-09-04T10:00:00+08:00", type: "WECHAT", content: "确认首轮需求", nextFollowupAt: "2026-09-08T10:00:00+08:00", ownerUserId: salesId },
    });
    expect(created.statusCode).toBe(201);
    contactFollowupId = created.json().data.id;
    expect((await inject({ method: "GET", url: `/api/v1/crm/contacts/${contactId}/followups` })).json().data[0].id).toBe(contactFollowupId);
    expect((await inject({ method: "PATCH", url: `/api/v1/crm/contacts/${contactId}/followups/${contactFollowupId}`, payload: { content: "修改" } })).statusCode).toBe(404);
    expect((await inject({ method: "DELETE", url: `/api/v1/crm/contacts/${contactId}/followups/${contactFollowupId}` })).statusCode).toBe(404);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: contactId } })).nextFollowupAt?.toISOString()).toBe("2026-09-08T02:00:00.000Z");
    await inject({ method: "POST", url: `/api/v1/crm/contacts/${contactId}/followups`, payload: { occurredAt: "2026-09-01T10:00:00+08:00", type: "EMAIL", content: "补录较早邮件", nextFollowupAt: "2026-09-02T10:00:00+08:00", ownerUserId: salesId } });
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: contactId } })).nextFollowupAt?.toISOString()).toBe("2026-09-08T02:00:00.000Z");
  });

  it("一个联系人可关联多个线索，线索详情实时读取联系人信息", async () => {
    const createLead = (summary: string) => inject({
      method: "POST",
      url: "/api/v1/crm/leads",
      payload: { contactId, requirementSummary: summary, salesOwnerUserId: salesId, followupOwnerUserId: salesId },
    });
    const first = await createLead(`AR 应用服务合作 ${runKey}`);
    const second = await createLead(`OEM 合作 ${runKey}`);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    leadId = first.json().data.id;
    secondLeadId = second.json().data.id;
    const contact = await inject({ method: "GET", url: `/api/v1/crm/contacts/${contactId}` });
    expect(contact.json().data.relatedLeadCount).toBe(2);
    const related = await inject({ method: "GET", url: `/api/v1/crm/contacts/${contactId}/leads` });
    expect(related.json().meta.total).toBe(2);
    const newEmail = `new-${runKey}@example.test`;
    await inject({ method: "PATCH", url: `/api/v1/crm/contacts/${contactId}`, payload: { email: newEmail } });
    const lead = await inject({ method: "GET", url: `/api/v1/crm/leads/${leadId}` });
    expect(lead.json().data.contact.email).toBe(newEmail);
  });

  it("线索可更新状态并追加重要跟进", async () => {
    const updated = await inject({ method: "PATCH", url: `/api/v1/crm/leads/${leadId}`, payload: { status: "SOLUTION", priority: "HIGH" } });
    expect(updated.json().data).toMatchObject({ status: "SOLUTION", priority: "HIGH" });
    const followup = await inject({
      method: "POST",
      url: `/api/v1/crm/leads/${leadId}/followups`,
      payload: { occurredAt: "2026-09-04T11:00:00+08:00", type: "MEETING", content: "完成技术方案评审", progress: "方案评审完成", nextAction: "发送正式报价", nextFollowupAt: "2026-09-09T10:00:00+08:00", important: true, ownerUserId: salesId },
    });
    expect(followup.statusCode).toBe(201);
    expect(followup.json().data.important).toBe(true);
    const snapshot = await prisma.crmLead.findUniqueOrThrow({ where: { id: leadId } });
    expect(snapshot).toMatchObject({ latestProgress: "方案评审完成", nextAction: "发送正式报价" });
    expect(snapshot.lastFollowupAt?.toISOString()).toBe("2026-09-04T03:00:00.000Z");
    expect(snapshot.nextFollowupAt?.toISOString()).toBe("2026-09-09T02:00:00.000Z");
    await inject({ method: "POST", url: `/api/v1/crm/leads/${leadId}/followups`, payload: { occurredAt: "2026-09-03T11:00:00+08:00", type: "CALL", content: "补录早期沟通", progress: "旧进度", nextAction: "旧动作", nextFollowupAt: "2026-09-04T10:00:00+08:00", ownerUserId: salesId } });
    const afterBackfill = await prisma.crmLead.findUniqueOrThrow({ where: { id: leadId } });
    expect(afterBackfill).toMatchObject({ latestProgress: "方案评审完成", nextAction: "发送正式报价" });
    expect(afterBackfill.lastFollowupAt?.toISOString()).toBe("2026-09-04T03:00:00.000Z");
    expect((await inject({ method: "PATCH", url: `/api/v1/crm/leads/${leadId}`, payload: { latestProgress: "禁止直接改" } })).statusCode).toBe(422);
  });

  it("线索支持多参与人员和成交日期只写一次", async () => {
    const updated = await inject({ method: "PATCH", url: `/api/v1/crm/leads/${leadId}`, payload: { participantUserIds: [salesId, adminId, salesId], leadSource: "Kiviman", collaborationGroups: "客户项目群\n交付群", followMode: "顾问式跟进", status: "WON" } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.participants.map((item: { user: { id: string } }) => item.user.id).sort()).toEqual([adminId, salesId].sort());
    const firstWonAt = updated.json().data.wonAt;
    expect(firstWonAt).toBeTruthy();
    const edited = await inject({ method: "PATCH", url: `/api/v1/crm/leads/${leadId}`, payload: { remark: "成交后更新" } });
    expect(edited.json().data.wonAt).toBe(firstWonAt);
    await prisma.user.update({ where: { id: viewerId }, data: { status: "DISABLED" } });
    expect((await inject({ method: "PATCH", url: `/api/v1/crm/leads/${leadId}`, payload: { participantUserIds: [viewerId] } })).statusCode).toBe(422);
    await prisma.user.update({ where: { id: viewerId }, data: { status: "ACTIVE" } });
  });

  it("通用附件按业务字段保存，校验内容类型并保护下载", async () => {
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    const uploaded = await inject({
      method: "POST",
      url: `/api/v1/crm/leads/${leadId}/attachments/requirementImages`,
      ...multipart(png, "需求示意.png", "image/png"),
    });
    expect(uploaded.statusCode).toBe(201);
    expect(uploaded.json().data).toMatchObject({ originalName: "需求示意.png", kind: "IMAGE", fieldKey: "requirementImages", fileSize: png.length });
    expect(uploaded.json().data).not.toHaveProperty("storageKey");
    expect(uploaded.json().data).not.toHaveProperty("fileHash");

    const detail = await inject({ method: "GET", url: `/api/v1/crm/leads/${leadId}` });
    const attachment = detail.json().data.attachments[0];
    expect(attachment).toMatchObject({ id: uploaded.json().data.id, originalName: "需求示意.png" });
    expect(attachment).not.toHaveProperty("storageKey");
    const downloaded = await inject({ method: "GET", url: `/api/v1/crm/leads/${leadId}/attachments/${attachment.id}/download` });
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.rawPayload).toEqual(png);
    expect(downloaded.headers["content-disposition"]).toContain("filename*=UTF-8''");
    expect((await inject({ method: "GET", url: `/api/v1/crm/leads/${secondLeadId}/attachments/${attachment.id}/download` })).statusCode).toBe(404);

    const removed = await inject({ method: "DELETE", url: `/api/v1/crm/leads/${leadId}/attachments/${attachment.id}` });
    expect(removed.statusCode).toBe(200);
    expect(await prisma.crmAttachment.count({ where: { id: attachment.id } })).toBe(0);

    const mp4 = Buffer.from("000000186674797069736f6d00000000", "hex");
    const video = await inject({
      method: "POST",
      url: `/api/v1/crm/leads/${leadId}/attachments/proposalFiles`,
      ...multipart(mp4, "演示视频.mp4", "video/mp4"),
    });
    expect(video.statusCode).toBe(201);
    expect(video.json().data.kind).toBe("VIDEO");
    expect((await inject({ method: "DELETE", url: `/api/v1/crm/leads/${leadId}/attachments/${video.json().data.id}` })).statusCode).toBe(200);

    const jpeg = Buffer.from("ffd8ffe000104a4649460001", "hex");
    const jpegUpload = await inject({ method: "POST", url: `/api/v1/crm/leads/${leadId}/attachments/requirementImages`, ...multipart(jpeg, "需求照片.jpg", "image/jpeg") });
    expect(jpegUpload.statusCode).toBe(201);
    expect(jpegUpload.json().data.kind).toBe("IMAGE");

    const rejected = await inject({
      method: "POST",
      url: `/api/v1/crm/leads/${leadId}/attachments/requirementFiles`,
      ...multipart(Buffer.from("<html></html>"), "unsafe.html", "text/html"),
    });
    expect(rejected.statusCode).toBe(415);
    expect(rejected.json().error.code).toBe("ATTACHMENT_TYPE_NOT_ALLOWED");

    const spoofed = await inject({ method: "POST", url: `/api/v1/crm/leads/${leadId}/attachments/requirementImages`, ...multipart(Buffer.from("not-a-jpeg"), "伪装.jpg", "image/jpeg") });
    expect(spoofed.statusCode).toBe(415);
    expect(spoofed.json().error.code).toBe("ATTACHMENT_MIME_MISMATCH");

    const oversized = await inject({ method: "POST", url: `/api/v1/crm/leads/${leadId}/attachments/requirementFiles`, ...multipart(Buffer.alloc(1024 * 1024 + 1, 65), "超大.txt", "text/plain") });
    expect(oversized.statusCode).toBe(413);

    const docx = Buffer.concat([Buffer.from("504b0304", "hex"), Buffer.from("[Content_Types].xml word/document.xml")]);
    const docxUpload = await inject({ method: "POST", url: `/api/v1/crm/leads/${leadId}/attachments/requirementFiles`, ...multipart(docx, "需求说明.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document") });
    expect(docxUpload.statusCode).toBe(201);

    const document = Buffer.from("Kivisense requirement document");
    const cascadeUpload = await inject({
      method: "POST",
      url: `/api/v1/crm/leads/${leadId}/attachments/requirementFiles`,
      ...multipart(document, "需求说明.txt", "text/plain"),
    });
    expect(cascadeUpload.statusCode).toBe(201);
    preservedAttachmentId = cascadeUpload.json().data.id;
    preservedAttachmentPath = join(storageDir, (await prisma.crmAttachment.findUniqueOrThrow({ where: { id: cascadeUpload.json().data.id } })).storageKey!);

    const pdf = Buffer.from("%PDF-1.4\nKivisense meeting minutes");
    const contactUpload = await inject({ method: "POST", url: `/api/v1/crm/contacts/${contactId}/attachments/meetingMinutesFiles`, ...multipart(pdf, "会议纪要.pdf", "application/pdf") });
    expect(contactUpload.statusCode).toBe(201);
    expect((await inject({ method: "GET", url: `/api/v1/crm/contacts/${contactId}` })).json().data.attachments[0]).toMatchObject({ fieldKey: "meetingMinutesFiles" });

    const followupDocument = Buffer.from("Kivisense followup notes");
    const followupUpload = await inject({ method: "POST", url: `/api/v1/crm/leads/${leadId}/followups/${(await prisma.leadFollowup.findFirstOrThrow({ where: { leadId }, orderBy: { occurredAt: "desc" } })).id}/attachments/followupAttachments`, ...multipart(followupDocument, "跟进资料.txt", "text/plain") });
    expect(followupUpload.statusCode).toBe(201);
    expect(followupUpload.json().data).toMatchObject({ entityType: "LEAD_FOLLOWUP", fieldKey: "followupAttachments" });
    const followupList = await inject({ method: "GET", url: `/api/v1/crm/leads/${leadId}/followups` });
    expect(followupList.json().data[0].attachments[0].originalName).toBe("跟进资料.txt");

    const journey = await inject({ method: "GET", url: `/api/v1/crm/contacts/${contactId}/journey` });
    expect(journey.statusCode).toBe(200);
    expect(journey.json().data.events.some((event: { type: string }) => event.type === "LEAD_FOLLOWUP")).toBe(true);
    expect(journey.json().data.events.some((event: { type: string }) => event.type === "LEGACY_MEETING_FILES")).toBe(true);
  });

  it("VIEWER 只读，SALES 无导入导出权限", async () => {
    expect((await inject({ method: "GET", url: `/api/v1/crm/contacts/${contactId}` }, viewerCookie)).statusCode).toBe(200);
    expect((await inject({ method: "POST", url: "/api/v1/crm/contacts", payload: { contactName: "禁止创建" } }, viewerCookie)).statusCode).toBe(403);
    expect((await inject({ method: "DELETE", url: `/api/v1/crm/leads/${leadId}` }, viewerCookie)).statusCode).toBe(403);
    expect((await inject({ method: "GET", url: "/api/v1/crm/templates/contacts" }, salesCookie)).statusCode).toBe(403);
    expect((await inject({ method: "POST", url: "/api/v1/crm/exports/leads", payload: {} }, salesCookie)).statusCode).toBe(403);
  });

  it("删除受权限和关联关系保护，并以软删除保留历史跟进与附件", async () => {
    const blockedContact = await inject({ method: "DELETE", url: `/api/v1/crm/contacts/${contactId}` });
    expect(blockedContact.statusCode).toBe(409);
    expect(blockedContact.json().error).toMatchObject({ code: "CONTACT_HAS_ACTIVE_LEADS", details: { relatedLeadCount: 2 } });

    expect((await inject({ method: "DELETE", url: `/api/v1/crm/leads/${secondLeadId}` })).statusCode).toBe(200);
    expect((await inject({ method: "DELETE", url: `/api/v1/crm/leads/${leadId}` })).statusCode).toBe(200);
    expect((await prisma.crmLead.findUniqueOrThrow({ where: { id: leadId } })).deletedAt).not.toBeNull();
    expect(await prisma.leadFollowup.count({ where: { leadId } })).toBeGreaterThan(0);
    expect(await prisma.crmAttachment.count({ where: { entityType: "LEAD", entityId: leadId } })).toBeGreaterThan(0);
    expect((await stat(preservedAttachmentPath)).isFile()).toBe(true);
    expect((await inject({ method: "GET", url: `/api/v1/crm/leads/${leadId}` })).statusCode).toBe(404);
    const journeyWithDeletedLead = await inject({ method: "GET", url: `/api/v1/crm/contacts/${contactId}/journey` });
    expect(journeyWithDeletedLead.json().data.events.some((event: { relatedLead?: { id: string; deleted: boolean } }) => event.relatedLead?.id === leadId && event.relatedLead.deleted)).toBe(true);
    expect((await inject({ method: "GET", url: `/api/v1/crm/leads/${leadId}/attachments/${preservedAttachmentId}/download` })).rawPayload).toEqual(Buffer.from("Kivisense requirement document"));

    expect((await inject({ method: "DELETE", url: `/api/v1/crm/contacts/${contactId}` })).statusCode).toBe(200);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: contactId } })).deletedAt).not.toBeNull();
    expect(await prisma.contactFollowup.findUnique({ where: { id: contactFollowupId } })).not.toBeNull();
    expect((await inject({ method: "GET", url: `/api/v1/crm/contacts/${contactId}` })).statusCode).toBe(404);
    expect((await inject({ method: "GET", url: `/api/v1/crm/leads/${leadId}/attachments/${preservedAttachmentId}/download` })).statusCode).toBe(404);
  });

  it("超级管理员可管理账号、角色与审计，不接受品牌字段", async () => {
    const roles = await inject({ method: "GET", url: "/api/v1/roles" }, adminCookie);
    expect(roles.statusCode).toBe(200);
    expect(roles.json().data.map((role: { key: string }) => role.key).sort()).toEqual(["SALES", "SUPER_ADMIN", "VIEWER"]);
    const invalid = await inject({
      method: "POST",
      url: "/api/v1/users",
      payload: { name: "错误账号", loginAccount: `invalid-${runKey}@example.test`, roleId: (await prisma.role.findUniqueOrThrow({ where: { key: "SALES" } })).id, brandIds: [] },
    }, adminCookie);
    expect(invalid.statusCode).toBe(422);
    const audit = await inject({ method: "GET", url: "/api/v1/audit-logs?module=crm&pageSize=100" }, adminCookie);
    expect(audit.statusCode).toBe(200);
    const auditActions = new Set(audit.json().data.map((item: { action: string }) => item.action));
    for (const action of ["CREATE_CRM_LEAD", "UPLOAD_ATTACHMENT", "DOWNLOAD_ATTACHMENT", "DELETE_ATTACHMENT"]) expect(auditActions.has(action)).toBe(true);
    expect(audit.json().data[0]).not.toHaveProperty("brandId");
  });

  it("旧业务 API 已删除", async () => {
    for (const url of ["/api/v1/customers", "/api/v1/leads", "/api/v1/brands", "/api/integration/v1/leads", "/api/v1/forms"]) {
      expect((await inject({ method: "GET", url }, adminCookie)).statusCode).toBe(404);
    }
  });

  it("退出登录会撤销会话", async () => {
    const logout = await inject({ method: "POST", url: "/api/v1/auth/logout", payload: {} }, adminCookie);
    expect(logout.statusCode).toBe(200);
    expect((await inject({ method: "GET", url: "/api/v1/auth/me" }, adminCookie)).statusCode).toBe(401);
  });
});
