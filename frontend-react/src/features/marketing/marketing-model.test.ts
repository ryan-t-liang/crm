import { describe, expect, it } from "vitest";
import { createDemoState } from "@/mock/demo-data";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";
import { createDemoMarketingActivity as createMarketingActivity, createMarketingDemoState } from "@/mock/marketing-demo-data";
import { decodeMarketing, MARKETING_STORAGE_KEY, MARKETING_V1_BACKUP_KEY, saveMarketing } from "./marketing-storage";
import { parseMarketingCodes } from "./marketing-code-import";
import type { MarketingActivity, MarketingState } from "@/types/marketing";
import { activityMetrics, bookingStatus, chances, codeInventory, executeMarketing, fulfillmentCapacity, identityFor, participationFor, quota, resolveCredential, slotOccupancy, validateActivity as validateActivityAt, winnable, type MarketingCommand, type MarketingContext } from "./marketing-model";

const now = Date.parse("2026-09-17T06:00:00Z");
// Publication capacity is time-dependent; existing scenarios use their fixed fixture clock.
const validateActivity = (activity: MarketingActivity, state: MarketingState, brands: MarketingActivity["brand"][]) => validateActivityAt(activity, state, brands, now);
function fixture(patch: Partial<MarketingActivity> = {}) {
  const sales = createDemoState(), members = createMemberOperationsDemoState();
  const activity = { ...createMarketingActivity("gp", now), id: "activity-test", status: "PUBLISHED" as const, publishedAt: new Date(now).toISOString(), ...patch };
  activity.pool.forEach((item) => { item.activityId = activity.id; });
  const users = members.brandUsers.filter((row) => row.brand === "gp" && row.is_deleted === 0);
  let serial = 0;
  const ctx: MarketingContext = { actor: sales.users[0], members, now, random: () => 0.1, id: () => `id-${++serial}` };
  let state: MarketingState = { version: 2, revision: 0, seededAt: new Date(now).toISOString(), activities: [activity], participations: [], bookings: [], chances: [], draws: [], awards: [], audits: [], redemptions: [] };
  const run = (command: MarketingCommand, extra: Partial<MarketingContext> = {}) => { const result = executeMarketing(state, command, { ...ctx, ...extra }); state = result.state; return result; };
  const register = (userId = users[0].id, slotId = activity.slots[0].id) => run({ type: "REGISTER", activityId: activity.id, userId, slotId: activity.bookingEnabled ? slotId : undefined });
  const verify = (action: "CHECKIN" | "COMPLETE" | "CLAIM", credential = state.participations[0].credential, extra: Partial<MarketingContext> = {}, location = activity.location, slotId = activity.slots[0]?.id) => run({ type: "VERIFY", action, credential, location, slotId }, extra);
  const complete = () => { expect(register().ok).toBe(true); expect(verify("CHECKIN").ok).toBe(true); expect(verify("COMPLETE").ok).toBe(true); };
  const draw = (operationId = "draw-test", extra: Partial<MarketingContext> = {}) => run({ type: "DRAW", activityId: activity.id, userId: users[0].id, operationId }, extra);
  return { sales, members, activity, users, ctx, run, register, verify, complete, draw, get state() { return state; } };
}

describe("Marketing configuration and compatibility", () => {
  it("saves incomplete draft, rejects invalid publish, edits, publishes, pauses, resumes and copies", () => {
    const f = fixture(); const draft = { ...f.activity, id: "new", pool: f.activity.pool.map((item) => ({ ...item, activityId: "new", codes: item.codes.map((code) => ({ code: `NEW-${code.code}` })) })), name: "草稿", description: "", status: "DRAFT" as const, publishedAt: undefined };
    expect(f.run({ type: "SAVE_ACTIVITY", activity: draft }).ok).toBe(true);
    // Description is optional; reservation drafts without sessions still cannot be published.
    expect(f.run({ type: "SAVE_ACTIVITY", activity: { ...draft, slots: [] } }).ok).toBe(true);
    expect(f.run({ type: "STATUS", activityId: "new", status: "PUBLISHED" }).ok).toBe(false);
    expect(f.run({ type: "SAVE_ACTIVITY", activity: { ...draft, description: "完整配置" } }).ok).toBe(true);
    expect(f.run({ type: "STATUS", activityId: "new", status: "PUBLISHED" }).ok).toBe(true);
    expect(f.run({ type: "STATUS", activityId: "new", status: "PAUSED" }).ok).toBe(true);
    expect(f.run({ type: "STATUS", activityId: "new", status: "PUBLISHED" }).ok).toBe(true);
    const copied = f.run({ type: "COPY_ACTIVITY", activityId: "new" });
    expect(f.state.activities.find((row) => row.id === copied.resultId)?.status).toBe("DRAFT");
  });
  it("hides disabled capability validation and completes without lottery or imaginary slot", () => {
    const f = fixture({ bookingEnabled: false, lotteryEnabled: false, slots: [], bookingStart: "", bookingEnd: "", lotteryStart: "", lotteryEnd: "", grantCount: 0, drawLimit: 0, pool: [], completion: "CHECKIN" });
    expect(validateActivity(f.activity, f.state, ["gp"])).toEqual([]);
    expect(f.register(f.users[0].id, "").ok).toBe(true);
    expect(f.verify("CHECKIN").ok).toBe(true);
    expect(f.state.participations[0].completedAt).toBeTruthy(); expect(f.state.chances).toHaveLength(0);
    expect(f.draw().ok).toBe(false);
  });
  it("rejects time order, wrong brand, online automatic completion, missing inventory and invalid numeric probabilities", () => {
    const f = fixture();
    for (const patch of [{ brand: "un" as const }, { endAt: f.activity.startAt }, { location: "" }, { mode: "ONLINE" as const, completion: "CHECKIN" as const }, { grantCount: 3 }, { dailyLimit: 0 }, { noWinProbability: -1 }, { noWinProbability: NaN }, { noWinProbability: null as unknown as number }, { noWinProbability: 21 }]) expect(validateActivity({ ...f.activity, ...patch }, f.state, ["gp"]).length).toBeGreaterThan(0);
    expect(validateActivity({ ...f.activity, pool: f.activity.pool.map((row) => ({ ...row, quota: 0 })) }, f.state, ["gp"]).length).toBeGreaterThan(0);
  });
  it("validates activity slot cutoff/range and separate prize capacity/range", () => {
    const f = fixture(), a = structuredClone(f.activity);
    a.slots[0].bookingClosesAt = a.slots[0].endAt; expect(validateActivity(a, f.state, ["gp"])).not.toEqual([]);
    a.slots[0].startAt = new Date(now - 100 * 60_000).toISOString(); expect(validateActivity(a, f.state, ["gp"])).not.toEqual([]);
    const b = structuredClone(f.activity); b.pool[1].slots[0].capacity = 1; b.pool[1].claimEnd = b.startAt;
    expect(validateActivity(b, f.state, ["gp"])).not.toEqual([]);
    const c = structuredClone(f.activity); c.pool[1].id = c.pool[0].id; expect(validateActivity(c, f.state, ["gp"])).not.toEqual([]);
  });
  it("locks published rules, appends quota with audit, protects capacity and occupied slots", () => {
    const f = fixture();
    expect(f.run({ type: "SAVE_ACTIVITY", activity: { ...f.activity, grantCount: 1 } }).ok).toBe(false);
    expect(f.run({ type: "SAVE_ACTIVITY", activity: { ...f.activity, name: "更新说明" } }).ok).toBe(true);
    expect(f.run({ type: "ADD_QUOTA", activityId: f.activity.id, poolItemId: f.activity.pool[0].id, count: 1 }).ok).toBe(true);
    expect(f.state.audits.at(-1)?.detail).toContain("追加配额");
    expect(f.run({ type: "ADD_QUOTA", activityId: f.activity.id, poolItemId: f.activity.pool[0].id, count: -1 }).ok).toBe(false);
    expect(f.run({ type: "ADD_QUOTA", activityId: f.activity.id, poolItemId: f.activity.pool[1].id, count: 100 }).ok).toBe(false);
    expect(f.run({ type: "ADD_PRIZE_SLOT", activityId: f.activity.id, poolItemId: f.activity.pool[1].id, slot: { ...f.activity.pool[1].slots[0], id: "extra-100", capacity: 100 } }).ok).toBe(true);
    expect(f.run({ type: "ADD_QUOTA", activityId: f.activity.id, poolItemId: f.activity.pool[1].id, count: 100 }).ok).toBe(true);
    expect(f.run({ type: "DELETE_ACTIVITY", activityId: f.activity.id }).ok).toBe(false);
  });
  it("seeds four activities ONCE with current user references and all required business fixtures", () => {
    const f = fixture(), seed = createMarketingDemoState(f.members, now);
    expect(seed.activities).toHaveLength(4); expect(seed.activities[2].lotteryEnabled).toBe(false);
    expect(seed.activities[1].bookingEnabled).toBe(false); expect(Date.parse(seed.activities[3].endAt)).toBeLessThan(now);
    expect(seed.participations.every((row) => row.identities.every((ref) => f.members.brandUsers.some((user) => user.id === ref.userId && user.brand === ref.brand)))).toBe(true);
    expect(seed.draws.some((row) => row.poolItemId === null)).toBe(true);
    expect(seed.awards.some((row) => row.fulfilledAt)).toBe(true); expect(seed.awards.some((row) => Date.parse(row.claimEnd) < now && !row.fulfilledAt)).toBe(true);
    expect(quota(seed, seed.activities[3].id, seed.activities[3].pool[1]).available).toBe(0);
  });
  it("decodes v2 lacking revision without reseeding and preserves unknown/corrupt data", () => {
    const f = fixture(), raw = JSON.stringify({ ...f.state, revision: undefined });
    expect(decodeMarketing(raw).state?.revision).toBe(0); expect(decodeMarketing(raw).state?.activities[0].id).toBe(f.activity.id);
    expect(decodeMarketing('{"version":9}').issue).toBeTruthy(); expect(decodeMarketing("broken").state).toBeUndefined();
    expect(MARKETING_STORAGE_KEY).not.toBe("kivisense-sales-prototype-v1");
  });
  it("missing record fields block unreadable data rather than treating it as empty zero", () => {
    const f = fixture();
    expect(decodeMarketing(JSON.stringify({ ...f.state, activities: [{ id: "incomplete" }] })).state).toBeUndefined();
    expect(decodeMarketing(JSON.stringify({ ...f.state, participations: [{ id: "incomplete", activityId: f.activity.id }] })).issue).toBeTruthy();
    expect(decodeMarketing(JSON.stringify({ ...f.state, activities: [{ ...f.activity, lotteryEnabled: undefined }] })).issue).toBeTruthy();
    expect(decodeMarketing(JSON.stringify({ ...f.state, activities: [{ ...f.activity, grantCount: null }] })).state).toBeUndefined();
  });
});

describe("Marketing bookings, subjects and completion", () => {
  it("cannot overbook last slot with repeated submissions, cancel frees capacity, failed reschedule preserves original", () => {
    const f = fixture(); f.activity.slots[0].capacity = 1;
    expect(f.register().ok).toBe(true); expect(f.register().ok).toBe(true);
    expect(slotOccupancy(f.state, f.activity.id, "ACTIVITY", f.activity.slots[0].id)).toBe(1);
    const other = f.users.find((user) => user.customer_id !== f.users[0].customer_id)!;
    expect(f.register(other.id).ok).toBe(false);
    const booking = f.state.bookings[0]; expect(f.run({ type: "RESCHEDULE", bookingId: booking.id, slotId: "missing" }).ok).toBe(false);
    expect(f.state.bookings[0].status).toBe("BOOKED");
    expect(f.run({ type: "CANCEL_BOOKING", bookingId: booking.id }).ok).toBe(true);
    expect(f.register(other.id).ok).toBe(true);
    expect(f.state.bookings.filter((row) => row.status === "BOOKED")).toHaveLength(1);
  });
  it("cancel/rebook preserves participation, repeated check-in/completion only grants once", () => {
    const f = fixture(); f.register(); const pid = f.state.participations[0].id;
    f.run({ type: "CANCEL_BOOKING", bookingId: f.state.bookings[0].id }); f.register();
    expect(f.state.participations).toHaveLength(1); expect(f.state.participations[0].id).toBe(pid); expect(f.state.chances).toHaveLength(0);
    f.verify("CHECKIN"); f.verify("CHECKIN"); expect(f.state.chances).toHaveLength(0);
    f.verify("COMPLETE"); f.verify("COMPLETE"); expect(f.state.chances).toHaveLength(1); expect(chances(f.state, f.state.participations[0]).earned).toBe(2);
    expect(f.run({ type: "CANCEL_BOOKING", bookingId: f.state.bookings.find((row) => row.status === "CHECKED_IN")!.id }).ok).toBe(false);
  });
  it("same reliable customer aliases share one participant; phone and UnionID never infer a merge", () => {
    const f = fixture(); const clone = { ...f.users[0], id: "same-customer", openid: "different-openid" }; f.members.brandUsers.push(clone);
    f.register(); expect(f.register(clone.id).ok).toBe(true); expect(f.state.participations).toHaveLength(1); expect(f.state.participations[0].identities).toHaveLength(2);
    const detached = { ...clone, id: "detached", customer_id: null }; f.members.brandUsers.push(detached); expect(f.register(detached.id).ok).toBe(true);
    expect(f.state.participations).toHaveLength(2); expect(identityFor(f.members, detached.id, f.activity).subjectKey).toBe("user:detached");
  });
  it("association changes preserve original ledger and conflicting identities stop draws", () => {
    const f = fixture(); f.complete(); const originalKey = f.state.participations[0].subjectKey;
    f.members.brandUsers.find((row) => row.id === f.users[0].id)!.customer_id = null;
    expect(participationFor(f.state, f.activity, f.members, f.users[0].id).participation?.subjectKey).toBe(originalKey);
    expect(f.state.chances).toHaveLength(1);
    f.state.participations.push({ ...structuredClone(f.state.participations[0]), id: "conflicting", credential: "ACT-conflict" });
    expect(f.draw().error).toContain("冲突"); expect(f.state.draws).toHaveLength(0);
  });
  it("reassigned customer aliases reuse the frozen participation rather than minting new opportunities", () => {
    const f = fixture(); f.complete(); const other = f.users.find((row) => row.customer_id !== f.users[0].customer_id && row.customer_id !== null)!;
    const original = f.state.participations[0].subjectKey;
    f.members.brandUsers.find((row) => row.id === f.users[0].id)!.customer_id = other.customer_id;
    expect(participationFor(f.state, f.activity, f.members, other.id).participation?.subjectKey).toBe(original);
    const originalBookingCount = f.state.bookings.length;
    expect(f.register(other.id).ok).toBe(true); // Existing reservation is returned idempotently.
    expect(f.state.bookings).toHaveLength(originalBookingCount); expect(f.state.participations).toHaveLength(1); expect(f.state.chances).toHaveLength(1);
    expect(chances(f.state, f.state.participations[0]).earned).toBe(2);
    expect(f.run({ type: "DRAW", activityId: f.activity.id, userId: other.id, operationId: "alias-after-change" }).ok).toBe(true);
    expect(f.state.draws[0].participationId).toBe(f.state.participations[0].id); expect(f.state.chances).toHaveLength(1);
  });
  it("reassignment collision between existing subjects blocks both aliases without merging history", () => {
    const f = fixture(); f.complete(); const other = f.users.find((row) => row.customer_id !== f.users[0].customer_id && row.customer_id !== null)!;
    f.register(other.id); const originalParticipants = structuredClone(f.state.participations);
    f.members.brandUsers.find((row) => row.id === f.users[0].id)!.customer_id = other.customer_id;
    expect(f.draw().error).toContain("冲突");
    expect(f.run({ type: "DRAW", activityId: f.activity.id, userId: other.id, operationId: "collision" }).ok).toBe(false);
    expect(f.state.participations).toEqual(originalParticipants); expect(f.state.chances).toHaveLength(1); expect(f.state.draws).toHaveLength(0);
  });
  it("rejects wrong brand, deleted/missing identities and dangling references without reassigning", () => {
    const f = fixture(); const un = f.members.brandUsers.find((row) => row.brand === "un")!;
    expect(f.register(un.id).ok).toBe(false); expect(f.register("missing").ok).toBe(false);
    f.complete(); f.members.brandUsers.find((row) => row.id === f.users[0].id)!.openid = "reset-new-identity";
    expect(f.draw().ok).toBe(false); expect(resolveCredential(f.state, f.state.participations[0].credential, f.ctx).error).toContain("待核对");
    const g = fixture(); g.members.brandUsers.find((row) => row.id === g.users[0].id)!.is_deleted = 1;
    expect(g.register().ok).toBe(false);
  });
  it("staff walk-in still checks capacity and window; no-show is only after closed check-in window", () => {
    const f = fixture(); f.activity.slots[0].capacity = 1; expect(f.run({ type: "REGISTER", activityId: f.activity.id, userId: f.users[0].id, slotId: f.activity.slots[0].id, walkIn: true }).ok).toBe(true);
    const other = f.users.find((user) => user.customer_id !== f.users[0].customer_id)!;
    expect(f.run({ type: "REGISTER", activityId: f.activity.id, userId: other.id, slotId: f.activity.slots[0].id, walkIn: true }).ok).toBe(false);
    const end = Date.parse(f.activity.slots[0].checkinEnd);
    expect(bookingStatus(f.state.bookings[0], f.activity.slots[0], end - 1)).toBe("BOOKED");
    expect(bookingStatus(f.state.bookings[0], f.activity.slots[0], end)).toBe("NO_SHOW");
    expect(f.verify("CHECKIN", undefined, { now: end }).ok).toBe(false); expect(f.state.participations[0].checkedInAt).toBeUndefined();
  });
  it("online completion works without fake check-in; check-in and prize credentials cannot substitute", () => {
    const f = fixture({ mode: "ONLINE", bookingEnabled: false, slots: [] }); f.register(f.users[0].id, "");
    expect(f.verify("CHECKIN").ok).toBe(false); expect(f.verify("COMPLETE").ok).toBe(true); expect(f.state.participations[0].checkedInAt).toBeUndefined();
    expect(f.verify("CLAIM").ok).toBe(false); f.draw(); expect(f.verify("COMPLETE", f.state.awards[0].credential).ok).toBe(false);
  });
});

describe("Marketing atomic draws, inventory and fulfillment", () => {
  it("does not draw on mere booking, before/after window, at zero chances or invalid random source", () => {
    const f = fixture(); f.register(); expect(f.draw().ok).toBe(false); f.verify("CHECKIN"); expect(f.draw().ok).toBe(false); f.verify("COMPLETE");
    expect(f.draw("early", { now: Date.parse(f.activity.lotteryStart) - 1 }).ok).toBe(false);
    expect(f.draw("late", { now: Date.parse(f.activity.lotteryEnd) }).ok).toBe(false);
    expect(f.draw("bad", { random: () => NaN }).ok).toBe(false); expect(f.state.draws).toHaveLength(0);
    f.state.chances = []; expect(f.draw().ok).toBe(false);
  });
  it("failed random source creates no orphan cost, result, award or stock", () => {
    const f = fixture(); f.complete(); const before = structuredClone(f.state);
    expect(f.draw("failed", { random: () => { throw new Error("test failure"); } }).ok).toBe(false);
    expect(f.state.draws).toEqual(before.draws); expect(f.state.awards).toEqual(before.awards); expect(f.state.chances).toEqual(before.chances);
    expect(quota(f.state, f.activity.id, f.activity.pool[0]).available).toBe(10);
  });
  it("saved operation cannot be replayed under another participation or unauthorized brand", () => {
    const f = fixture(); f.complete(); f.draw();
    const other = f.users.find((row) => row.customer_id !== f.users[0].customer_id)!; f.register(other.id);
    expect(f.run({ type: "DRAW", activityId: f.activity.id, userId: other.id, operationId: "draw-test" }).ok).toBe(false);
    const restricted = { brands: ["un" as const], manage: true, redeem: true, preview: true };
    expect(resolveCredential(f.state, f.state.participations[0].credential, { ...f.ctx, access: restricted }).error).toBeTruthy();
    expect(f.run({ type: "VERIFY", credential: f.state.participations[0].credential, action: "COMPLETE", location: f.activity.location }, { access: restricted }).ok).toBe(false);
    expect(f.state.draws).toHaveLength(1);
  });
  it("first win occupies quota; win limit leaves remaining opportunity unused; repeat/reload return saved result", () => {
    const f = fixture(); f.complete(); const a = f.draw(); expect(a.ok).toBe(true);
    expect(chances(f.state, f.state.participations[0])).toEqual({ earned: 2, used: 1, remaining: 1 });
    expect(quota(f.state, f.activity.id, f.activity.pool[0])).toEqual({ total: 10, occupied: 1, held: 1, issued: 0, available: 9 });
    expect(f.draw("next").error).toContain("中奖上限"); expect(f.draw().resultId).toBe(a.resultId);
    const reloaded = decodeMarketing(JSON.stringify(f.state)).state!;
    const retry = executeMarketing(reloaded, { type: "DRAW", activityId: f.activity.id, userId: f.users[0].id, operationId: "draw-test" }, { ...f.ctx, random: () => { throw new Error("retry must not call RNG"); } });
    expect(retry.resultId).toBe(a.resultId); expect(retry.state.draws).toHaveLength(1); expect(retry.state.awards).toHaveLength(1);
    expect(f.verify("CLAIM", f.state.awards[0].credential).ok).toBe(true); expect(f.verify("CLAIM", f.state.awards[0].credential).ok).toBe(true);
    expect(quota(f.state, f.activity.id, f.activity.pool[0])).toEqual({ total: 10, occupied: 1, held: 0, issued: 1, available: 9 });
  });
  it("NONE consumes once, remaining effective probability zero or no inventory consumes none", () => {
    const f = fixture(); f.complete(); expect(f.draw("none", { random: () => 0.95 }).ok).toBe(true); expect(f.state.draws[0].poolItemId).toBeNull(); expect(f.state.awards).toHaveLength(0);
    f.state.activities[0].pool.forEach((row) => { row.quota = 0; }); expect(f.draw("no-stock").ok).toBe(false); expect(f.state.draws).toHaveLength(1);
    f.state.activities[0].pool.forEach((row) => { row.quota = 1; row.probability = 0; }); expect(f.draw("no-prob").ok).toBe(false); expect(f.state.draws).toHaveLength(1);
  });
  it("exhausted item probability and personal item cap become NONE without redistribution", () => {
    const f = fixture({ winLimit: 2 }); f.complete(); f.state.activities[0].pool[0].quota = 0;
    expect(f.draw().ok).toBe(true); expect(f.state.draws[0].poolItemId).toBeNull(); expect(f.state.awards).toHaveLength(0);
    const g = fixture({ winLimit: 2 }); g.complete(); g.draw(); expect(g.draw("second").ok).toBe(true);
    expect(g.state.draws[1].poolItemId).toBeNull(); expect(g.state.awards).toHaveLength(1);
  });
  it("daily boundary uses Shanghai and cumulative limit stops even with artificially excess ledger", () => {
    const f = fixture({ dailyLimit: 1, lotteryEnd: "2026-09-19T12:00:00+08:00", winLimit: 2 }); f.complete(); f.draw("first", { random: () => 0.95 });
    expect(f.draw("same-day", { random: () => 0.95 }).error).toContain("今日");
    expect(f.draw("next-day", { now: Date.parse("2026-09-17T16:00:00Z"), random: () => 0.95 }).ok).toBe(true);
    f.state.chances[0].count = 3;
    expect(f.draw("cumulative", { now: Date.parse("2026-09-18T16:00:00Z") }).error).toContain("累计抽奖"); expect(f.state.draws).toHaveLength(2);
  });
  it("invalid location/type/slot cannot fulfill; expired rights keep occupied stock", () => {
    const f = fixture(); f.complete(); f.draw(); const award = f.state.awards[0];
    expect(f.verify("CLAIM", award.credential, {}, "wrong-place").ok).toBe(false);
    expect(f.verify("CLAIM", award.credential, { now: Date.parse(award.claimEnd) }).ok).toBe(false);
    expect(quota(f.state, f.activity.id, f.activity.pool[0]).held).toBe(1); expect(f.state.awards[0].fulfilledAt).toBeUndefined();
    const g = fixture(); g.register(); expect(g.verify("CHECKIN", undefined, {}, g.activity.location, "wrong-slot").ok).toBe(false);
  });
  it("prize reservation cancel only releases slot; full/failed reschedule leaves booking and award untouched", () => {
    const f = fixture(); f.complete(); f.draw("pickup", { random: () => 0.4 }); const award = f.state.awards[0], item = f.activity.pool[1];
    expect(f.verify("CLAIM", award.credential).ok).toBe(false);
    expect(f.run({ type: "BOOK_PRIZE", awardId: award.id, slotId: item.slots[0].id }).ok).toBe(true);
    const booking = f.state.bookings.find((row) => row.kind === "PRIZE")!;
    expect(f.run({ type: "RESCHEDULE", bookingId: booking.id, slotId: "missing" }).ok).toBe(false); expect(f.state.bookings.find((row) => row.id === booking.id)?.status).toBe("BOOKED");
    expect(f.run({ type: "CANCEL_BOOKING", bookingId: booking.id }).ok).toBe(true); expect(f.state.awards).toHaveLength(1); expect(quota(f.state, f.activity.id, item).held).toBe(1);
    f.state.activities[0].pool[1].slots[0].capacity = 0; expect(f.run({ type: "BOOK_PRIZE", awardId: award.id, slotId: item.slots[0].id }).ok).toBe(false);
    f.state.activities[0].pool[1].slots[0].capacity = 20;
    expect(f.run({ type: "BOOK_PRIZE", awardId: award.id, slotId: item.slots[0].id }).ok).toBe(true);
    expect(f.verify("CLAIM", award.credential, {}, item.slots[0].location, item.slots[0].id).ok).toBe(true);
    expect(f.state.bookings.find((row) => row.status === "FULFILLED")?.kind).toBe("PRIZE"); expect(chances(f.state, f.state.participations[0]).used).toBe(1);
  });
  it("ended/paused/canceled activity preserves existing prize fulfillment and paused check-in/completion", () => {
    const f = fixture(); f.register(); f.run({ type: "STATUS", activityId: f.activity.id, status: "PAUSED" });
    expect(f.register(f.users[1].id).ok).toBe(false); expect(f.verify("CHECKIN").ok).toBe(true); expect(f.verify("COMPLETE").ok).toBe(true); expect(f.draw().ok).toBe(false);
    f.run({ type: "STATUS", activityId: f.activity.id, status: "PUBLISHED" }); f.draw(); f.run({ type: "STATUS", activityId: f.activity.id, status: "CANCELED" });
    expect(f.state.awards).toHaveLength(1); expect(f.verify("CLAIM", f.state.awards[0].credential, { now: Date.parse(f.activity.endAt) + 1 }).ok).toBe(true);
    expect(f.run({ type: "STATUS", activityId: f.activity.id, status: "PUBLISHED" }).ok).toBe(false);
    const g = fixture(); g.register(); g.run({ type: "STATUS", activityId: g.activity.id, status: "CANCELED" }); expect(g.state.bookings[0].status).toBe("CANCELED"); expect(g.verify("CHECKIN").ok).toBe(false);
  });
  it("snapshot prize promises survive activity-prize edits and used prizes cannot be removed", () => {
    const f = fixture(); f.complete(); f.draw(); const snapshot = structuredClone(f.state.awards[0]);
    expect(f.run({ type: "SAVE_ACTIVITY_PRIZE", activityId: f.activity.id, prize: { ...f.state.activities[0].pool[0], name: "改名", description: "新说明" } }).ok).toBe(true);
    expect(f.state.awards[0]).toEqual(snapshot); expect(f.run({ type: "DELETE_ACTIVITY_PRIZE", activityId: f.activity.id, poolItemId: f.activity.pool[0].id }).ok).toBe(false);
  });
  it("activity metrics use same source, unique people versus attempts, canceled history not active", () => {
    const f = fixture({ winLimit: 2 }); f.complete(); f.draw("none", { random: () => 0.95 }); f.draw("win");
    const counts = Object.fromEntries(activityMetrics(f.state, f.state.activities[0], now).map((metric) => [metric.label, metric.rows.length]));
    expect(counts).toEqual({ 当前有效预约人数: 1, 到场人数: 1, 完成人数: 1, 抽奖人数: 1, 抽奖次数: 2, 中奖人数: 1, 中奖份数: 1, "已履约份数": 0 });
    const g = fixture(); g.register(); g.run({ type: "CANCEL_BOOKING", bookingId: g.state.bookings[0].id }); expect(activityMetrics(g.state, g.activity, now)[0].rows).toHaveLength(0); expect(g.state.bookings).toHaveLength(1);
  });
  it("read-only/brand-scoped/distributor actions deny writes and never mutate sales or member records", () => {
    const f = fixture(), salesBefore = JSON.stringify(f.sales), membersBefore = JSON.stringify(f.members);
    const readonly = { brands: ["gp" as const], manage: false, redeem: false, preview: false };
    expect(f.run({ type: "STATUS", activityId: f.activity.id, status: "PAUSED" }, { access: readonly }).ok).toBe(false);
    expect(f.run({ type: "REGISTER", activityId: f.activity.id, userId: f.users[0].id, slotId: f.activity.slots[0].id }, { access: readonly }).ok).toBe(false);
    const limited = { ...readonly, brands: ["un" as const] }; expect(f.run({ type: "COPY_ACTIVITY", activityId: f.activity.id }, { access: limited }).ok).toBe(false);
    const partner = f.sales.users.find((row) => row.role !== "HQ_ADMIN")!; expect(f.register().ok).toBe(true);
    expect(f.run({ type: "VERIFY", credential: f.state.participations[0].credential, action: "CHECKIN", location: f.activity.location, slotId: f.activity.slots[0].id }, { actor: partner }).ok).toBe(false);
    f.verify("CHECKIN"); f.verify("COMPLETE"); f.draw();
    expect(JSON.stringify(f.sales)).toBe(salesBefore); expect(JSON.stringify(f.members)).toBe(membersBefore);
  });
});

describe("V2 activity-owned prizes and virtual delivery", () => {
  it("multiple activities with same-name prizes have independent quota, bookings and all records", () => {
    const f = fixture(); f.complete(); f.draw();
    const second = createMarketingActivity("gp", now);
    second.name = f.activity.name;
    expect(f.run({ type: "SAVE_ACTIVITY", activity: second }).ok).toBe(true);
    expect(second.pool[0].name).toBe(f.activity.pool[0].name);
    expect(quota(f.state, second.id, second.pool[0]).occupied).toBe(0);
    for (const rows of [f.state.bookings, f.state.participations, f.state.chances, f.state.draws, f.state.awards, f.state.redemptions]) expect(rows.every((row) => row.activityId === f.activity.id)).toBe(true);
    const before = structuredClone(f.state.activities[0]);
    expect(f.run({ type: "SAVE_ACTIVITY_PRIZE", activityId: second.id, prize: { ...second.pool[0], name: "独立改名", quota: 2 } }).ok).toBe(true);
    expect(f.state.activities[0]).toEqual(before);
    expect(f.run({ type: "SAVE_ACTIVITY_PRIZE", activityId: second.id, prize: f.activity.pool[0] }).ok).toBe(false);
  });
  it("copy clones owned configs and slots but no codes, allocations, held stock or business records", () => {
    const f = fixture(); f.complete(); f.draw("code", { random: () => 0.65 });
    const before = [f.state.participations.length, f.state.bookings.length, f.state.draws.length, f.state.awards.length, f.state.redemptions.length];
    const result = f.run({ type: "COPY_ACTIVITY", activityId: f.activity.id }), copy = f.state.activities.find((row) => row.id === result.resultId)!;
    expect(result.ok).toBe(true); expect(copy.status).toBe("DRAFT"); expect(copy.publishedAt).toBeUndefined();
    expect(copy.pool).toHaveLength(f.activity.pool.length);
    expect(copy.pool.every((item) => item.activityId === copy.id && !item.codes.length && !f.activity.pool.some((old) => old.id === item.id))).toBe(true);
    expect(copy.slots[0].id).not.toBe(f.activity.slots[0].id);
    expect([f.state.participations.length, f.state.bookings.length, f.state.draws.length, f.state.awards.length, f.state.redemptions.length]).toEqual(before);
    expect(copy.pool.every((item) => quota(f.state, copy.id, item).occupied === 0)).toBe(true);
    expect(f.run({ type: "STATUS", activityId: copy.id, status: "PUBLISHED" }).error).toContain("兑换码不足");
  });
  it("invalid inventory/probability never saves, even in a draft or disabled lottery", () => {
    const f = fixture(), draft = { ...createMarketingActivity("gp", now), lotteryEnabled: false };
    for (const amount of [-1, NaN, 1.2, Infinity]) {
      const activity = structuredClone(draft); activity.pool[0].quota = amount;
      expect(f.run({ type: "SAVE_ACTIVITY", activity }).ok).toBe(false);
    }
    expect(f.state.activities).toHaveLength(1);
    const bad = { ...draft, pool: draft.pool.map((item) => ({ ...item, probability: NaN })) };
    expect(f.run({ type: "SAVE_ACTIVITY", activity: bad }).ok).toBe(false);
  });
  it("physical and virtual type cannot substitute for a mismatched fulfillment method", () => {
    const f = fixture(), a = structuredClone(f.activity);
    a.pool[0].prizeType = "VIRTUAL";
    expect(validateActivity(a, f.state, ["gp"])).toContain("虚拟奖品须配置虚拟发放方式");
    a.pool[0].prizeType = "UNKNOWN";
    expect(winnable(f.state, a.id, a.pool[0], now)).toBe(0);
    expect(validateActivity(a, f.state, ["gp"])).toContain("待补充奖品类型，不能发布");
    const b = structuredClone(f.activity); b.pool[3].prizeType = "PHYSICAL";
    expect(validateActivity(b, f.state, ["gp"])).toContain("实体奖品须配置实体领取方式和地点");
  });
  it("supports code, voucher and safe-link configurations; no fake external viewed event", () => {
    const f = fixture(), a = structuredClone(f.activity), item = a.pool[3];
    item.method = "VIRTUAL_VOUCHER"; item.codes = []; item.voucherName = "品牌凭证"; item.voucherDescription = "演示虚拟凭证";
    expect(validateActivity(a, f.state, ["gp"])).toEqual([]);
    item.method = "LINK"; item.link = "javascript:alert(1)";
    expect(validateActivity(a, f.state, ["gp"])).toContain("领取链接须使用有效的 HTTP / HTTPS 地址");
    item.link = "https://example.com/demo";
    expect(validateActivity(a, f.state, ["gp"])).toEqual([]);
    expect(item).not.toHaveProperty("viewedAt");
  });
  it("insufficient code inventory blocks publish and append quota; imports report duplicate rows without writing them", () => {
    const f = fixture(), draft = createMarketingActivity("gp", now); draft.pool[3].codes = [];
    expect(f.run({ type: "SAVE_ACTIVITY", activity: draft }).ok).toBe(true);
    expect(f.run({ type: "STATUS", activityId: draft.id, status: "PUBLISHED" }).error).toContain("兑换码不足");
    const command = { type: "IMPORT_CODES" as const, activityId: draft.id, poolItemId: draft.pool[3].id };
    expect(f.run({ ...command, codes: ["ONE", "ONE"] }).codeImport).toMatchObject({ imported: 1, duplicate: 1 });
    expect(f.run({ ...command, codes: ["ONE", "TWO"] }).codeImport).toMatchObject({ imported: 1, duplicate: 1 });
    expect(f.run({ ...command, codes: ["THREE", "ONE"] }).codeImport).toMatchObject({ imported: 1, duplicate: 1 });
    expect(f.state.activities.find((row) => row.id === draft.id)!.pool[3].codes.map((code) => code.code)).toEqual(["ONE", "TWO", "THREE"]);
    expect(f.run({ type: "IMPORT_CODES", activityId: f.activity.id, poolItemId: f.activity.pool[3].id, codes: ["ONE"] }).ok).toBe(false);
    expect(f.run({ type: "ADD_QUOTA", activityId: f.activity.id, poolItemId: f.activity.pool[3].id, count: 1 }).ok).toBe(false);
  });
  it("assigns one unused code and keeps the identical saved payload on repeat and refresh", () => {
    const f = fixture(); f.complete(); const result = f.draw("virtual", { random: () => 0.65 });
    expect(result.ok).toBe(true); const award = f.state.awards[0], content = award.virtualContent?.code;
    expect(award.prizeType).toBe("VIRTUAL"); expect(content).toBeTruthy(); expect(award.issuedAt).toBeTruthy(); expect(award.fulfilledAt).toBeUndefined();
    expect(codeInventory(f.state.activities[0].pool[3])).toEqual({ imported: 10, assigned: 1, remaining: 9 });
    expect(f.draw("virtual").resultId).toBe(result.resultId);
    const reloaded = decodeMarketing(JSON.stringify(f.state)).state!;
    const retry = executeMarketing(reloaded, { type: "DRAW", activityId: f.activity.id, userId: f.users[0].id, operationId: "virtual" }, { ...f.ctx, random: () => { throw new Error("must not reallocate"); } });
    expect(retry.state.awards[0].virtualContent?.code).toBe(content);
    expect(retry.state.activities[0].pool[3].codes.filter((code) => code.assignedAwardId)).toHaveLength(1);
    expect(f.verify("CLAIM", award.credential).ok).toBe(false);
  });
  it("two independent people never receive the same code", () => {
    const f = fixture(); f.complete(); f.draw("first-code", { random: () => 0.65 });
    const other = f.users.find((user) => user.customer_id !== f.users[0].customer_id)!;
    f.register(other.id); const participant = f.state.participations.find((row) => row.identities.some((ref) => ref.userId === other.id))!;
    f.verify("CHECKIN", participant.credential); f.verify("COMPLETE", participant.credential);
    expect(f.run({ type: "DRAW", activityId: f.activity.id, userId: other.id, operationId: "second-code" }, { random: () => 0.65 }).ok).toBe(true);
    expect(new Set(f.state.awards.map((award) => award.virtualContent?.code)).size).toBe(2);
  });
  it("voucher and link snapshot contents survive description edits and never call physical claiming", () => {
    for (const method of ["VIRTUAL_VOUCHER", "LINK"] as const) {
      const f = fixture(); Object.assign(f.activity.pool[3], { method, voucherName: "演示券", voucherDescription: "本地内容", link: "https://example.com/demo" });
      f.complete(); expect(f.draw("payload", { random: () => 0.65 }).ok).toBe(true);
      const award = structuredClone(f.state.awards[0]);
      expect(method === "LINK" ? award.virtualContent?.link : award.virtualContent?.name).toBe(method === "LINK" ? "https://example.com/demo" : "演示券");
      expect(f.run({ type: "SAVE_ACTIVITY_PRIZE", activityId: f.activity.id, prize: { ...f.state.activities[0].pool[3], description: "新配置说明" } }).ok).toBe(true);
      expect(f.state.awards[0]).toEqual(award); expect(f.verify("CLAIM", award.credential).ok).toBe(false);
    }
  });
  it("text/CSV imports preserve literal code values and reject ambiguous multi-column or duplicate batches", () => {
    expect(parseMarketingCodes("CODE0001\nCODE0002")).toEqual(["CODE0001", "CODE0002"]);
    expect(parseMarketingCodes('\uFEFFcode\r\n"0001"\r\n"CO,DE"')).toEqual(["0001", "CO,DE"]);
    expect(() => parseMarketingCodes("code,name\nA,Name")).toThrow();
    expect(() => parseMarketingCodes("A\nA")).toThrow();
  });
});

describe("V2 fulfillment capacity, rules and redemption facts", () => {
  it("paused stops new prize bookings/reschedules but existing booked winners can still fulfill", () => {
    const f = fixture(); f.complete(); f.draw("pickup", { random: () => 0.3 }); const award = f.state.awards[0], item = f.activity.pool[1];
    f.run({ type: "STATUS", activityId: f.activity.id, status: "PAUSED" });
    expect(f.run({ type: "BOOK_PRIZE", awardId: award.id, slotId: item.slots[0].id }).ok).toBe(false);
    f.run({ type: "STATUS", activityId: f.activity.id, status: "PUBLISHED" }); f.run({ type: "BOOK_PRIZE", awardId: award.id, slotId: item.slots[0].id });
    const booking = f.state.bookings.find((row) => row.kind === "PRIZE")!;
    f.run({ type: "STATUS", activityId: f.activity.id, status: "PAUSED" });
    expect(f.run({ type: "BOOK_PRIZE", awardId: award.id, slotId: booking.slotId }).resultId).toBe(booking.id);
    expect(f.run({ type: "RESCHEDULE", bookingId: booking.id, slotId: booking.slotId }).ok).toBe(false);
    expect(f.verify("CLAIM", award.credential, {}, item.location, booking.slotId).ok).toBe(true);
  });
  it("caps further winners by valid fulfillment seats minus unreserved winning promises, not quota alone", () => {
    const f = fixture({ grantCount: 5, drawLimit: 5, winLimit: 5 }); const item = f.activity.pool[1];
    f.activity.pool = [item]; item.probability = 100; item.perPersonLimit = 5; item.slots[0].capacity = 3; f.activity.noWinProbability = 0;
    f.complete(); expect(winnable(f.state, f.activity.id, item, now)).toBe(3);
    for (let index = 0; index < 3; index++) expect(f.draw(`limited-${index}`).ok).toBe(true);
    expect(f.state.awards).toHaveLength(3);
    expect(quota(f.state, f.activity.id, item).available).toBe(7);
    expect(fulfillmentCapacity(f.state, f.activity.id, item, now).unreservedPromises).toBe(3);
    expect(f.draw("over-capacity").ok).toBe(false); expect(f.state.draws).toHaveLength(3);
    expect(chances(f.state, f.state.participations[0]).remaining).toBe(2);
  });
  it("canceling a prize booking frees a seat but never frees the outstanding winning promise", () => {
    const f = fixture(), item = f.activity.pool[1]; item.slots[0].capacity = 2;
    f.complete(); f.draw("pickup", { random: () => 0.3 }); const award = f.state.awards[0];
    expect(fulfillmentCapacity(f.state, f.activity.id, item, now).availableForNewWins).toBe(1);
    f.run({ type: "BOOK_PRIZE", awardId: award.id, slotId: item.slots[0].id });
    expect(fulfillmentCapacity(f.state, f.activity.id, item, now).availableForNewWins).toBe(1);
    const booking = f.state.bookings.find((row) => row.kind === "PRIZE")!;
    f.run({ type: "CANCEL_BOOKING", bookingId: booking.id });
    expect(fulfillmentCapacity(f.state, f.activity.id, item, now)).toMatchObject({ remainingSlots: 2, unreservedPromises: 1, availableForNewWins: 1 });
    expect(f.state.awards).toHaveLength(1);
  });
  it("expired/closed slots create no new fulfillment capacity and do not delete existing rights", () => {
    const f = fixture(), item = f.activity.pool[1]; f.complete(); f.draw("pickup", { random: () => 0.3 });
    const later = Date.parse(item.slots[0].bookingClosesAt) + 1;
    expect(fulfillmentCapacity(f.state, f.activity.id, item, later)).toMatchObject({ availableForNewWins: 0, shortfall: 1 });
    expect(winnable(f.state, f.activity.id, item, later)).toBe(0); expect(f.state.awards).toHaveLength(1);
  });
  it("activity slot edits honor live occupancy and retain even canceled booking history", () => {
    const f = fixture(); f.register(); const old = f.state.activities[0].slots[0];
    expect(f.run({ type: "DELETE_ACTIVITY_SLOT", activityId: f.activity.id, slotId: old.id }).ok).toBe(false);
    expect(f.run({ type: "SAVE_ACTIVITY_SLOT", activityId: f.activity.id, slot: { ...old, capacity: 0 } }).ok).toBe(false);
    expect(f.run({ type: "SAVE_ACTIVITY_SLOT", activityId: f.activity.id, slot: { ...old, capacity: 1 } }).ok).toBe(true);
    expect(f.run({ type: "SAVE_ACTIVITY_SLOT", activityId: f.activity.id, slot: { ...old, location: "覆盖既有预约" } }).ok).toBe(false);
    f.run({ type: "CANCEL_BOOKING", bookingId: f.state.bookings[0].id });
    expect(f.run({ type: "DELETE_ACTIVITY_SLOT", activityId: f.activity.id, slotId: old.id }).ok).toBe(false);
    const fresh = { ...old, id: "unused-slot" };
    expect(f.run({ type: "SAVE_ACTIVITY_SLOT", activityId: f.activity.id, slot: fresh }).ok).toBe(true);
    expect(f.run({ type: "DELETE_ACTIVITY_SLOT", activityId: f.activity.id, slotId: fresh.id }).ok).toBe(true);
  });
  it("allowCancel and allowReschedule are real service rules, not only disabled buttons", () => {
    const f = fixture({ allowCancel: false, allowReschedule: false }); f.register();
    expect(f.run({ type: "CANCEL_BOOKING", bookingId: f.state.bookings[0].id }).ok).toBe(false);
    expect(f.run({ type: "RESCHEDULE", bookingId: f.state.bookings[0].id, slotId: f.activity.slots[0].id }).ok).toBe(false);
    expect(f.state.bookings[0].status).toBe("BOOKED");
  });
  it("bookings retain actual user/walk-in sources without affecting member or sales collections", () => {
    const f = fixture(); f.register(); expect(f.state.bookings[0].source).toBe("USER");
    const other = f.users.find((user) => user.customer_id !== f.users[0].customer_id)!;
    expect(f.run({ type: "REGISTER", activityId: f.activity.id, userId: other.id, slotId: f.activity.slots[0].id, walkIn: true }).ok).toBe(true);
    expect(f.state.bookings[1].source).toBe("WALK_IN");
  });
  it("walk-in permission applies even when activity booking is disabled", () => {
    const f = fixture({ bookingEnabled: false, allowWalkIn: false });
    expect(f.run({ type: "REGISTER", activityId: f.activity.id, userId: f.users[0].id, walkIn: true }).ok).toBe(false);
    expect(f.state.participations).toHaveLength(0);
    expect(f.register().ok).toBe(true);
    const g = fixture({ bookingEnabled: false, allowWalkIn: true });
    expect(g.run({ type: "REGISTER", activityId: g.activity.id, userId: g.users[0].id, walkIn: true }, { access: { brands: ["gp"], manage: true, preview: true, redeem: false } }).ok).toBe(false);
    expect(g.state.participations).toHaveLength(0);
  });
  it("redemption facts are separate, include actors/credentials and never include config audits", () => {
    const f = fixture(); f.complete(); f.draw(); f.verify("CLAIM", f.state.awards[0].credential);
    f.run({ type: "ADD_QUOTA", activityId: f.activity.id, poolItemId: f.activity.pool[0].id, count: 1 });
    expect(f.state.redemptions.map((row) => row.type)).toEqual(["CHECKIN", "COMPLETE", "PRIZE_CLAIM"]);
    expect(f.state.redemptions.every((row) => row.activityId === f.activity.id && row.actorId === f.ctx.actor.id && row.credential && row.result === "SUCCESS")).toBe(true);
    expect(f.state.audits.some((row) => row.action === "ADD_QUOTA")).toBe(true);
    const before = f.state.redemptions.length; f.verify("CLAIM", f.state.awards[0].credential); expect(f.state.redemptions).toHaveLength(before);
  });
  it("checkin-completes emits both business facts once, experience emits its own claim type", () => {
    const f = fixture({ completion: "CHECKIN" }); f.register(); f.verify("CHECKIN"); f.verify("CHECKIN");
    expect(f.state.redemptions.map((row) => row.type)).toEqual(["CHECKIN", "COMPLETE"]); expect(f.state.chances).toHaveLength(1);
    const g = fixture(); g.complete(); g.draw("experience", { random: () => 0.5 }); const award = g.state.awards[0], item = g.activity.pool[2];
    expect(award.method).toBe("EXPERIENCE"); g.run({ type: "BOOK_PRIZE", awardId: award.id, slotId: item.slots[0].id });
    expect(g.verify("CLAIM", award.credential, {}, item.location, item.slots[0].id).ok).toBe(true);
    expect(g.state.redemptions.at(-1)?.type).toBe("EXPERIENCE_CLAIM");
  });
});

function legacyV1(state: MarketingState) {
  const { redemptions: _redemptions, ...base } = structuredClone(state);
  return { ...base, version: 1,
    prizes: state.activities.flatMap((activity) => activity.pool.map((item) => ({ id: `legacy:${item.id}`, name: item.name, image: item.image, description: item.description, method: item.method }))),
    activities: state.activities.map(({ allowCancel: _cancel, allowReschedule: _reschedule, ...activity }) => ({ ...activity, pool: activity.pool.map(({ activityId: _activity, name: _name, description: _description, image: _image, prizeType: _type, codes: _codes, voucherName: _voucher, voucherDescription: _voucherDescription, link: _link, ...item }) => ({ ...item, prizeId: `legacy:${item.id}` })) })),
    awards: state.awards.map(({ prizeType: _type, image: _image, description: _description, awardLabel: _label, ...award }) => award),
    bookings: state.bookings.map(({ source: _source, ...booking }) => booking),
  };
}
describe("V2 non-destructive persistence migration", () => {
  it("corrupt duplicated or dangling code allocations block reload without manufacturing empty data", () => {
    const f = fixture(); f.complete(); f.draw("virtual", { random: () => 0.65 });
    const duplicated = structuredClone(f.state); duplicated.activities[0].pool[3].codes[1].code = duplicated.activities[0].pool[3].codes[0].code;
    expect(decodeMarketing(JSON.stringify(duplicated)).state).toBeUndefined();
    const dangling = structuredClone(f.state); dangling.activities[0].pool[3].codes[0].assignedAwardId = "missing-award";
    expect(decodeMarketing(JSON.stringify(dangling)).issue).toBeTruthy();
  });
  it("an intervening change to V1 primary storage is never overwritten by migration", () => {
    const f = fixture(), original = JSON.stringify(legacyV1(f.state)), rows = new Map([[MARKETING_STORAGE_KEY, "NEWER_USER_EDIT"]]);
    expect(() => saveMarketing({ getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => { rows.set(key, value); } }, decodeMarketing(original).state!, original)).toThrow();
    expect(rows.get(MARKETING_STORAGE_KEY)).toBe("NEWER_USER_EDIT"); expect(rows.has(MARKETING_V1_BACKUP_KEY)).toBe(false);
  });
  it("maps old physical methods to owned physical prizes, freezes historic promises and preserves user modifications", () => {
    const f = fixture(); f.complete(); f.draw(); f.verify("CLAIM", f.state.awards[0].credential);
    const old = legacyV1(f.state); old.activities[0].name = "用户修改的旧活动";
    const raw = JSON.stringify(old), decoded = decodeMarketing(raw), next = decoded.state!;
    expect(decoded.originalV1).toBe(raw); expect(next.version).toBe(2); expect(next.activities[0].name).toBe("用户修改的旧活动");
    expect(next.activities[0].pool.slice(0, 3).every((item) => item.prizeType === "PHYSICAL" && item.activityId === f.activity.id)).toBe(true);
    expect(next.activities[0].pool[3].prizeType).toBe("UNKNOWN");
    expect(next.awards[0].prizeName).toBe(f.state.awards[0].prizeName); expect(next.awards[0].fulfilledAt).toBe(f.state.awards[0].fulfilledAt);
    expect(next.awards[0].image).toBe(""); expect(next.bookings[0].source).toBe("UNKNOWN");
    expect(next.draws).toEqual(f.state.draws); expect(next.chances).toEqual(f.state.chances); expect(next.participations).toEqual(f.state.participations);
    expect(next.redemptions.map((row) => row.type)).toEqual(["CHECKIN", "COMPLETE", "PRIZE_CLAIM"]);
    expect(next.redemptions.every((row) => row.source === "LEGACY_AUDIT")).toBe(true);
    expect(next).not.toHaveProperty("prizes"); expect(decodeMarketing(JSON.stringify(next)).state).toEqual(next);
  });
  it("timestamps without trustworthy actors/business audits do not manufacture redemption records", () => {
    const f = fixture(); f.complete(); const old = legacyV1(f.state); old.audits = old.audits.filter((row) => row.action === "REGISTER");
    const next = decodeMarketing(JSON.stringify(old)).state!;
    expect(next.participations[0].completedAt).toBeTruthy(); expect(next.redemptions).toHaveLength(0);
  });
  it("backs up exact V1 raw text before writing V2 and does not touch sales/member keys", () => {
    const f = fixture(), raw = JSON.stringify(legacyV1(f.state)), rows = new Map([[MARKETING_STORAGE_KEY, raw], ["sales", "USER_EDIT"], ["member", "MEMBER_EDIT"]]);
    const storage = { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); } };
    const decoded = decodeMarketing(raw); saveMarketing(storage, decoded.state!, decoded.originalV1);
    expect(rows.get(MARKETING_V1_BACKUP_KEY)).toBe(raw); expect(JSON.parse(rows.get(MARKETING_STORAGE_KEY)!).version).toBe(2);
    expect(rows.get("sales")).toBe("USER_EDIT"); expect(rows.get("member")).toBe("MEMBER_EDIT");
  });
  it("backup or primary write failure never clears V1; conflicting prior backups are not overwritten", () => {
    const f = fixture(), raw = JSON.stringify(legacyV1(f.state)), decoded = decodeMarketing(raw);
    for (const failureKey of [MARKETING_V1_BACKUP_KEY, MARKETING_STORAGE_KEY]) {
      const rows = new Map([[MARKETING_STORAGE_KEY, raw]]);
      const storage = { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { if (key === failureKey) throw new Error("quota"); rows.set(key, value); } };
      expect(() => saveMarketing(storage, decoded.state!, raw)).toThrow(); expect(rows.get(MARKETING_STORAGE_KEY)).toBe(raw);
    }
    const rows = new Map([[MARKETING_STORAGE_KEY, raw], [MARKETING_V1_BACKUP_KEY, "OTHER_BACKUP"]]);
    expect(() => saveMarketing({ getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => { rows.set(key, value); } }, decoded.state!, raw)).toThrow();
    expect(rows.get(MARKETING_V1_BACKUP_KEY)).toBe("OTHER_BACKUP"); expect(rows.get(MARKETING_STORAGE_KEY)).toBe(raw);
  });
});
