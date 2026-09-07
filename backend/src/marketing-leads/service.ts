import { Prisma, type MarketingLeadStatus, type PrismaClient } from "@prisma/client";
import type { AppConfig } from "../common/config.js";
import type { AuditActorContext } from "../common/audit.js";
import { appendAuditRecord } from "../common/audit.js";
import { assertAssignableCrmUser, crmUserSummarySelect, type CrmDbClient } from "../common/crm-users.js";
import { ApiError } from "../common/errors.js";
import { crmLeadDetailInclude } from "../crm-leads/service.js";
import { normalizeOrganizationName, transitionOrganizationLifecycle, websiteDomain } from "../organizations/service.js";
import type {
  MarketingLeadActivityCreateInput,
  MarketingLeadConversionInput,
  MarketingLeadCreateInput,
  MarketingLeadImportInput,
  MarketingLeadPatchInput,
  MarketingLeadTransitionInput,
  ScoringRuleCreateInput,
  ScoringRulePatchInput,
} from "./schemas.js";
import { normalizeInternationalPhone, validatedPhone } from "./phone.js";
import { clampLeadScore, leadScoreLevel, leadTemperature } from "./scoring.js";

export type MarketingLeadListInput = {
  keyword?: string;
  status?: MarketingLeadStatus;
  source?: string;
  ownerUserId?: string;
  fitLevel?: "LOW" | "MEDIUM" | "HIGH";
  engagementLevel?: "LOW" | "MEDIUM" | "HIGH";
  page: number;
  pageSize: number;
  orderBy: "createdAt_desc" | "createdAt_asc" | "updatedAt_desc" | "updatedAt_asc" | "lastActivityAt_desc" | "lastActivityAt_asc" | "fitScore_desc" | "engagementScoreCached_desc" | "fullName_asc";
  scopeUserId?: string;
};

const marketingLeadSummaryInclude = {
  owner: { select: crmUserSummarySelect },
  convertedBy: { select: crmUserSummarySelect },
  convertedOrganization: { select: { id: true, name: true, shortName: true, website: true } },
  convertedContact: { select: { id: true, contactName: true, email: true, phone: true } },
  convertedOpportunity: { select: { id: true, requirementSummary: true, status: true, deletedAt: true } },
} satisfies Prisma.MarketingLeadInclude;

const marketingLeadDetailInclude = {
  ...marketingLeadSummaryInclude,
  createdBy: { select: crmUserSummarySelect },
  activities: {
    include: { scoringRule: true, actor: { select: crmUserSummarySelect } },
    orderBy: [{ occurredAt: "desc" as const }, { id: "desc" as const }],
    take: 200,
  },
  scoreHistory: {
    include: { changedBy: { select: crmUserSummarySelect } },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: 200,
  },
  statusHistory: {
    include: { changedBy: { select: crmUserSummarySelect } },
    orderBy: [{ changedAt: "desc" as const }, { id: "desc" as const }],
    take: 200,
  },
} satisfies Prisma.MarketingLeadInclude;

function response<T extends { fitScore: number; engagementScoreCached: number; requirementTags: Prisma.JsonValue | null }>(row: T) {
  return {
    ...row,
    requirementTags: Array.isArray(row.requirementTags) ? row.requirementTags.filter((item): item is string => typeof item === "string") : [],
    fitLevel: leadScoreLevel(row.fitScore),
    engagementLevel: leadScoreLevel(row.engagementScoreCached),
    leadLevel: leadTemperature(row.fitScore, row.engagementScoreCached),
  };
}

function scopeWhere(scopeUserId?: string): Prisma.MarketingLeadWhereInput | undefined {
  return scopeUserId ? { OR: [{ ownerUserId: scopeUserId }, { createdByUserId: scopeUserId }] } : undefined;
}

async function requireMarketingLead(db: CrmDbClient, id: string, scopeUserId?: string) {
  const row = await db.marketingLead.findFirst({ where: { id, deletedAt: null, AND: scopeWhere(scopeUserId) } });
  if (!row) throw new ApiError(404, "RESOURCE_NOT_FOUND", "线索不存在或不在当前数据范围内");
  return row;
}

function orderBy(value: MarketingLeadListInput["orderBy"]): Prisma.MarketingLeadOrderByWithRelationInput[] {
  const [field, direction] = value.split("_") as ["createdAt" | "updatedAt" | "lastActivityAt" | "fitScore" | "engagementScoreCached" | "fullName", "asc" | "desc"];
  return [{ [field]: direction }, { id: direction }];
}

function levelRange(level?: "LOW" | "MEDIUM" | "HIGH") {
  return level === "LOW" ? { lte: 39 } : level === "MEDIUM" ? { gte: 40, lte: 69 } : level === "HIGH" ? { gte: 70 } : undefined;
}

function tags(value: Prisma.JsonValue | null | undefined): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string");
}

function jsonInput(value: string[] | null | undefined): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull | undefined {
  return value === undefined ? undefined : value === null ? Prisma.JsonNull : value;
}

async function maybePromoteToMql(
  db: CrmDbClient,
  config: AppConfig,
  id: string,
  actorUserId: string,
  audit: AuditActorContext,
) {
  const lead = await db.marketingLead.findUniqueOrThrow({ where: { id } });
  if (lead.status !== "NURTURING" || lead.fitScore < config.crmMqlMinFitScore || lead.engagementScoreCached < config.crmMqlMinEngagementScore) return lead;
  const now = new Date();
  const updated = await db.marketingLead.update({ where: { id }, data: { status: "MQL", mqlAt: lead.mqlAt ?? now } });
  await db.leadStatusHistory.create({ data: { marketingLeadId: id, fromStatus: lead.status, toStatus: "MQL", reason: `Automatic MQL: Fit >= ${config.crmMqlMinFitScore}, Engagement >= ${config.crmMqlMinEngagementScore}`, changedByUserId: actorUserId, changedAt: now } });
  await appendAuditRecord(db, audit, {
    action: "MARKETING_LEAD_AUTO_MQL",
    module: "crm_marketing",
    targetType: "marketing_lead",
    targetId: id,
    details: { fitScore: lead.fitScore, engagementScore: lead.engagementScoreCached, fitThreshold: config.crmMqlMinFitScore, engagementThreshold: config.crmMqlMinEngagementScore, mqlAt: now.toISOString() },
  });
  return updated;
}

export class MarketingLeadService {
  constructor(private readonly prisma: PrismaClient, private readonly config: AppConfig) {}

  async list(input: MarketingLeadListInput) {
    const where: Prisma.MarketingLeadWhereInput = {
      deletedAt: null,
      status: input.status,
      source: input.source,
      ownerUserId: input.ownerUserId,
      fitScore: levelRange(input.fitLevel),
      engagementScoreCached: levelRange(input.engagementLevel),
      AND: scopeWhere(input.scopeUserId),
    };
    if (input.keyword) where.OR = [
      { fullName: { contains: input.keyword } },
      { companyName: { contains: input.keyword } },
      { email: { contains: input.keyword } },
      { phone: { contains: input.keyword } },
      { whatsapp: { contains: input.keyword } },
      { wechat: { contains: input.keyword } },
      { inquiryContent: { contains: input.keyword } },
      { sourceDetail: { contains: input.keyword } },
    ];
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.marketingLead.count({ where }),
      this.prisma.marketingLead.findMany({ where, include: marketingLeadSummaryInclude, orderBy: orderBy(input.orderBy), skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
    ]);
    return { total, rows: rows.map(response) };
  }

  async duplicateCandidates(input: { email?: string | null; phone?: string | null; whatsapp?: string | null; countryCode?: string | null; excludeId?: string }) {
    const email = input.email?.trim().toLowerCase() || null;
    const phoneNormalized = normalizeInternationalPhone(input.phone, input.countryCode);
    const whatsappNormalized = normalizeInternationalPhone(input.whatsapp, input.countryCode);
    const OR: Prisma.MarketingLeadWhereInput[] = [
      ...(email ? [{ email }] : []),
      ...(phoneNormalized ? [{ phoneNormalized }] : []),
      ...(whatsappNormalized ? [{ whatsappNormalized }] : []),
    ];
    if (!OR.length) return [];
    return this.prisma.marketingLead.findMany({
      where: { deletedAt: null, id: input.excludeId ? { not: input.excludeId } : undefined, OR },
      select: { id: true, fullName: true, companyName: true, email: true, phone: true, whatsapp: true, status: true, source: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
    });
  }

  async create(input: MarketingLeadCreateInput | MarketingLeadImportInput, createdByUserId: string, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      await assertAssignableCrmUser(tx, input.ownerUserId, "ownerUserId");
      const now = new Date();
      const { requirementTags, ...fields } = input;
      const row = await tx.marketingLead.create({
        data: {
          ...fields,
          requirementTags: jsonInput(requirementTags),
          phoneNormalized: validatedPhone(input.phone, input.countryCode, "phone"),
          whatsappNormalized: validatedPhone(input.whatsapp, input.countryCode, "whatsapp"),
          companyDomain: websiteDomain(input.companyWebsite),
          assignedAt: input.ownerUserId ? now : null,
          firstTouchAt: input.firstTouchAt ?? now,
          createdByUserId,
        },
        include: marketingLeadSummaryInclude,
      });
      await tx.leadStatusHistory.create({ data: { marketingLeadId: row.id, fromStatus: null, toStatus: row.status, reason: "Marketing lead created", changedByUserId: createdByUserId, changedAt: row.createdAt } });
      if (row.fitScore !== 0) await tx.leadScoreHistory.create({ data: { marketingLeadId: row.id, dimension: "FIT", previousScore: 0, scoreDelta: row.fitScore, newScore: row.fitScore, reason: "Initial Fit score", changedByUserId: createdByUserId, createdAt: row.createdAt } });
      await appendAuditRecord(tx, audit, { action: "CREATE_MARKETING_LEAD", module: "crm_marketing", targetType: "marketing_lead", targetId: row.id, details: { source: row.source, status: row.status, ownerUserId: row.ownerUserId, fields: Object.keys(input) } });
      return response(row);
    });
  }

  async detail(id: string, scopeUserId?: string) {
    const row = await this.prisma.marketingLead.findFirst({ where: { id, deletedAt: null, AND: scopeWhere(scopeUserId) }, include: marketingLeadDetailInclude });
    if (!row) throw new ApiError(404, "RESOURCE_NOT_FOUND", "线索不存在或不在当前数据范围内");
    return response(row);
  }

  async update(id: string, input: MarketingLeadPatchInput, actorUserId: string, audit: AuditActorContext, options: { scopeUserId?: string; superAdmin?: boolean } = {}) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await requireMarketingLead(tx, id, options.scopeUserId);
      if (existing.status === "CONVERTED" && !options.superAdmin) throw new ApiError(409, "CONVERTED_LEAD_READ_ONLY", "已转商机的线索为只读记录");
      if (input.ownerUserId !== undefined) await assertAssignableCrmUser(tx, input.ownerUserId as string | null, "ownerUserId");
      const country = input.countryCode === undefined ? existing.countryCode : input.countryCode as string | null;
      const { requirementTags, ...fields } = input;
      const row = await tx.marketingLead.update({
        where: { id },
        data: {
          ...fields,
          requirementTags: jsonInput(requirementTags),
          phoneNormalized: input.phone === undefined ? undefined : validatedPhone(input.phone as string | null, country, "phone"),
          whatsappNormalized: input.whatsapp === undefined ? undefined : validatedPhone(input.whatsapp as string | null, country, "whatsapp"),
          companyDomain: input.companyWebsite === undefined ? undefined : websiteDomain(input.companyWebsite as string | null),
          assignedAt: input.ownerUserId === undefined ? undefined : input.ownerUserId ? new Date() : null,
        },
      });
      if (input.fitScore !== undefined && input.fitScore !== existing.fitScore) {
        await tx.leadScoreHistory.create({ data: { marketingLeadId: id, dimension: "FIT", previousScore: existing.fitScore, scoreDelta: input.fitScore - existing.fitScore, newScore: input.fitScore, reason: input.fitReason as string | null ?? "Manual Fit score update", changedByUserId: actorUserId } });
      }
      await appendAuditRecord(tx, audit, {
        action: existing.status === "CONVERTED" ? "CORRECT_CONVERTED_MARKETING_LEAD" : "UPDATE_MARKETING_LEAD",
        module: "crm_marketing",
        targetType: "marketing_lead",
        targetId: id,
        details: { changedFields: Object.keys(input), ownerChange: input.ownerUserId === undefined ? undefined : { from: existing.ownerUserId, to: input.ownerUserId }, fitChange: input.fitScore === undefined ? undefined : { from: existing.fitScore, to: input.fitScore } },
      });
      await maybePromoteToMql(tx, this.config, id, actorUserId, audit);
      const refreshed = await tx.marketingLead.findUniqueOrThrow({ where: { id }, include: marketingLeadDetailInclude });
      return response(refreshed);
    });
  }

  async remove(id: string, actorUserId: string, audit: AuditActorContext, options: { scopeUserId?: string; superAdmin?: boolean } = {}) {
    return this.prisma.$transaction(async (tx) => {
      const lead = await requireMarketingLead(tx, id, options.scopeUserId);
      if (lead.status === "CONVERTED" && !options.superAdmin) throw new ApiError(409, "CONVERTED_LEAD_DELETE_FORBIDDEN", "已转商机的线索不能由普通用户删除");
      const deletedAt = new Date();
      await tx.marketingLead.update({ where: { id }, data: { deletedAt, deletedByUserId: actorUserId } });
      await appendAuditRecord(tx, audit, { action: "DELETE_MARKETING_LEAD", module: "crm_marketing", targetType: "marketing_lead", targetId: id, details: { status: lead.status, softDelete: true, deletedAt: deletedAt.toISOString() } });
      return { id };
    });
  }

  async addActivity(id: string, input: MarketingLeadActivityCreateInput, actorUserId: string, audit: AuditActorContext, scopeUserId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const lead = await requireMarketingLead(tx, id, scopeUserId);
      if (lead.status === "CONVERTED") throw new ApiError(409, "CONVERTED_LEAD_READ_ONLY", "已转商机的线索不能再记录营销行为");
      const rule = await tx.leadScoringRule.findUnique({ where: { code: input.ruleCode } });
      if (!rule || !rule.enabled) throw new ApiError(422, "SCORING_RULE_UNAVAILABLE", "评分规则不存在或已停用");
      const priorCount = await tx.leadActivityEvent.count({ where: { marketingLeadId: id, scoringRuleId: rule.id } });
      if (!rule.repeatable && priorCount > 0) throw new ApiError(409, "SCORING_RULE_NOT_REPEATABLE", "该行为只能记录一次");
      if (rule.maxOccurrences !== null && priorCount >= rule.maxOccurrences) throw new ApiError(409, "SCORING_RULE_MAX_OCCURRENCES", "该行为已达到最大记录次数");
      const occurredAt = input.occurredAt ?? new Date();
      if (rule.cooldownHours !== null) {
        const latest = await tx.leadActivityEvent.findFirst({ where: { marketingLeadId: id, scoringRuleId: rule.id }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] });
        if (latest && occurredAt.getTime() - latest.occurredAt.getTime() < rule.cooldownHours * 3_600_000) {
          throw new ApiError(409, "SCORING_RULE_COOLDOWN", "该行为仍在冷却时间内", { nextAllowedAt: new Date(latest.occurredAt.getTime() + rule.cooldownHours * 3_600_000).toISOString() });
        }
      }
      const engagementDelta = rule.scoreDimension === "ENGAGEMENT" ? rule.scoreDelta : 0;
      const fitDelta = rule.scoreDimension === "FIT" ? rule.scoreDelta : 0;
      const newEngagement = clampLeadScore(lead.engagementScoreCached + engagementDelta);
      const newFit = clampLeadScore(lead.fitScore + fitDelta);
      const event = await tx.leadActivityEvent.create({
        data: { marketingLeadId: id, scoringRuleId: rule.id, eventType: rule.code, source: input.source, occurredAt, actorUserId, note: input.note, engagementDeltaSnapshot: engagementDelta, fitDeltaSnapshot: fitDelta },
        include: { scoringRule: true, actor: { select: crmUserSummarySelect } },
      });
      if (newEngagement !== lead.engagementScoreCached) await tx.leadScoreHistory.create({ data: { marketingLeadId: id, activityEventId: event.id, dimension: "ENGAGEMENT", previousScore: lead.engagementScoreCached, scoreDelta: newEngagement - lead.engagementScoreCached, newScore: newEngagement, reason: rule.code, changedByUserId: actorUserId } });
      if (newFit !== lead.fitScore) await tx.leadScoreHistory.create({ data: { marketingLeadId: id, activityEventId: event.id, dimension: "FIT", previousScore: lead.fitScore, scoreDelta: newFit - lead.fitScore, newScore: newFit, reason: rule.code, changedByUserId: actorUserId } });
      await tx.marketingLead.update({ where: { id }, data: { engagementScoreCached: newEngagement, engagementScoreCalculatedAt: new Date(), fitScore: newFit, lastActivityAt: occurredAt > (lead.lastActivityAt ?? new Date(0)) ? occurredAt : undefined } });
      await appendAuditRecord(tx, audit, { action: "CREATE_MARKETING_LEAD_ACTIVITY", module: "crm_marketing", targetType: "lead_activity_event", targetId: event.id, details: { marketingLeadId: id, ruleCode: rule.code, source: input.source, engagementDeltaSnapshot: engagementDelta, fitDeltaSnapshot: fitDelta, engagementScore: newEngagement, fitScore: newFit, occurredAt: occurredAt.toISOString() } });
      await maybePromoteToMql(tx, this.config, id, actorUserId, audit);
      const refreshed = await tx.marketingLead.findUniqueOrThrow({ where: { id }, include: marketingLeadDetailInclude });
      return { activity: event, lead: response(refreshed) };
    });
  }

  async transition(id: string, input: MarketingLeadTransitionInput, actorUserId: string, audit: AuditActorContext, scopeUserId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const lead = await requireMarketingLead(tx, id, scopeUserId);
      if (lead.status === "CONVERTED") throw new ApiError(409, "CONVERTED_LEAD_READ_ONLY", "已转商机的线索不能再修改状态");
      const target: Record<MarketingLeadTransitionInput["action"], MarketingLeadStatus> = { START_NURTURING: "NURTURING", ACCEPT_SQL: "SQL", RECYCLE: "RECYCLED", QUALIFY: "QUALIFIED", DISQUALIFY: "DISQUALIFIED" };
      const allowed: Record<MarketingLeadTransitionInput["action"], MarketingLeadStatus[]> = {
        START_NURTURING: ["NEW", "RECYCLED"],
        ACCEPT_SQL: ["MQL"],
        RECYCLE: ["MQL", "SQL", "QUALIFIED"],
        QUALIFY: ["SQL"],
        DISQUALIFY: ["NEW", "NURTURING", "MQL", "SQL", "QUALIFIED", "RECYCLED"],
      };
      if (!allowed[input.action].includes(lead.status)) throw new ApiError(409, "INVALID_MARKETING_LEAD_TRANSITION", `当前状态 ${lead.status} 不能执行 ${input.action}`);
      const next = target[input.action];
      const now = new Date();
      const updated = await tx.marketingLead.update({
        where: { id },
        data: {
          status: next,
          sqlAt: next === "SQL" ? lead.sqlAt ?? now : undefined,
          qualifiedAt: next === "QUALIFIED" ? lead.qualifiedAt ?? now : undefined,
          recycledAt: next === "RECYCLED" ? now : undefined,
          disqualifiedAt: next === "DISQUALIFIED" ? now : undefined,
          disqualifiedReason: next === "DISQUALIFIED" ? input.reason : undefined,
          firstSalesResponseAt: next === "SQL" ? lead.firstSalesResponseAt ?? now : undefined,
        },
      });
      await tx.leadStatusHistory.create({ data: { marketingLeadId: id, fromStatus: lead.status, toStatus: next, reason: input.reason ?? input.action, changedByUserId: actorUserId, changedAt: now } });
      await appendAuditRecord(tx, audit, { action: `MARKETING_LEAD_${input.action}`, module: "crm_marketing", targetType: "marketing_lead", targetId: id, details: { fromStatus: lead.status, toStatus: next, changedAt: now.toISOString(), hasReason: Boolean(input.reason) } });
      if (next === "NURTURING") await maybePromoteToMql(tx, this.config, id, actorUserId, audit);
      const refreshed = await tx.marketingLead.findUniqueOrThrow({ where: { id }, include: marketingLeadDetailInclude });
      return response(refreshed);
    });
  }

  async conversionPreview(id: string, scopeUserId?: string) {
    const lead = await requireMarketingLead(this.prisma, id, scopeUserId);
    const normalizedName = lead.companyName ? normalizeOrganizationName(lead.companyName) : null;
    const domain = lead.companyDomain ?? websiteDomain(lead.companyWebsite);
    const organizationCandidates = await this.prisma.organization.findMany({
      where: {
        deletedAt: null,
        OR: [
          ...(domain ? [{ websiteDomain: domain }] : []),
          ...(normalizedName ? [{ normalizedName }] : []),
          ...(normalizedName ? [{ normalizedName: { contains: normalizedName } }] : []),
        ],
      },
      select: { id: true, name: true, shortName: true, website: true, websiteDomain: true, industry: true, countryCode: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 10,
    });
    const organizationMatches = organizationCandidates.map((row) => ({
      ...row,
      matchType: domain && row.websiteDomain === domain ? "DOMAIN_EXACT" : normalizedName && row.name && normalizeOrganizationName(row.name) === normalizedName ? "NAME_EXACT" : "NAME_SIMILAR",
      autoMerge: false,
    })).sort((a, b) => ["DOMAIN_EXACT", "NAME_EXACT", "NAME_SIMILAR"].indexOf(a.matchType) - ["DOMAIN_EXACT", "NAME_EXACT", "NAME_SIMILAR"].indexOf(b.matchType));
    const email = lead.email?.toLowerCase() ?? null;
    const contactOr: Prisma.ContactWhereInput[] = [
      ...(email ? [{ email }] : []),
      ...(lead.phoneNormalized ? [{ phoneNormalized: lead.phoneNormalized }] : []),
      ...(lead.phone ? [{ phone: lead.phone }] : []),
      ...(lead.whatsappNormalized ? [{ whatsappNormalized: lead.whatsappNormalized }] : []),
      ...(lead.whatsapp ? [{ whatsapp: lead.whatsapp }] : []),
      ...(lead.wechat ? [{ wechat: lead.wechat }] : []),
      { contactName: lead.fullName },
    ];
    const contacts = await this.prisma.contact.findMany({
      where: { deletedAt: null, OR: contactOr },
      select: { id: true, contactName: true, email: true, phone: true, phoneNormalized: true, whatsapp: true, whatsappNormalized: true, wechat: true, organizationId: true, organization: { select: { id: true, name: true, shortName: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 20,
    });
    const organizationIds = new Set(organizationMatches.map((item) => item.id));
    const contactMatches = contacts.map((row) => ({
      ...row,
      matchType: email && row.email?.toLowerCase() === email ? "EMAIL_EXACT" : lead.phoneNormalized && row.phoneNormalized === lead.phoneNormalized ? "PHONE_EXACT" : lead.whatsappNormalized && row.whatsappNormalized === lead.whatsappNormalized ? "WHATSAPP_EXACT" : lead.wechat && row.wechat === lead.wechat ? "WECHAT_EXACT" : row.contactName === lead.fullName && row.organizationId && organizationIds.has(row.organizationId) ? "NAME_COMPANY_WARNING" : "NAME_WARNING",
      autoMerge: false,
    })).sort((a, b) => ["EMAIL_EXACT", "PHONE_EXACT", "WHATSAPP_EXACT", "WECHAT_EXACT", "NAME_COMPANY_WARNING", "NAME_WARNING"].indexOf(a.matchType) - ["EMAIL_EXACT", "PHONE_EXACT", "WHATSAPP_EXACT", "WECHAT_EXACT", "NAME_COMPANY_WARNING", "NAME_WARNING"].indexOf(b.matchType));
    const defaultSummary = (lead.inquiryType || lead.productInterest || `${lead.companyName || lead.fullName} 业务机会`).slice(0, 200);
    return {
      lead: response(lead),
      organizationMatches,
      contactMatches,
      suggestedOpportunity: { requirementSummary: defaultSummary, requirementDetail: lead.inquiryContent, requirementContext: lead.inquiryType, productInterest: lead.productInterest, requirementTags: tags(lead.requirementTags) ?? [], priority: "MEDIUM", status: "NEW", salesOwnerUserId: lead.ownerUserId },
    };
  }

  async convert(id: string, input: MarketingLeadConversionInput, actorUserId: string, audit: AuditActorContext, options: { scopeUserId?: string; superAdmin?: boolean } = {}) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const lead = await requireMarketingLead(tx, id, options.scopeUserId);
        if (lead.status === "CONVERTED" && lead.convertedOpportunityId) {
          return { idempotent: true, marketingLeadId: id, organizationId: lead.convertedOrganizationId, contactId: lead.convertedContactId, opportunityId: lead.convertedOpportunityId };
        }
        if (lead.status !== "QUALIFIED" && !(options.superAdmin && input.overrideQualification)) {
          throw new ApiError(409, "MARKETING_LEAD_NOT_QUALIFIED", "只有已确认机会的线索可以转为商机");
        }
        await Promise.all([
          assertAssignableCrmUser(tx, input.opportunity.salesOwnerUserId, "opportunity.salesOwnerUserId"),
          assertAssignableCrmUser(tx, input.opportunity.followupOwnerUserId, "opportunity.followupOwnerUserId"),
        ]);

        let organization: { id: string; name: string; shortName: string | null; website: string | null; industry: string | null; country: string | null; countryCode: string | null; region: string | null; city: string | null } | null = null;
        if (input.organization.mode === "existing") {
          organization = await tx.organization.findFirst({ where: { id: input.organization.id, deletedAt: null }, select: { id: true, name: true, shortName: true, website: true, industry: true, country: true, countryCode: true, region: true, city: true } });
          if (!organization) throw new ApiError(422, "CONVERSION_ORGANIZATION_NOT_FOUND", "选择的公司不存在");
        } else if (input.organization.mode === "create") {
          const data = input.organization.createData;
          organization = await tx.organization.create({
            data: { ...data, normalizedName: normalizeOrganizationName(data.name), websiteDomain: websiteDomain(data.website), ownerUserId: lead.ownerUserId, createdByUserId: actorUserId, roles: { create: { role: "PROSPECT" } }, lifecycleHistory: { create: { fromStage: null, toStage: "TARGET", reason: "Created during Marketing Lead conversion", changedByUserId: actorUserId } } },
            select: { id: true, name: true, shortName: true, website: true, industry: true, country: true, countryCode: true, region: true, city: true },
          });
        }

        let contact: { id: string; organizationId: string | null };
        if (input.contact.mode === "existing") {
          const found = await tx.contact.findFirst({ where: { id: input.contact.id, deletedAt: null }, select: { id: true, organizationId: true } });
          if (!found) throw new ApiError(422, "CONVERSION_CONTACT_NOT_FOUND", "选择的联系人不存在");
          if (found.organizationId && organization && found.organizationId !== organization.id) throw new ApiError(409, "CONVERSION_CONTACT_ORGANIZATION_CONFLICT", "联系人已关联其他公司，请重新确认匹配结果");
          if (!organization && found.organizationId) {
            organization = await tx.organization.findFirst({ where: { id: found.organizationId, deletedAt: null }, select: { id: true, name: true, shortName: true, website: true, industry: true, country: true, countryCode: true, region: true, city: true } });
          }
          if (!found.organizationId && organization) {
            await tx.contact.update({ where: { id: found.id }, data: { organizationId: organization.id, companyName: organization.name, companyShortName: organization.shortName, website: organization.website, industry: organization.industry, country: organization.country, region: organization.region, city: organization.city } });
          }
          contact = { id: found.id, organizationId: found.organizationId ?? organization?.id ?? null };
        } else {
          const data = input.contact.createData;
          const phone = data.phone ?? lead.phone;
          const whatsapp = data.whatsapp ?? lead.whatsapp;
          contact = await tx.contact.create({
            data: {
              contactName: data.contactName,
              email: data.email ?? lead.email,
              phone,
              phoneNormalized: validatedPhone(phone, lead.countryCode, "contact.phone"),
              whatsapp,
              whatsappNormalized: validatedPhone(whatsapp, lead.countryCode, "contact.whatsapp"),
              wechat: data.wechat ?? lead.wechat,
              linkedin: data.linkedin ?? lead.linkedinUrl,
              title: data.title ?? lead.title,
              department: data.department ?? lead.department,
              organizationId: organization?.id,
              companyName: organization?.name ?? lead.companyName,
              companyShortName: organization?.shortName,
              website: organization?.website ?? lead.companyWebsite,
              industry: organization?.industry ?? lead.industry,
              country: organization?.country,
              region: organization?.region ?? lead.region,
              city: organization?.city ?? lead.city,
              ownerUserId: lead.ownerUserId ?? input.opportunity.salesOwnerUserId,
              source: `Marketing Lead / ${lead.source}`,
              initialContext: "Created from Marketing Lead conversion",
              createdByUserId: actorUserId,
            },
            select: { id: true, organizationId: true },
          });
        }

        const opportunity = await tx.crmLead.create({
          data: {
            contactId: contact.id,
            sourceMarketingLeadId: lead.id,
            requirementSummary: input.opportunity.requirementSummary,
            requirementDetail: input.opportunity.requirementDetail ?? lead.inquiryContent,
            requirementContext: input.opportunity.requirementContext ?? lead.inquiryType,
            productInterest: input.opportunity.productInterest ?? lead.productInterest,
            requirementTags: jsonInput(input.opportunity.requirementTags ?? tags(lead.requirementTags)),
            priority: input.opportunity.priority,
            status: input.opportunity.status,
            salesOwnerUserId: input.opportunity.salesOwnerUserId,
            followupOwnerUserId: input.opportunity.followupOwnerUserId,
            remark: input.opportunity.conversionNote,
            createdByUserId: actorUserId,
          },
          include: crmLeadDetailInclude,
        });
        await tx.leadStageHistory.create({ data: { leadId: opportunity.id, fromStatus: null, toStatus: opportunity.status, changedByUserId: actorUserId, changedAt: opportunity.createdAt } });
        if (organization) await transitionOrganizationLifecycle(tx, organization.id, "OPPORTUNITY", actorUserId, "Marketing Lead converted to Opportunity", { automatic: true });
        const convertedAt = new Date();
        await tx.marketingLead.update({ where: { id }, data: { status: "CONVERTED", convertedOrganizationId: organization?.id ?? null, convertedContactId: contact.id, convertedOpportunityId: opportunity.id, convertedByUserId: actorUserId, convertedAt } });
        await tx.leadStatusHistory.create({ data: { marketingLeadId: id, fromStatus: lead.status, toStatus: "CONVERTED", reason: options.superAdmin && input.overrideQualification ? "Super Admin conversion override" : "Converted to Opportunity", changedByUserId: actorUserId, changedAt: convertedAt } });
        await appendAuditRecord(tx, audit, {
          action: "CONVERT_MARKETING_LEAD",
          module: "crm_marketing",
          targetType: "marketing_lead",
          targetId: id,
          details: { marketingLeadId: id, organizationId: organization?.id ?? null, contactId: contact.id, opportunityId: opportunity.id, convertedBy: actorUserId, convertedAt: convertedAt.toISOString(), organizationMode: input.organization.mode, contactMode: input.contact.mode, qualificationOverride: Boolean(options.superAdmin && input.overrideQualification) },
        });
        return { idempotent: false, marketingLeadId: id, organizationId: organization?.id ?? null, contactId: contact.id, opportunityId: opportunity.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const lead = await this.prisma.marketingLead.findUnique({ where: { id }, select: { status: true, convertedOrganizationId: true, convertedContactId: true, convertedOpportunityId: true } });
        if (lead?.status === "CONVERTED" && lead.convertedOpportunityId) return { idempotent: true, marketingLeadId: id, organizationId: lead.convertedOrganizationId, contactId: lead.convertedContactId, opportunityId: lead.convertedOpportunityId };
      }
      throw error;
    }
  }
}

export class LeadScoringRuleService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(includeDisabled = false) {
    return this.prisma.leadScoringRule.findMany({ where: includeDisabled ? undefined : { enabled: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
  }

  async create(input: ScoringRuleCreateInput, audit: AuditActorContext) {
    const row = await this.prisma.leadScoringRule.create({ data: input });
    await appendAuditRecord(this.prisma, audit, { action: "CREATE_LEAD_SCORING_RULE", module: "crm_marketing", targetType: "lead_scoring_rule", targetId: row.id, details: { code: row.code, category: row.category, dimension: row.scoreDimension, scoreDelta: row.scoreDelta } });
    return row;
  }

  async update(id: string, input: ScoringRulePatchInput, audit: AuditActorContext) {
    const existing = await this.prisma.leadScoringRule.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "RESOURCE_NOT_FOUND", "评分规则不存在");
    const repeatable = input.repeatable ?? existing.repeatable;
    const maxOccurrences = input.maxOccurrences === undefined ? existing.maxOccurrences : input.maxOccurrences;
    if (!repeatable && maxOccurrences !== null && maxOccurrences > 1) {
      throw new ApiError(422, "INVALID_SCORING_RULE", "不可重复规则最多只能发生一次");
    }
    const row = await this.prisma.leadScoringRule.update({ where: { id }, data: input });
    await appendAuditRecord(this.prisma, audit, { action: "UPDATE_LEAD_SCORING_RULE", module: "crm_marketing", targetType: "lead_scoring_rule", targetId: id, details: { code: row.code, changedFields: Object.keys(input), scoreChange: input.scoreDelta === undefined ? undefined : { from: existing.scoreDelta, to: input.scoreDelta } } });
    return row;
  }
}
