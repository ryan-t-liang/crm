import { describe, expect, it } from "vitest";
import { createDemoState } from "@/mock/demo-data";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";
import { createDemoMarketingActivity, createMarketingActivity } from "@/mock/marketing-demo-data";
import type { MarketingActivity, MarketingState } from "@/types/marketing";
import { activityBookingPhase, activityDetailTab, activityDrawRecords, drawRecordLabels, participantGender, prizeBookingRecords } from "./marketing-records";
import { activityMetrics, executeMarketing, participantIdentityIssue, type MarketingCommand, type MarketingContext } from "./marketing-model";
import { decodeMarketing } from "./marketing-storage";

const now = Date.parse("2026-09-18T06:00:00Z");
function fixture(reservation = false, virtual = false, activityBooking = true) {
  const members = createMemberOperationsDemoState(), sales = createDemoState();
  const activity: MarketingActivity = { ...createDemoMarketingActivity("gp", now), id: "records-activity", status: "PUBLISHED", bookingEnabled: activityBooking, publishedAt: new Date(now).toISOString(), noWinProbability: 0 };
  const prize = activity.pool[virtual ? 3 : reservation ? 1 : 0];
  prize.activityId = activity.id; prize.fulfillmentMode = reservation ? "RESERVATION" : "DIRECT"; prize.probability = 100;
  if (reservation && !prize.slots.length) prize.slots = [{ ...activity.slots[0], id: "virtual-slot", capacity: 20 }];
  if (!reservation) prize.slots = [];
  activity.pool = [prize];
  let serial = 0;
  let state: MarketingState = { version: 2, revision: 0, seededAt: new Date(now).toISOString(), activities: [activity], participations: [], bookings: [], chances: [], draws: [], awards: [], audits: [], redemptions: [] };
  const ctx: MarketingContext = { actor: sales.users[0], members, now, random: () => 0.1, id: () => `record-${++serial}` };
  const run = (command: MarketingCommand, extra: Partial<MarketingContext> = {}) => { const result = executeMarketing(state, command, { ...ctx, ...extra }); state = result.state; return result; };
  const register = () => run({ type: "REGISTER", activityId: activity.id, participantId: "external", identity: { displayName: "预约表单姓名", phone: "13800138001", phoneCountryCode: "86", openId: "form-openid", wechatAppId: "form-app", gender: "FEMALE" }, slotId: activityBooking ? activity.slots[0].id : undefined });
  const complete = () => { expect(register().ok).toBe(true); expect(run({ type: "VERIFY", action: "CHECKIN", credential: state.participations[0].credential, location: activity.location, slotId: activityBooking ? activity.slots[0].id : undefined }).ok).toBe(true); expect(run({ type: "VERIFY", action: "COMPLETE", credential: state.participations[0].credential, location: activity.location, slotId: activityBooking ? activity.slots[0].id : undefined }).ok).toBe(true); };
  const draw = () => run({ type: "DRAW", activityId: activity.id, participationId: state.participations[0].id, operationId: "records-draw" });
  const rows = (at = now) => activityDrawRecords(state, activity, at);
  return { activity, prize, ctx, members, sales, run, register, complete, draw, rows, get state() { return state; } };
}

describe("activity record phases preserve the two distinct fulfillment paths", () => {
  it.each([true, false])("direct prize follows 1 → 2 → 3, activity booking=%s", activityBooking => {
    const f = fixture(false, false, activityBooking);
    expect(f.register().ok).toBe(true); expect(f.rows()[0].phase).toBe(1);
    f.complete(); expect(f.draw().ok).toBe(true); expect(f.rows()[0].phase).toBe(2);
    expect(f.run({ type: "VERIFY", action: "CLAIM", credential: f.state.awards[0].credential, location: f.prize.location }).ok).toBe(true);
    expect(f.rows()[0].phase).toBe(3); expect(drawRecordLabels[3]).toBe("已核销");
    expect(f.rows()[0].reservation).toBe(false);
  });
  it.each([true, false])("reserved prize follows 1 → 2 → 4 → 5, virtual=%s", virtual => {
    const f = fixture(true, virtual); f.complete(); expect(f.draw().ok).toBe(true);
    const award = f.state.awards[0], slot = f.prize.slots[0];
    expect(f.rows()[0].phase).toBe(2);
    expect(f.run({ type: "VERIFY", action: "CLAIM", credential: award.credential, location: slot.location, slotId: slot.id }).ok).toBe(false);
    expect(f.rows()[0].phase).toBe(2);
    expect(f.run({ type: "BOOK_PRIZE", awardId: award.id, slotId: slot.id }).ok).toBe(true);
    expect(f.rows()[0].phase).toBe(4);
    expect(f.run({ type: "VERIFY", action: "CLAIM", credential: award.credential, location: slot.location, slotId: slot.id }).ok).toBe(true);
    expect(f.rows()[0].phase).toBe(5); expect(drawRecordLabels[5]).toBe(drawRecordLabels[3]);
    expect(f.rows()[0].reservation).toBe(true);
  });
  it("includes NONE draws as phase 2 without fabricating an award", () => {
    const f = fixture(); f.complete(); f.state.activities[0].pool[0].probability = 20; f.state.activities[0].noWinProbability = 80;
    expect(f.run({ type: "DRAW", activityId: f.activity.id, participationId: f.state.participations[0].id, operationId: "none-draw" }, { random: () => 0.95 }).ok).toBe(true); expect(f.rows()).toHaveLength(1);
    expect(f.rows()[0]).toMatchObject({ phase: 2, note: "未中奖", reservation: false }); expect(f.rows()[0].award).toBeUndefined();
  });
  it("does not call direct virtual issuance redemption", () => {
    const f = fixture(false, true); f.complete(); expect(f.draw().ok).toBe(true);
    expect(f.state.awards[0].issuedAt).toBeTruthy(); expect(f.state.awards[0].fulfilledAt).toBeUndefined();
    expect(f.rows()[0]).toMatchObject({ phase: 2, note: "已发放 · 未记录外部核销" });
  });
  it("keeps canceled booking history and derives rebooking without merging ACT and PRIZE", () => {
    const f = fixture(true); f.complete(); f.draw(); const award = f.state.awards[0], slot = f.prize.slots[0];
    expect(f.run({ type: "BOOK_PRIZE", awardId: award.id, slotId: slot.id }).ok).toBe(true);
    const booking = f.state.bookings.find(row => row.kind === "PRIZE")!;
    expect(f.run({ type: "CANCEL_BOOKING", bookingId: booking.id }).ok).toBe(true);
    expect(f.rows()[0]).toMatchObject({ phase: 2, note: "预约已取消 · 可重新预约" });
    expect(f.run({ type: "BOOK_PRIZE", awardId: award.id, slotId: slot.id }).ok).toBe(true);
    expect(f.rows()[0].phase).toBe(4);
    expect(prizeBookingRecords(f.state, f.activity.id, award.participationId, award.id).map(row => row.status)).toEqual(["CANCELED", "BOOKED"]);
    expect(prizeBookingRecords(f.state, "different", award.participationId, award.id)).toEqual([]);
    expect(prizeBookingRecords(f.state, f.activity.id, award.participationId, "different")).toEqual([]);
  });
  it("does not show invalid, missed or expired bookings as currently reserved", () => {
    const f = fixture(true); f.complete(); f.draw(); const award = f.state.awards[0], slot = f.prize.slots[0];
    f.run({ type: "BOOK_PRIZE", awardId: award.id, slotId: slot.id });
    expect(f.rows(Date.parse(slot.checkinEnd) + 1)[0]).toMatchObject({ phase: 2, note: "预约未到场" });
    f.state.activities[0].pool[0].slots[0].disabled = true;
    expect(f.rows()[0]).toMatchObject({ phase: 2, note: "预约场次待核对" });
    expect(f.rows(Date.parse(award.claimEnd) + 1)[0]).toMatchObject({ phase: 2, note: "领奖已过期" });
  });
  it("retains missing participants and disconnected historical awards for review", () => {
    const f = fixture(); f.complete(); f.draw(); f.state.participations = []; f.state.draws = [];
    expect(f.rows()).toHaveLength(1); expect(f.rows()[0].participant).toBeUndefined(); expect(f.rows()[0].note).toContain("来源待核对");
  });
  it("is readonly and leaves sales/member data, metrics, revision and storage shape unchanged", () => {
    const f = fixture(true); f.complete(); f.draw();
    const raw = JSON.stringify(f.state), sales = JSON.stringify(f.sales), members = JSON.stringify(f.members), metrics = activityMetrics(f.state, f.activity, now);
    f.rows(); prizeBookingRecords(f.state, f.activity.id, f.state.participations[0].id);
    expect(JSON.stringify(f.state)).toBe(raw); expect(JSON.stringify(f.sales)).toBe(sales); expect(JSON.stringify(f.members)).toBe(members);
    expect(activityMetrics(f.state, f.activity, now)).toEqual(metrics); expect(JSON.stringify(decodeMarketing(raw).state)).toBe(raw);
  });
});
describe("booking records, optional form fields and legacy links", () => {
  it.each([["BOOKED", "PENDING"], ["CHECKED_IN", "REDEEMED"], ["FULFILLED", "REDEEMED"], ["CANCELED", "CANCELED"], ["NO_SHOW", "PENDING"]] as const)("maps %s without rewriting the operational status", (status, expected) => {
    const f = fixture(); f.register(); const booking = { ...f.state.bookings[0], status };
    expect(activityBookingPhase(booking)).toBe(expected); expect(booking.status).toBe(status);
  });
  it("persists optional gender snapshots but never invents missing legacy values", () => {
    const f = fixture(); f.register(); expect(participantGender(f.state.participations[0])).toBe("女");
    const decoded = decodeMarketing(JSON.stringify(f.state)); expect(participantGender(decoded.state!.participations[0])).toBe("女");
    delete f.state.participations[0].identity!.gender;
    expect(participantGender(decodeMarketing(JSON.stringify(f.state)).state!.participations[0])).toBe("未记录");
    expect(participantGender()).toBe("未记录"); expect(participantIdentityIssue({ gender: "UNDISCLOSED" })).toBe("");
    expect(participantIdentityIssue({ gender: 1 as never })).toBeTruthy();
  });
  it.each([[undefined, "bookings"], ["overview", "bookings"], ["basic", "bookings"], ["booking-settings", "bookings"], ["participants", "bookings"], ["prizes", "prizes"], ["awards", "draws"], ["prize-bookings", "draws"], ["redemptions", "draws"], ["lottery", "draws"]] as const)("adapts legacy %s to %s", (requested, expected) => expect(activityDetailTab(requested)).toBe(expected));
  it.each([["settings", "prizes", "prizes"], ["settings", "lottery", "draws"], ["participants", "bookings", "bookings"], ["participants", "draws", "draws"], ["awards", "bookings", "draws"], ["awards", "redemptions", "draws"]] as const)("maps nested %s/%s to %s", (requested, secondary, expected) => expect(activityDetailTab(requested, secondary)).toBe(expected));
  it("records the actual creator for new/copy records and cannot overwrite a saved creator", () => {
    const f = fixture(), draft = { ...createMarketingActivity("gp", now), name: "创建人检查", createdBy: "forged" };
    expect(f.run({ type: "SAVE_ACTIVITY", activity: draft, section: "basic" }).ok).toBe(true);
    const created = f.state.activities.find(row => row.id === draft.id)!;
    expect(created.createdBy).toBe(f.ctx.actor.id);
    expect(f.run({ type: "SAVE_ACTIVITY", activity: { ...created, createdBy: "changed", name: "修改名称" }, section: "basic" }).ok).toBe(true);
    expect(f.state.activities.find(row => row.id === draft.id)?.createdBy).toBe(f.ctx.actor.id);
    expect(f.run({ type: "SAVE_ACTIVITY", activity: { ...f.activity, name: "旧记录编辑" }, section: "basic" }).ok).toBe(true);
    expect(f.state.activities[0].createdBy).toBeUndefined();
    const copy = f.run({ type: "COPY_ACTIVITY", activityId: f.activity.id });
    expect(copy.ok).toBe(true); expect(f.state.activities.find(row => row.id === copy.resultId)?.createdBy).toBe(f.ctx.actor.id);
  });
});
