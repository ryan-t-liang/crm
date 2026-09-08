import { useCallback, useEffect, useState } from "react";
import { ApiError, crmApi, type CrmUser, type SessionUser } from "./api";
import {
  contactTypeLabels,
  engagementStateLabels,
  opportunityStageLabels,
  organizationLifecycleLabels,
  organizationRoleLabels,
  priorityLabels,
} from "./product-language";

export type PageResult<T> = {
  data: T[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
};
export type Attachment = {
  id: string;
  entityId: string;
  entityType: string;
  fieldKey: string;
  originalName: string;
  kind: string;
  fileSize: number | null;
  createdAt: string;
  uploadedBy?: CrmUser;
};
export type Contact = {
  id: string;
  contactName: string;
  contactType: "BUSINESS" | "INDIVIDUAL";
  title?: string;
  email?: string;
  phone?: string;
  stage: string;
  organizationId?: string;
  companyName?: string;
  companyShortName?: string;
  organization?: { id: string; name: string; shortName?: string };
  source?: string;
  relatedLeadCount?: number;
  nextFollowupAt?: string;
  lastFollowupAt?: string;
  updatedAt?: string;
  attachments?: Attachment[];
  owner?: CrmUser;
  _count?: { leads: number };
};
export type Lead = {
  id: string;
  requirementSummary: string;
  status: string;
  priority: string;
  contactId: string;
  contact?: Contact;
  salesOwner?: CrmUser;
  followupOwner?: CrmUser;
  latestProgress?: string;
  lastFollowupAt?: string;
  updatedAt?: string;
  attachments?: Attachment[];
  nextAction?: string;
  nextFollowupAt?: string;
  requirementDetail?: string;
  requirementContext?: string;
  productInterest?: string;
  requirementTags?: string[];
  sourceMarketingLeadId?: string;
  sourceMarketingLead?: {
    id: string;
    fullName: string;
    companyName?: string;
    source: string;
    sourceChannel?: string;
    sourceDetail?: string;
    inquiryContent?: string;
    convertedAt?: string;
  };
};
export type MarketingLeadStatus = "NEW" | "NURTURING" | "MQL" | "SQL" | "QUALIFIED" | "CONVERTED" | "RECYCLED" | "DISQUALIFIED";
export type MarketingLead = {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  phoneNormalized?: string;
  whatsapp?: string;
  whatsappNormalized?: string;
  wechat?: string;
  linkedinUrl?: string;
  title?: string;
  department?: string;
  companyName?: string;
  companyWebsite?: string;
  companySize?: string;
  industry?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  inquiryType?: string;
  inquiryContent?: string;
  productInterest?: string;
  requirementTags: string[];
  budgetRange?: string;
  note?: string;
  source: string;
  sourceChannel?: string;
  sourceDetail?: string;
  firstTouchAt?: string;
  status: MarketingLeadStatus;
  ownerUserId?: string;
  owner?: CrmUser;
  assignedAt?: string;
  mqlAt?: string;
  sqlAt?: string;
  qualifiedAt?: string;
  recycledAt?: string;
  convertedAt?: string;
  disqualifiedAt?: string;
  disqualifiedReason?: string;
  fitScore: number;
  fitReason?: string;
  fitLevel: "LOW" | "MEDIUM" | "HIGH";
  engagementScoreCached: number;
  engagementScoreCalculatedAt?: string;
  engagementLevel: "LOW" | "MEDIUM" | "HIGH";
  leadLevel: "COLD" | "WARM" | "HOT";
  lastActivityAt?: string;
  firstSalesResponseAt?: string;
  convertedOrganizationId?: string;
  convertedContactId?: string;
  convertedOpportunityId?: string;
  convertedByUserId?: string;
  convertedBy?: CrmUser;
  convertedOrganization?: { id: string; name: string; shortName?: string; website?: string };
  convertedContact?: { id: string; contactName: string; email?: string; phone?: string };
  convertedOpportunity?: { id: string; requirementSummary: string; status: string; deletedAt?: string };
  createdBy?: CrmUser;
  createdAt: string;
  updatedAt: string;
  activities?: MarketingLeadActivity[];
  scoreHistory?: MarketingLeadScoreHistory[];
  statusHistory?: MarketingLeadStatusHistory[];
};
export type MarketingLeadActivity = {
  id: string;
  eventType: string;
  source: string;
  occurredAt: string;
  note?: string;
  engagementDeltaSnapshot: number;
  fitDeltaSnapshot: number;
  scoringRule?: LeadScoringRule;
  actor?: CrmUser;
};
export type MarketingLeadScoreHistory = {
  id: string;
  dimension: "FIT" | "ENGAGEMENT";
  previousScore: number;
  scoreDelta: number;
  newScore: number;
  reason?: string;
  createdAt: string;
  changedBy?: CrmUser;
};
export type MarketingLeadStatusHistory = {
  id: string;
  fromStatus?: MarketingLeadStatus;
  toStatus: MarketingLeadStatus;
  reason?: string;
  changedAt: string;
  changedBy?: CrmUser;
};
export type LeadScoringRule = {
  id: string;
  code: string;
  name: string;
  category: string;
  scoreDimension: "FIT" | "ENGAGEMENT";
  scoreDelta: number;
  repeatable: boolean;
  maxOccurrences?: number;
  cooldownHours?: number;
  enabled: boolean;
  sortOrder: number;
  description?: string;
};
export type Task = {
  id: string;
  title: string;
  description?: string;
  dueAt: string;
  status: string;
  priority: string;
  ownerUserId: string;
  owner?: CrmUser;
  organizationId?: string;
  contactId?: string;
  leadId?: string;
  organization?: { id: string; name: string };
  contact?: Contact;
  lead?: Lead;
};
export type Nurture = {
  id: string;
  organizationId: string;
  ownerUserId: string;
  owner?: CrmUser;
  reason: string;
  objective: string;
  cadenceDays: number;
  nextTouchAt: string;
  touchTopic: string;
  status: string;
};
export type Organization = {
  id: string;
  name: string;
  shortName?: string;
  website?: string;
  industry?: string;
  industryCode?: string;
  industryCustom?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  regionCode?: string;
  city?: string;
  cityCode?: string;
  cityCustom?: string;
  note?: string;
  ownerUserId?: string;
  owner?: CrmUser;
  roleKeys: string[];
  lifecycleStage: string;
  fitScore: number;
  fitReason?: string;
  fitLevel: string;
  engagementScore: number;
  engagementLevel: string;
  engagementState: string;
  engagementBreakdown: { key: string; label: string; points: number }[];
  dormantDays: number | null;
  contactCount: number;
  activeLeadCount: number;
  wonLeadCount: number;
  lastInteractionAt: string | null;
  nextActionAt: string | null;
  nextTask?: Task;
  logo?: Attachment;
  updatedAt: string;
  createdAt: string;
  contacts: Contact[];
  leads: Lead[];
  tasks: Task[];
  nurtures: Nurture[];
  files: Attachment[];
};
export type JourneyEvent = {
  id: string;
  occurredAt: string;
  type: string;
  title: string;
  summary: string;
  actor?: CrmUser;
  relatedContactId?: string;
  relatedLeadId?: string;
  relatedLead?: {
    id: string;
    requirementSummary: string;
    deleted?: boolean;
  } | null;
  progress?: string;
  nextAction?: string;
  nextFollowupAt?: string;
  attachments?: Attachment[];
};
export const roleLabels = organizationRoleLabels;
export function businessRelationText(roleKeys: string[]): string {
  const labels = [
    ...(roleKeys.some((role) => role === "PROSPECT" || role === "CUSTOMER") ? ["客户"] : []),
    ...(roleKeys.includes("VENDOR") ? ["供应商"] : []),
    ...(roleKeys.includes("PARTNER") ? ["合作伙伴"] : []),
  ];
  return labels.join(" · ") || "—";
}
export const lifecycleLabels = organizationLifecycleLabels;
export const stageLabels: Record<string, string> = {
  ...opportunityStageLabels,
  ...contactTypeLabels,
};
export const levelLabels = priorityLabels;
export const engagementLabels = engagementStateLabels;
export function can(me: SessionUser, permission: string) {
  return me.permissions.includes(permission);
}
export function canManageTask(me: SessionUser, task: Task, permission: string) {
  return (
    can(me, permission) &&
    (me.role.key === "SUPER_ADMIN" || task.ownerUserId === me.id)
  );
}
export function queryString(
  input: Record<string, string | number | undefined>,
) {
  return new URLSearchParams(
    Object.entries(input)
      .filter(([, v]) => v !== undefined && v !== "" && v !== "all")
      .map(([k, v]) => [k, String(v)]),
  ).toString();
}
export function dateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
}
export function relativeDate(value?: string | null) {
  if (!value) return "暂无互动";
  const days = Math.floor((Date.now() - Date.parse(value)) / 86400000);
  return days < 0
    ? dateTime(value)
    : days === 0
      ? "今天"
      : days === 1
        ? "昨天"
        : `${days} 天前`;
}
export function localInput(value: string | Date = new Date()) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function friendlyError(error: unknown) {
  if (error instanceof ApiError && error.status === 403)
    return "当前账号没有此操作权限。";
  if (error instanceof ApiError && error.status === 401)
    return "登录已过期，请重新登录。";
  if (error instanceof ApiError && error.status < 500) {
    const detail = Array.isArray(error.details)
      ? error.details.find((item) => item && typeof item === "object" && "message" in item)
      : null;
    const message = detail && typeof detail === "object" && "message" in detail
      ? String(detail.message)
      : error.message;
    if (/Validation failed|Invalid enum|ZodError|Bad Request|Request data validation failed|Prisma|SQL|Stack Trace|Internal Server Error/i.test(message))
      return "提交内容有误，请检查标记字段后重试。";
    return message || "提交内容有误，请检查后重试。";
  }
  return "暂时无法完成请求，请稍后重试。";
}
export function useResource<T>(path: string | null) {
  const [resource, setResource] = useState<{
    path: string | null;
    data: T | null;
  }>({ path: null, data: null });
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setLoading(Boolean(path));
    if (path)
      void crmApi<T>(path, { signal: controller.signal })
        .then((value) => {
          if (!controller.signal.aborted) setResource({ path, data: value });
        })
        .catch((reason) => {
          if (!controller.signal.aborted) setError(reason);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    return () => controller.abort();
  }, [path, version]);
  const data = resource.path === path ? resource.data : null;
  return {
    data,
    error,
    loading: loading && !data,
    refreshing: loading,
    reload,
  };
}

export const migratedRoutes = new Set([
  "dashboard",
  "marketing-leads",
  "scoring-rules",
  "organizations",
  "contacts",
  "leads",
  "operations",
  "workbench",
  "suppliers",
  "vendors",
  "accounts",
  "roles",
  "audit",
  "login",
  "security",
]);
export function routeHref(route: string) {
  return `#${route}`;
}
