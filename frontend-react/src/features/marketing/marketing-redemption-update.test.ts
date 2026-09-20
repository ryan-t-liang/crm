import { describe, expect, it } from "vitest";
import { createDemoState } from "@/mock/demo-data";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";
import { createMarketingDemoState, createMarketingActivity } from "@/mock/marketing-demo-data";
import { appendMarketingShowcase, MARKETING_SHOWCASE_ID } from "@/mock/marketing-showcase-data";
import { executeMarketing, lotteryScope, sessionPrizeReadiness, type MarketingCommand, type MarketingContext } from "./marketing-model";
import { decodeMarketing } from "./marketing-storage";
import { activityDrawRecords } from "./marketing-records";

const now = Date.parse("2026-09-20T06:00:00Z");
function fixture() {
  const members = createMemberOperationsDemoState(), actor = createDemoState().users[0];
  const source = createMarketingDemoState(members, now);
  let state = appendMarketingShowcase(source, "gp", now), serial = 0;
  const activity = state.activities.find(row => row.id === MARKETING_SHOWCASE_ID)!;
  const participant = state.participations.find(row => row.activityId === activity.id && row.completedAt && state.draws.filter(draw => draw.participationId === row.id).length === 1 && !state.awards.some(award => award.participationId === row.id))!;
  const ctx: MarketingContext = { actor, members, now, random: () => 0.1, id: () => `new-${++serial}` };
  const run = (command: MarketingCommand) => { const result = executeMarketing(state, command, ctx); state = result.state; return result; };
  const draw = () => run({ type: "DRAW", activityId: activity.id, participationId: participant.id, operationId: `operation-${++serial}` });
  return { source, activity, participant, ctx, run, draw, get state() { return state; } };
}

describe("redemption settings iteration", () => {
  it("adds one isolated showcase with exactly 200 bookings and 200 draws; preserves every old collection and user edit", () => {
    const f = fixture(), sourceCopy = structuredClone(f.source);
    expect(f.state.activities.filter(row => row.id !== MARKETING_SHOWCASE_ID)).toEqual(f.source.activities);
    for (const key of ["participations", "bookings", "draws", "awards", "chances", "redemptions", "audits"] as const) expect(f.state[key].filter(row => row.activityId !== MARKETING_SHOWCASE_ID)).toEqual(f.source[key]);
    expect(f.state.bookings.filter(row => row.activityId === f.activity.id && row.kind === "ACTIVITY")).toHaveLength(200);
    expect(f.state.draws.filter(row => row.activityId === f.activity.id)).toHaveLength(200);
    expect(activityDrawRecords(f.state, f.activity, now)).toHaveLength(200);
    expect(f.activity.pool.map(row => [row.name, row.prizeType, row.fulfillmentMode])).toEqual([["咖啡券", "PHYSICAL", "DIRECT"], ["DIY皮牌", "PHYSICAL", "RESERVATION"], ["京东购物卡", "VIRTUAL", "DIRECT"]]);
    expect(decodeMarketing(JSON.stringify(f.state)).issue).toBeUndefined();
    f.activity.name = "用户改名";
    expect(appendMarketingShowcase(f.state, "gp", now + 1000)).toBe(f.state);
    expect(f.source).toEqual(sourceCopy);
  });
  it("uses the activity pool regardless of booking sessions and persists the effective snapshot", () => {
    const f = fixture();
    expect(sessionPrizeReadiness(f.state, f.activity, now)).toEqual([]);
    const before = structuredClone(f.state.draws);
    expect(f.draw().ok).toBe(true);
    expect(f.state.draws.at(-1)?.poolItemId).toBe(f.activity.pool[0].id);
    expect(f.state.draws.at(-1)?.probabilitySnapshot?.map(row => row.configuredProbability)).toEqual([30, 30, 20]);
    expect(f.state.draws.slice(0, before.length)).toEqual(before);
    expect(decodeMarketing(JSON.stringify(f.state)).issue).toBeUndefined();
  });
  it("activity mode rejects session configuration and does not consult stale session allocations", () => {
    const f = fixture(), sessionId = f.activity.slots[0].id;
    const prizes = f.activity.pool.map(item => ({ sessionId, prizeId: item.id, enabled: true, probability: 10, allocatedQuantity: 1 }));
    expect(f.run({ type: "SAVE_SESSION_PRIZES", activityId: f.activity.id, sessionId, prizes }).ok).toBe(false);
    expect(f.run({ type: "COPY_SESSION_PRIZES", activityId: f.activity.id, sourceSessionId: sessionId, targetSessionId: f.activity.slots[1].id }).ok).toBe(false);
    const current = f.state.activities.find(row => row.id === f.activity.id)!;
    current.sessionPrizes = prizes;
    expect(f.draw().ok).toBe(true);
    expect(f.state.draws.at(-1)?.probabilitySnapshot?.map(row => row.configuredProbability)).toEqual([30, 30, 20]);
  });
  it("activity probability edits affect future draws only, reject over 100%, and preserve history", () => {
    const f = fixture(), before = structuredClone(f.state.draws), explicit = structuredClone(f.activity.sessionPrizes);
    expect(f.run({ type: "SAVE_ACTIVITY_PRIZE", activityId: f.activity.id, prize: { ...f.activity.pool[0], probability: 90, defaultProbability: 90 } }).ok).toBe(false);
    expect(f.run({ type: "SAVE_ACTIVITY_PRIZE", activityId: f.activity.id, prize: { ...f.activity.pool[0], probability: 0, defaultProbability: 0 } }).ok).toBe(true);
    expect(f.draw().ok).toBe(true);
    expect(f.state.draws.at(-1)?.poolItemId).toBe(f.activity.pool[1].id);
    expect(f.state.draws.at(-1)?.probabilitySnapshot?.map(row => row.configuredProbability)).toEqual([0, 30, 20]);
    expect(f.state.draws.at(-1)?.drawConfigVersion).toBe(2);
    expect(f.state.draws.slice(0, before.length)).toEqual(before);
    expect(f.state.activities.find(row => row.id === f.activity.id)?.sessionPrizes).toEqual(explicit);
  });
  it("session mode uses only explicitly configured prizes and preserves history", () => {
    const f = fixture(), sessionId = f.activity.slots[0].id, before = structuredClone(f.state.draws);
    f.activity.lotteryScope = "SESSION";
    const prizes = f.activity.pool.map((item, index) => ({ sessionId, prizeId: item.id, enabled: index === 1, probability: index === 1 ? 70 : 0,
      allocatedQuantity: f.state.awards.filter(row => row.activityId === f.activity.id && row.poolItemId === item.id).length + (index === 1 ? 10 : 0) }));
    expect(f.run({ type: "SAVE_SESSION_PRIZES", activityId: f.activity.id, sessionId, prizes }).ok).toBe(true);
    expect(f.draw().ok).toBe(true);
    expect(f.state.draws.at(-1)?.poolItemId).toBe(f.activity.pool[1].id);
    expect(f.state.draws.at(-1)?.probabilitySnapshot?.map(row => row.configuredProbability)).toEqual([70]);
    expect(f.state.draws.slice(0, before.length)).toEqual(before);
    expect(decodeMarketing(JSON.stringify(f.state)).issue).toBeUndefined();
  });
  it("all-disabled session does not fall back; clearing configuration is rejected", () => {
    const f = fixture(), sessionId = f.activity.slots[0].id;
    f.activity.lotteryScope = "SESSION";
    const prizes = f.activity.pool.map(item => ({ sessionId, prizeId: item.id, enabled: false, probability: 0, allocatedQuantity: f.state.awards.filter(row => row.activityId === f.activity.id && row.poolItemId === item.id).length }));
    expect(f.run({ type: "SAVE_SESSION_PRIZES", activityId: f.activity.id, sessionId, prizes }).ok).toBe(true);
    expect(f.draw().ok).toBe(false);
    expect(f.run({ type: "SAVE_SESSION_PRIZES", activityId: f.activity.id, sessionId, prizes: [] }).ok).toBe(false);
  });
  it("missing session pool blocks draws even with positive activity probabilities", () => {
    const f = fixture(); f.activity.lotteryScope = "SESSION";
    expect(sessionPrizeReadiness(f.state, f.activity, now)).toHaveLength(2);
    const before = structuredClone(f.state.draws);
    expect(f.draw().error).toContain("尚未配置奖池");
    expect(f.state.draws).toEqual(before);
  });
  it("creation saves one explicit scope; later edits cannot switch it", () => {
    const f = fixture(), activity = createMarketingActivity("gp", now);
    activity.name = "按场次的新活动"; activity.lotteryScope = "SESSION";
    expect(f.run({ type: "SAVE_ACTIVITY", activity, section: "information" }).ok).toBe(true);
    expect(f.run({ type: "SAVE_ACTIVITY", activity: { ...activity, lotteryScope: "ACTIVITY" }, section: "information" }).ok).toBe(false);
    expect(f.run({ type: "SAVE_ACTIVITY", activity: { ...activity, id: "invalid-direct", bookingEnabled: false }, section: "information" }).ok).toBe(false);
    expect(f.run({ type: "SAVE_ACTIVITY", activity: { ...activity, id: "missing-mode", lotteryScope: undefined }, section: "information" }).ok).toBe(false);
  });
  it("information save includes booking settings, protects used slots, and keeps lottery settings and history", () => {
    const f = fixture(), before = structuredClone(f.state);
    expect(f.run({ type: "SAVE_ACTIVITY", section: "information", activity: { ...f.activity, name: "新名称", allowCancel: false, grantCount: 999 } }).ok).toBe(true);
    const saved = f.state.activities.find(row => row.id === f.activity.id)!;
    expect(saved.name).toBe("新名称"); expect(saved.allowCancel).toBe(false); expect(saved.grantCount).toBe(f.activity.grantCount);
    expect(f.state.bookings).toEqual(before.bookings); expect(f.state.draws).toEqual(before.draws); expect(f.state.awards).toEqual(before.awards);
    expect(f.run({ type: "SAVE_ACTIVITY", section: "information", activity: { ...saved, slots: [] } }).ok).toBe(false);
  });
  it("reads legacy scope uniformly without rewriting history and rejects unknown scopes", () => {
    const f = fixture(); delete f.activity.lotteryScope;
    expect(lotteryScope(f.activity)).toBe("ACTIVITY");
    f.activity.sessionPrizes = [{ sessionId: f.activity.slots[1].id, prizeId: f.activity.pool[0].id, enabled: true, probability: 10, allocatedQuantity: 1 }];
    expect(lotteryScope(f.activity)).toBe("SESSION");
    const before = JSON.stringify(f.state), decoded = decodeMarketing(before);
    expect(decoded.issue).toBeUndefined(); expect(JSON.stringify(decoded.state)).toBe(before);
    expect(decodeMarketing(before.replace('"lotteryEnabled":true', '"lotteryScope":"MIXED","lotteryEnabled":true')).issue).toBeTruthy();
  });
  it("creates a single pickup slot, rejects overlap and preserves already booked slots", () => {
    const f = fixture(), schedule = f.activity.pickupSchedules![0], existing = structuredClone(schedule.slots);
    const time = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
    const slot = { ...schedule.slots[0], id: "new-pickup", startAt: time(3 * 1440), endAt: time(3 * 1440 + 60), bookingClosesAt: time(3 * 1440 + 60), checkinStart: time(3 * 1440), checkinEnd: time(3 * 1440 + 60), capacity: 20 };
    expect(f.run({ type: "SAVE_PICKUP_SLOT", activityId: f.activity.id, scheduleId: schedule.id, slot }).ok).toBe(true);
    expect(f.run({ type: "SAVE_PICKUP_SLOT", activityId: f.activity.id, scheduleId: schedule.id, slot: { ...slot, id: "overlap" } }).ok).toBe(false);
    expect(f.state.activities.find(row => row.id === f.activity.id)!.pickupSchedules![0].slots.slice(0, 2)).toEqual(existing);
    expect(f.run({ type: "SAVE_PICKUP_SLOT", activityId: f.activity.id, scheduleId: schedule.id, slot: { ...existing[0], location: "变更地点" } }).ok).toBe(false);
  });
  it("saves a prize and new redemption schedule atomically, with no partial schedule on invalid prize or slots", () => {
    const f = fixture(), original = structuredClone(f.activity), template = f.activity.pickupSchedules![0];
    const schedule = { ...template, id: "inline-schedule", slots: template.slots.map((slot, index) => ({ ...slot, id: `inline-slot-${index}` })) };
    const prize = { ...f.activity.pool[1], id: "inline-prize", name: "新预约奖品", probability: 0, defaultProbability: 0, pickupScheduleId: schedule.id, slots: [] };
    expect(f.run({ type: "SAVE_ACTIVITY_PRIZE", activityId: f.activity.id, prize: { ...prize, name: "" }, newPickupSchedule: schedule }).ok).toBe(false);
    expect(f.state.activities.find(row => row.id === f.activity.id)?.pickupSchedules).toEqual(original.pickupSchedules);
    expect(f.run({ type: "SAVE_ACTIVITY_PRIZE", activityId: f.activity.id, prize, newPickupSchedule: { ...schedule, slots: [...schedule.slots, { ...schedule.slots[0], id: "overlap-inline" }] } }).ok).toBe(false);
    expect(f.state.activities.find(row => row.id === f.activity.id)?.pickupSchedules).toEqual(original.pickupSchedules);
    expect(f.run({ type: "SAVE_ACTIVITY_PRIZE", activityId: f.activity.id, prize, newPickupSchedule: schedule }).ok).toBe(true);
    expect(f.state.activities.find(row => row.id === f.activity.id)?.pickupSchedules?.find(row => row.id === schedule.id)?.slots).toHaveLength(schedule.slots.length);
    expect(decodeMarketing(JSON.stringify(f.state)).issue).toBeUndefined();
  });
});
