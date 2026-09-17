import type { CrmState, DemoUser, Lead, Deal, CrmTask } from "@/types/crm";
import type { MemberOperationsState, MemberBrandScope, SowindBrandCode, SowindBrandUser, SowindCustomer, SowindPurchaseIntent } from "@/types/member-operations";

export const DAY = 86_400_000;
const OFFSET = 8 * 3_600_000;
export type PeriodPreset = "today" | "7" | "30" | "month" | "quarter" | "custom";
export interface DateRange { start: number; end: number; now: number; label: string }
export interface RangeResult { range?: DateRange; error?: string }
export function shanghaiDate(time: number): string { return new Date(time + OFFSET).toISOString().slice(0, 10); }
export function dayStart(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(`${value}T00:00:00+08:00`);
  return Number.isFinite(time) && shanghaiDate(time) === value ? time : NaN;
}
/** Offset-less SQL DATETIME is interpreted in Asia/Shanghai, never in the browser timezone. */
export function parseCreatedAt(value: unknown): number {
  if (typeof value !== "string") return NaN;
  const date = value.slice(0, 10);
  if (!Number.isFinite(dayStart(date))) return NaN;
  const clock = value.match(/[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (clock && (Number(clock[1]) > 23 || Number(clock[2]) > 59 || Number(clock[3] ?? 0) > 59)) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return dayStart(value);
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) return Date.parse(`${value.replace(" ", "T")}+08:00`);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return Date.parse(value);
  return NaN;
}
export function resolveRange(preset: PeriodPreset, now: number, from = "", to = ""): RangeResult {
  const today = shanghaiDate(now);
  const todayStart = dayStart(today);
  let start = todayStart;
  let end = todayStart + DAY;
  if (preset === "7" || preset === "30") start -= (Number(preset) - 1) * DAY;
  if (preset === "month") start = dayStart(`${today.slice(0, 7)}-01`);
  if (preset === "quarter") {
    const month = Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1;
    start = dayStart(`${today.slice(0, 4)}-${String(month).padStart(2, "0")}-01`);
  }
  if (preset === "custom") {
    if (!from || !to) return { error: "请选择完整的开始日期和结束日期。" };
    start = dayStart(from); end = dayStart(to) + DAY;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return { error: "日期无效，请重新选择。" };
    if (start >= end) return { error: "开始日期不能晚于结束日期。" };
    if (start > now) return { error: "所选日期全部在未来，暂无可统计记录。" };
  }
  return { range: { start, end, now, label: `${shanghaiDate(start)} — ${shanghaiDate(end - 1)}` } };
}
export interface DateBucket { start: number; end: number; label: string }
export function dateBuckets(range: DateRange): DateBucket[] {
  const days = Math.ceil((range.end - range.start) / DAY);
  const buckets: DateBucket[] = [];
  let cursor = range.start;
  while (cursor < range.end) {
    let next: number;
    if (days <= 31) next = cursor + DAY;
    else if (days <= 93) {
      const weekday = new Date(cursor + OFFSET).getUTCDay();
      next = cursor + (weekday === 1 ? 7 : (8 - weekday) % 7) * DAY;
    } else {
      const date = new Date(cursor + OFFSET);
      next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - OFFSET;
    }
    next = Math.min(next, range.end);
    buckets.push({ start: cursor, end: next, label: days <= 31 ? shanghaiDate(cursor).slice(5) : `${shanghaiDate(cursor).slice(5)}–${shanghaiDate(next - 1).slice(5)}` });
    cursor = next;
  }
  return buckets;
}
export interface Cohort<T> { rows: T[]; unknown: T[]; future: T[]; known: number; available: boolean }
export function cohort<T>(records: T[], date: (record: T) => unknown, range: DateRange): Cohort<T> {
  const rows: T[] = [], unknown: T[] = [], future: T[] = [];
  let known = 0;
  records.forEach((record) => {
    const time = parseCreatedAt(date(record));
    if (!Number.isFinite(time)) unknown.push(record);
    else if (time > range.now) future.push(record);
    else { known++; if (time >= range.start && time < range.end) rows.push(record); }
  });
  return { rows, unknown, future, known, available: records.length === 0 || known > 0 || future.length === records.length };
}
export const leadLabels: Record<string, string> = { NEW: "新建", CONTACTED: "已联系", NURTURING: "培育中", QUALIFIED: "已合格", CONVERTED: "已转为 Deal", UNQUALIFIED: "不合格", UNKNOWN: "未知状态" };
export const stageLabels: Record<string, string> = { DISCOVERY: "需求发现", SOLUTION: "方案沟通", QUOTATION: "报价阶段", NEGOTIATION: "谈判阶段", WON: "赢单", LOST: "输单", UNKNOWN: "未知阶段" };
export const openStages = ["DISCOVERY", "SOLUTION", "QUOTATION", "NEGOTIATION"];
export type HqCategory = "pending" | "anomaly" | "success" | "inconsistent" | "unknown";
export function hqCategory(intent: Pick<SowindPurchaseIntent, "hq_sync_status" | "error">): HqCategory {
  const error = typeof intent.error === "string" && intent.error.trim().length > 0;
  if (intent.hq_sync_status === 0) return error ? "anomaly" : "pending";
  if (intent.hq_sync_status === 1) return error ? "inconsistent" : "success";
  return "unknown";
}
export const hqLabels: Record<HqCategory, string> = { pending: "未同步", anomaly: "同步异常", success: "已同步", inconsistent: "状态与错误不一致 / 待核验", unknown: "同步状态未提供" };
export type AssociationCategory = "linked" | "unlinked" | "invalid";
export function association(intent: SowindPurchaseIntent, users: SowindBrandUser[]): AssociationCategory {
  if (intent.user_id === null) return "unlinked";
  return users.some((user) => user.id === intent.user_id && user.brand === intent.brand && user.is_deleted === 0) ? "linked" : "invalid";
}
export function confirmedConversions(leads: Lead[], deals: Deal[], allVisibleLeads = leads) {
  const linked = new Map<string, Lead[]>();
  allVisibleLeads.forEach((lead) => { if (lead.convertedDealId) linked.set(lead.convertedDealId, [...(linked.get(lead.convertedDealId) ?? []), lead]); });
  const confirmed: Lead[] = [], conflicts: Lead[] = [];
  leads.forEach((lead) => {
    if (lead.status !== "CONVERTED") {
      if (lead.convertedDealId) conflicts.push(lead);
      return;
    }
    const deal = deals.find((item) => item.id === lead.convertedDealId);
    const reverse = deals.filter((item) => item.sourceLeadId === lead.id);
    if (deal && deal.distributorId === lead.distributorId && (!deal.sourceLeadId || deal.sourceLeadId === lead.id) && linked.get(deal.id)?.length === 1 && reverse.every((item) => item.id === deal.id)) confirmed.push(lead);
    else conflicts.push(lead);
  });
  return { confirmed, conflicts };
}
export function ratio(numerator: number, denominator: number): string { return denominator ? `${Math.round(numerator / denominator * 100)}%` : "—"; }
export interface MemberAccess { brands: SowindBrandCode[]; group: boolean; crossBrand: boolean }
export function memberAccess(actor: DemoUser): MemberAccess { return actor.role === "HQ_ADMIN" ? { brands: ["gp", "un"], group: true, crossBrand: true } : { brands: [], group: false, crossBrand: false }; }
export function authorizedSales<T extends { distributorId: string }>(rows: T[], actor: DemoUser): T[] {
  return actor.role === "HQ_ADMIN" ? rows : rows.filter((row) => row.distributorId === actor.distributorId);
}
export interface DashboardQuery { range: DateRange; distributorId: string; brand: MemberBrandScope; actor: DemoUser; access?: MemberAccess }
export interface RowGroup<T> { key: string; label: string; rows: T[] }
function partition<T>(rows: T[], keys: string[], classify: (row: T) => string, labels: Record<string, string>): RowGroup<T>[] {
  return keys.map((key) => ({ key, label: labels[key] ?? key, rows: rows.filter((row) => classify(row) === key) }));
}
export function buildDashboard(sales: CrmState, members: MemberOperationsState, query: DashboardQuery) {
  const { range, actor } = query;
  const notFuture = (date: unknown) => !Number.isFinite(parseCreatedAt(date)) || parseCreatedAt(date) <= range.now;
  const salesScope = <T extends { distributorId: string }>(rows: T[]) => authorizedSales(rows, actor).filter((row) => query.distributorId === "all" || row.distributorId === query.distributorId);
  const leads = salesScope(sales.leads), deals = salesScope(sales.deals), tasks = salesScope(sales.tasks);
  const leadCohort = cohort(leads, (row) => row.createdAt, range), dealCohort = cohort(deals, (row) => row.createdAt, range);
  const currentDeals = deals.filter((row) => notFuture(row.createdAt));
  const openDeals = currentDeals.filter((row) => openStages.includes(row.stage));
  const overdueTasks = tasks.filter((row) => row.status === "OPEN" && Number.isFinite(parseCreatedAt(row.dueAt)) && parseCreatedAt(row.dueAt) < range.now);
  const conversion = confirmedConversions(leadCohort.rows, currentDeals, authorizedSales(sales.leads, actor));
  const leadStatuses = partition(leadCohort.rows, Object.keys(leadLabels), (row) => leadLabels[row.status] ? row.status : "UNKNOWN", leadLabels);
  const currentStages = partition(openDeals, openStages, (row) => row.stage, stageLabels);
  const unknownDeals = currentDeals.filter((row) => !stageLabels[row.stage]);
  const outcomes = partition(dealCohort.rows, ["OPEN", "WON", "LOST", "UNKNOWN"], (row) => openStages.includes(row.stage) ? "OPEN" : ["WON", "LOST"].includes(row.stage) ? row.stage : "UNKNOWN", { OPEN: "进行中", WON: "当前赢单", LOST: "当前输单", UNKNOWN: "未知阶段" });
  const access = query.access ?? memberAccess(actor);
  const authorizedUsers = members.brandUsers.filter((row) => access.brands.includes(row.brand));
  const authorizedIntents = members.purchaseIntents.filter((row) => access.brands.includes(row.brand));
  const brandFilter = <T extends { brand: SowindBrandCode }>(rows: T[]) => rows.filter((row) => query.brand === "ALL" || row.brand === query.brand);
  const users = brandFilter(authorizedUsers), allIntents = brandFilter(authorizedIntents);
  const intents = allIntents.filter((row) => notFuture(row.created_at));
  const effectiveUsers = users.filter((row) => row.is_deleted === 0 && notFuture(row.created_at));
  const unknownDeletion = users.filter((row) => row.is_deleted !== 0 && row.is_deleted !== 1);
  const userCohort = cohort(users.filter((row) => row.is_deleted === 0), (row) => row.created_at, range), intentCohort = cohort(allIntents, (row) => row.created_at, range);
  const userDateCoverage = cohort(users, (row) => row.created_at, range);
  if (users.length > 0 && users.every((row) => row.is_deleted !== 0 && row.is_deleted !== 1)) userCohort.available = false;
  const visibleCustomers = access.group ? members.customers.filter((row, index, all) => notFuture(row.created_at) && all.findIndex((other) => other.id === row.id) === index) : [];
  const selectedCustomerIds = new Set(effectiveUsers.map((row) => row.customer_id).filter((id): id is string => id !== null));
  const customers = query.brand === "ALL" && access.crossBrand && access.brands.length === 2 ? visibleCustomers : visibleCustomers.filter((row) => selectedCustomerIds.has(row.id));
  const noCustomer = effectiveUsers.filter((row) => row.customer_id === null);
  const invalidCustomer = effectiveUsers.filter((row) => row.customer_id !== null && access.group && !visibleCustomers.some((customer) => customer.id === row.customer_id));
  const unlinkedIntents = intents.filter((row) => row.user_id === null);
  const syncGroups = partition(intents, ["pending", "anomaly", "success", "inconsistent", "unknown"], hqCategory, hqLabels);
  const syncAnomalies = intents.filter((row) => hqCategory(row) === "anomaly");
  const associations = partition(intentCohort.rows, ["linked", "unlinked", "invalid"], (row) => association(row, authorizedUsers.filter((user) => notFuture(user.created_at))), { linked: "关联有效同品牌会员", unlinked: "未关联会员（待核查）", invalid: "关联不可用 / 待核验" });
  const showGroupRelationship = access.group && access.crossBrand && access.brands.length === 2 && query.brand === "ALL";
  const groupRelationships: RowGroup<SowindCustomer>[] = showGroupRelationship ? partition(visibleCustomers, ["gp", "un", "both", "none"], (customer) => {
    const brands = new Set(authorizedUsers.filter((user) => user.is_deleted === 0 && notFuture(user.created_at) && user.customer_id === customer.id).map((user) => user.brand));
    return brands.size === 2 ? "both" : brands.has("gp") ? "gp" : brands.has("un") ? "un" : "none";
  }, { gp: "仅 GP", un: "仅 UN", both: "GP + UN", none: "暂无有效品牌关联" }) : [];
  const brandComparison = access.brands.filter((brand) => query.brand === "ALL" || brand === query.brand).map((brand) => {
    const current = effectiveUsers.filter((row) => row.brand === brand), currentIntents = intents.filter((row) => row.brand === brand);
    const brandUsers = users.filter((row) => row.brand === brand);
    const currentAvailable = brandUsers.length === 0 || brandUsers.some((row) => row.is_deleted === 0 || row.is_deleted === 1);
    const newUsers = cohort(brandUsers.filter((row) => row.is_deleted === 0), (row) => row.created_at, range);
    if (!currentAvailable) newUsers.available = false;
    return { brand, current, currentAvailable, newUsers, newIntents: cohort(allIntents.filter((row) => row.brand === brand), (row) => row.created_at, range), unlinked: currentIntents.filter((row) => row.user_id === null), anomalies: currentIntents.filter((row) => hqCategory(row) === "anomaly") };
  });
  const merchandise = new Map<string, RowGroup<SowindPurchaseIntent>>();
  intentCohort.rows.forEach((row) => {
    const sku = row.product_sku?.trim(), model = row.model?.trim();
    const key = JSON.stringify([row.brand, sku ? "sku" : model ? "model" : "empty", sku || model || ""]);
    const label = `${row.brand.toUpperCase()} · ${sku || model || "未填写商品"}${sku ? "（SKU）" : model ? "（型号）" : ""}`;
    merchandise.set(key, { key, label, rows: [...(merchandise.get(key)?.rows ?? []), row] });
  });
  const trend = dateBuckets(range).map((bucket) => ({ ...bucket,
    leads: leadCohort.rows.filter((row) => parseCreatedAt(row.createdAt) >= bucket.start && parseCreatedAt(row.createdAt) < bucket.end),
    deals: dealCohort.rows.filter((row) => parseCreatedAt(row.createdAt) >= bucket.start && parseCreatedAt(row.createdAt) < bucket.end),
    users: userCohort.rows.filter((row) => parseCreatedAt(row.created_at) >= bucket.start && parseCreatedAt(row.created_at) < bucket.end),
    intents: intentCohort.rows.filter((row) => parseCreatedAt(row.created_at) >= bucket.start && parseCreatedAt(row.created_at) < bucket.end),
  }));
  const analysis = (key: string, label: string, selectedLeads: Lead[], selectedDeals: Deal[]) => ({ key, label, leads: selectedLeads, deals: selectedDeals, won: selectedDeals.filter((row) => row.stage === "WON"), lost: selectedDeals.filter((row) => row.stage === "LOST") });
  const distributors = sales.distributors.filter((row) => (actor.role === "HQ_ADMIN" || row.id === actor.distributorId) && (query.distributorId === "all" || row.id === query.distributorId)).map((row) => analysis(row.id, row.name, leadCohort.rows.filter((lead) => lead.distributorId === row.id), dealCohort.rows.filter((deal) => deal.distributorId === row.id)));
  const products = sales.products.map((row) => analysis(row.id, row.name, leadCohort.rows.filter((lead) => lead.productInterest.includes(row.name)), dealCohort.rows.filter((deal) => deal.productId === row.id)));
  const addons = sales.products.flatMap((product) => product.capabilities.map((capability) => ({ key: `${product.id}:${capability.id}`, label: `${product.name} / ${capability.name}`, deals: dealCohort.rows.filter((deal) => deal.productId === product.id && deal.capabilityIds.includes(capability.id)), won: dealCohort.rows.filter((deal) => deal.productId === product.id && deal.capabilityIds.includes(capability.id) && deal.stage === "WON") })));
  return { query, access, leads, deals, tasks, leadCohort, dealCohort, openDeals, overdueTasks, conversion, leadStatuses, currentStages, unknownDeals, outcomes, users, effectiveUsers, unknownDeletion, userCohort, userDateCoverage, intentCohort, intents, customers, noCustomer, invalidCustomer, unlinkedIntents, syncGroups, syncAnomalies, associations, groupRelationships, brandComparison, merchandise: [...merchandise.values()], trend, distributors, products, addons };
}
export type DashboardSnapshot = ReturnType<typeof buildDashboard>;
export type DashboardRecord = Lead | Deal | CrmTask | SowindBrandUser | SowindPurchaseIntent | SowindCustomer;
export type RecordKind = "lead" | "deal" | "task" | "user" | "intent" | "customer";
export function recordLabel(row: DashboardRecord): string { return "name" in row && row.name ? row.name : "title" in row ? row.title : row.id; }
