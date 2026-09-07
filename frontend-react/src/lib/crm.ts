import { useCallback, useEffect, useState } from "react";
import { ApiError, crmApi, type CrmUser, type SessionUser } from "./api";

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
  country?: string;
  region?: string;
  city?: string;
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
export const roleLabels: Record<string, string> = {
  PROSPECT: "潜在客户",
  CUSTOMER: "客户",
  VENDOR: "供应商",
  PARTNER: "合作伙伴",
};
export const lifecycleLabels: Record<string, string> = {
  TARGET: "目标",
  CONTACTED: "已触达",
  NURTURING: "孵化中",
  OPPORTUNITY: "机会中",
  CUSTOMER: "客户",
  DISQUALIFIED: "不合格",
};
export const stageLabels: Record<string, string> = {
  NEW: "新建",
  QUALIFIED: "已确认",
  SOLUTION: "方案",
  QUOTATION: "报价",
  WON: "成交",
  LOST: "丢失",
  INITIAL: "初筛",
  ONE_TO_ONE: "1v1",
  CONVENTION: "Convention",
};
export const levelLabels: Record<string, string> = {
  HIGH: "高",
  MEDIUM: "中",
  LOW: "低",
};
export const engagementLabels: Record<string, string> = {
  ACTIVE: "活跃",
  COOLING: "降温",
  DORMANT: "沉睡",
};
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
  if (
    error instanceof ApiError &&
    error.status < 500 &&
    ![401, 403].includes(error.status)
  )
    return error.message;
  if (error instanceof ApiError && error.status === 403)
    return "当前账号没有此操作权限。";
  if (error instanceof ApiError && error.status === 401)
    return "登录已过期，请重新登录。";
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
