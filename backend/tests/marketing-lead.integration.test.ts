import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { SESSION_COOKIE, sessionTokenHash } from "../src/common/auth.js";
import type { AppConfig } from "../src/common/config.js";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const runKey = `marketing-${Date.now()}-${randomUUID().slice(0, 6)}`;
const inquiry = "We interest to add AR app and service on our products.\nCan we use as a OEM? With our brand?\nBecause we have limitation in our country and server should be inside of country.";

describe.skipIf(!enabled).sequential("Marketing Lead to Opportunity", () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let storageDir: string;
  let adminCookie: string;
  let salesCookie: string;
  let viewerCookie: string;
  let adminId: string;
  let salesId: string;
  let marketingLeadId: string;
  let organizationId: string;
  let contactId: string;
  let opportunityId: string;
  let originalCustomerReplyScore = 5;

  const inject = (input: any, cookie = salesCookie) => app.inject({ ...input, headers: { ...(input.headers || {}), cookie } });

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("TEST_DATABASE_URL or DATABASE_URL is required");
    storageDir = await mkdtemp(join(tmpdir(), "kivisense-marketing-lead-"));
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    const config: AppConfig = {
      nodeEnv: "test", logLevel: "silent", port: 0, databaseUrl,
      sessionSecret: "kivisense-marketing-lead-integration-secret", sessionTtlHours: 12,
      initialPassword: "KivisenseInitialPassword@2026", superAdminAccount: "admin@kivisense.test", superAdminName: "测试管理员",
      cookieSecure: false, corsOrigin: "*", appBasePath: "", trustProxy: false,
      maxBodyBytes: 10 * 1024 * 1024, maxAttachmentBytes: 1024 * 1024, storageDir,
      crmActiveDays: 30, crmDormantDays: 60, crmStaleLeadDays: 30, crmHighFitUntouchedDays: 30,
      crmMqlMinFitScore: 40, crmMqlMinEngagementScore: 70,
    };
    const [adminRole, salesRole, viewerRole] = await Promise.all([
      prisma.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } }),
      prisma.role.findUniqueOrThrow({ where: { key: "SALES" } }),
      prisma.role.findUniqueOrThrow({ where: { key: "VIEWER" } }),
    ]);
    const [admin, sales, viewer] = await Promise.all([
      prisma.user.create({ data: { name: `营销管理员 ${runKey}`, loginAccount: `marketing-admin-${runKey}@example.test`, passwordHash: "test-only", roleId: adminRole.id, mustChangePassword: false } }),
      prisma.user.create({ data: { name: `营销销售 ${runKey}`, loginAccount: `marketing-sales-${runKey}@example.test`, passwordHash: "test-only", roleId: salesRole.id, mustChangePassword: false } }),
      prisma.user.create({ data: { name: `营销只读 ${runKey}`, loginAccount: `marketing-viewer-${runKey}@example.test`, passwordHash: "test-only", roleId: viewerRole.id, mustChangePassword: false } }),
    ]);
    adminId = admin.id; salesId = sales.id;
    async function cookie(userId: string) {
      const token = `${randomUUID()}${randomUUID()}`;
      await prisma.session.create({ data: { userId, tokenHash: sessionTokenHash(token, config.sessionSecret), expiresAt: new Date(Date.now() + 3_600_000) } });
      return `${SESSION_COOKIE}=${token}`;
    }
    [adminCookie, salesCookie, viewerCookie] = await Promise.all([cookie(admin.id), cookie(sales.id), cookie(viewer.id)]);
    app = await buildApp({ config, prisma, frontendRoot: resolve(process.cwd(), "../frontend") });
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.leadScoringRule.update({ where: { code: "CUSTOMER_REPLY" }, data: { scoreDelta: originalCustomerReplyScore } }).catch(() => undefined);
    const users = await prisma.user.findMany({ where: { loginAccount: { contains: runKey } }, select: { id: true } });
    const userIds = users.map((row) => row.id);
    const leads = await prisma.marketingLead.findMany({ where: { createdByUserId: { in: userIds } }, select: { id: true, convertedOpportunityId: true, convertedContactId: true, convertedOrganizationId: true } });
    const leadIds = leads.map((row) => row.id);
    const opportunities = await prisma.crmLead.findMany({ where: { OR: [{ createdByUserId: { in: userIds } }, { sourceMarketingLeadId: { in: leadIds } }] }, select: { id: true } });
    const opportunityIds = opportunities.map((row) => row.id);
    await prisma.marketingLead.updateMany({ where: { id: { in: leadIds } }, data: { convertedOpportunityId: null, convertedContactId: null, convertedOrganizationId: null, convertedByUserId: null } });
    await prisma.crmLead.updateMany({ where: { id: { in: opportunityIds } }, data: { sourceMarketingLeadId: null } });
    await prisma.crmTask.deleteMany({ where: { OR: [{ createdByUserId: { in: userIds } }, { ownerUserId: { in: userIds } }] } });
    await prisma.leadFollowup.deleteMany({ where: { leadId: { in: opportunityIds } } });
    await prisma.leadStageHistory.deleteMany({ where: { leadId: { in: opportunityIds } } });
    await prisma.crmLead.deleteMany({ where: { id: { in: opportunityIds } } });
    await prisma.leadScoreHistory.deleteMany({ where: { marketingLeadId: { in: leadIds } } });
    await prisma.leadActivityEvent.deleteMany({ where: { marketingLeadId: { in: leadIds } } });
    await prisma.leadStatusHistory.deleteMany({ where: { marketingLeadId: { in: leadIds } } });
    await prisma.marketingLead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.contactFollowup.deleteMany({ where: { createdByUserId: { in: userIds } } });
    await prisma.contact.deleteMany({ where: { createdByUserId: { in: userIds } } });
    const organizationIds = (await prisma.organization.findMany({ where: { createdByUserId: { in: userIds } }, select: { id: true } })).map((row) => row.id);
    await prisma.organizationLifecycleHistory.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organizationRole.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { createdByUserId: { in: userIds } } });
    await prisma.importJob.deleteMany({ where: { createdBy: { in: userIds } } });
    await prisma.exportJob.deleteMany({ where: { createdBy: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app?.close(); await prisma.$disconnect();
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
  }, 30_000);

  it("enforces permission, SALES ownership scope and international phone validation", async () => {
    const forbidden = await inject({ method: "POST", url: "/api/v1/crm/marketing-leads", payload: { fullName: "Forbidden", source: "MANUAL" } }, viewerCookie);
    expect(forbidden.statusCode).toBe(403);
    const invalidPhone = await inject({ method: "POST", url: "/api/v1/crm/marketing-leads", payload: { fullName: "Invalid Phone", phone: "not-a-phone", countryCode: "US", source: "MANUAL" } });
    expect(invalidPhone.statusCode).toBe(422);
    expect(invalidPhone.json().error.code).toBe("INVALID_INTERNATIONAL_PHONE");
    const adminOwned = await inject({ method: "POST", url: "/api/v1/crm/marketing-leads", payload: { fullName: `Admin Owned ${runKey}`, source: "MANUAL", ownerUserId: adminId } }, adminCookie);
    expect(adminOwned.statusCode).toBe(201);
    expect((await inject({ method: "GET", url: `/api/v1/crm/marketing-leads/${adminOwned.json().data.id}` })).statusCode).toBe(404);
    expect((await inject({ method: "GET", url: "/api/v1/crm/marketing/scoring-rules?includeDisabled=false" })).statusCode).toBe(200);
    expect((await inject({ method: "GET", url: "/api/v1/crm/marketing/scoring-rules?includeDisabled=true" })).statusCode).toBe(403);
  });

  it("creates the Naderi overseas lead, detects duplicates and records immutable score history", async () => {
    const created = await inject({ method: "POST", url: "/api/v1/crm/marketing-leads", payload: {
      fullName: "Naderi", companyName: "Dena", title: "Manager", email: `naderi-${runKey}@denaholding.com`,
      phone: "+98 21 5555 0188", whatsapp: "+98 912 555 0188", countryCode: "IR",
      source: "WEBSITE", sourceChannel: "Organic Search", sourceDetail: "Google/Bing", inquiryType: "Not sure yet",
      inquiryContent: inquiry, status: "NURTURING", ownerUserId: salesId, fitScore: 40, fitReason: "ICP country and company profile",
    } });
    expect(created.statusCode).toBe(201);
    expect(created.json().data).toMatchObject({ status: "NURTURING", phoneNormalized: "+982155550188", whatsappNormalized: "+989125550188", fitLevel: "MEDIUM" });
    marketingLeadId = created.json().data.id;
    const duplicate = await inject({ method: "GET", url: `/api/v1/crm/marketing-leads/duplicate-candidates?email=${encodeURIComponent(`naderi-${runKey}@denaholding.com`)}` });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().data[0].id).toBe(marketingLeadId);
    expect(await prisma.leadScoreHistory.findFirstOrThrow({ where: { marketingLeadId, dimension: "FIT" } })).toMatchObject({ previousScore: 0, scoreDelta: 40, newScore: 40 });
  });

  it("applies repeat and cooldown rules, promotes to MQL, then supports SQL, recycle and Qualified", async () => {
    const activity = async (ruleCode: string) => inject({ method: "POST", url: `/api/v1/crm/marketing-leads/${marketingLeadId}/activities`, payload: { ruleCode, source: "CRM", note: `Regression ${ruleCode}` } });
    expect((await activity("FORM_SUBMIT")).statusCode).toBe(201);
    const repeated = await activity("FORM_SUBMIT");
    expect(repeated.statusCode).toBe(409);
    expect(repeated.json().error.code).toBe("SCORING_RULE_NOT_REPEATABLE");
    expect((await activity("PAGE_VIEW")).statusCode).toBe(201);
    const cooldown = await activity("PAGE_VIEW");
    expect(cooldown.statusCode).toBe(409);
    expect(cooldown.json().error.code).toBe("SCORING_RULE_COOLDOWN");
    for (const code of ["REQUEST_SOLUTION", "EXPLICIT_REQUIREMENT", "MEETING_COMPLETED", "EXPLICIT_INTEREST"]) expect((await activity(code)).statusCode).toBe(201);
    const mql = await prisma.marketingLead.findUniqueOrThrow({ where: { id: marketingLeadId } });
    expect(mql.status).toBe("MQL"); expect(mql.mqlAt).toBeTruthy(); expect(mql.engagementScoreCached).toBe(81);
    const requestEvent = await prisma.leadActivityEvent.findFirstOrThrow({ where: { marketingLeadId, eventType: "REQUEST_SOLUTION" } });
    expect(requestEvent.engagementDeltaSnapshot).toBe(20);
    expect(await prisma.leadScoreHistory.count({ where: { marketingLeadId, dimension: "ENGAGEMENT" } })).toBe(6);
    const accept = await inject({ method: "POST", url: `/api/v1/crm/marketing-leads/${marketingLeadId}/transition`, payload: { action: "ACCEPT_SQL" } });
    expect(accept.statusCode).toBe(200); expect(accept.json().data.status).toBe("SQL"); expect(accept.json().data.firstSalesResponseAt).toBeTruthy();
    const recycled = await inject({ method: "POST", url: `/api/v1/crm/marketing-leads/${marketingLeadId}/transition`, payload: { action: "RECYCLE", reason: "Wait for confirmed timing" } });
    expect(recycled.statusCode).toBe(200); expect(recycled.json().data.status).toBe("RECYCLED");
    const nurturing = await inject({ method: "POST", url: `/api/v1/crm/marketing-leads/${marketingLeadId}/transition`, payload: { action: "START_NURTURING" } });
    expect(nurturing.statusCode).toBe(200); expect(nurturing.json().data.status).toBe("MQL");
    expect((await inject({ method: "POST", url: `/api/v1/crm/marketing-leads/${marketingLeadId}/transition`, payload: { action: "ACCEPT_SQL" } })).statusCode).toBe(200);
    const qualified = await inject({ method: "POST", url: `/api/v1/crm/marketing-leads/${marketingLeadId}/transition`, payload: { action: "QUALIFY" } });
    expect(qualified.statusCode).toBe(200); expect(qualified.json().data.status).toBe("QUALIFIED");
  });

  it("supports disqualification with a mandatory reason", async () => {
    const created = await inject({ method: "POST", url: "/api/v1/crm/marketing-leads", payload: { fullName: `No Interest ${runKey}`, source: "OUTBOUND" } });
    const id = created.json().data.id;
    expect((await inject({ method: "POST", url: `/api/v1/crm/marketing-leads/${id}/transition`, payload: { action: "DISQUALIFY" } })).statusCode).toBe(422);
    const response = await inject({ method: "POST", url: `/api/v1/crm/marketing-leads/${id}/transition`, payload: { action: "DISQUALIFY", reason: "No interest" } });
    expect(response.statusCode).toBe(200); expect(response.json().data).toMatchObject({ status: "DISQUALIFIED", disqualifiedReason: "No interest" });
  });

  it("previews backend matches and converts once in an idempotent transaction", async () => {
    const organization = await inject({ method: "POST", url: "/api/v1/crm/organizations", payload: { name: `Dena ${runKey}`, shortName: "Dena", website: `https://dena-${runKey}.example.com`, countryCode: "IR", roles: ["PROSPECT"], ownerUserId: salesId, confirmDuplicate: true } });
    expect(organization.statusCode).toBe(201); organizationId = organization.json().data.id;
    const contact = await inject({ method: "POST", url: "/api/v1/crm/contacts", payload: { contactName: "Naderi", email: `naderi-${runKey}@denaholding.com`, phone: "+98 21 5555 0188", whatsapp: "+98 912 555 0188", organizationId, title: "Manager", ownerUserId: salesId } });
    expect(contact.statusCode).toBe(201); contactId = contact.json().data.id;
    const preview = await inject({ method: "GET", url: `/api/v1/crm/marketing-leads/${marketingLeadId}/conversion-preview` });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().data.contactMatches.some((row: any) => row.id === contactId && row.matchType === "EMAIL_EXACT" && row.autoMerge === false)).toBe(true);
    expect(preview.json().data.suggestedOpportunity.requirementDetail).toBe(inquiry);
    const payload = { organization: { mode: "existing", id: organizationId }, contact: { mode: "existing", id: contactId }, opportunity: { requirementSummary: `AR OEM opportunity ${runKey}`, requirementDetail: inquiry, requirementContext: "Not sure yet", productInterest: "AR app and service", requirementTags: ["OEM", "On-premise"], priority: "HIGH", status: "NEW", salesOwnerUserId: salesId, followupOwnerUserId: salesId, conversionNote: "Confirmed by sales" }, overrideQualification: false };
    const converted = await inject({ method: "POST", url: `/api/v1/crm/marketing-leads/${marketingLeadId}/convert`, payload });
    expect(converted.statusCode).toBe(200); expect(converted.json().data.idempotent).toBe(false); opportunityId = converted.json().data.opportunityId;
    const retried = await inject({ method: "POST", url: `/api/v1/crm/marketing-leads/${marketingLeadId}/convert`, payload });
    expect(retried.statusCode).toBe(200); expect(retried.json().data).toMatchObject({ idempotent: true, opportunityId });
    expect(await prisma.crmLead.count({ where: { sourceMarketingLeadId: marketingLeadId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { targetId: marketingLeadId, action: "CONVERT_MARKETING_LEAD" } })).toBe(1);
  });

  it("rolls back an organization create when contact resolution fails", async () => {
    const candidate = await inject({ method: "POST", url: "/api/v1/crm/marketing-leads", payload: { fullName: `Rollback ${runKey}`, companyName: `Rollback Org ${runKey}`, source: "MANUAL", ownerUserId: adminId } }, adminCookie);
    const before = await prisma.organization.count({ where: { name: `Rollback Org ${runKey}` } });
    const response = await inject({ method: "POST", url: `/api/v1/crm/marketing-leads/${candidate.json().data.id}/convert`, payload: { organization: { mode: "create", createData: { name: `Rollback Org ${runKey}` } }, contact: { mode: "existing", id: "missing-contact-id" }, opportunity: { requirementSummary: "Should rollback", priority: "MEDIUM", status: "NEW", salesOwnerUserId: adminId }, overrideQualification: true } }, adminCookie);
    expect(response.statusCode).toBe(422);
    expect(await prisma.organization.count({ where: { name: `Rollback Org ${runKey}` } })).toBe(before);
    expect(await prisma.crmLead.count({ where: { requirementSummary: "Should rollback" } })).toBe(0);
  });

  it("preserves source-of-truth ownership and exposes attribution and high-level journeys", async () => {
    const newEmail = `naderi-updated-${runKey}@denaholding.com`;
    await inject({ method: "PATCH", url: `/api/v1/crm/contacts/${contactId}`, payload: { email: newEmail } });
    const newWebsite = `https://updated-${runKey}.example.com`;
    await inject({ method: "PATCH", url: `/api/v1/crm/organizations/${organizationId}`, payload: { website: newWebsite } });
    const opportunity = await inject({ method: "GET", url: `/api/v1/crm/leads/${opportunityId}` });
    expect(opportunity.json().data.contact.email).toBe(newEmail);
    expect(opportunity.json().data.contact.organization.website).toBe(newWebsite);
    expect(opportunity.json().data.sourceMarketingLead.id).toBe(marketingLeadId);
    await inject({ method: "PATCH", url: `/api/v1/crm/leads/${opportunityId}`, payload: { requirementDetail: "Sales refined requirement without changing the raw inquiry." } });
    expect((await inject({ method: "GET", url: `/api/v1/crm/marketing-leads/${marketingLeadId}` })).json().data.inquiryContent).toBe(inquiry);
    const rule = await prisma.leadScoringRule.findUniqueOrThrow({ where: { code: "CUSTOMER_REPLY" } });
    originalCustomerReplyScore = rule.scoreDelta;
    const editedRule = await inject({ method: "PATCH", url: `/api/v1/crm/marketing/scoring-rules/${rule.id}`, payload: { scoreDelta: 9 } }, adminCookie);
    expect(editedRule.statusCode).toBe(200);
    const invalidRuleEdit = await inject({ method: "PATCH", url: `/api/v1/crm/marketing/scoring-rules/${rule.id}`, payload: { repeatable: false, maxOccurrences: 2 } }, adminCookie);
    expect(invalidRuleEdit.statusCode).toBe(422);
    expect(invalidRuleEdit.json().error.code).toBe("INVALID_SCORING_RULE");
    expect((await prisma.crmLead.findUniqueOrThrow({ where: { id: opportunityId } })).requirementDetail).toBe("Sales refined requirement without changing the raw inquiry.");
    const sourceCorrection = await inject({ method: "PATCH", url: `/api/v1/crm/marketing-leads/${marketingLeadId}`, payload: { source: "PARTNER" } }, adminCookie);
    expect(sourceCorrection.statusCode).toBe(200);
    expect(sourceCorrection.json().data.source).toBe("PARTNER");
    const [contactJourney, organizationJourney] = await Promise.all([
      inject({ method: "GET", url: `/api/v1/crm/contacts/${contactId}/journey` }),
      inject({ method: "GET", url: `/api/v1/crm/organizations/${organizationId}/journey` }),
    ]);
    for (const journey of [contactJourney, organizationJourney]) {
      expect(journey.statusCode).toBe(200);
      expect(journey.json().data.events.some((event: any) => event.type === "MARKETING_LEAD_CONVERTED")).toBe(true);
      expect(journey.json().data.events.some((event: any) => event.type === "MARKETING_LEAD_MQL")).toBe(true);
      expect(journey.json().data.events.some((event: any) => event.type === "MARKETING_LEAD_SQL")).toBe(true);
    }
  });

  it("calculates funnel, scoring and source-quality analytics on backend-owned definitions", async () => {
    const from = encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString());
    const to = encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString());
    const [funnel, scoring, sources] = await Promise.all([
      inject({ method: "GET", url: `/api/v1/crm/marketing/analytics/funnel?from=${from}&to=${to}` }),
      inject({ method: "GET", url: `/api/v1/crm/marketing/analytics/scoring?from=${from}&to=${to}` }),
      inject({ method: "GET", url: `/api/v1/crm/marketing/analytics/sources?from=${from}&to=${to}` }),
    ]);
    expect(funnel.statusCode).toBe(200);
    expect(funnel.json().data.tracking).toEqual({ visitorTracking: false, message: "未接入网站访客追踪" });
    expect(funnel.json().data.kpis.leadToOpportunityRate).toMatchObject({ numerator: expect.any(Number), denominator: expect.any(Number), percent: expect.any(Number) });
    expect(scoring.statusCode).toBe(200); expect(scoring.json().data.distribution).toHaveLength(9);
    expect(sources.statusCode).toBe(200);
    expect(sources.json().data.rows.some((row: any) => row.source === "PARTNER" && row.opportunityCount >= 1)).toBe(true);
  });
});
