import { describe, expect, it } from "vitest";
import { createDemoState } from "@/mock/demo-data";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";
import { createDemoMarketingActivity } from "@/mock/marketing-demo-data";
import type { MarketingActivity, MarketingFulfillmentMode, MarketingParticipantIdentity, MarketingParticipationChannel, MarketingState } from "@/types/marketing";
import { awardFulfillmentLabel, chances, executeMarketing, fulfillmentCapacity, fulfillmentMode, isAwardFulfilled, needsReservation, participantChannel, participantDisplayName, participantIdentity, participantIdentityIssue, participantIdentityReview, participationMode, readActivityRule, validateActivity, winnable, type MarketingCommand, type MarketingContext } from "./marketing-model";
import { decodeMarketing, MARKETING_STORAGE_KEY, MARKETING_V1_BACKUP_KEY, saveMarketing } from "./marketing-storage";

const now = Date.parse("2026-09-17T06:00:00Z");
function fixture(booking = false, prizeMode: MarketingFulfillmentMode = "DIRECT", virtual = false) {
  const members = createMemberOperationsDemoState(), sales = createDemoState();
  const activity = { ...createDemoMarketingActivity("gp", now), id: "refinement-activity", status: "PUBLISHED" as const, publishedAt: new Date(now).toISOString(), bookingEnabled: booking, noWinProbability: 0 };
  const slot = structuredClone(activity.slots[0]);
  const prize = structuredClone(activity.pool[virtual ? 3 : prizeMode === "RESERVATION" ? 1 : 0]);
  prize.activityId = activity.id; prize.fulfillmentMode = prizeMode; prize.probability = 100; prize.quota = 2;
  if (prizeMode === "RESERVATION") { prize.location = slot.location; prize.slots = [{ ...slot, id: "prize-slot", capacity: 2 }]; }
  else prize.slots = [];
  activity.pool = [prize]; if (!booking) { activity.slots = []; activity.bookingStart = ""; activity.bookingEnd = ""; }
  const users = members.brandUsers.filter((row) => row.brand === "gp" && row.is_deleted === 0);
  let serial = 0;
  const ctx: MarketingContext = { actor: sales.users[0], members, now, random: () => 0.1, id: () => `refinement-${++serial}` };
  let state: MarketingState = { version: 2, revision: 0, seededAt: new Date(now).toISOString(), activities: [activity], participations: [], bookings: [], chances: [], draws: [], awards: [], audits: [], redemptions: [] };
  const run = (command: MarketingCommand, extra: Partial<MarketingContext> = {}) => { const result = executeMarketing(state, command, { ...ctx, ...extra }); state = result.state; return result; };
  const register = (identity?: MarketingParticipantIdentity, participantId?: string, participationChannel?: MarketingParticipationChannel) => run({ type: "REGISTER", activityId: activity.id, identity, participantId, participationChannel, slotId: booking ? slot.id : undefined });
  const verify = (action: "CHECKIN" | "COMPLETE" | "CLAIM", credential = state.participations[0].credential, slotId = booking ? slot.id : undefined, location = activity.location, extra: Partial<MarketingContext> = {}) => run({ type: "VERIFY", action, credential, slotId, location }, extra);
  const complete = (identity?: MarketingParticipantIdentity, participantId?: string) => { expect(register(identity, participantId).ok).toBe(true); expect(verify("CHECKIN").ok).toBe(true); expect(verify("COMPLETE").ok).toBe(true); };
  const draw = (operationId = "refinement-draw", participationId = state.participations[0]?.id) => run({ type: "DRAW", activityId: activity.id, participationId, operationId });
  return { members, sales, activity, users, ctx, prize, run, register, verify, complete, draw, get state() { return state; } };
}

describe("Marketing rule text is descriptive, compatible and persistent", () => {
  it("reads a missing legacy rule as empty without assigning a field", () => {
    const f = fixture(); delete f.activity.ruleContent;
    const raw = JSON.stringify(f.state), decoded = decodeMarketing(raw);
    expect(decoded.issue).toBeUndefined(); expect(readActivityRule(decoded.state!.activities[0])).toBe("");
    expect(decoded.state!.activities[0]).not.toHaveProperty("ruleContent"); expect(JSON.stringify(decoded.state)).toBe(raw);
  });
  it("saves and reloads editable rule text on a draft", () => {
    const f = fixture(), draft = { ...f.activity, id: "draft", status: "DRAFT" as const, publishedAt: undefined, ruleContent: "到场完成互动后抽奖", pool: [] };
    expect(f.run({ type: "SAVE_ACTIVITY", activity: draft }).ok).toBe(true);
    expect(readActivityRule(decodeMarketing(JSON.stringify(f.state)).state!.activities.find((row) => row.id === "draft")!)).toBe(draft.ruleContent);
  });
  it("allows published rule text edits without changing locked lottery configuration", () => {
    const f = fixture(); expect(f.run({ type: "SAVE_ACTIVITY", activity: { ...f.activity, ruleContent: "每人可抽十次，仅为文案" } }).ok).toBe(true);
    expect(f.state.activities[0].drawLimit).toBe(2); expect(f.state.activities[0].ruleVersion).toBe(1);
    expect(f.run({ type: "SAVE_ACTIVITY", activity: { ...f.state.activities[0], ruleContent: "更新文案", drawLimit: 10 } }).ok).toBe(false);
    expect(readActivityRule(f.state.activities[0])).toBe("每人可抽十次，仅为文案");
  });
  it("copies rule text into a new draft without copying business records", () => {
    const f = fixture(); f.complete(); const rule = readActivityRule(f.activity), result = f.run({ type: "COPY_ACTIVITY", activityId: f.activity.id });
    expect(result.ok).toBe(true); const copy = f.state.activities.find((row) => row.id === result.resultId)!;
    expect(copy.ruleContent).toBe(rule); expect(copy.status).toBe("DRAFT"); expect(f.state.participations.filter((row) => row.activityId === copy.id)).toHaveLength(0);
  });
  it("rejects non-text rule data instead of coercing it into a rule", () => {
    const f = fixture(), invalid = { ...f.activity, ruleContent: 1 as unknown as string };
    expect(f.run({ type: "SAVE_ACTIVITY", activity: invalid }).ok).toBe(false);
    expect(decodeMarketing(JSON.stringify({ ...f.state, activities: [invalid] })).issue).toBeTruthy();
  });
});

describe("Participation mode and prize fulfillment are independent", () => {
  it.each([false, true])("bookingEnabled=%s remains the participation-mode compatibility adapter", (booking) => {
    const f = fixture(booking); expect(participationMode(f.activity)).toBe(booking ? "RESERVATION" : "DIRECT");
    expect(validateActivity(f.activity, f.state, ["gp"], now)).toEqual([]);
  });
  it.each([[false, "DIRECT"], [true, "DIRECT"], [false, "RESERVATION"], [true, "RESERVATION"]] as const)("anonymous activity reservation=%s with %s prize completes the correct flow", (booking, prizeMode) => {
    const f = fixture(booking, prizeMode); f.complete({ anonymousId: "anonymous-scene" }, "stable-scene-user");
    expect(f.state.bookings.filter((row) => row.kind === "ACTIVITY")).toHaveLength(booking ? 1 : 0);
    expect(f.draw().ok).toBe(true); const award = f.state.awards[0]; expect(award.credential).toMatch(/^WIN-/); expect(award.fulfillmentMode).toBe(prizeMode);
    if (prizeMode === "RESERVATION") {
      expect(f.verify("CLAIM", award.credential).ok).toBe(false);
      expect(f.run({ type: "BOOK_PRIZE", awardId: award.id, slotId: "prize-slot" }).ok).toBe(true);
      expect(f.verify("CLAIM", award.credential, "prize-slot", f.prize.location).ok).toBe(true);
      expect(f.state.bookings.filter((row) => row.kind === "PRIZE" && row.status === "FULFILLED")).toHaveLength(1);
    } else {
      expect(f.run({ type: "BOOK_PRIZE", awardId: award.id, slotId: "prize-slot" }).ok).toBe(false);
      expect(f.verify("CLAIM", award.credential, undefined, f.prize.location).ok).toBe(true);
      expect(f.state.bookings.filter((row) => row.kind === "PRIZE")).toHaveLength(0);
    }
    expect(isAwardFulfilled(f.state.awards[0])).toBe(true); expect(f.state.chances).toHaveLength(1);
    expect(f.state.participations[0].identities).toEqual([]);
  });
  it("retains old EXPERIENCE reservation and virtual DIRECT fallback", () => {
    const f = fixture(); const legacy = createDemoMarketingActivity("gp", now);
    expect(fulfillmentMode(legacy.pool[2])).toBe("RESERVATION"); expect(needsReservation(legacy.pool[2])).toBe(true);
    expect(fulfillmentMode(legacy.pool[3])).toBe("DIRECT"); expect(needsReservation(legacy.pool[3])).toBe(false);
    expect(fulfillmentMode({ ...f.prize, method: "PICKUP", fulfillmentMode: "DIRECT" })).toBe("DIRECT");
    expect(fulfillmentMode({ ...f.prize, method: "REDEMPTION_CODE", fulfillmentMode: "RESERVATION" })).toBe("RESERVATION");
  });
  it("rejects invalid explicit fulfillment modes during save and reload", () => {
    const f = fixture(), invalid = { ...f.prize, fulfillmentMode: "__proto__" as MarketingFulfillmentMode };
    expect(f.run({ type: "SAVE_ACTIVITY_PRIZE", activityId: f.activity.id, prize: invalid }).ok).toBe(false);
    expect(decodeMarketing(JSON.stringify({ ...f.state, activities: [{ ...f.activity, pool: [invalid] }] })).issue).toBeTruthy();
  });
  it("virtual DIRECT allocates content at draw and does not permit staff CLAIM", () => {
    const f = fixture(false, "DIRECT", true); f.complete(); expect(f.draw().ok).toBe(true);
    expect(f.state.awards[0].issuedAt).toBeTruthy(); expect(isAwardFulfilled(f.state.awards[0])).toBe(true);
    expect(f.verify("CLAIM", f.state.awards[0].credential).ok).toBe(false); expect(f.state.bookings).toHaveLength(0);
  });
  it("virtual RESERVATION holds stock and code, but only issues after booked fulfillment", () => {
    const f = fixture(false, "RESERVATION", true); f.complete(); expect(f.draw().ok).toBe(true);
    const award = f.state.awards[0], frozenCode = award.virtualContent!.code;
    expect(award.issuedAt).toBeUndefined(); expect(isAwardFulfilled(award)).toBe(false); expect(f.state.activities[0].pool[0].codes.filter((row) => row.assignedAwardId)).toHaveLength(1);
    expect(fulfillmentCapacity(f.state, f.activity.id, f.prize, now).unreservedPromises).toBe(1);
    expect(f.verify("CLAIM", award.credential, "prize-slot", f.prize.location).ok).toBe(false);
    expect(f.run({ type: "BOOK_PRIZE", awardId: award.id, slotId: "prize-slot" }).ok).toBe(true);
    expect(f.verify("CLAIM", award.credential, "wrong-slot", f.prize.location).ok).toBe(false);
    expect(f.verify("CLAIM", award.credential, "prize-slot", "wrong-location").ok).toBe(false);
    expect(f.verify("CLAIM", award.credential, "prize-slot", f.prize.location).ok).toBe(true);
    expect(f.state.awards[0].issuedAt).toBeTruthy(); expect(f.state.awards[0].virtualContent!.code).toBe(frozenCode); expect(isAwardFulfilled(f.state.awards[0])).toBe(true);
    const assigned = f.state.activities[0].pool[0].codes.filter((row) => row.assignedAwardId).length, successes = f.state.redemptions.filter((row) => row.type === "PRIZE_CLAIM" && row.result === "SUCCESS").length;
    expect(f.verify("CLAIM", award.credential, "prize-slot", f.prize.location).ok).toBe(true);
    expect(f.state.activities[0].pool[0].codes.filter((row) => row.assignedAwardId)).toHaveLength(assigned);
    expect(f.state.redemptions.filter((row) => row.type === "PRIZE_CLAIM" && row.result === "SUCCESS")).toHaveLength(successes);
  });
  it("virtual reservation cannot bypass effective capacity with available codes", () => {
    const f = fixture(false, "RESERVATION", true); f.prize.slots[0].capacity = 1;
    expect(validateActivity(f.activity, f.state, ["gp"], now).some((error) => error.includes("容量"))).toBe(true);
    expect(winnable(f.state, f.activity.id, f.prize, now)).toBe(1); f.complete(); f.draw();
    expect(winnable(f.state, f.activity.id, f.state.activities[0].pool[0], now)).toBe(0);
    expect(f.state.activities[0].pool[0].codes.filter((row) => !row.assignedAwardId).length).toBeGreaterThan(0);
  });
  it("virtual reservation also respects code inventory and expired windows", () => {
    const f = fixture(false, "RESERVATION", true); f.prize.codes = [];
    expect(winnable(f.state, f.activity.id, f.prize, now)).toBe(0);
    f.prize.codes = [{ code: "ONLY-CODE" }]; expect(winnable(f.state, f.activity.id, f.prize, now)).toBe(1);
    expect(winnable(f.state, f.activity.id, f.prize, Date.parse(f.prize.slots[0].bookingClosesAt))).toBe(0);
  });
  it("UNKNOWN reservation awards never masquerade as fulfilled even with a legacy timestamp", () => {
    const f = fixture(false, "RESERVATION"); f.complete(); f.draw(); const award = { ...f.state.awards[0], prizeType: "UNKNOWN" as const, fulfilledAt: new Date(now).toISOString() };
    expect(isAwardFulfilled(award)).toBe(false); expect(awardFulfillmentLabel(f.state, award, now)).toBe("奖品类型待核对");
  });
  it("virtual reservation needs actual issuance as well as a fulfillment timestamp", () => {
    const f = fixture(false, "RESERVATION", true); f.complete(); f.draw(); const award = { ...f.state.awards[0], fulfilledAt: new Date(now).toISOString() };
    expect(isAwardFulfilled(award)).toBe(false); expect(awardFulfillmentLabel(f.state, award, now)).toBe("发放资料待核对");
    expect(isAwardFulfilled({ ...award, issuedAt: new Date(now).toISOString() })).toBe(true);
  });
  it("virtual reservation missing content is not fulfilled and cannot be staff-issued", () => {
    const f = fixture(false, "RESERVATION", true); f.complete(); f.draw(); const award = f.state.awards[0];
    award.virtualContent = undefined; expect(f.run({ type: "BOOK_PRIZE", awardId: award.id, slotId: "prize-slot" }).ok).toBe(true);
    expect(f.verify("CLAIM", award.credential, "prize-slot", f.prize.location).ok).toBe(false);
    expect(f.state.awards[0].issuedAt).toBeUndefined(); expect(f.state.awards[0].fulfilledAt).toBeUndefined();
    expect(isAwardFulfilled({ ...award, issuedAt: new Date(now).toISOString(), fulfilledAt: new Date(now).toISOString() })).toBe(false);
    expect(awardFulfillmentLabel(f.state, award, now)).toBe("发放资料待核对");
  });
  it.each([{ name: "缺说明", description: "" }, { link: "javascript:alert(1)" }])("virtual reservation incomplete voucher or invalid link %j remains unfulfilled", (content) => {
    const f = fixture(false, "RESERVATION", true); f.complete(); f.draw(); const award = { ...f.state.awards[0], method: "link" in content ? "LINK" as const : "VIRTUAL_VOUCHER" as const, virtualContent: content, issuedAt: new Date(now).toISOString(), fulfilledAt: new Date(now).toISOString() };
    expect(isAwardFulfilled(award)).toBe(false); expect(awardFulfillmentLabel(f.state, award, now)).toBe("发放资料待核对");
  });
});

describe("Optional identity anchors business on internal participation", () => {
  it.each([
    { openId: "openid-only", wechatAppId: "app-a" }, { phone: "13800138000", phoneCountryCode: "+86" },
    { anonymousId: "browser-anon", sessionId: "session-a" }, {},
    { memberId: null, unionId: null, openId: null, wechatAppId: null, phone: null, phoneCountryCode: null, externalUserId: null, anonymousId: null, sessionId: null, displayName: null },
  ])("optional identity %j supports complete/draw/award/redeem without CRM creation", (identity) => {
    const f = fixture(), before = JSON.stringify(f.members); f.complete(identity); expect(f.draw().ok).toBe(true);
    expect(f.verify("CLAIM", f.state.awards[0].credential, undefined, f.prize.location).ok).toBe(true);
    expect(f.state.participations[0].participantId).toBeTruthy(); expect(f.state.participations[0].identities).toEqual([]);
    expect(JSON.stringify(f.members)).toBe(before); expect(decodeMarketing(JSON.stringify(f.state)).state).toEqual(f.state);
  });
  it("complete explicitly selected member identity retains reliable customer subject and win limit", () => {
    const f = fixture(); f.complete({ memberId: f.users[0].id, unionId: f.users[0].unionid, openId: f.users[0].openid, wechatAppId: "demonstration-app", displayName: "会员参与者" });
    expect(f.state.participations[0].identities[0].userId).toBe(f.users[0].id); expect(f.state.participations[0].subjectKey).toMatch(/^(customer|user):/);
    expect(f.draw().ok).toBe(true); expect(f.draw("second-member-win").ok).toBe(false);
    expect(participantDisplayName(f.state.participations[0], f.members)).toBe("会员参与者");
  });
  it.each(["WECHAT_MINIPROGRAM", "WECHAT_H5", "WEB_H5", "QR_H5", "STAFF", "OTHER"] as MarketingParticipationChannel[])("saves and reloads channel %s", (channel) => {
    const f = fixture(); expect(f.register(undefined, undefined, channel).ok).toBe(true);
    expect(participantChannel(decodeMarketing(JSON.stringify(f.state)).state!.participations[0])).toBe(channel);
  });
  it("does not deduplicate equal phone, UnionID, session, anonymousId or display name", () => {
    const f = fixture(), identity = { phone: "13800138000", phoneCountryCode: "+86", unionId: "same-union", anonymousId: "same-browser", sessionId: "same-session", displayName: "同名" };
    expect(f.register(identity).ok).toBe(true); expect(f.register(identity).ok).toBe(true);
    expect(f.state.participations).toHaveLength(2); expect(new Set(f.state.participations.map((row) => row.participantId)).size).toBe(2);
    expect(f.state.participations.every((row) => row.identities.length === 0)).toBe(true);
  });
  it("does not globally deduplicate OpenID across application context", () => {
    const f = fixture(); f.register({ openId: "same-open", wechatAppId: "app-a" }); f.register({ openId: "same-open", wechatAppId: "app-b" }); f.register({ openId: "same-open", wechatAppId: "app-a" });
    expect(f.state.participations).toHaveLength(3); expect(f.state.participations.map((row) => row.identity!.wechatAppId)).toEqual(["app-a", "app-b", "app-a"]);
  });
  it("explicit internal participantId is stable across repeats and refresh", () => {
    const f = fixture(); f.complete({ anonymousId: "preview-anonymous" }, "preview-stable"); const row = f.state.participations[0];
    expect(f.register({ anonymousId: "preview-anonymous" }, "preview-stable").ok).toBe(true); expect(f.state.participations).toHaveLength(1); expect(f.state.chances).toHaveLength(1);
    const reloaded = decodeMarketing(JSON.stringify(f.state)).state!;
    const result = executeMarketing(reloaded, { type: "DRAW", activityId: f.activity.id, participantId: "preview-stable", operationId: "after-refresh" }, f.ctx);
    expect(result.ok).toBe(true); expect(result.state.draws[0].participationId).toBe(row.id);
  });
  it("later explicit member association preserves participation, frozen subject and chance ledger", () => {
    const f = fixture(); f.complete({ phone: "13800138000", phoneCountryCode: "86" }, "later-member"); const row = structuredClone(f.state.participations[0]), balance = chances(f.state, row);
    expect(f.register({ memberId: f.users[0].id }, "later-member").ok).toBe(true);
    expect(f.state.participations[0].id).toBe(row.id); expect(f.state.participations[0].subjectKey).toBe(row.subjectKey); expect(chances(f.state, f.state.participations[0])).toEqual(balance);
    expect(f.state.participations[0].identity!.memberId).toBe(f.users[0].id); expect(f.state.chances).toHaveLength(1); expect(f.draw().ok).toBe(true);
  });
  it("later member association with another existing participation requires review, never merges", () => {
    const f = fixture(); f.register({ memberId: f.users[0].id }, "member-participant"); f.register({}, "anonymous-participant"); const rows = structuredClone(f.state.participations);
    expect(f.register({ memberId: f.users[0].id }, "anonymous-participant").error).toContain("待核验"); expect(f.state.participations).toEqual(rows);
  });
  it("an already associated participant cannot be rebound to an unrelated member", () => {
    const f = fixture(); f.register({ memberId: f.users[0].id }, "existing-member"); const before = structuredClone(f.state.participations);
    const other = f.users.find((user) => user.customer_id !== f.users[0].customer_id)!;
    expect(f.register({ memberId: other.id }, "existing-member").error).toContain("待核验"); expect(f.state.participations).toEqual(before);
  });
  it("DRAW cannot implicitly associate an anonymous internal target with a supplied member", () => {
    const f = fixture(); f.complete({}, "anonymous-target");
    expect(f.run({ type: "DRAW", activityId: f.activity.id, participantId: "anonymous-target", userId: f.users[0].id, operationId: "implicit-member" }).ok).toBe(false);
    expect(f.state.participations[0].identities).toEqual([]); expect(f.state.awards).toHaveLength(0);
  });
  it("a legacy member reference without AppID still registers and draws", () => {
    const f = fixture(); expect(f.run({ type: "REGISTER", activityId: f.activity.id, userId: f.users[0].id }).ok).toBe(true);
    f.verify("CHECKIN"); f.verify("COMPLETE"); expect(f.run({ type: "DRAW", activityId: f.activity.id, userId: f.users[0].id, operationId: "legacy-draw" }).ok).toBe(true);
    expect(participantIdentity(f.state.participations[0]).openId).toBe(f.users[0].openid);
  });
  it("new explicit OpenID requires application context; invalid channel cannot use prototype keys", () => {
    const f = fixture(); expect(f.register({ openId: "unknown-app" }).ok).toBe(false); expect(f.state.participations).toHaveLength(0);
    expect(participantIdentityIssue({}, "__proto__" as MarketingParticipationChannel)).toBeTruthy(); expect(f.register({}, undefined, "constructor" as MarketingParticipationChannel).ok).toBe(false);
    expect(f.register({ openId: "valid", wechatAppId: "app-a" }).ok).toBe(true);
  });
  it("only whitelists observation fields, not caller role/customer IDs", () => {
    const f = fixture(); f.register({ anonymousId: "anon", role: "HQ_ADMIN", customerId: "customer-forged" } as MarketingParticipantIdentity);
    expect(f.state.participations[0].identity).toEqual({ anonymousId: "anon" }); expect(f.state.participations[0].identities).toEqual([]);
    expect(f.register({ phone: 42 } as unknown as MarketingParticipantIdentity).ok).toBe(false);
  });
  it("internal draw targets must belong to the current activity and be unique", () => {
    const f = fixture(); f.complete(); expect(f.draw("missing", "other-activity-participation").ok).toBe(false);
    f.state.participations.push({ ...structuredClone(f.state.participations[0]), id: "different-row" });
    expect(f.run({ type: "DRAW", activityId: f.activity.id, participantId: f.state.participations[0].participantId, operationId: "duplicate-key" }).error).toContain("冲突"); expect(f.state.draws).toHaveLength(0);
  });
  it("phone ambiguity is read-only review scoped to brand, not random association", () => {
    const f = fixture(), user = f.users[0], profile = f.members.userProfiles.find((row) => row.user_id === user.id)!;
    profile.tel = "13800138000"; profile.tel_country_code = "86";
    f.register({ phone: "138 0013 8000", phoneCountryCode: "+86" }); const row = f.state.participations[0];
    expect(participantIdentityReview(row, f.members, "gp")).toBe("UNLINKED");
    const duplicate = { ...user, id: "other-phone-member" }; f.members.brandUsers.push(duplicate); f.members.userProfiles.push({ ...profile, id: "other-phone-profile", user_id: duplicate.id });
    expect(participantIdentityReview(row, f.members, "gp")).toBe("UNVERIFIED"); expect(participantIdentityReview(row, f.members, "un")).toBe("UNLINKED");
    expect(row.identity!.memberId).toBeUndefined(); expect(row.identities).toEqual([]);
  });
  it("legacy channel default and missing identity are read adapters only", () => {
    const f = fixture(); f.register(); const row = f.state.participations[0]; delete row.participantId; delete row.identity; delete row.participationChannel;
    const raw = JSON.stringify(f.state), decoded = decodeMarketing(raw).state!;
    expect(participantChannel(decoded.participations[0])).toBe("OTHER"); expect(participantDisplayName(decoded.participations[0], f.members)).toContain("匿名参与者");
    expect(decoded.participations[0]).not.toHaveProperty("participantId"); expect(JSON.stringify(decoded)).toBe(raw);
  });
  it("legacy anonymous bookmark reuses participation.id when participantId is absent", () => {
    const f = fixture(); f.complete({ anonymousId: "legacy-anonymous" }); const row = f.state.participations[0]; delete row.participantId;
    const ledger = structuredClone(f.state.chances);
    expect(f.register({ anonymousId: "legacy-anonymous" }, row.id).ok).toBe(true);
    expect(f.state.participations).toHaveLength(1); expect(f.state.participations[0].id).toBe(row.id);
    expect(f.state.participations[0]).not.toHaveProperty("participantId"); expect(f.state.chances).toEqual(ledger);
  });
});

describe("Refinement preserves draw atomicity and isolated storage", () => {
  it("anonymous repeated operation is idempotent and does not double-use stock/code/chances", () => {
    const f = fixture(false, "DIRECT", true); f.complete(); const first = f.draw(); expect(first.ok).toBe(true);
    const before = JSON.stringify(f.state); expect(f.draw().resultId).toBe(first.resultId); expect(JSON.stringify(f.state)).toBe(before);
    expect(f.state.draws).toHaveLength(1); expect(f.state.awards).toHaveLength(1); expect(chances(f.state, f.state.participations[0]).used).toBe(1);
  });
  it("anonymous invalid random source leaves chances, draws and code inventory untouched", () => {
    const f = fixture(false, "DIRECT", true); f.complete(); const before = { participations: structuredClone(f.state.participations), codes: structuredClone(f.state.activities[0].pool[0].codes), chances: structuredClone(f.state.chances) };
    const result = f.run({ type: "DRAW", activityId: f.activity.id, participationId: f.state.participations[0].id, operationId: "bad-random" }, { random: () => NaN });
    expect(result.ok).toBe(false); expect(f.state.draws).toHaveLength(0); expect(f.state.awards).toHaveLength(0); expect(f.state.participations).toEqual(before.participations); expect(f.state.activities[0].pool[0].codes).toEqual(before.codes); expect(f.state.chances).toEqual(before.chances);
  });
  it("persists new optional identity and mode without touching sales/member namespaces", () => {
    const f = fixture(false, "RESERVATION", true); f.complete({ anonymousId: "persistent" }, "persistent-user"); f.draw();
    const rows = new Map([["sales", "user-sales-edit"], ["member", "user-member-edit"]]);
    saveMarketing({ getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => { rows.set(key, value); } }, f.state);
    expect(decodeMarketing(rows.get(MARKETING_STORAGE_KEY)!).state).toEqual(f.state); expect(rows.get("sales")).toBe("user-sales-edit"); expect(rows.get("member")).toBe("user-member-edit"); expect(rows.has(MARKETING_V1_BACKUP_KEY)).toBe(false);
  });
  it("unknown future version is rejected without any storage write", () => {
    const raw = '{"version":99,"ruleContent":"future user data"}', rows = new Map([[MARKETING_STORAGE_KEY, raw]]);
    expect(decodeMarketing(rows.get(MARKETING_STORAGE_KEY)!).state).toBeUndefined(); expect(rows.get(MARKETING_STORAGE_KEY)).toBe(raw);
  });
  it("an unprivileged account cannot anonymously register, draw or change rule text", () => {
    const f = fixture(), actor = f.sales.users.find((row) => row.role === "DISTRIBUTOR_MANAGER")!;
    const before = JSON.stringify(f.state); expect(f.run({ type: "REGISTER", activityId: f.activity.id, identity: {} }, { actor }).ok).toBe(false);
    expect(f.run({ type: "DRAW", activityId: f.activity.id, participationId: "any", operationId: "denied" }, { actor }).ok).toBe(false);
    expect(f.run({ type: "SAVE_ACTIVITY", activity: { ...f.activity, ruleContent: "forged" } }, { actor }).ok).toBe(false); expect(JSON.stringify(f.state)).toBe(before);
  });
});
