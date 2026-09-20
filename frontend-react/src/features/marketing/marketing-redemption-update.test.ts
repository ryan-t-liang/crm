import { describe, expect, it } from "vitest";
import { createDemoState } from "@/mock/demo-data";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";
import { createMarketingDemoState } from "@/mock/marketing-demo-data";
import { appendMarketingShowcase, MARKETING_SHOWCASE_ID } from "@/mock/marketing-showcase-data";
import { executeMarketing, sessionPrizeReadiness, type MarketingCommand, type MarketingContext } from "./marketing-model";
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
  it("inherits activity probability without session setup and persists the effective snapshot", () => {
    const f = fixture();
    expect(sessionPrizeReadiness(f.state, f.activity, now)).toEqual([]);
    const before = structuredClone(f.state.draws);
    expect(f.draw().ok).toBe(true);
    expect(f.state.draws.at(-1)?.poolItemId).toBe(f.activity.pool[0].id);
    expect(f.state.draws.at(-1)?.probabilitySnapshot?.map(row => row.configuredProbability)).toEqual([30, 30, 20]);
    expect(f.state.draws.slice(0, before.length)).toEqual(before);
    expect(decodeMarketing(JSON.stringify(f.state)).issue).toBeUndefined();
  });
  it("does not borrow quantities reserved by another future session", () => {
    const f = fixture();
    for (const item of f.activity.pool) {
      const won = f.state.awards.filter(row => row.activityId === f.activity.id && row.poolItemId === item.id).length;
      item.quantityLimit = won + 20; item.quota = won + 20;
    }
    const before = f.state.draws.length;
    expect(f.draw().ok).toBe(false);
    expect(f.state.draws).toHaveLength(before);
  });
  it("default probability edits affect inherited future draws only, reject over 100%, and retain explicit settings", () => {
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
  it("switches an active inherited session to a whole-pool override, omits disabled prizes, preserves history", () => {
    const f = fixture(), sessionId = f.activity.slots[0].id, before = structuredClone(f.state.draws);
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
    const prizes = f.activity.pool.map(item => ({ sessionId, prizeId: item.id, enabled: false, probability: 0, allocatedQuantity: f.state.awards.filter(row => row.activityId === f.activity.id && row.poolItemId === item.id).length }));
    expect(f.run({ type: "SAVE_SESSION_PRIZES", activityId: f.activity.id, sessionId, prizes }).ok).toBe(true);
    expect(f.draw().ok).toBe(false);
    expect(f.run({ type: "SAVE_SESSION_PRIZES", activityId: f.activity.id, sessionId, prizes: [] }).ok).toBe(false);
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
});
