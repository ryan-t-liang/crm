import { describe, expect, it } from "vitest";
import { contactCreateSchema, contactFollowupCreateSchema, contactImportSchema } from "../src/contacts/schemas.js";
import { crmLeadCreateSchema, crmLeadImportSchema, crmLeadPatchSchema, leadFollowupCreateSchema } from "../src/crm-leads/schemas.js";
import { redactAuditDetails } from "../src/common/audit.js";
import { normalizePermissionDependencies } from "../src/common/permissions.js";
import { safeEqual, sessionToken, sessionTokenHash } from "../src/common/auth.js";
import { assertCrmJobObjectType, jobPermission } from "../src/jobs/job-types.js";
import { organizationCreateSchema, nurtureCreateSchema } from "../src/organizations/schemas.js";
import { calculateEngagement, engagementState, scoreBand } from "../src/organizations/scoring.js";
import { taskCreateSchema } from "../src/tasks/schemas.js";

describe("Kivisense CRM 2.0 core unit contracts", () => {
  it("validates and normalizes contact fields", () => {
    const contact = contactCreateSchema.parse({
      contactName: "  Naderi  ",
      email: "NADERI@EXAMPLE.COM",
      stage: "ONE_TO_ONE",
    });
    expect(contact).toMatchObject({ contactName: "Naderi", email: "naderi@example.com", stage: "ONE_TO_ONE" });
    expect(contactCreateSchema.safeParse({ contactName: "Naderi", stage: "INVALID" }).success).toBe(false);
  });

  it("requires timezone-aware, append-only followup input", () => {
    expect(contactFollowupCreateSchema.safeParse({ occurredAt: "2026-09-04T10:00:00", content: "沟通记录" }).success).toBe(false);
    expect(contactFollowupCreateSchema.safeParse({ occurredAt: "2026-09-04T10:00:00+08:00", content: "沟通记录" }).success).toBe(true);
    expect(leadFollowupCreateSchema.parse({ occurredAt: "2026-09-04T10:00:00Z", content: "方案评审" }).important).toBe(false);
  });

  it("requires a contact and summary when creating a lead", () => {
    expect(crmLeadCreateSchema.safeParse({ requirementSummary: "AR 应用服务" }).success).toBe(false);
    expect(crmLeadCreateSchema.safeParse({ contactId: "contact-1", requirementSummary: "" }).success).toBe(false);
    expect(crmLeadCreateSchema.safeParse({ contactId: "contact-1", requirementSummary: "AR 应用服务" }).success).toBe(false);
    expect(crmLeadCreateSchema.parse({ contactId: "contact-1", requirementSummary: "AR 应用服务", salesOwnerUserId: "sales-1" })).toMatchObject({ priority: "MEDIUM", status: "NEW" });
  });

  it("normalizes multi-participant and field-alignment inputs", () => {
    const lead = crmLeadCreateSchema.parse({
      contactId: "contact-1",
      requirementSummary: "AR 应用服务",
      salesOwnerUserId: "sales-1",
      participantUserIds: ["sales-1", "admin-1", "sales-1"],
      leadSource: " Kiviman ",
      technologyType: "Kivicube Engine\nWebAR",
      wonAt: "2026-09-04T10:00:00+08:00",
    });
    expect(lead.participantUserIds).toEqual(["sales-1", "admin-1"]);
    expect(lead.leadSource).toBe("Kiviman");
    expect(lead.wonAt).toBeInstanceOf(Date);
    expect(contactCreateSchema.parse({ contactName: "Naderi", followupAttention: " 会前确认资料 " }).followupAttention).toBe("会前确认资料");
  });

  it("does not allow a lead patch to change contactId", () => {
    expect(crmLeadPatchSchema.safeParse({ contactId: "contact-2" }).success).toBe(false);
    expect(crmLeadPatchSchema.safeParse({ status: "SOLUTION" }).success).toBe(true);
  });

  it("keeps current snapshots out of interactive master-data APIs", () => {
    expect(crmLeadCreateSchema.safeParse({ contactId: "contact-1", requirementSummary: "AR", salesOwnerUserId: "sales-1", latestProgress: "direct" }).success).toBe(false);
    expect(crmLeadPatchSchema.safeParse({ nextAction: "direct" }).success).toBe(false);
    expect(crmLeadPatchSchema.safeParse({ nextFollowupAt: "2026-09-04T10:00:00+08:00" }).success).toBe(false);
    expect(contactCreateSchema.safeParse({ contactName: "Naderi", nextFollowupAt: "2026-09-04T10:00:00+08:00" }).success).toBe(false);
  });

  it("retains snapshot compatibility only for imports", () => {
    expect(crmLeadImportSchema.parse({ contactId: "contact-1", requirementSummary: "AR", salesOwnerUserId: "sales-1", latestProgress: "legacy", nextAction: "call", nextFollowupAt: "2026-09-04T10:00:00+08:00" })).toMatchObject({ latestProgress: "legacy", nextAction: "call" });
    expect(contactImportSchema.parse({ contactName: "Naderi", nextFollowupAt: "2026-09-04T10:00:00+08:00" }).nextFollowupAt).toBeInstanceOf(Date);
  });

  it("accepts progress, next action, next time, and attachment-ready followups", () => {
    const parsed = leadFollowupCreateSchema.parse({ occurredAt: "2026-09-04T10:00:00+08:00", content: "方案评审", progress: "评审完成", nextAction: "发送报价", nextFollowupAt: "2026-09-08T10:00:00+08:00" });
    expect(parsed).toMatchObject({ progress: "评审完成", nextAction: "发送报价" });
    expect(parsed.nextFollowupAt).toBeInstanceOf(Date);
  });

  it("removes dependent write permissions when view permission is absent", () => {
    expect(normalizePermissionDependencies(["crm.contact.create", "crm.lead.create"])).toEqual([]);
    expect(normalizePermissionDependencies(["crm.contact.view", "crm.contact.create"])).toEqual(["crm.contact.create", "crm.contact.view"]);
  });

  it("creates non-plain session tokens and stable secret-bound hashes", () => {
    const token = sessionToken();
    const hash = sessionTokenHash(token, "unit-test-session-secret");
    expect(token.length).toBeGreaterThan(32);
    expect(hash).not.toContain(token);
    expect(safeEqual(hash, sessionTokenHash(token, "unit-test-session-secret"))).toBe(true);
    expect(safeEqual(hash, sessionTokenHash(token, "another-secret"))).toBe(false);
  });

  it("redacts nested credentials from audit details", () => {
    expect(redactAuditDetails({ password: "secret", nested: { authorization: "Bearer token", note: "保留" } })).toEqual({
      password: "[REDACTED]",
      nested: { authorization: "[REDACTED]", note: "保留" },
    });
  });

  it("maps import and export permissions only for CRM objects", () => {
    expect(jobPermission("CONTACT", "import")).toBe("crm.contact.import");
    expect(jobPermission("CRM_LEAD", "export")).toBe("crm.lead.export");
    expect(() => assertCrmJobObjectType("CUSTOMER")).toThrowError(/不支持/);
  });

  it("validates the unified organization, nurture, and task contracts", () => {
    expect(organizationCreateSchema.parse({ name: " Dena Technologies ", roles: ["PROSPECT", "VENDOR", "PROSPECT"], fitScore: 70 })).toMatchObject({
      name: "Dena Technologies", roles: ["PROSPECT", "VENDOR"], fitScore: 70, confirmDuplicate: false,
    });
    expect(organizationCreateSchema.safeParse({ name: "Competitor", roles: ["COMPETITOR"] }).success).toBe(false);
    expect(nurtureCreateSchema.safeParse({ ownerUserId: "sales-1", reason: "等待预算", objective: "重启方案沟通", cadenceDays: 14, nextTouchAt: "2026-09-15T10:00:00+08:00", touchTopic: "预算确认" }).success).toBe(true);
    expect(taskCreateSchema.safeParse({ title: "跟进", ownerUserId: "sales-1", dueAt: "2026-09-15T10:00:00+08:00" }).success).toBe(false);
    expect(taskCreateSchema.safeParse({ organizationId: "org-1", title: "跟进", ownerUserId: "sales-1", dueAt: "2026-09-15T10:00:00+08:00" }).success).toBe(true);
  });

  it("uses transparent and clamped Fit and Engagement scoring boundaries", () => {
    expect([0, 39, 40, 69, 70, 100].map(scoreBand)).toEqual(["LOW", "LOW", "MEDIUM", "MEDIUM", "HIGH", "HIGH"]);
    const now = new Date("2026-09-05T00:00:00.000Z");
    const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
    expect(engagementState({ now, lastInteractionAt: daysAgo(30), hasActiveLead: false, activeDays: 30, dormantDays: 60 })).toBe("ACTIVE");
    expect(engagementState({ now, lastInteractionAt: daysAgo(31), hasActiveLead: false, activeDays: 30, dormantDays: 60 })).toBe("COOLING");
    expect(engagementState({ now, lastInteractionAt: daysAgo(60), hasActiveLead: false, activeDays: 30, dormantDays: 60 })).toBe("COOLING");
    expect(engagementState({ now, lastInteractionAt: daysAgo(61), hasActiveLead: false, activeDays: 30, dormantDays: 60 })).toBe("DORMANT");
    expect(engagementState({ now, lastInteractionAt: null, hasActiveLead: true, activeDays: 30, dormantDays: 60 })).toBe("ACTIVE");
    const maximum = calculateEngagement({ now, lastInteractionAt: now, interactionsLast30Days: 99, hasActiveLead: true, hasRecentMeeting: true, hasOpenNextActionTask: true, hasOverdueTask: false, activeDays: 30, dormantDays: 60 });
    expect(maximum.score).toBe(95);
    expect(maximum.breakdown.map((item) => item.points)).toEqual([35, 20, 20, 10, 10, 0]);
    const minimum = calculateEngagement({ now, lastInteractionAt: null, interactionsLast30Days: 0, hasActiveLead: false, hasRecentMeeting: false, hasOpenNextActionTask: false, hasOverdueTask: true, activeDays: 30, dormantDays: 60 });
    expect(minimum.score).toBe(0);
    expect(minimum.level).toBe("LOW");
  });
});
