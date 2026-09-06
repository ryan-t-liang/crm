import type { OrganizationRoleType, PrismaClient } from "@prisma/client";
import type { AppConfig } from "../common/config.js";
import { crmUserSummarySelect } from "../common/crm-users.js";
import { OrganizationMetricsService } from "../organizations/service.js";

const ACTIVE_LEAD_STATUSES = ["NEW", "QUALIFIED", "SOLUTION", "QUOTATION"] as const;
const DAY = 86_400_000;

export type AnalyticsFilter = { from: Date; to: Date; ownerUserId?: string; organizationRole?: OrganizationRoleType };

function percentage(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function daysBetween(from: Date, to: Date) {
  return Math.max(0, (to.getTime() - from.getTime()) / DAY);
}

export function qualifiesAsReactivation(input: { organizationCreatedAt: Date; previousInteractionAt: Date | null; interactionAt: Date; dormantDays: number }) {
  const baseline = input.previousInteractionAt ?? input.organizationCreatedAt;
  return daysBetween(baseline, input.interactionAt) >= input.dormantDays;
}

export class CrmAnalyticsService {
  private readonly metrics: OrganizationMetricsService;
  constructor(private readonly prisma: PrismaClient, private readonly config: AppConfig) {
    this.metrics = new OrganizationMetricsService(prisma, config);
  }

  private organizationWhere(filter: AnalyticsFilter) {
    return {
      deletedAt: null,
      ownerUserId: filter.ownerUserId,
      lifecycleStage: { not: "DISQUALIFIED" as const },
      roles: { some: { role: filter.organizationRole ? filter.organizationRole : { in: ["PROSPECT", "CUSTOMER"] as OrganizationRoleType[] } } },
    };
  }

  private async organizations(filter: AnalyticsFilter) {
    const rows = await this.prisma.organization.findMany({
      where: this.organizationWhere(filter),
      include: { owner: { select: crmUserSummarySelect }, roles: true },
      orderBy: { updatedAt: "desc" },
      take: 1000,
    });
    return this.metrics.hydrate(rows);
  }

  async management(filter: AnalyticsFilter) {
    const organizations = await this.organizations(filter);
    const organizationIds = organizations.map((row) => row.id);
    const contacts = await this.prisma.contact.findMany({ where: { organizationId: { in: organizationIds }, deletedAt: null }, select: { id: true, organizationId: true } });
    const contactIds = contacts.map((row) => row.id);
    const now = new Date();
    const staleBoundary = new Date(now.getTime() - this.config.crmStaleLeadDays * DAY);
    const untouchedBoundary = new Date(now.getTime() - this.config.crmHighFitUntouchedDays * DAY);
    const [leads, tasks, nurtures, interactions] = await Promise.all([
      this.prisma.crmLead.findMany({
        where: { contactId: { in: contactIds }, deletedAt: null },
        select: { id: true, contactId: true, status: true, priority: true, createdAt: true, closedAt: true, lastFollowupAt: true, nextAction: true, salesOwnerUserId: true },
      }),
      this.prisma.crmTask.findMany({
        where: { OR: [{ organizationId: { in: organizationIds } }, { contactId: { in: contactIds } }, { lead: { contactId: { in: contactIds } } }] },
        select: { id: true, organizationId: true, contactId: true, leadId: true, ownerUserId: true, status: true, dueAt: true, completedAt: true },
      }),
      this.prisma.organizationNurture.findMany({ where: { organizationId: { in: organizationIds } }, select: { id: true, organizationId: true, status: true, createdAt: true, startedAt: true } }),
      this.interactions(organizationIds, contactIds),
    ]);
    const activeLeads = leads.filter((lead) => ACTIVE_LEAD_STATUSES.includes(lead.status as typeof ACTIVE_LEAD_STATUSES[number]));
    const closedInPeriod = leads.filter((lead) => ["WON", "LOST"].includes(lead.status) && lead.closedAt && lead.closedAt >= filter.from && lead.closedAt <= filter.to);
    const won = closedInPeriod.filter((lead) => lead.status === "WON").length;
    const dueInPeriod = tasks.filter((task) => task.status !== "CANCELED" && task.dueAt >= filter.from && task.dueAt <= filter.to);
    const doneInPeriod = dueInPeriod.filter((task) => task.status === "DONE");
    const nextActionCovered = activeLeads.filter((lead) => lead.nextAction?.trim() && tasks.some((task) => task.leadId === lead.id && task.status === "OPEN")).length;
    const assignedOrganizationIds = new Set(organizations.filter((organization) => organization.ownerUserId).map((organization) => organization.id));
    const coveredOrganizationIds = new Set(interactions.filter((item) => assignedOrganizationIds.has(item.organizationId) && item.occurredAt >= filter.from && item.occurredAt <= filter.to).map((item) => item.organizationId));
    const nurtureStarts = nurtures.filter((item) => item.startedAt >= filter.from && item.startedAt <= filter.to);
    const nurtureOrganizationIds = new Set(nurtureStarts.map((item) => item.organizationId));
    const nurtureConvertedIds = new Set(leads.filter((lead) => {
      const organizationId = contacts.find((contact) => contact.id === lead.contactId)?.organizationId;
      const nurture = nurtureStarts.find((item) => item.organizationId === organizationId);
      return Boolean(nurture && lead.createdAt >= nurture.startedAt && lead.createdAt <= filter.to);
    }).map((lead) => contacts.find((contact) => contact.id === lead.contactId)?.organizationId).filter(Boolean));
    const reactivation = this.reactivationMetrics(organizations, interactions, filter);
    const pipelineStages = ["NEW", "QUALIFIED", "SOLUTION", "QUOTATION"].map((status) => ({ status, count: activeLeads.filter((lead) => lead.status === status).length }));
    pipelineStages.push({ status: "WON", count: closedInPeriod.filter((lead) => lead.status === "WON").length }, { status: "LOST", count: closedInPeriod.filter((lead) => lead.status === "LOST").length });
    const lifecycle = ["TARGET", "CONTACTED", "NURTURING", "OPPORTUNITY", "CUSTOMER"].map((stage) => ({ stage, count: organizations.filter((row) => row.lifecycleStage === stage).length }));
    const salesCycles = closedInPeriod.map((lead) => daysBetween(lead.createdAt, lead.closedAt!));
    return {
      period: { from: filter.from, to: filter.to, ownerUserId: filter.ownerUserId ?? null, organizationRole: filter.organizationRole ?? null },
      kpis: {
        activeOrganizations: organizations.filter((row) => row.engagementState === "ACTIVE").length,
        activeLeads: activeLeads.length,
        newLeads: leads.filter((lead) => lead.createdAt >= filter.from && lead.createdAt <= filter.to).length,
        reactivationCandidates: organizations.filter((row) => row.fitScore >= 70 && row.engagementState === "DORMANT").length,
        overdueTasks: tasks.filter((task) => task.status === "OPEN" && task.dueAt < now).length,
        staleLeads: activeLeads.filter((lead) => (lead.lastFollowupAt ?? lead.createdAt) < staleBoundary).length,
      },
      pipeline: pipelineStages,
      lifecycle,
      execution: {
        winRate: { numerator: won, denominator: closedInPeriod.length, percent: percentage(won, closedInPeriod.length) },
        averageSalesCycleDays: salesCycles.length ? Math.round((salesCycles.reduce((sum, days) => sum + days, 0) / salesCycles.length) * 10) / 10 : 0,
        nextActionCoverage: { numerator: nextActionCovered, denominator: activeLeads.length, percent: percentage(nextActionCovered, activeLeads.length) },
        followupCompletion: { numerator: doneInPeriod.length, denominator: dueInPeriod.length, percent: percentage(doneInPeriod.length, dueInPeriod.length), onTime: doneInPeriod.filter((task) => task.completedAt && task.completedAt <= task.dueAt).length },
        customerCoverage: { numerator: coveredOrganizationIds.size, denominator: assignedOrganizationIds.size, percent: percentage(coveredOrganizationIds.size, assignedOrganizationIds.size) },
        nurtureConversion: { numerator: nurtureConvertedIds.size, denominator: nurtureOrganizationIds.size, percent: percentage(nurtureConvertedIds.size, nurtureOrganizationIds.size) },
        reactivation,
        activeNurtures: nurtures.filter((item) => item.status === "ACTIVE").length,
        highFitUntouched: organizations.filter((row) => row.fitScore >= 70 && row.activeLeadCount === 0 && (!row.lastInteractionAt || row.lastInteractionAt < untouchedBoundary)).length,
      },
    };
  }

  async matrix(filter: AnalyticsFilter) {
    const organizations = await this.organizations(filter);
    const levels = ["HIGH", "MEDIUM", "LOW"] as const;
    return {
      total: organizations.length,
      cells: levels.flatMap((engagementLevel) => levels.map((fitLevel) => ({
        key: `${fitLevel}_${engagementLevel}`,
        fitLevel,
        engagementLevel,
        label: fitLevel === "HIGH" ? engagementLevel === "HIGH" ? "A1 重点跟进" : engagementLevel === "MEDIUM" ? "A2 持续孵化" : "A3 优先唤醒" : `${fitLevel[0]}-${engagementLevel[0]}`,
        count: organizations.filter((row) => row.fitLevel === fitLevel && row.engagementLevel === engagementLevel).length,
      }))),
    };
  }

  async team(filter: AnalyticsFilter) {
    const users = await this.prisma.user.findMany({
      where: { status: "ACTIVE", id: filter.ownerUserId },
      select: crmUserSummarySelect,
      orderBy: { name: "asc" },
    });
    const userIds = users.map((user) => user.id);
    const now = new Date();
    const staleBoundary = new Date(now.getTime() - this.config.crmStaleLeadDays * DAY);
    const organizations = await this.organizations({ ...filter, ownerUserId: undefined });
    const organizationIds = organizations.map((row) => row.id);
    const contacts = await this.prisma.contact.findMany({
      where: { organizationId: { in: organizationIds }, deletedAt: null },
      select: { id: true, organizationId: true },
    });
    const contactIds = contacts.map((row) => row.id);
    const [tasks, leads, contactInteractionGroups, leadInteractionGroups] = await Promise.all([
      this.prisma.crmTask.findMany({
        where: { ownerUserId: { in: userIds } },
        select: { ownerUserId: true, leadId: true, status: true, dueAt: true, completedAt: true },
      }),
      this.prisma.crmLead.findMany({
        where: { contactId: { in: contactIds }, deletedAt: null, salesOwnerUserId: { in: userIds } },
        select: { id: true, contactId: true, salesOwnerUserId: true, status: true, lastFollowupAt: true, createdAt: true, nextAction: true },
      }),
      this.prisma.contactFollowup.groupBy({
        by: ["ownerUserId"],
        where: { ownerUserId: { in: userIds }, occurredAt: { gte: filter.from, lte: filter.to } },
        _count: { _all: true },
      }),
      this.prisma.leadFollowup.groupBy({
        by: ["ownerUserId"],
        where: { ownerUserId: { in: userIds }, occurredAt: { gte: filter.from, lte: filter.to } },
        _count: { _all: true },
      }),
    ]);
    const organizationOwner = new Map(organizations.map((organization) => [organization.id, organization.ownerUserId]));
    const contactOrganization = new Map(contacts.map((contact) => [contact.id, contact.organizationId]));
    const contactInteractionsByOwner = new Map(contactInteractionGroups.map((group) => [group.ownerUserId, group._count._all]));
    const leadInteractionsByOwner = new Map(leadInteractionGroups.map((group) => [group.ownerUserId, group._count._all]));
    const rows = users.map((user) => {
      const ownedContactIds = new Set(contacts
        .filter((contact) => contact.organizationId && organizationOwner.get(contact.organizationId) === user.id)
        .map((contact) => contact.id));
      const userTasks = tasks.filter((task) => task.ownerUserId === user.id);
      const userLeads = leads.filter((lead) => lead.salesOwnerUserId === user.id && ownedContactIds.has(lead.contactId) && contactOrganization.has(lead.contactId));
      const activeLeads = userLeads.filter((lead) => ACTIVE_LEAD_STATUSES.includes(lead.status as typeof ACTIVE_LEAD_STATUSES[number]));
      const openTasks = userTasks.filter((task) => task.status === "OPEN");
      const due = userTasks.filter((task) => task.status !== "CANCELED" && task.dueAt >= filter.from && task.dueAt <= filter.to);
      const done = due.filter((task) => task.status === "DONE");
      return {
        user,
        openTasks: openTasks.length,
        doneTasks: done.length,
        overdueTasks: openTasks.filter((task) => task.dueAt < now).length,
        onTimeCompletionPercent: percentage(done.filter((task) => task.completedAt && task.completedAt <= task.dueAt).length, done.length),
        interactions: (contactInteractionsByOwner.get(user.id) ?? 0) + (leadInteractionsByOwner.get(user.id) ?? 0),
        activeLeads: activeLeads.length,
        staleLeads: activeLeads.filter((lead) => (lead.lastFollowupAt ?? lead.createdAt) < staleBoundary).length,
        leadsWithNextActionPercent: percentage(activeLeads.filter((lead) => lead.nextAction?.trim() && tasks.some((task) => task.leadId === lead.id && task.status === "OPEN")).length, activeLeads.length),
      };
    });
    return { period: { from: filter.from, to: filter.to }, rows };
  }

  private async interactions(organizationIds: string[], contactIds: string[]) {
    const [contactFollowups, leadFollowups] = await Promise.all([
      this.prisma.contactFollowup.findMany({ where: { contactId: { in: contactIds } }, select: { contactId: true, occurredAt: true } }),
      this.prisma.leadFollowup.findMany({ where: { lead: { contactId: { in: contactIds } } }, select: { occurredAt: true, lead: { select: { contact: { select: { organizationId: true } } } } } }),
    ]);
    const organizationByContact = new Map((await this.prisma.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, organizationId: true } })).map((row) => [row.id, row.organizationId]));
    return [
      ...contactFollowups.map((item) => ({ organizationId: organizationByContact.get(item.contactId), occurredAt: item.occurredAt })),
      ...leadFollowups.map((item) => ({ organizationId: item.lead.contact.organizationId, occurredAt: item.occurredAt })),
    ].filter((item): item is { organizationId: string; occurredAt: Date } => Boolean(item.organizationId && organizationIds.includes(item.organizationId)));
  }

  private reactivationMetrics(organizations: Awaited<ReturnType<OrganizationMetricsService["hydrate"]>>, interactions: Array<{ organizationId: string; occurredAt: Date }>, filter: AnalyticsFilter) {
    let touchedDormant = 0;
    let reactivated = 0;
    for (const organization of organizations) {
      const ordered = interactions.filter((item) => item.organizationId === organization.id).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
      const firstInPeriod = ordered.find((item) => item.occurredAt >= filter.from && item.occurredAt <= filter.to);
      if (!firstInPeriod) continue;
      const previous = [...ordered].reverse().find((item) => item.occurredAt < firstInPeriod.occurredAt);
      if (qualifiesAsReactivation({ organizationCreatedAt: organization.createdAt, previousInteractionAt: previous?.occurredAt ?? null, interactionAt: firstInPeriod.occurredAt, dormantDays: this.config.crmDormantDays })) {
        touchedDormant += 1;
        reactivated += 1;
      }
    }
    return { numerator: reactivated, denominator: touchedDormant, percent: percentage(reactivated, touchedDormant), count: reactivated };
  }
}
