import { describe, expect, it } from "vitest";
import { createDemoState } from "@/mock/demo-data";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";
import { createDemoMarketingActivity } from "@/mock/marketing-demo-data";
import type { MarketingState } from "@/types/marketing";
import { activityMetrics, awardFulfillmentLabel, effectiveFulfillmentCapacity, executeMarketing, quota, resolveCredential, type MarketingCommand, type MarketingContext } from "./marketing-model";
import { decodeMarketing } from "./marketing-storage";

const now = Date.parse("2026-09-17T06:00:00Z");
function fixture(draft = false) {
  const members = createMemberOperationsDemoState(), actor = createDemoState().users[0];
  const activity = { ...createDemoMarketingActivity("gp", now), status: draft ? "DRAFT" as const : "PUBLISHED" as const, publishedAt: draft ? undefined : new Date(now).toISOString() };
  let state: MarketingState = { version: 2, revision: 0, seededAt: new Date(now).toISOString(), activities: [activity], participations: [], bookings: [], chances: [], draws: [], awards: [], redemptions: [], audits: [] }, serial = 0;
  const ctx: MarketingContext = { members, actor, now, random: () => 0.1, id: () => `final-${++serial}` };
  const run = (command: MarketingCommand) => { const result = executeMarketing(state, command, ctx); state = result.state; return result; };
  const userId = members.brandUsers.find((row) => row.brand === "gp" && row.is_deleted === 0)!.id;
  const win = (random = 0.1) => {
    expect(run({ type: "REGISTER", activityId: activity.id, userId, slotId: activity.slots[0].id }).ok).toBe(true);
    const row = state.participations[0];
    for (const action of ["CHECKIN", "COMPLETE"] as const) expect(run({ type: "VERIFY", credential: row.credential, action, location: activity.location, slotId: activity.slots[0].id }).ok).toBe(true);
    ctx.random = () => random;
    expect(run({ type: "DRAW", activityId: activity.id, userId, operationId: "final-draw" }).ok).toBe(true);
    return state.awards[0];
  };
  return { activity, run, win, ctx, userId, get state() { return state; } };
}

describe("Final Acceptance copy and safe quota", () => {
  it("copies structure with new IDs but clears every date, code and business fact", () => {
    const f = fixture(); f.win(0.65); const before = structuredClone(f.state);
    const result = f.run({ type: "COPY_ACTIVITY", activityId: f.activity.id }), copy = f.state.activities.find((row) => row.id === result.resultId)!;
    expect([copy.startAt, copy.endAt, copy.bookingStart, copy.bookingEnd, copy.lotteryStart, copy.lotteryEnd]).toEqual(Array(6).fill(""));
    for (const slot of [...copy.slots, ...copy.pool.flatMap((item) => item.slots)]) expect([slot.startAt, slot.endAt, slot.bookingClosesAt, slot.checkinStart, slot.checkinEnd]).toEqual(Array(5).fill(""));
    for (const item of copy.pool) { expect([item.claimStart, item.claimEnd]).toEqual(["", ""]); expect(item.codes).toEqual([]); expect(quota(f.state, copy.id, item).occupied).toBe(0); }
    expect(copy.slots[0]).toMatchObject({ label: f.activity.slots[0].label, capacity: f.activity.slots[0].capacity, location: f.activity.slots[0].location });
    expect(copy.slots[0].id).not.toBe(f.activity.slots[0].id); expect(copy.pool.map((item) => item.id)).not.toEqual(f.activity.pool.map((item) => item.id));
    for (const key of ["participations", "bookings", "chances", "draws", "awards", "redemptions"] as const) expect(f.state[key]).toEqual(before[key]);
    expect(f.state.activities[0]).toEqual(before.activities[0]); expect(copy.status).toBe("DRAFT"); expect(copy.publishedAt).toBeUndefined();
  });
  it("rejects extra reservation quota without capacity, then allows a properly backed addition", () => {
    const f = fixture(), item = f.activity.pool[1];
    expect(effectiveFulfillmentCapacity(item, now)).toBe(20);
    expect(f.run({ type: "ADD_QUOTA", activityId: f.activity.id, poolItemId: item.id, count: 50 }).ok).toBe(false);
    expect(f.state.activities[0].pool[1].quota).toBe(10);
    expect(f.run({ type: "ADD_PRIZE_SLOT", activityId: f.activity.id, poolItemId: item.id, slot: { ...item.slots[0], id: "more-seats", capacity: 50 } }).ok).toBe(true);
    expect(f.run({ type: "ADD_QUOTA", activityId: f.activity.id, poolItemId: item.id, count: 50 }).ok).toBe(true);
    expect(f.state.activities[0].pool[1].quota).toBe(60);
  });
  it("100 quota with 30 occupied cannot become 20; backed addition to 150 preserves all promises", () => {
    const f = fixture(), item = f.activity.pool[1]; item.quota = 100; item.slots[0].capacity = 200;
    const first = f.win(0.3);
    for (let index = 1; index < 30; index++) f.state.awards.push({ ...first, id: `occupied-${index}`, credential: `WIN-occupied-${index}` });
    const before = structuredClone(f.state.awards), prize = f.state.activities[0].pool[1];
    expect(f.run({ type: "SAVE_ACTIVITY_PRIZE", activityId: f.activity.id, prize: { ...prize, quota: 20 } }).ok).toBe(false);
    expect(f.run({ type: "ADD_QUOTA", activityId: f.activity.id, poolItemId: prize.id, count: 50 }).ok).toBe(true);
    expect(quota(f.state, f.activity.id, f.state.activities[0].pool[1])).toMatchObject({ total: 150, occupied: 30, available: 120 });
    expect(f.state.awards).toEqual(before);
  });
  it.each(["expiry", "voucher", "link"])("append also validates %s fulfillment prerequisites", (kind) => {
    const f = fixture(), item = f.activity.pool[3];
    if (kind === "expiry") item.claimEnd = new Date(now - 1000).toISOString();
    if (kind === "voucher") Object.assign(item, { method: "VIRTUAL_VOUCHER", voucherName: "", voucherDescription: "" });
    if (kind === "link") Object.assign(item, { method: "LINK", link: "javascript:bad" });
    expect(f.run({ type: "ADD_QUOTA", activityId: f.activity.id, poolItemId: item.id, count: 1 }).ok).toBe(false);
    expect(f.state.activities[0].pool[3].quota).toBe(10);
  });
  it.each(["prizeType", "method", "location", "claimEnd", "quota", "probability", "voucherDescription", "link"])("published %s is locked; prior awards remain unchanged", (key) => {
    const f = fixture(), award = f.win(), item = f.state.activities[0].pool[0], before = structuredClone(f.state.awards);
    const value = key === "quota" ? 0 : key === "probability" ? 80 : key === "prizeType" ? "VIRTUAL" : key === "method" ? "LINK" : "changed";
    expect(f.run({ type: "SAVE_ACTIVITY_PRIZE", activityId: f.activity.id, prize: { ...item, [key]: value } }).ok).toBe(false);
    expect(f.state.awards).toEqual(before); expect(f.state.awards[0]).toEqual(award);
  });
  it("descriptive edits apply only to future wins, not saved award promises", () => {
    const f = fixture(); f.win(); const before = structuredClone(f.state.awards), item = f.state.activities[0].pool[0];
    expect(f.run({ type: "SAVE_ACTIVITY_PRIZE", activityId: f.activity.id, prize: { ...item, name: "Future name", instructions: "Future instructions" } }).ok).toBe(true);
    expect(f.state.awards).toEqual(before); expect(f.state.activities[0].pool[0].name).toBe("Future name");
  });
  it("existing physical business locks prize and activity rules even if a legacy status becomes draft", () => {
    const f = fixture(); f.win(); f.state.activities[0].publishedAt = undefined; f.state.activities[0].status = "DRAFT";
    const before = structuredClone(f.state.activities[0]), awards = structuredClone(f.state.awards);
    expect(f.run({ type: "SAVE_ACTIVITY", activity: { ...before, grantCount: 100 } }).ok).toBe(false);
    expect(f.run({ type: "SAVE_ACTIVITY_PRIZE", activityId: before.id, prize: { ...before.pool[0], probability: 80 } }).ok).toBe(false);
    expect(f.state.activities[0]).toEqual(before); expect(f.state.awards).toEqual(awards);
  });
});

describe("Final Acceptance hard delete versus cancellation", () => {
  it("all capabilities still reject foreign-brand activity/booking/award/code/credential references", () => {
    const f = fixture(), award = f.win(0.65), activity = f.state.activities[0], booking = f.state.bookings[0], item = activity.pool[3], before = f.state;
    f.ctx.access = { brands: ["un"], view: true, manage: true, redeem: true, preview: true };
    const commands: MarketingCommand[] = [
      { type: "SAVE_ACTIVITY", activity: { ...activity, brand: "un" } }, { type: "STATUS", activityId: activity.id, status: "PAUSED" },
      { type: "COPY_ACTIVITY", activityId: activity.id }, { type: "DELETE_ACTIVITY", activityId: activity.id },
      { type: "SAVE_ACTIVITY_PRIZE", activityId: activity.id, prize: item }, { type: "DELETE_ACTIVITY_PRIZE", activityId: activity.id, poolItemId: item.id },
      { type: "IMPORT_CODES", activityId: activity.id, poolItemId: item.id, codes: ["FOREIGN"] }, { type: "DELETE_CODES", activityId: activity.id, poolItemId: item.id, codes: [item.codes[0].code] },
      { type: "ADD_QUOTA", activityId: activity.id, poolItemId: item.id, count: 1 }, { type: "ADD_PRIZE_SLOT", activityId: activity.id, poolItemId: activity.pool[1].id, slot: { ...activity.pool[1].slots[0], id: "foreign" } },
      { type: "SAVE_ACTIVITY_SLOT", activityId: activity.id, slot: activity.slots[0] }, { type: "DELETE_ACTIVITY_SLOT", activityId: activity.id, slotId: activity.slots[0].id },
      { type: "REGISTER", activityId: activity.id, userId: f.userId, slotId: activity.slots[0].id }, { type: "REGISTER", activityId: activity.id, userId: f.userId, slotId: activity.slots[0].id, walkIn: true },
      { type: "DRAW", activityId: activity.id, userId: f.userId, operationId: "final-draw" }, { type: "CANCEL_BOOKING", bookingId: booking.id },
      { type: "RESCHEDULE", bookingId: booking.id, slotId: booking.slotId }, { type: "BOOK_PRIZE", awardId: award.id, slotId: activity.pool[1].slots[0].id },
      { type: "VERIFY", credential: award.credential, action: "CLAIM", location: award.location },
    ];
    for (const command of commands) { expect(f.run(command).ok).toBe(false); expect(f.state).toBe(before); }
    expect(resolveCredential(f.state, award.credential, f.ctx).error).toBeTruthy();
  });
  it("configuration/import/copy audits do not prevent deleting a genuinely unused draft", () => {
    const f = fixture(true);
    expect(f.run({ type: "IMPORT_CODES", activityId: f.activity.id, poolItemId: f.activity.pool[3].id, codes: ["FINAL-DRAFT"] }).ok).toBe(true);
    expect(f.run({ type: "DELETE_ACTIVITY", activityId: f.activity.id }).ok).toBe(true);
    expect(f.state.activities).toEqual([]); expect(f.state.audits.some((row) => row.action === "DELETE_ACTIVITY" && row.result === "SUCCESS")).toBe(true);
  });
  it.each(["participations", "bookings", "chances", "draws", "awards", "redemptions"] as const)("orphan %s alone prevents hard deletion of a technical draft", (key) => {
    const f = fixture(); f.win(); const fact = structuredClone(f.state[key][0]);
    for (const name of ["participations", "bookings", "chances", "draws", "awards", "redemptions", "audits"] as const) f.state[name].length = 0;
    // Deliberately corrupt legacy association: deletion must still protect the persisted fact.
    (f.state[key] as typeof fact[]).push(fact);
    f.state.activities[0].status = "DRAFT"; f.state.activities[0].publishedAt = undefined;
    expect(f.run({ type: "DELETE_ACTIVITY", activityId: f.activity.id }).ok).toBe(false);
    expect(f.state.activities).toHaveLength(1); expect(f.state[key]).toEqual([fact]);
  });
  it.each(["PAUSED", "CANCELED"] as const)("%s preserves saved awards/codes and blocks new draws/registration", (status) => {
    const f = fixture(); f.win(0.65); const before = structuredClone(f.state);
    expect(f.run({ type: "STATUS", activityId: f.activity.id, status }).ok).toBe(true);
    expect(f.run({ type: "REGISTER", activityId: f.activity.id, userId: f.userId, slotId: f.activity.slots[0].id }).ok).toBe(false);
    expect(f.run({ type: "DRAW", activityId: f.activity.id, userId: f.userId, operationId: "blocked-new" }).ok).toBe(false);
    expect(f.state.awards).toEqual(before.awards); expect(f.state.draws).toEqual(before.draws); expect(f.state.activities[0].pool[3].codes).toEqual(before.activities[0].pool[3].codes);
    expect(f.state.redemptions).toEqual(before.redemptions);
    expect(decodeMarketing(JSON.stringify(f.state)).state?.awards).toEqual(before.awards);
  });
});

describe("Final Acceptance fulfilled metric and issued content", () => {
  it("reservation state is waiting / booked / claimed, while expiry keeps history occupied", () => {
    const f = fixture(), award = f.win(0.3);
    expect(awardFulfillmentLabel(f.state, award, now)).toBe("待预约");
    expect(f.run({ type: "BOOK_PRIZE", awardId: award.id, slotId: f.activity.pool[1].slots[0].id }).ok).toBe(true);
    expect(awardFulfillmentLabel(f.state, f.state.awards[0], now)).toBe("已预约 / 待领取");
    expect(f.run({ type: "VERIFY", credential: award.credential, action: "CLAIM", location: award.location, slotId: f.activity.pool[1].slots[0].id }).ok).toBe(true);
    expect(awardFulfillmentLabel(f.state, f.state.awards[0], now)).toBe("已领取");
    const g = fixture(), expired = g.win();
    expect(awardFulfillmentLabel(g.state, expired, Date.parse(expired.claimEnd))).toBe("已过期（占用不返池）");
    expect(quota(g.state, g.activity.id, g.activity.pool[0]).occupied).toBe(1);
  });
  it("unknown prize types and missing virtual content do not masquerade as fulfilled", () => {
    const f = fixture(), award = f.win(0.65); f.state.awards[0].virtualContent = undefined;
    expect(activityMetrics(f.state, f.activity, now).at(-1)?.rows).toEqual([]);
    expect(awardFulfillmentLabel(f.state, f.state.awards[0], now)).toBe("发放资料待核对");
    f.state.awards[0].prizeType = "UNKNOWN"; f.state.awards[0].fulfilledAt = award.wonAt;
    expect(activityMetrics(f.state, f.activity, now).at(-1)?.rows).toEqual([]);
  });
  it.each(["REDEMPTION_CODE", "VIRTUAL_VOUCHER", "LINK"] as const)("%s counts platform-side issuance, never onsite redemption", (method) => {
    const f = fixture(), item = f.activity.pool[3]; Object.assign(item, { method, voucherName: "Demo voucher", voucherDescription: "Demo only", link: "https://example.com/demo" });
    const award = f.win(0.65), snapshot = structuredClone(award);
    expect(awardFulfillmentLabel(f.state, award, now)).toBe(method === "REDEMPTION_CODE" ? "兑换码已分配" : method === "VIRTUAL_VOUCHER" ? "权益已生成" : "领取链接已生成");
    expect(activityMetrics(f.state, f.state.activities[0], now).find((row) => row.label === "已履约份数")?.rows).toEqual([award]);
    expect(f.run({ type: "VERIFY", credential: award.credential, action: "CLAIM", location: "" }).ok).toBe(false);
    expect(f.state.awards[0]).toEqual(snapshot); expect(f.state.redemptions.some((row) => row.type === "PRIZE_CLAIM" && row.result === "SUCCESS")).toBe(false);
    expect(award.fulfilledAt).toBeUndefined();
  });
  it("physical issuance is counted only after real onsite fulfillment and repeat claim is idempotent", () => {
    const f = fixture(), award = f.win();
    expect(activityMetrics(f.state, f.activity, now).at(-1)?.rows).toEqual([]);
    const command = { type: "VERIFY" as const, credential: award.credential, action: "CLAIM" as const, location: award.location };
    expect(f.run(command).ok).toBe(true); const before = structuredClone(f.state);
    expect(f.run(command).ok).toBe(true); expect(f.state).toEqual(before);
    expect(activityMetrics(f.state, f.activity, now).at(-1)?.rows).toHaveLength(1);
  });
  it("ended activity and lottery do not invalidate a still-valid physical claim", () => {
    const f = fixture(), award = f.win(); f.ctx.now = Date.parse(f.activity.lotteryEnd) + 1000;
    expect(f.ctx.now).toBeGreaterThan(Date.parse(f.activity.endAt)); expect(f.ctx.now).toBeLessThan(Date.parse(award.claimEnd));
    expect(f.run({ type: "VERIFY", credential: award.credential, action: "CLAIM", location: award.location }).ok).toBe(true);
    expect(f.state.awards[0].fulfilledAt).toBeTruthy();
  });
});
