import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoState } from "@/mock/demo-data";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";
import { readBrandPhone, readIntentPhone } from "@/features/member-operations/sowind-read";
import { association, buildDashboard, cohort, confirmedConversions, dateBuckets, dayStart, hqCategory, parseCreatedAt, ratio, resolveRange, shanghaiDate, type DashboardQuery } from "./dashboard-model";
import type { Deal, Lead } from "@/types/crm";
import type { SowindBrandUser, SowindPurchaseIntent } from "@/types/member-operations";

const now = Date.parse("2026-09-17T06:00:00Z");
const created = "2026-09-16 12:00:00";
function fixture() {
  const sales = createDemoState(), members = createMemberOperationsDemoState();
  const leadBase = sales.leads[0], dealBase = sales.deals[0], taskBase = sales.tasks[0], userBase = members.brandUsers[0], intentBase = members.purchaseIntents[0];
  sales.leads = []; sales.deals = []; sales.tasks = [];
  members.brandUsers = []; members.purchaseIntents = []; members.customers = []; members.userProfiles = [];
  const lead = (id: string, patch: Partial<Lead> = {}): Lead => ({ ...leadBase, id, status: "NEW", distributorId: "dist-cn", createdAt: created, convertedDealId: undefined, ...patch });
  const deal = (id: string, patch: Partial<Deal> = {}): Deal => ({ ...dealBase, id, stage: "DISCOVERY", distributorId: "dist-cn", sourceLeadId: undefined, createdAt: created, ...patch });
  const user = (id: string, patch: Partial<SowindBrandUser> = {}): SowindBrandUser => ({ ...userBase, id, brand: "gp", customer_id: null, is_deleted: 0, created_at: created, ...patch });
  const intent = (id: string, patch: Partial<SowindPurchaseIntent> = {}): SowindPurchaseIntent => ({ ...intentBase, id, brand: "gp", user_id: null, created_at: created, hq_sync_status: 0, error: null, product_sku: null, model: null, ...patch });
  const query: DashboardQuery = { range: resolveRange("30", now).range!, actor: sales.users[0], distributorId: "all", brand: "ALL" };
  const snapshot = (patch: Partial<DashboardQuery> = {}) => buildDashboard(sales, members, { ...query, ...patch });
  return { sales, members, query, lead, deal, user, intent, taskBase, snapshot };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());

describe("Dashboard temporal and metric contracts", () => {
  it("counts ALL new Lead states, partitions the same cohort including unknown", () => {
    const f = fixture();
    f.sales.leads = ["NEW", "CONTACTED", "NURTURING", "QUALIFIED", "CONVERTED", "UNQUALIFIED", "OTHER"].map((status, index) => f.lead(String(index), { status: status as Lead["status"] }));
    const s = f.snapshot();
    expect(s.leadCohort.rows).toHaveLength(7);
    expect(s.leadStatuses.map((group) => group.rows.length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(s.leadStatuses.flatMap((group) => group.rows)).toHaveLength(s.leadCohort.rows.length);
  });
  it("includes an older open Deal only in current pipeline, never current cohort", () => {
    const f = fixture(); f.sales.deals = [f.deal("old", { createdAt: "2026-01-01 00:00:00" }), f.deal("new-won", { stage: "WON" }), f.deal("unknown", { stage: "OTHER" as Deal["stage"] })];
    const s = f.snapshot(); expect(s.dealCohort.rows.map((row) => row.id)).toEqual(["new-won", "unknown"]);
    expect(s.openDeals.map((row) => row.id)).toEqual(["old"]);
    expect(s.currentStages.flatMap((group) => group.rows)).toEqual(s.openDeals);
    expect(s.outcomes.flatMap((group) => group.rows)).toHaveLength(2);
    expect(s.unknownDeals).toHaveLength(1);
  });
  it("counts overdue OPEN tasks, not DONE/CANCELED/invalid/future due dates", () => {
    const f = fixture(); f.sales.tasks = [
      { ...f.taskBase, id: "a", status: "OPEN", distributorId: "dist-cn", dueAt: "2026-09-17 13:59:59" },
      { ...f.taskBase, id: "b", status: "DONE", distributorId: "dist-cn", dueAt: created },
      { ...f.taskBase, id: "c", status: "OPEN", distributorId: "dist-cn", dueAt: "2026-09-17 14:00:00" },
      { ...f.taskBase, id: "d", status: "OPEN", distributorId: "dist-cn", dueAt: "invalid" },
    ]; expect(f.snapshot().overdueTasks.map((row) => row.id)).toEqual(["a"]);
  });
  it("validates conversion links, flags conflicts/duplicates without mutating data", () => {
    const f = fixture(); f.sales.leads = [f.lead("ok", { status: "CONVERTED", convertedDealId: "d-ok" }), f.lead("missing", { status: "CONVERTED" }), f.lead("wrong", { status: "CONVERTED", convertedDealId: "d-wrong" }), f.lead("duplicate1", { status: "CONVERTED", convertedDealId: "d-duplicate" }), f.lead("duplicate2", { status: "CONVERTED", convertedDealId: "d-duplicate" }), f.lead("state", { convertedDealId: "d-state" })];
    f.sales.deals = [f.deal("d-ok", { sourceLeadId: "ok" }), f.deal("d-wrong", { sourceLeadId: "another" }), f.deal("d-duplicate"), f.deal("d-state")];
    const before = JSON.stringify(f.sales); const result = f.snapshot().conversion;
    expect(result.confirmed.map((row) => row.id)).toEqual(["ok"]); expect(result.conflicts).toHaveLength(5); expect(JSON.stringify(f.sales)).toBe(before);
    expect(confirmedConversions([f.lead("reverse", { status: "CONVERTED", convertedDealId: "a" })], [f.deal("a", { sourceLeadId: "reverse" }), f.deal("b", { sourceLeadId: "reverse" })]).confirmed).toHaveLength(0);
  });
  it("renders absent denominators as a dash, not 0%", () => { expect(ratio(0, 0)).toBe("—"); expect(ratio(0, 3)).toBe("0%"); expect(ratio(1, 2)).toBe("50%"); });
  it("uses Asia/Shanghai natural days, calendar month and calendar quarter", () => {
    expect(shanghaiDate(Date.parse("2026-09-16T16:00:00Z"))).toBe("2026-09-17");
    expect(resolveRange("today", now).range!.start).toBe(Date.parse("2026-09-16T16:00:00Z"));
    expect(resolveRange("7", now).range!.start).toBe(dayStart("2026-09-11"));
    expect(resolveRange("30", now).range!.start).toBe(dayStart("2026-08-19"));
    expect(resolveRange("month", now).range!.start).toBe(dayStart("2026-09-01"));
    expect(resolveRange("quarter", now).range!.start).toBe(dayStart("2026-07-01"));
    expect(parseCreatedAt("2026-09-17 00:00:00")).toBe(dayStart("2026-09-17"));
    expect(Number.isNaN(parseCreatedAt("2026-02-30 00:00:00"))).toBe(true);
  });
  it("includes custom end day but excludes next day and future records", () => {
    const range = resolveRange("custom", now, "2026-09-15", "2026-09-16").range!;
    const rows = [{ date: "2026-09-15 00:00:00" }, { date: "2026-09-16 23:59:59" }, { date: "2026-09-17 00:00:00" }, { date: "2026-09-18 00:00:00" }, { date: undefined }];
    const c = cohort(rows, (row) => row.date, range); expect(c.rows).toEqual(rows.slice(0, 2)); expect(c.future).toEqual([rows[3]]); expect(c.unknown).toEqual([rows[4]]);
    expect(cohort([{ date: "2026-09-17 15:00:00" }], (row) => row.date, resolveRange("today", now).range!).rows).toHaveLength(0);
  });
  it("does not silently replace incomplete/reversed/wholly future custom ranges", () => {
    for (const [from, to] of [["2026-09-01", ""], ["2026-09-17", "2026-09-01"], ["2026-09-18", "2026-09-25"], ["2026-02-31", "2026-03-02"]]) { const result = resolveRange("custom", now, from, to); expect(result.range).toBeUndefined(); expect(result.error).toBeTruthy(); }
  });
  it.each([["2026-09-01", "2026-09-17", "daily"], ["2026-07-01", "2026-09-17", "weekly"], ["2026-01-01", "2026-09-17", "monthly"]])("creates contiguous clipped %s to %s %s buckets with identical KPI sums", (from, to, granularity) => {
    const f = fixture(), range = resolveRange("custom", now, from, to).range!;
    for (let time = range.start; time <= now; time += 86_400_000) f.sales.leads.push(f.lead(String(time), { createdAt: new Date(time).toISOString() }));
    const s = f.snapshot({ range }), bins = dateBuckets(range);
    expect(bins[0].start).toBe(range.start); expect(bins.at(-1)!.end).toBe(range.end);
    for (let index = 1; index < bins.length; index++) { expect(bins[index].start).toBe(bins[index - 1].end); if (granularity === "weekly") expect(new Date(bins[index].start + 8 * 3_600_000).getUTCDay()).toBe(1); if (granularity === "monthly") expect(shanghaiDate(bins[index].start).endsWith("-01")).toBe(true); }
    expect(s.trend.reduce((sum, row) => sum + row.leads.length, 0)).toBe(s.leadCohort.rows.length);
    expect(new Set(s.trend.flatMap((row) => row.leads.map((lead) => lead.id))).size).toBe(s.leadCohort.rows.length);
  });
  it("distinguishes missing dates, empty data, known-zero and future records", () => {
    const range = resolveRange("30", now).range!;
    expect(cohort([{ date: undefined }], (row) => row.date, range).available).toBe(false);
    expect(cohort([], () => undefined, range).available).toBe(true);
    const mixed = cohort([{ date: "2025-01-01" }, { date: undefined }], (row) => row.date, range);
    expect(mixed.available).toBe(true); expect(mixed.rows).toHaveLength(0); expect(mixed.unknown).toHaveLength(1);
  });
  it("never includes known-future creations in current stock or confirmed conversions", () => {
    const f = fixture(); f.sales.deals = [f.deal("future", { createdAt: "2099-01-01" })]; f.sales.leads = [f.lead("converted", { status: "CONVERTED", convertedDealId: "future" })]; f.members.brandUsers = [f.user("future", { created_at: "2099-01-01" })]; f.members.purchaseIntents = [f.intent("future", { created_at: "2099-01-01", error: "error" })]; const s = f.snapshot();
    expect(s.openDeals).toEqual([]); expect(s.conversion.confirmed).toEqual([]); expect(s.effectiveUsers).toEqual([]); expect(s.intents).toEqual([]); expect(s.intentCohort.future).toHaveLength(1); expect(s.userCohort.future).toHaveLength(1);
  });
});

describe("Dashboard Sowind boundaries and permissions", () => {
  it("deduplicates customers, not brand users; same-brand multiple records remain", () => {
    const f = fixture(); f.members.customers = [{ id: "shared" }, { id: "none" }]; f.members.brandUsers = [f.user("g1", { customer_id: "shared" }), f.user("g2", { customer_id: "shared" }), f.user("u1", { brand: "un", customer_id: "shared" })];
    const s = f.snapshot(); expect(s.customers).toHaveLength(2); expect(s.effectiveUsers).toHaveLength(3); expect(s.groupRelationships.find((group) => group.key === "both")!.rows).toHaveLength(1); expect(s.groupRelationships.find((group) => group.key === "none")!.rows).toHaveLength(1);
    const gp = f.snapshot({ brand: "gp" }); expect(gp.customers).toEqual([{ id: "shared" }]); expect(gp.effectiveUsers).toHaveLength(2); expect(gp.groupRelationships).toEqual([]);
  });
  it("separates nullable, dangling, cross-brand, deleted and unknown-deletion associations", () => {
    const f = fixture(); f.members.customers = [{ id: "exists" }]; f.members.brandUsers = [f.user("valid"), f.user("un", { brand: "un" }), f.user("deleted", { is_deleted: 1 }), f.user("unknown", { is_deleted: undefined }), f.user("bad-customer", { customer_id: "missing" })];
    f.members.purchaseIntents = [f.intent("null"), f.intent("ok", { user_id: "valid" }), f.intent("dangling", { user_id: "missing" }), f.intent("cross", { user_id: "un" }), f.intent("deleted", { user_id: "deleted" }), f.intent("unknown", { user_id: "unknown" })];
    const s = f.snapshot(); expect(s.effectiveUsers).toHaveLength(3); expect(s.unknownDeletion).toHaveLength(1); expect(s.invalidCustomer).toHaveLength(1); expect(s.noCustomer).toHaveLength(2);
    expect(s.associations.map((group) => group.rows.length)).toEqual([1, 1, 4]); expect(s.associations.flatMap((group) => group.rows)).toHaveLength(6); expect(s.unlinkedIntents).toHaveLength(1);
    expect(association(f.intent("null"), [])).toBe("unlinked");
  });
  it("distinguishes all four HQ states and ignores whitespace and hq_ref", () => {
    const f = fixture(); f.members.purchaseIntents = [f.intent("pending", { error: "  \n ", hq_ref: { arbitrary: "present" } }), f.intent("anomaly", { error: " Demo error " }), f.intent("success", { hq_sync_status: 1 }), f.intent("inconsistent", { hq_sync_status: 1, error: "old error" })];
    expect(f.members.purchaseIntents.map(hqCategory)).toEqual(["pending", "anomaly", "success", "inconsistent"]);
    expect(f.snapshot().syncAnomalies.map((row) => row.id)).toEqual(["anomaly"]);
  });
  it("keeps current stocks independent of period and independent business filters", () => {
    const f = fixture(); f.sales.leads = [f.lead("cn"), f.lead("sg", { distributorId: "dist-sg" })]; f.sales.deals = [f.deal("old", { createdAt: "2025-01-01" })]; f.members.brandUsers = [f.user("g"), f.user("u", { brand: "un" })]; f.members.purchaseIntents = [f.intent("old", { created_at: "2025-01-01", error: "error" })];
    const all = f.snapshot(), cn = f.snapshot({ distributorId: "dist-cn" }), gp = f.snapshot({ brand: "gp" }), today = f.snapshot({ range: resolveRange("today", now).range! });
    expect(cn.intents).toEqual(all.intents); expect(cn.effectiveUsers).toEqual(all.effectiveUsers); expect(gp.leadCohort).toEqual(all.leadCohort); expect(today.openDeals).toEqual(all.openDeals); expect(today.unlinkedIntents).toEqual(all.unlinkedIntents); expect(today.syncAnomalies).toEqual(all.syncAnomalies);
  });
  it("authorizes BEFORE filtering and exposes no unauthorized rows in drilldown collections", () => {
    const f = fixture(); const actor = f.sales.users.find((row) => row.role === "DISTRIBUTOR_MANAGER")!;
    f.sales.leads = [f.lead("own", { distributorId: actor.distributorId }), f.lead("hidden", { distributorId: "other" })]; f.sales.deals = [f.deal("hidden", { distributorId: "other" })]; f.members.brandUsers = [f.user("secret")]; f.members.purchaseIntents = [f.intent("secret")]; f.members.customers = [{ id: "secret" }];
    const s = f.snapshot({ actor }); expect(s.leads.map((row) => row.id)).toEqual(["own"]); expect(s.openDeals).toEqual([]); expect(s.effectiveUsers).toEqual([]); expect(s.intents).toEqual([]); expect(s.customers).toEqual([]); expect(s.brandComparison).toEqual([]); expect(s.groupRelationships).toEqual([]);
    expect(f.snapshot({ actor, distributorId: "other" }).leads).toEqual([]);
  });
  it("single-brand authority has no other-brand names, counts, intersections or group total", () => {
    const f = fixture(); f.members.customers = [{ id: "gp" }, { id: "un-only" }]; f.members.brandUsers = [f.user("g", { customer_id: "gp" }), f.user("u", { brand: "un", customer_id: "un-only" })]; f.members.purchaseIntents = [f.intent("cross", { user_id: "u" })];
    const s = f.snapshot({ access: { brands: ["gp"], group: false, crossBrand: false } }); expect(s.users.map((row) => row.id)).toEqual(["g"]); expect(s.brandComparison.map((row) => row.brand)).toEqual(["gp"]); expect(s.customers).toEqual([]); expect(s.groupRelationships).toEqual([]); expect(s.associations.find((group) => group.key === "invalid")!.rows).toHaveLength(1);
  });
  it("groups merchandise by brand+SKU, falls back to model, counts each intent once", () => {
    const f = fixture(); f.members.purchaseIntents = [f.intent("a", { product_sku: "SAME", model: "ignore" }), f.intent("b", { brand: "un", product_sku: "SAME" }), f.intent("c", { model: "MODEL" }), f.intent("d")]; const s = f.snapshot(); expect(s.merchandise).toHaveLength(4); expect(s.merchandise.flatMap((group) => group.rows)).toHaveLength(4); expect(s.trend.reduce((sum, bucket) => sum + bucket.intents.length, 0)).toBe(s.intentCohort.rows.length);
  });
  it("never merges same-named Add-ons across products", () => { const f = fixture(), s = f.snapshot(); const rows = s.addons.filter((row) => row.key.endsWith(":cap-1")); expect(rows.length).toBeGreaterThan(1); expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length); });
  it("reads native profile phone and preserves the independent intent contact snapshot/nulls", () => {
    const f = fixture(), user = f.user("u"); const profile = { ...createMemberOperationsDemoState().userProfiles[0], user_id: "u", tel: "12345", tel_country_code: null }; const intent = f.intent("i", { tel: null, tel_country_code: "852" });
    expect(readBrandPhone(user, [profile])).toMatchObject({ number: "12345", country: null }); expect(readIntentPhone(intent)).toEqual({ number: null, country: "852" }); expect(readBrandPhone(user, []).number).toBe(user.phone);
  });
  it("does not mutate older persisted records, missing dates or deletion status", () => {
    const f = fixture(); f.members.brandUsers = [f.user("old", { created_at: undefined, is_deleted: undefined, openid: "user-edited" })]; f.members.purchaseIntents = [f.intent("old", { created_at: undefined, name: "用户修改" })]; f.sales.leads = [f.lead("edited", { name: "销售用户修改", createdAt: "" })];
    const before = JSON.stringify([f.sales, f.members]), s = f.snapshot(); expect(s.userCohort.available).toBe(false); expect(s.unknownDeletion).toHaveLength(1); expect(s.userDateCoverage.unknown).toHaveLength(1); expect(s.intentCohort.available).toBe(false); expect(s.leadCohort.available).toBe(false); expect(JSON.stringify([f.sales, f.members])).toBe(before);
  });
  it("new member records never change sales metrics or sales records", () => {
    const f = fixture(); f.sales.leads = [f.lead("sales")]; const before = f.snapshot(); f.members.brandUsers = [f.user("member")]; f.members.purchaseIntents = [f.intent("intent")]; expect(f.snapshot().leadCohort).toEqual(before.leadCohort); expect(f.snapshot().dealCohort).toEqual(before.dealCohort);
  });
});
