import type { OrganizationLifecycle, OrganizationRoleType, Prisma, PrismaClient } from "@prisma/client";
import type { AppConfig } from "../common/config.js";
import type { AuditActorContext } from "../common/audit.js";
import { appendAuditRecord } from "../common/audit.js";
import { assertAssignableCrmUser, crmUserSummarySelect, type CrmDbClient } from "../common/crm-users.js";
import { ApiError } from "../common/errors.js";
import { crmAttachmentSelect } from "../crm-leads/attachments.js";
import { calculateEngagement, scoreBand } from "./scoring.js";
import type { NurtureCreateInput, NurturePatchInput, OrganizationCreateInput, OrganizationPatchInput } from "./schemas.js";

const ACTIVE_LEAD_STATUSES = ["NEW", "QUALIFIED", "SOLUTION", "QUOTATION"] as const;

export type OrganizationListInput = {
  keyword?: string;
  role?: OrganizationRoleType;
  lifecycleStage?: OrganizationLifecycle;
  ownerUserId?: string;
  industry?: string;
  fitLevel?: "LOW" | "MEDIUM" | "HIGH";
  engagementLevel?: "LOW" | "MEDIUM" | "HIGH";
  engagementState?: "ACTIVE" | "COOLING" | "DORMANT";
  page: number;
  pageSize: number;
};

export function normalizeOrganizationName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function websiteDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return new URL(value).hostname.toLocaleLowerCase("en-US").replace(/^www\./, ""); } catch { return null; }
}

async function requireOrganization(db: CrmDbClient, id: string) {
  const row = await db.organization.findFirst({ where: { id, deletedAt: null } });
  if (!row) throw new ApiError(404, "RESOURCE_NOT_FOUND", "公司不存在");
  return row;
}

export async function transitionOrganizationLifecycle(
  db: CrmDbClient,
  organizationId: string,
  nextStage: OrganizationLifecycle,
  changedByUserId: string,
  reason: string,
  options: { automatic?: boolean } = {},
) {
  const organization = await db.organization.findFirst({ where: { id: organizationId, deletedAt: null } });
  if (!organization || organization.lifecycleStage === nextStage) return organization;
  if (options.automatic && organization.lifecycleStage === "DISQUALIFIED") return organization;
  const updated = await db.organization.update({ where: { id: organizationId }, data: { lifecycleStage: nextStage } });
  await db.organizationLifecycleHistory.create({
    data: { organizationId, fromStage: organization.lifecycleStage, toStage: nextStage, reason, changedByUserId },
  });
  return updated;
}

type OrganizationBase = Prisma.OrganizationGetPayload<{
  include: {
    owner: { select: typeof crmUserSummarySelect };
    roles: true;
  };
}>;

export class OrganizationMetricsService {
  constructor(private readonly prisma: PrismaClient, private readonly config: AppConfig) {}

  async hydrate(organizations: OrganizationBase[]) {
    const ids = organizations.map((row) => row.id);
    if (!ids.length) return [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
    const contacts = await this.prisma.contact.findMany({
      where: { organizationId: { in: ids }, deletedAt: null },
      select: { id: true, organizationId: true },
    });
    const contactIds = contacts.map((row) => row.id);
    const [leads, contactFollowups, leadFollowups, tasks, logos] = await Promise.all([
      this.prisma.crmLead.findMany({
        where: { contactId: { in: contactIds }, deletedAt: null },
        select: { id: true, contactId: true, status: true, requirementSummary: true, createdAt: true, updatedAt: true, lastFollowupAt: true },
      }),
      this.prisma.contactFollowup.findMany({
        where: { contactId: { in: contactIds } },
        select: { id: true, contactId: true, occurredAt: true, type: true },
      }),
      this.prisma.leadFollowup.findMany({
        where: { lead: { contactId: { in: contactIds } } },
        select: { id: true, leadId: true, occurredAt: true, type: true },
      }),
      this.prisma.crmTask.findMany({
        where: {
          OR: [
            { organizationId: { in: ids } },
            { contactId: { in: contactIds } },
            { lead: { contactId: { in: contactIds } } },
          ],
        },
        select: { id: true, organizationId: true, contactId: true, leadId: true, title: true, dueAt: true, status: true, priority: true, owner: { select: crmUserSummarySelect } },
      }),
      this.prisma.crmAttachment.findMany({
        where: { entityType: "ORGANIZATION", entityId: { in: ids }, fieldKey: "logo" },
        select: crmAttachmentSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    ]);
    const organizationByContact = new Map(contacts.map((row) => [row.id, row.organizationId!]));
    const leadById = new Map(leads.map((row) => [row.id, row]));
    const interactions = new Map<string, Array<{ occurredAt: Date; type: string }>>();
    for (const item of contactFollowups) {
      const id = organizationByContact.get(item.contactId);
      if (id) (interactions.get(id) ?? interactions.set(id, []).get(id)!).push(item);
    }
    for (const item of leadFollowups) {
      const lead = leadById.get(item.leadId);
      const id = lead ? organizationByContact.get(lead.contactId) : undefined;
      if (id) (interactions.get(id) ?? interactions.set(id, []).get(id)!).push(item);
    }
    const tasksForOrganization = (organizationId: string) => tasks.filter((task) => task.organizationId === organizationId
      || (task.contactId && organizationByContact.get(task.contactId) === organizationId)
      || (task.leadId && organizationByContact.get(leadById.get(task.leadId)?.contactId || "") === organizationId));
    return organizations.map((organization) => {
      const organizationContacts = contacts.filter((row) => row.organizationId === organization.id);
      const organizationContactIds = new Set(organizationContacts.map((row) => row.id));
      const organizationLeads = leads.filter((row) => organizationContactIds.has(row.contactId));
      const activeLeads = organizationLeads.filter((row) => ACTIVE_LEAD_STATUSES.includes(row.status as typeof ACTIVE_LEAD_STATUSES[number]));
      const organizationInteractions = interactions.get(organization.id) || [];
      const lastInteractionAt = organizationInteractions.reduce<Date | null>((latest, item) => !latest || item.occurredAt > latest ? item.occurredAt : latest, null);
      const organizationTasks = tasksForOrganization(organization.id);
      const openTasks = organizationTasks.filter((task) => task.status === "OPEN");
      const score = calculateEngagement({
        now,
        lastInteractionAt,
        interactionsLast30Days: organizationInteractions.filter((item) => item.occurredAt >= thirtyDaysAgo).length,
        hasActiveLead: activeLeads.length > 0,
        hasRecentMeeting: organizationInteractions.some((item) => item.type === "MEETING" && item.occurredAt >= thirtyDaysAgo),
        hasOpenNextActionTask: openTasks.length > 0,
        hasOverdueTask: openTasks.some((task) => task.dueAt < now),
        activeDays: this.config.crmActiveDays,
        dormantDays: this.config.crmDormantDays,
      });
      const nextTask = openTasks.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0] || null;
      return {
        ...organization,
        roleKeys: organization.roles.map((item) => item.role),
        fitLevel: scoreBand(organization.fitScore),
        engagementScore: score.score,
        engagementLevel: score.level,
        engagementState: score.state,
        engagementBreakdown: score.breakdown,
        dormantDays: score.lastInteractionAgeDays,
        contactCount: organizationContacts.length,
        activeLeadCount: activeLeads.length,
        wonLeadCount: organizationLeads.filter((row) => row.status === "WON").length,
        lastInteractionAt,
        nextActionAt: nextTask?.dueAt ?? null,
        nextTask,
        logo: logos.find((item) => item.entityId === organization.id) ?? null,
      };
    });
  }
}

export class OrganizationService {
  private readonly metrics: OrganizationMetricsService;
  constructor(private readonly prisma: PrismaClient, private readonly config: AppConfig) {
    this.metrics = new OrganizationMetricsService(prisma, config);
  }

  async duplicateCandidates(name: string, website?: string | null, excludeId?: string) {
    const normalizedName = normalizeOrganizationName(name);
    const domain = websiteDomain(website);
    return this.prisma.organization.findMany({
      where: {
        deletedAt: null,
        id: excludeId ? { not: excludeId } : undefined,
        OR: [
          { normalizedName },
          ...(domain ? [{ websiteDomain: domain }] : []),
        ],
      },
      select: { id: true, name: true, shortName: true, website: true, industry: true, city: true, roles: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 10,
    });
  }

  async list(input: OrganizationListInput) {
    const where: Prisma.OrganizationWhereInput = {
      deletedAt: null,
      lifecycleStage: input.lifecycleStage,
      ownerUserId: input.ownerUserId,
      industry: input.industry ? { contains: input.industry } : undefined,
      roles: input.role ? { some: { role: input.role } } : undefined,
    };
    if (input.keyword) where.OR = [
      { name: { contains: input.keyword } },
      { shortName: { contains: input.keyword } },
      { website: { contains: input.keyword } },
      { contacts: { some: { deletedAt: null, contactName: { contains: input.keyword } } } },
    ];
    const rows = await this.prisma.organization.findMany({
      where,
      include: { owner: { select: crmUserSummarySelect }, roles: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 1000,
    });
    let enriched = await this.metrics.hydrate(rows);
    if (input.fitLevel) enriched = enriched.filter((row) => row.fitLevel === input.fitLevel);
    if (input.engagementLevel) enriched = enriched.filter((row) => row.engagementLevel === input.engagementLevel);
    if (input.engagementState) enriched = enriched.filter((row) => row.engagementState === input.engagementState);
    return { total: enriched.length, rows: enriched.slice((input.page - 1) * input.pageSize, input.page * input.pageSize) };
  }

  async create(input: OrganizationCreateInput, createdByUserId: string, audit: AuditActorContext) {
    const { roles, confirmDuplicate, ...fields } = input;
    await assertAssignableCrmUser(this.prisma, input.ownerUserId, "ownerUserId");
    const duplicates = await this.duplicateCandidates(input.name, input.website);
    if (duplicates.length && !confirmDuplicate) {
      throw new ApiError(409, "ORGANIZATION_DUPLICATE_WARNING", "发现可能重复的公司，请选择已有公司或确认继续创建", { candidates: duplicates });
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.organization.create({
        data: {
          ...fields,
          normalizedName: normalizeOrganizationName(input.name),
          websiteDomain: websiteDomain(input.website),
          createdByUserId,
          roles: { create: roles.map((role) => ({ role })) },
          lifecycleHistory: { create: { fromStage: null, toStage: input.lifecycleStage || "TARGET", reason: "Company created", changedByUserId: createdByUserId } },
        },
        include: { owner: { select: crmUserSummarySelect }, roles: true },
      });
      await appendAuditRecord(tx, audit, { action: "CREATE_ORGANIZATION", module: "crm", targetType: "organization", targetId: row.id, details: { roles, fields: Object.keys(fields), duplicateOverride: confirmDuplicate } });
      return (await new OrganizationMetricsService(tx as unknown as PrismaClient, this.config).hydrate([row]))[0];
    });
  }

  async update(id: string, input: OrganizationPatchInput, audit: AuditActorContext) {
    const { roles, ...fields } = input;
    return this.prisma.$transaction(async (tx) => {
      const existing = await requireOrganization(tx, id);
      if (input.ownerUserId !== undefined) await assertAssignableCrmUser(tx, input.ownerUserId, "ownerUserId");
      const nextName = input.name ?? existing.name;
      const nextWebsite = input.website === undefined ? existing.website : input.website;
      const row = await tx.organization.update({
        where: { id },
        data: {
          ...fields,
          normalizedName: input.name === undefined ? undefined : normalizeOrganizationName(nextName),
          websiteDomain: input.website === undefined ? undefined : websiteDomain(nextWebsite),
          roles: roles === undefined ? undefined : { deleteMany: {}, create: roles.map((role) => ({ role })) },
        },
        include: { owner: { select: crmUserSummarySelect }, roles: true },
      });
      if (input.lifecycleStage && input.lifecycleStage !== existing.lifecycleStage) {
        await tx.organizationLifecycleHistory.create({ data: { organizationId: id, fromStage: existing.lifecycleStage, toStage: input.lifecycleStage, reason: "Manual lifecycle update", changedByUserId: audit.actorUserId! } });
      }
      await appendAuditRecord(tx, audit, {
        action: "UPDATE_ORGANIZATION", module: "crm", targetType: "organization", targetId: id,
        details: { changedFields: Object.keys(input), fitScoreChange: input.fitScore === undefined ? undefined : { from: existing.fitScore, to: input.fitScore }, lifecycleChange: input.lifecycleStage === undefined ? undefined : { from: existing.lifecycleStage, to: input.lifecycleStage } },
      });
      return (await new OrganizationMetricsService(tx as unknown as PrismaClient, this.config).hydrate([row]))[0];
    });
  }

  async detail(id: string) {
    const row = await this.prisma.organization.findFirst({ where: { id, deletedAt: null }, include: { owner: { select: crmUserSummarySelect }, roles: true } });
    if (!row) throw new ApiError(404, "RESOURCE_NOT_FOUND", "公司不存在");
    const [enriched] = await this.metrics.hydrate([row]);
    const contacts = await this.prisma.contact.findMany({ where: { organizationId: id, deletedAt: null }, include: { owner: { select: crmUserSummarySelect }, _count: { select: { leads: { where: { deletedAt: null } } } } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] });
    const contactIds = contacts.map((item) => item.id);
    const [leads, nurtures, tasks, files, lifecycleHistory] = await Promise.all([
      this.prisma.crmLead.findMany({ where: { contactId: { in: contactIds }, deletedAt: null }, include: { contact: { select: { id: true, contactName: true } }, salesOwner: { select: crmUserSummarySelect } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] }),
      this.prisma.organizationNurture.findMany({ where: { organizationId: id }, include: { owner: { select: crmUserSummarySelect }, createdBy: { select: crmUserSummarySelect } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] }),
      this.prisma.crmTask.findMany({ where: { OR: [{ organizationId: id }, { contactId: { in: contactIds } }, { lead: { contactId: { in: contactIds } } }] }, include: { owner: { select: crmUserSummarySelect }, contact: { select: { id: true, contactName: true } }, lead: { select: { id: true, requirementSummary: true, status: true } } }, orderBy: [{ dueAt: "asc" }, { id: "asc" }] }),
      this.prisma.crmAttachment.findMany({ where: { entityType: "ORGANIZATION", entityId: id }, select: crmAttachmentSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
      this.prisma.organizationLifecycleHistory.findMany({ where: { organizationId: id }, include: { changedBy: { select: crmUserSummarySelect } }, orderBy: [{ changedAt: "desc" }, { id: "desc" }] }),
    ]);
    return { ...enriched, contacts, leads, nurtures, tasks, files, lifecycleHistory };
  }

  async remove(id: string, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await requireOrganization(tx, id);
      const contactCount = await tx.contact.count({ where: { organizationId: id, deletedAt: null } });
      const activeLeadCount = await tx.crmLead.count({ where: { contact: { organizationId: id, deletedAt: null }, deletedAt: null, status: { in: [...ACTIVE_LEAD_STATUSES] } } });
      if (contactCount || activeLeadCount) throw new ApiError(409, "ORGANIZATION_HAS_ACTIVE_RELATIONS", `公司仍有 ${contactCount} 位联系人、${activeLeadCount} 条活跃商机，不能删除`, { contactCount, activeLeadCount });
      await tx.organization.update({ where: { id }, data: { deletedAt: new Date(), deletedByUserId: audit.actorUserId } });
      await appendAuditRecord(tx, audit, { action: "DELETE_ORGANIZATION", module: "crm", targetType: "organization", targetId: id, details: { name: existing.name } });
      return { id };
    });
  }

  async journey(id: string) {
    const organization = await requireOrganization(this.prisma, id);
    const contacts = await this.prisma.contact.findMany({ where: { organizationId: id }, select: { id: true, contactName: true, createdAt: true, deletedAt: true } });
    const contactIds = contacts.map((item) => item.id);
    const leads = await this.prisma.crmLead.findMany({ where: { contactId: { in: contactIds } }, select: { id: true, contactId: true, requirementSummary: true, status: true, createdAt: true, closedAt: true, deletedAt: true } });
    const leadIds = leads.map((item) => item.id);
    const [contactFollowups, leadFollowups, stages, nurtures, lifecycle, convertedMarketingLeads] = await Promise.all([
      this.prisma.contactFollowup.findMany({ where: { contactId: { in: contactIds } }, include: { owner: { select: crmUserSummarySelect } } }),
      this.prisma.leadFollowup.findMany({ where: { leadId: { in: leadIds } }, include: { owner: { select: crmUserSummarySelect } } }),
      this.prisma.leadStageHistory.findMany({ where: { leadId: { in: leadIds } }, include: { changedBy: { select: crmUserSummarySelect } } }),
      this.prisma.organizationNurture.findMany({ where: { organizationId: id }, include: { owner: { select: crmUserSummarySelect } } }),
      this.prisma.organizationLifecycleHistory.findMany({ where: { organizationId: id }, include: { changedBy: { select: crmUserSummarySelect } } }),
      this.prisma.marketingLead.findMany({
        where: { convertedOrganizationId: id, status: "CONVERTED" },
        include: {
          statusHistory: { where: { toStatus: { in: ["MQL", "SQL", "CONVERTED"] } }, include: { changedBy: { select: crmUserSummarySelect } }, orderBy: { changedAt: "asc" } },
          convertedContact: { select: { id: true, contactName: true } },
          convertedOpportunity: { select: { id: true, requirementSummary: true } },
          convertedBy: { select: crmUserSummarySelect },
        },
      }),
    ]);
    const contactById = new Map(contacts.map((item) => [item.id, item]));
    const leadById = new Map(leads.map((item) => [item.id, item]));
    const events: Array<{ id: string; occurredAt: Date; type: string; title: string; summary: string; actor?: unknown; relatedContactId?: string; relatedLeadId?: string }> = [
      { id: `organization-${id}`, occurredAt: organization.createdAt, type: "ORGANIZATION_CREATED", title: "创建公司", summary: organization.name },
    ];
    contacts.forEach((item) => events.push({ id: `contact-${item.id}`, occurredAt: item.createdAt, type: "CONTACT_CREATED", title: "创建联系人", summary: item.contactName, relatedContactId: item.id }));
    contactFollowups.forEach((item) => events.push({ id: `contact-followup-${item.id}`, occurredAt: item.occurredAt, type: "CONTACT_FOLLOWUP", title: "联系人互动", summary: item.content, actor: item.owner, relatedContactId: item.contactId }));
    leads.forEach((item) => events.push({ id: `lead-${item.id}`, occurredAt: item.createdAt, type: "OPPORTUNITY_CREATED", title: "创建商机", summary: item.requirementSummary, relatedContactId: item.contactId, relatedLeadId: item.id }));
    leadFollowups.forEach((item) => events.push({ id: `lead-followup-${item.id}`, occurredAt: item.occurredAt, type: "OPPORTUNITY_FOLLOWUP", title: "商机跟进", summary: item.content, actor: item.owner, relatedContactId: leadById.get(item.leadId)?.contactId, relatedLeadId: item.leadId }));
    stages.forEach((item) => events.push({ id: `stage-${item.id}`, occurredAt: item.changedAt, type: ["WON", "LOST"].includes(item.toStatus) ? `OPPORTUNITY_${item.toStatus}` : "OPPORTUNITY_STAGE_CHANGED", title: "商机阶段变更", summary: `${item.fromStatus || "-"} → ${item.toStatus}`, actor: item.changedBy, relatedContactId: leadById.get(item.leadId)?.contactId, relatedLeadId: item.leadId }));
    nurtures.forEach((item) => events.push({ id: `nurture-${item.id}`, occurredAt: item.createdAt, type: "ACCOUNT_PLAN_EVENT", title: "开始客户经营计划", summary: `${item.reason} · 下一触达：${item.touchTopic}`, actor: item.owner }));
    lifecycle.forEach((item) => events.push({ id: `lifecycle-${item.id}`, occurredAt: item.changedAt, type: "LIFECYCLE_CHANGED", title: "公司生命周期变更", summary: `${item.fromStage || "-"} → ${item.toStage}`, actor: item.changedBy }));
    convertedMarketingLeads.forEach((marketingLead) => {
      marketingLead.statusHistory.filter((item) => ["MQL", "SQL"].includes(item.toStatus)).forEach((history) => events.push({ id: `marketing-${history.id}`, occurredAt: history.changedAt, type: `MARKETING_LEAD_${history.toStatus}`, title: `Marketing Lead → ${history.toStatus}`, summary: `${marketingLead.fullName} · ${marketingLead.source}`, actor: history.changedBy, relatedContactId: marketingLead.convertedContactId ?? undefined }));
      if (marketingLead.convertedAt) events.push({ id: `marketing-converted-${marketingLead.id}`, occurredAt: marketingLead.convertedAt, type: "MARKETING_LEAD_CONVERTED", title: "Marketing Lead Converted", summary: marketingLead.convertedOpportunity?.requirementSummary || marketingLead.fullName, actor: marketingLead.convertedBy, relatedContactId: marketingLead.convertedContact?.id, relatedLeadId: marketingLead.convertedOpportunity?.id });
    });
    events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id));
    return { organizationId: id, contactCount: contacts.filter((item) => !item.deletedAt).length, leadCount: leads.filter((item) => !item.deletedAt).length, events, contactNames: Object.fromEntries(contactById) };
  }
}

export class OrganizationNurtureService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(organizationId?: string, ownerUserId?: string, status?: "ACTIVE" | "PAUSED" | "COMPLETED") {
    return this.prisma.organizationNurture.findMany({
      where: { organizationId, ownerUserId, status, organization: { deletedAt: null } },
      include: { organization: { include: { roles: true, owner: { select: crmUserSummarySelect } } }, owner: { select: crmUserSummarySelect }, createdBy: { select: crmUserSummarySelect } },
      orderBy: [{ nextTouchAt: "asc" }, { id: "asc" }],
    });
  }

  async create(organizationId: string, input: NurtureCreateInput, createdByUserId: string, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const organization = await requireOrganization(tx, organizationId);
      await assertAssignableCrmUser(tx, input.ownerUserId, "ownerUserId");
      const existing = await tx.organizationNurture.findFirst({ where: { organizationId, status: "ACTIVE" } });
      if (existing) throw new ApiError(409, "ACTIVE_NURTURE_EXISTS", "该公司已有进行中的客户经营计划");
      const row = await tx.organizationNurture.create({ data: { ...input, organizationId, createdByUserId }, include: { owner: { select: crmUserSummarySelect } } });
      await tx.crmTask.create({ data: { organizationId, title: input.touchTopic, description: input.objective, ownerUserId: input.ownerUserId, dueAt: input.nextTouchAt, source: "NURTURE", createdByUserId } });
      if (["TARGET", "CONTACTED"].includes(organization.lifecycleStage)) await transitionOrganizationLifecycle(tx, organizationId, "NURTURING", createdByUserId, "Active nurture plan created", { automatic: true });
      await appendAuditRecord(tx, audit, { action: "START_NURTURE", module: "crm", targetType: "organization_nurture", targetId: row.id, details: { organizationId, nextTouchAt: input.nextTouchAt.toISOString(), cadenceDays: input.cadenceDays } });
      return row;
    });
  }

  async update(id: string, input: NurturePatchInput, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.organizationNurture.findUnique({ where: { id } });
      if (!existing) throw new ApiError(404, "RESOURCE_NOT_FOUND", "客户经营计划不存在");
      if (input.ownerUserId !== undefined) await assertAssignableCrmUser(tx, input.ownerUserId, "ownerUserId");
      const row = await tx.organizationNurture.update({
        where: { id },
        data: { ...input, endedAt: input.status && input.status !== "ACTIVE" ? new Date() : input.status === "ACTIVE" ? null : undefined },
        include: { organization: true, owner: { select: crmUserSummarySelect } },
      });
      const task = await tx.crmTask.findFirst({ where: { organizationId: row.organizationId, source: "NURTURE", status: "OPEN" }, orderBy: { createdAt: "desc" } });
      if (row.status === "ACTIVE") {
        if (task) await tx.crmTask.update({ where: { id: task.id }, data: { title: row.touchTopic, description: row.objective, dueAt: row.nextTouchAt, ownerUserId: row.ownerUserId } });
        else await tx.crmTask.create({ data: { organizationId: row.organizationId, title: row.touchTopic, description: row.objective, dueAt: row.nextTouchAt, ownerUserId: row.ownerUserId, source: "NURTURE", createdByUserId: audit.actorUserId! } });
      } else if (task) await tx.crmTask.update({ where: { id: task.id }, data: { status: "CANCELED" } });
      await appendAuditRecord(tx, audit, { action: "UPDATE_NURTURE", module: "crm", targetType: "organization_nurture", targetId: id, details: { changedFields: Object.keys(input), statusChange: input.status ? { from: existing.status, to: input.status } : undefined } });
      return row;
    });
  }
}
