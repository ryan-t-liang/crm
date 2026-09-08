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
    // Company ownership scopes company-health metrics. Opportunity metrics are
    // independently owned by salesOwnerUserId and must never require the
    // Opportunity owner to also own its Company.
    const opportunityOrganizations = filter.ownerUserId
      ? await this.prisma.organization.findMany({
          where: this.organizationWhere({ ...filter, ownerUserId: undefined }),
          select: { id: true },
          take: 1000,
        })
      : organizations;
    const opportunityOrganizationIds = opportunityOrganizations.map((row) => row.id);
    const contacts = await this.prisma.contact.findMany({ where: { organizationId: { in: opportunityOrganizationIds }, deletedAt: null }, select: { id: true, organizationId: true } });
    const contactIds = contacts.map((row) => row.id);
    const now = new Date();
    const staleBoundary = new Date(now.getTime() - this.config.crmStaleLeadDays * DAY);
    const untouchedBoundary = new Date(now.getTime() - this.config.crmHighFitUntouchedDays * DAY);
    const [leads, tasks, nurtures, interactions] = await Promise.all([
      this.prisma.crmLead.findMany({
        where: { contactId: { in: contactIds }, salesOwnerUserId: filter.ownerUserId, deletedAt: null },
        select: {
          id: true,
          contactId: true,
          requirementSummary: true,
          status: true,
          priority: true,
          createdAt: true,
          updatedAt: true,
          wonAt: true,
          closedAt: true,
          lastFollowupAt: true,
          nextFollowupAt: true,
          latestProgress: true,
          nextAction: true,
          salesOwnerUserId: true,
          salesOwner: { select: crmUserSummarySelect },
          contact: {
            select: {
              contactName: true,
              companyName: true,
              companyShortName: true,
              organization: { select: { id: true, name: true, shortName: true } },
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
      this.prisma.crmTask.findMany({
        where: { ownerUserId: filter.ownerUserId, OR: [{ organizationId: { in: opportunityOrganizationIds } }, { contactId: { in: contactIds } }, { lead: { contactId: { in: contactIds } } }] },
        select: { id: true, organizationId: true, contactId: true, leadId: true, ownerUserId: true, status: true, dueAt: true, completedAt: true },
      }),
      this.prisma.organizationNurture.findMany({ where: { organizationId: { in: organizationIds } }, select: { id: true, organizationId: true, status: true, createdAt: true, startedAt: true } }),
      this.interactions(organizationIds, contactIds),
    ]);
    const activeLeads = leads.filter((lead) => ACTIVE_LEAD_STATUSES.includes(lead.status as typeof ACTIVE_LEAD_STATUSES[number]));
    const closedAt = (lead: typeof leads[number]) => lead.status === "WON" ? lead.wonAt ?? lead.closedAt : lead.closedAt;
    const closedInPeriod = leads.filter((lead) => {
      const occurredAt = closedAt(lead);
      return ["WON", "LOST"].includes(lead.status) && occurredAt && occurredAt >= filter.from && occurredAt <= filter.to;
    });
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
    const salesCycles = closedInPeriod.map((lead) => daysBetween(lead.createdAt, closedAt(lead)!));
    const opportunityRows = [...activeLeads, ...closedInPeriod]
      .filter((lead, index, rows) => rows.findIndex((row) => row.id === lead.id) === index)
      .sort((a, b) => {
        const activeOrder = Number(ACTIVE_LEAD_STATUSES.includes(b.status as typeof ACTIVE_LEAD_STATUSES[number])) - Number(ACTIVE_LEAD_STATUSES.includes(a.status as typeof ACTIVE_LEAD_STATUSES[number]));
        return activeOrder || b.updatedAt.getTime() - a.updatedAt.getTime();
      })
      .slice(0, 40)
      .map((lead) => ({
        id: lead.id,
        requirementSummary: lead.requirementSummary,
        status: lead.status,
        priority: lead.priority,
        company: lead.contact.organization?.shortName ?? lead.contact.organization?.name ?? lead.contact.companyShortName ?? lead.contact.companyName ?? "—",
        contactName: lead.contact.contactName,
        owner: lead.salesOwner,
        latestProgress: lead.latestProgress,
        nextAction: lead.nextAction,
        nextFollowupAt: lead.nextFollowupAt,
        lastFollowupAt: lead.lastFollowupAt,
        updatedAt: lead.updatedAt,
        stale: (lead.lastFollowupAt ?? lead.createdAt) < staleBoundary,
        missingNextAction: !lead.nextAction?.trim(),
      }));
    const nextSevenDays = new Date(now.getTime() + 7 * DAY);
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
      opportunities: {
        rows: opportunityRows,
        risk: {
          stale: activeLeads.filter((lead) => (lead.lastFollowupAt ?? lead.createdAt) < staleBoundary).length,
          withoutNextAction: activeLeads.filter((lead) => !lead.nextAction?.trim()).length,
          dueNextSevenDays: activeLeads.filter((lead) => lead.nextFollowupAt && lead.nextFollowupAt >= now && lead.nextFollowupAt <= nextSevenDays).length,
          overdueFollowups: activeLeads.filter((lead) => lead.nextFollowupAt && lead.nextFollowupAt < now).length,
        },
      },
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
        label: fitLevel === "HIGH" ? engagementLevel === "HIGH" ? "A1 重点跟进" : engagementLevel === "MEDIUM" ? "A2 持续经营" : "A3 优先唤醒" : `${fitLevel[0]}-${engagementLevel[0]}`,
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
    const [tasks, leads, marketingLeads, contactInteractionGroups, leadInteractionGroups] = await Promise.all([
      this.prisma.crmTask.findMany({
        where: { ownerUserId: { in: userIds } },
        select: { ownerUserId: true, leadId: true, status: true, dueAt: true, completedAt: true },
      }),
      this.prisma.crmLead.findMany({
        where: {
          deletedAt: null,
          salesOwnerUserId: { in: userIds },
          contact: filter.organizationRole
            ? { organization: { roles: { some: { role: filter.organizationRole } } } }
            : undefined,
        },
        select: { id: true, salesOwnerUserId: true, status: true, lastFollowupAt: true, createdAt: true, wonAt: true, closedAt: true, nextAction: true },
      }),
      this.prisma.marketingLead.findMany({
        where: { deletedAt: null, ownerUserId: { in: userIds } },
        select: {
          id: true,
          ownerUserId: true,
          status: true,
          createdAt: true,
          mqlAt: true,
          sqlAt: true,
          convertedAt: true,
          convertedOpportunityId: true,
          statusHistory: { select: { toStatus: true, changedAt: true } },
        },
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
    const contactInteractionsByOwner = new Map(contactInteractionGroups.map((group) => [group.ownerUserId, group._count._all]));
    const leadInteractionsByOwner = new Map(leadInteractionGroups.map((group) => [group.ownerUserId, group._count._all]));
    const rows = users.map((user) => {
      const userTasks = tasks.filter((task) => task.ownerUserId === user.id);
      const userLeads = leads.filter((lead) => lead.salesOwnerUserId === user.id);
      const userMarketingLeads = marketingLeads.filter((lead) => lead.ownerUserId === user.id);
      const activeLeads = userLeads.filter((lead) => ACTIVE_LEAD_STATUSES.includes(lead.status as typeof ACTIVE_LEAD_STATUSES[number]));
      const openTasks = userTasks.filter((task) => task.status === "OPEN");
      const reached = (lead: typeof userMarketingLeads[number], status: "MQL" | "SQL") => {
        const canonicalAt = status === "MQL" ? lead.mqlAt : lead.sqlAt;
        if (canonicalAt) return canonicalAt >= filter.from && canonicalAt <= filter.to;
        return lead.statusHistory.some((history) => history.toStatus === status && history.changedAt >= filter.from && history.changedAt <= filter.to);
      };
      const mql = userMarketingLeads.filter((lead) => reached(lead, "MQL"));
      const sql = userMarketingLeads.filter((lead) => reached(lead, "SQL"));
      const convertedSql = sql.filter((lead) => lead.convertedOpportunityId);
      const opportunitiesWithNextAction = activeLeads.filter((lead) => lead.nextAction?.trim()).length;
      return {
        user,
        newMarketingLeads: userMarketingLeads.filter((lead) => lead.createdAt >= filter.from && lead.createdAt <= filter.to).length,
        mql: mql.length,
        sql: sql.length,
        newOpportunities: userLeads.filter((lead) => lead.createdAt >= filter.from && lead.createdAt <= filter.to).length,
        wonOpportunities: userLeads.filter((lead) => {
          const occurredAt = lead.wonAt ?? lead.closedAt;
          return lead.status === "WON" && occurredAt && occurredAt >= filter.from && occurredAt <= filter.to;
        }).length,
        overdueTasks: openTasks.filter((task) => task.dueAt < now).length,
        interactions: (contactInteractionsByOwner.get(user.id) ?? 0) + (leadInteractionsByOwner.get(user.id) ?? 0),
        staleLeads: activeLeads.filter((lead) => (lead.lastFollowupAt ?? lead.createdAt) < staleBoundary).length,
        activeOpportunities: activeLeads.length,
        opportunitiesWithNextAction,
        leadsWithNextActionPercent: percentage(opportunitiesWithNextAction, activeLeads.length),
        mqlToSqlPercent: percentage(sql.length, mql.length),
        sqlToOpportunityPercent: percentage(convertedSql.length, sql.length),
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
