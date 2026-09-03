import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
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
      storageDir: resolve(process.cwd(), "../storage/test-crm2"),
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
    await prisma.leadFollowup.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.contactFollowup.deleteMany({ where: { contactId: { in: contactIds } } });
    await prisma.crmLead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { targetId: { in: [...contactIds, ...leadIds] } }] } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app?.close();
    await prisma.$disconnect();
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
    contactId = created.json().data.id;
    const updated = await inject({ method: "PATCH", url: `/api/v1/crm/contacts/${contactId}`, payload: { stage: "ONE_TO_ONE", title: "业务发展总监" } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data).toMatchObject({ stage: "ONE_TO_ONE", title: "业务发展总监" });
  });

  it("联系人跟进只能追加，不能编辑或删除", async () => {
    const created = await inject({
      method: "POST",
      url: `/api/v1/crm/contacts/${contactId}/followups`,
      payload: { occurredAt: "2026-09-04T10:00:00+08:00", type: "WECHAT", content: "确认首轮需求", ownerUserId: salesId },
    });
    expect(created.statusCode).toBe(201);
    contactFollowupId = created.json().data.id;
    expect((await inject({ method: "GET", url: `/api/v1/crm/contacts/${contactId}/followups` })).json().data[0].id).toBe(contactFollowupId);
    expect((await inject({ method: "PATCH", url: `/api/v1/crm/contacts/${contactId}/followups/${contactFollowupId}`, payload: { content: "修改" } })).statusCode).toBe(404);
    expect((await inject({ method: "DELETE", url: `/api/v1/crm/contacts/${contactId}/followups/${contactFollowupId}` })).statusCode).toBe(404);
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
      payload: { occurredAt: "2026-09-04T11:00:00+08:00", type: "MEETING", content: "完成技术方案评审", important: true, ownerUserId: salesId },
    });
    expect(followup.statusCode).toBe(201);
    expect(followup.json().data.important).toBe(true);
    expect((await prisma.crmLead.findUniqueOrThrow({ where: { id: leadId } })).lastFollowupAt).not.toBeNull();
  });

  it("VIEWER 只读，SALES 无导入导出权限", async () => {
    expect((await inject({ method: "GET", url: `/api/v1/crm/contacts/${contactId}` }, viewerCookie)).statusCode).toBe(200);
    expect((await inject({ method: "POST", url: "/api/v1/crm/contacts", payload: { contactName: "禁止创建" } }, viewerCookie)).statusCode).toBe(403);
    expect((await inject({ method: "GET", url: "/api/v1/crm/templates/contacts" }, salesCookie)).statusCode).toBe(403);
    expect((await inject({ method: "POST", url: "/api/v1/crm/exports/leads", payload: {} }, salesCookie)).statusCode).toBe(403);
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
    const audit = await inject({ method: "GET", url: "/api/v1/audit-logs?module=crm" }, adminCookie);
    expect(audit.statusCode).toBe(200);
    expect(audit.json().data.some((item: { action: string }) => item.action === "CREATE_CRM_LEAD")).toBe(true);
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
