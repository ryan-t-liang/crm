import { describe, expect, it } from "vitest";
import { createDemoState } from "@/mock/demo-data";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";
import { buildCurrentDistributorMetrics, buildDashboard, resolveRange } from "@/features/dashboard/dashboard-model";
import type { Deal, DemoUser, Lead } from "@/types/crm";
import { authorizedSales, confirmedConversions, confirmedLeadConversion, dealOutcome, ratio, winRate } from "./sales-metrics";

const now = Date.parse("2026-09-17T06:00:00Z");
const createdAt = "2026-09-16 12:00:00";
function fixture() {
  const state = createDemoState();
  const lead: Lead = { ...state.leads[0], id: "lead", status: "CONVERTED", convertedDealId: "deal", distributorId: "dist-cn", createdAt };
  const deal: Deal = { ...state.deals[0], id: "deal", sourceLeadId: "lead", stage: "WON", distributorId: "dist-cn", createdAt };
  state.leads = [lead]; state.deals = [deal]; state.tasks = [];
  return { state, lead, deal, actor: state.users[0] };
}

describe("shared confirmed conversion integrity", () => {
  it("requires one exact, same-distributor forward and reverse relationship without mutations", () => {
    const { lead, deal } = fixture(), before = JSON.stringify([lead, deal]);
    expect(confirmedLeadConversion(lead, [deal], [lead])).toBe(true);
    expect(confirmedConversions([lead], [deal])).toEqual({ confirmed: [lead], conflicts: [] });
    expect(JSON.stringify([lead, deal])).toBe(before);
  });
  it("does not accept a missing legacy reverse sourceLeadId", () => {
    const { lead, deal } = fixture(); delete deal.sourceLeadId;
    expect(confirmedConversions([lead], [deal])).toEqual({ confirmed: [], conflicts: [lead] });
  });
  it("does not accept another Lead as source or a different distributor", () => {
    const { lead, deal } = fixture();
    expect(confirmedLeadConversion(lead, [{ ...deal, sourceLeadId: "other" }], [lead])).toBe(false);
    expect(confirmedLeadConversion(lead, [{ ...deal, distributorId: "dist-sg" }], [lead])).toBe(false);
  });
  it("checks duplicate forward links outside the selected cohort", () => {
    const { lead, deal } = fixture();
    const old = { ...lead, id: "old", createdAt: "2020-01-01" };
    expect(confirmedConversions([lead], [deal], [lead, old]).confirmed).toEqual([]);
  });
  it("checks duplicate reverse links outside selected distributor and date rows", () => {
    const { lead, deal } = fixture();
    const hiddenByFilter = { ...deal, id: "second", distributorId: "dist-sg", createdAt: "2099-01-01" };
    expect(confirmedConversions([lead], [deal], [lead], [deal, hiddenByFilter]).confirmed).toEqual([]);
  });
  it("rejects duplicate record IDs instead of selecting the first record", () => {
    const { lead, deal } = fixture();
    expect(confirmedLeadConversion(lead, [deal, { ...deal }], [lead])).toBe(false);
    expect(confirmedLeadConversion(lead, [deal], [lead, { ...lead }])).toBe(false);
  });
  it("flags missing converted targets and does not manufacture a conversion", () => {
    const { lead } = fixture();
    expect(confirmedConversions([lead], [])).toEqual({ confirmed: [], conflicts: [lead] });
    expect(confirmedConversions([{ ...lead, convertedDealId: undefined }], []).conflicts).toHaveLength(1);
  });
  it("flags a reverse-linked ordinary Lead without counting it as converted", () => {
    const { lead, deal } = fixture(); lead.status = "QUALIFIED"; delete lead.convertedDealId;
    expect(confirmedConversions([lead], [deal])).toEqual({ confirmed: [], conflicts: [lead] });
  });
});

describe("shared Deal outcomes and denominators", () => {
  it("partitions the four open stages, terminal stages and unknown values explicitly", () => {
    expect(["DISCOVERY", "SOLUTION", "QUOTATION", "NEGOTIATION", "WON", "LOST", "OTHER"].map((stage) => dealOutcome({ stage: stage as Deal["stage"] }))).toEqual(["OPEN", "OPEN", "OPEN", "OPEN", "WON", "LOST", "UNKNOWN"]);
  });
  it("uses WON / (WON + LOST), excluding open and unknown Deals", () => {
    const { deal } = fixture();
    expect(winRate([deal, { ...deal, stage: "LOST" }, { ...deal, stage: "DISCOVERY" }, { ...deal, stage: "SOLUTION" }, { ...deal, stage: "OTHER" as Deal["stage"] }])).toBe("50%");
  });
  it("shows an unavailable dash for zero denominators, but known zero as 0%", () => {
    expect(winRate([])).toBe("—"); expect(winRate([{ stage: "DISCOVERY" }])).toBe("—");
    expect(winRate([{ stage: "LOST" }])).toBe("0%"); expect(ratio(0, 0)).toBe("—");
  });
});

describe("Dashboard and Distributor use the same authorized metric functions", () => {
  it("returns identical confirmed conversions and win rates for the same population", () => {
    const { state, deal, actor } = fixture(); state.deals.push({ ...deal, id: "lost", sourceLeadId: undefined, stage: "LOST" }, { ...deal, id: "open", sourceLeadId: undefined, stage: "DISCOVERY" });
    const snapshot = buildDashboard(state, createMemberOperationsDemoState(), { actor, distributorId: "dist-cn", brand: "ALL", range: resolveRange("30", now).range! });
    const management = buildCurrentDistributorMetrics(state, actor, "dist-cn", now);
    expect(management.conversion).toEqual(snapshot.conversion);
    expect(management.conversionRate).toBe(ratio(snapshot.conversion.confirmed.length, snapshot.leadCohort.rows.length));
    expect(management.winRate).toBe(winRate(snapshot.dealCohort.rows)); expect(management.winRate).toBe("50%");
  });
  it("retains current stock outside the creation cohort but excludes known future creations", () => {
    const { state, deal, actor } = fixture();
    state.deals = [{ ...deal, id: "old", sourceLeadId: undefined, stage: "DISCOVERY", createdAt: "2020-01-01" }, { ...deal, id: "future", sourceLeadId: undefined, stage: "DISCOVERY", createdAt: "2099-01-01" }, { ...deal, id: "unknown-date", sourceLeadId: undefined, stage: "SOLUTION", createdAt: "" }];
    const before = JSON.stringify(state);
    const current = buildCurrentDistributorMetrics(state, actor, "dist-cn", now);
    const snapshot = buildDashboard(state, createMemberOperationsDemoState(), { actor, distributorId: "dist-cn", brand: "ALL", range: resolveRange("today", now).range! });
    expect(current.openDeals.map((row) => row.id)).toEqual(["old", "unknown-date"]);
    expect(current.openDeals).toEqual(snapshot.openDeals); expect(snapshot.dealCohort.rows).toEqual([]);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("keeps zero denominators unavailable on the current Distributor metric", () => {
    const { state, actor } = fixture(); state.leads = []; state.deals = [];
    const current = buildCurrentDistributorMetrics(state, actor, "dist-cn", now);
    expect(current.conversionRate).toBe("—"); expect(current.winRate).toBe("—");
  });
  it("applies actual role scope before any current Distributor aggregation", () => {
    const { state, actor } = fixture();
    const distributorActor = { ...actor, role: "DISTRIBUTOR_SALES", distributorId: "dist-sg" } as DemoUser;
    const hidden = buildCurrentDistributorMetrics(state, distributorActor, "dist-cn", now);
    expect(hidden.leads).toEqual([]); expect(hidden.deals).toEqual([]); expect(hidden.conversionRate).toBe("—");
    expect(authorizedSales(state.leads, { ...actor, role: "UNKNOWN" as DemoUser["role"] })).toEqual([]);
  });
  it("does not allow distributor filtering to hide an authorized conflicting reverse link", () => {
    const { state, deal, actor } = fixture(); state.deals.push({ ...deal, id: "cross-conflict", distributorId: "dist-sg" });
    const snapshot = buildDashboard(state, createMemberOperationsDemoState(), { actor, distributorId: "dist-cn", brand: "ALL", range: resolveRange("30", now).range! });
    const management = buildCurrentDistributorMetrics(state, actor, "dist-cn", now);
    expect(snapshot.conversion.confirmed).toEqual([]); expect(management.conversion.confirmed).toEqual([]);
    expect(snapshot.conversion.conflicts).toHaveLength(1); expect(management.conversion.conflicts).toHaveLength(1);
  });
});
