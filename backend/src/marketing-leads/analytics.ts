import type { Prisma, PrismaClient } from "@prisma/client";
import type { AppConfig } from "../common/config.js";
import { crmUserSummarySelect } from "../common/crm-users.js";
import { leadScoreLevel, leadTemperature } from "./scoring.js";

export type MarketingAnalyticsFilter = {
  from: Date;
  to: Date;
  ownerUserId?: string;
  source?: string;
};

const HOUR = 3_600_000;

function percentage(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function averageHours(values: number[]) {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
}

function elapsedHours(from: Date, to: Date) {
  return Math.max(0, (to.getTime() - from.getTime()) / HOUR);
}

export class MarketingAnalyticsService {
  constructor(private readonly prisma: PrismaClient, private readonly config: AppConfig) {}

  private where(filter: MarketingAnalyticsFilter): Prisma.MarketingLeadWhereInput {
    return {
      deletedAt: null,
      createdAt: { gte: filter.from, lte: filter.to },
      ownerUserId: filter.ownerUserId,
      source: filter.source,
    };
  }

  private async cohort(filter: MarketingAnalyticsFilter) {
    return this.prisma.marketingLead.findMany({ where: this.where(filter), orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  }

  async funnel(filter: MarketingAnalyticsFilter) {
    const leads = await this.cohort(filter);
    const reachedBy = (date: Date | null) => Boolean(date && date <= filter.to);
    const mql = leads.filter((lead) => reachedBy(lead.mqlAt));
    const sql = leads.filter((lead) => reachedBy(lead.sqlAt));
    const opportunities = leads.filter((lead) => reachedBy(lead.convertedAt) && lead.convertedOpportunityId);
    return {
      period: filter,
      tracking: { visitorTracking: false, message: "未接入网站访客追踪" },
      stages: [
        { key: "LEAD", label: "Lead", count: leads.length },
        { key: "MQL", label: "MQL", count: mql.length },
        { key: "SQL", label: "SQL", count: sql.length },
        { key: "OPPORTUNITY", label: "Opportunity", count: opportunities.length },
      ],
      kpis: {
        newLeads: leads.length,
        mqlCount: mql.length,
        mqlRate: { numerator: mql.length, denominator: leads.length, percent: percentage(mql.length, leads.length) },
        mqlToSqlRate: { numerator: sql.length, denominator: mql.length, percent: percentage(sql.length, mql.length) },
        sqlToOpportunityRate: { numerator: opportunities.length, denominator: sql.length, percent: percentage(opportunities.length, sql.length) },
        leadToOpportunityRate: { numerator: opportunities.length, denominator: leads.length, percent: percentage(opportunities.length, leads.length) },
        avgLeadToMqlHours: averageHours(mql.map((lead) => elapsedHours(lead.createdAt, lead.mqlAt!))),
        avgMqlToSqlHours: averageHours(sql.filter((lead) => lead.mqlAt).map((lead) => elapsedHours(lead.mqlAt!, lead.sqlAt!))),
        avgLeadToOpportunityHours: averageHours(opportunities.map((lead) => elapsedHours(lead.createdAt, lead.convertedAt!))),
        mqlResponseHours: averageHours(leads.filter((lead) => lead.mqlAt && lead.firstSalesResponseAt && lead.firstSalesResponseAt <= filter.to).map((lead) => elapsedHours(lead.mqlAt!, lead.firstSalesResponseAt!))),
      },
    };
  }

  async sources(filter: MarketingAnalyticsFilter) {
    const leads = await this.cohort(filter);
    const groups = new Map<string, typeof leads>();
    for (const lead of leads) groups.set(lead.source, [...(groups.get(lead.source) ?? []), lead]);
    const rows = [...groups.entries()].map(([source, sourceLeads]) => {
      const mql = sourceLeads.filter((lead) => lead.mqlAt && lead.mqlAt <= filter.to);
      const sql = sourceLeads.filter((lead) => lead.sqlAt && lead.sqlAt <= filter.to);
      const opportunities = sourceLeads.filter((lead) => lead.convertedAt && lead.convertedAt <= filter.to && lead.convertedOpportunityId);
      return {
        source,
        leadCount: sourceLeads.length,
        mqlCount: mql.length,
        mqlRate: percentage(mql.length, sourceLeads.length),
        sqlCount: sql.length,
        sqlRate: percentage(sql.length, sourceLeads.length),
        opportunityCount: opportunities.length,
        leadToOpportunityRate: percentage(opportunities.length, sourceLeads.length),
        avgConversionHours: averageHours(opportunities.map((lead) => elapsedHours(lead.createdAt, lead.convertedAt!))),
      };
    }).sort((a, b) => b.leadCount - a.leadCount || a.source.localeCompare(b.source));
    return { period: filter, rows };
  }

  async scoring(filter: MarketingAnalyticsFilter) {
    const leads = await this.prisma.marketingLead.findMany({
      where: this.where(filter),
      include: { owner: { select: crmUserSummarySelect } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    const active = leads.filter((lead) => !["CONVERTED", "DISQUALIFIED"].includes(lead.status));
    const highScoreBoundary = new Date(filter.to.getTime() - this.config.crmHighFitUntouchedDays * 24 * HOUR);
    const isHighFitHighEngagement = (lead: typeof active[number]) => lead.fitScore >= 70 && lead.engagementScoreCached >= 70;
    const isHighFitUntouched = (lead: typeof active[number]) => lead.fitScore >= 70 && (!lead.lastActivityAt || lead.lastActivityAt < highScoreBoundary);
    const attentionRows = active.map((lead) => {
      const reasons = [
        lead.status === "MQL" ? "PENDING_MQL" : null,
        isHighFitHighEngagement(lead) ? "HIGH_FIT_HIGH_ENGAGEMENT" : null,
        isHighFitUntouched(lead) ? "HIGH_FIT_UNTOUCHED" : null,
        lead.status === "RECYCLED" ? "RECYCLED" : null,
      ].filter((reason): reason is string => Boolean(reason));
      return {
        id: lead.id,
        fullName: lead.fullName,
        companyName: lead.companyName,
        status: lead.status,
        fitScore: lead.fitScore,
        engagementScore: lead.engagementScoreCached,
        owner: lead.owner,
        lastActivityAt: lead.lastActivityAt,
        updatedAt: lead.updatedAt,
        reasons,
      };
    }).filter((lead) => lead.reasons.length)
      .sort((a, b) => b.reasons.length - a.reasons.length || (b.fitScore + b.engagementScore) - (a.fitScore + a.engagementScore) || b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 20);
    const ids = leads.map((lead) => lead.id);
    const activities = ids.length ? await this.prisma.leadActivityEvent.groupBy({
      by: ["eventType"],
      where: { marketingLeadId: { in: ids }, occurredAt: { lte: filter.to } },
      _count: { _all: true },
      _sum: { engagementDeltaSnapshot: true, fitDeltaSnapshot: true },
      orderBy: { _count: { eventType: "desc" } },
      take: 10,
    }) : [];
    const levels = ["LOW", "MEDIUM", "HIGH"] as const;
    return {
      period: filter,
      summary: {
        activeLeads: active.length,
        mql: active.filter((lead) => lead.status === "MQL").length,
        hotLeads: active.filter((lead) => leadTemperature(lead.fitScore, lead.engagementScoreCached) === "HOT").length,
        warmLeads: active.filter((lead) => leadTemperature(lead.fitScore, lead.engagementScoreCached) === "WARM").length,
        coldLeads: active.filter((lead) => leadTemperature(lead.fitScore, lead.engagementScoreCached) === "COLD").length,
        highScoreUntouched: active.filter(isHighFitUntouched).length,
        recycledLeads: active.filter((lead) => lead.status === "RECYCLED").length,
      },
      attention: {
        counts: {
          pendingMql: active.filter((lead) => lead.status === "MQL").length,
          highFitHighEngagement: active.filter(isHighFitHighEngagement).length,
          highFitUntouched: active.filter(isHighFitUntouched).length,
          recycled: active.filter((lead) => lead.status === "RECYCLED").length,
        },
        rows: attentionRows,
      },
      distribution: levels.flatMap((fitLevel) => levels.map((engagementLevel) => ({
        fitLevel,
        engagementLevel,
        count: active.filter((lead) => leadScoreLevel(lead.fitScore) === fitLevel && leadScoreLevel(lead.engagementScoreCached) === engagementLevel).length,
      }))),
      topSignals: activities.map((activity) => ({ eventType: activity.eventType, count: activity._count._all, engagementDelta: activity._sum.engagementDeltaSnapshot ?? 0, fitDelta: activity._sum.fitDeltaSnapshot ?? 0 })),
    };
  }
}
