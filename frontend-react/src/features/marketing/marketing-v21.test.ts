import { describe, expect, it } from "vitest";
import { createDemoState } from "@/mock/demo-data";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";
import { createDemoMarketingActivity, createMarketingActivity, createMarketingSlot } from "@/mock/marketing-demo-data";
import type { MarketingActivity, MarketingState } from "@/types/marketing";
import { decodeMarketing, MARKETING_STORAGE_KEY, saveMarketing } from "./marketing-storage";
import { inspectMarketingCodes, parseMarketingCodeRows } from "./marketing-code-import";
import { activityCreationIssue, activityMetrics, canViewMarketing, chances, codeInventory, draftActivityErrors, effectiveFulfillmentCapacity, executeMarketing, fulfillmentCapacity, marketingPermissions, publishChecks, quota, resolveCredential, validateActivity, winnable, type MarketingCommand, type MarketingContext, type MarketingPermissions } from "./marketing-model";

const now = Date.parse("2026-09-17T06:00:00Z");
function fixture(patch: Partial<MarketingActivity> = {}) {
  const sales = createDemoState(), members = createMemberOperationsDemoState();
  const activity = { ...createDemoMarketingActivity("gp", now), status: "PUBLISHED" as const, publishedAt: new Date(now).toISOString(), ...patch };
  const users = members.brandUsers.filter((user) => user.brand === "gp" && user.is_deleted === 0);
  let serial = 0, state: MarketingState = { version: 2, revision: 0, seededAt: new Date(now).toISOString(), activities: [activity], participations: [], bookings: [], chances: [], draws: [], awards: [], redemptions: [], audits: [] };
  const ctx: MarketingContext = { actor: sales.users[0], members, now, id: () => `v21-${++serial}`, random: () => 0.1 };
  const run = (command: MarketingCommand, patch: Partial<MarketingContext> = {}) => { const result = executeMarketing(state, command, { ...ctx, ...patch }); state = result.state; return result; };
  const complete = (userId = users[0].id) => {
    expect(run({ type: "REGISTER", activityId: activity.id, userId, slotId: activity.slots[0]?.id }).ok).toBe(true);
    const participant = state.participations.find((row) => row.identities.some((ref) => ref.userId === userId))!;
    for (const action of ["CHECKIN", "COMPLETE"] as const) expect(run({ type: "VERIFY", credential: participant.credential, action, slotId: activity.slots[0]?.id, location: activity.location }).ok).toBe(true);
    return participant;
  };
  const draw = (operationId: string, random = 0.1) => run({ type: "DRAW", activityId: activity.id, userId: users[0].id, operationId }, { random: () => random });
  return { sales, members, users, activity, ctx, run, complete, draw, get state() { return state; } };
}
const checksFor = (f: ReturnType<typeof fixture>) => validateActivity(f.state.activities[0], f.state, ["gp"], now);
const onlyPrize = (f: ReturnType<typeof fixture>, index: number) => { const prize = f.activity.pool[index]; f.activity.pool = [prize]; prize.probability = 100; f.activity.noWinProbability = 0; return prize; };

describe("V2.1 creation and draft time boundaries", () => {
  it("manager can create an empty-time draft without any brand members", () => {
    const f = fixture(); f.members.brandUsers = []; f.members.userProfiles = [];
    const draft = createMarketingActivity("gp", now);
    expect(activityCreationIssue(marketingPermissions(f.ctx.actor))).toBe("");
    expect(f.run({ type: "SAVE_ACTIVITY", activity: draft }).ok).toBe(true);
    expect(f.state.activities.find((row) => row.id === draft.id)).toMatchObject({ startAt: "", endAt: "", slots: [], pool: [], status: "DRAFT" });
    expect(f.state.participations).toEqual([]); expect(f.members.brandUsers).toEqual([]);
  });
  it("no manageable brand denies creation regardless of membership", () => {
    const f = fixture(), access = { brands: [], view: true, manage: true, redeem: false, preview: false };
    expect(activityCreationIssue(access)).toBe("当前账号没有可管理的品牌。");
    const result = f.run({ type: "SAVE_ACTIVITY", activity: createMarketingActivity("gp", now) }, { access });
    expect(result.ok).toBe(false); expect(f.state.activities).toHaveLength(1); expect(f.state.audits).toEqual([]);
  });
  it("member-free managers can configure slots/prizes, import codes and publish", () => {
    const f = fixture({ status: "DRAFT", publishedAt: undefined }); f.members.brandUsers = [];
    expect(f.run({ type: "SAVE_ACTIVITY_SLOT", activityId: f.activity.id, slot: { ...f.activity.slots[0], label: "未来活动配置" } }).ok).toBe(true);
    expect(f.run({ type: "SAVE_ACTIVITY_PRIZE", activityId: f.activity.id, prize: { ...f.activity.pool[0], name: "预配置" } }).ok).toBe(true);
    expect(f.run({ type: "IMPORT_CODES", activityId: f.activity.id, poolItemId: f.activity.pool[3].id, codes: ["FUTURE-001"] }).ok).toBe(true);
    expect(f.run({ type: "STATUS", activityId: f.activity.id, status: "PUBLISHED" }).ok).toBe(true);
    expect(f.state.participations).toHaveLength(0);
  });
  it("new activities keep all windows unset; publication requires explicit times", () => {
    const f = fixture(), draft = createMarketingActivity("un", now);
    expect([draft.startAt, draft.endAt, draft.bookingStart, draft.bookingEnd, draft.lotteryStart, draft.lotteryEnd]).toEqual(["", "", "", "", "", ""]);
    expect(validateActivity(draft, f.state, ["un"], now)).toContain("活动起止时间无效");
    expect(draftActivityErrors(draft)).toEqual([]);
  });
  it("new sessions have unset times until parent start is provided", () => {
    const slot = createMarketingSlot("new-slot", "", 10, now);
    expect([slot.startAt, slot.endAt, slot.bookingClosesAt, slot.checkinStart, slot.checkinEnd]).toEqual(["", "", "", "", ""]);
  });
  it("slot suggestions based on a past or future parent start never begin in the past", () => {
    for (const start of [new Date(now - 86_400_000).toISOString(), new Date(now + 86_400_000).toISOString()]) {
      const slot = createMarketingSlot("future-slot", start, 10, now);
      expect(Date.parse(slot.startAt)).toBeGreaterThan(now);
      expect(Date.parse(slot.bookingClosesAt)).toBeGreaterThan(now);
      expect(Date.parse(slot.checkinStart)).toBeGreaterThan(now);
    }
  });
  it("incomplete draft saves but reversed windows and illegal scalars cannot save", () => {
    const f = fixture(), draft = createMarketingActivity("gp", now);
    expect(f.run({ type: "SAVE_ACTIVITY", activity: draft }).ok).toBe(true);
    for (const patch of [{ startAt: "2026-10-02T00:00:00Z", endAt: "2026-10-01T00:00:00Z" }, { noWinProbability: 101 }, { grantCount: -1 }, { bookingStart: "not-a-date" }]) {
      expect(f.run({ type: "SAVE_ACTIVITY", activity: { ...draft, ...patch } }).ok).toBe(false);
      expect(f.state.activities.find((row) => row.id === draft.id)?.startAt).toBe("");
    }
  });
});

describe("V2.1 publish capacity and per-prize distributability", () => {
  it("quota100 with capacity20 blocks publish and reports the exact deficit80", () => {
    const f = fixture({ status: "DRAFT", publishedAt: undefined }), prize = onlyPrize(f, 1); prize.quota = 100;
    expect(effectiveFulfillmentCapacity(prize, now)).toBe(20);
    const result = f.run({ type: "STATUS", activityId: f.activity.id, status: "PUBLISHED" });
    expect(result.ok).toBe(false); expect(result.error).toContain("配置数量为 100 份"); expect(result.error).toContain("仅为 20"); expect(result.error).toContain("至少 80");
    expect(f.state.activities[0].status).toBe("DRAFT");
  });
  it("quota20 with capacity20 passes, including EXPERIENCE fulfillment", () => {
    for (const index of [1, 2]) {
      const f = fixture({ status: "DRAFT", publishedAt: undefined }), prize = onlyPrize(f, index); prize.quota = 20;
      expect(checksFor(f)).toEqual([]); expect(f.run({ type: "STATUS", activityId: f.activity.id, status: "PUBLISHED" }).ok).toBe(true);
    }
  });
  it("expired, cutoff-closed, disabled/deleted and out-of-window slots never add capacity", () => {
    const f = fixture(), prize = f.activity.pool[1], base = prize.slots[0];
    prize.slots = [base, { ...base, id: "expired", startAt: new Date(now - 50 * 60_000).toISOString(), endAt: new Date(now - 30 * 60_000).toISOString(), bookingClosesAt: new Date(now - 60 * 60_000).toISOString() }, { ...base, id: "cutoff", bookingClosesAt: new Date(now).toISOString() }, { ...base, id: "disabled", disabled: true }, { ...base, id: "deleted", deleted: true }, { ...base, id: "outside", endAt: new Date(Date.parse(prize.claimEnd) + 1000).toISOString() }];
    expect(effectiveFulfillmentCapacity(prize, now)).toBe(base.capacity);
  });
  it.each([-1, 1.2, NaN, Infinity, undefined])("illegal capacity %s is excluded and configuration errors take priority", (capacity) => {
    const f = fixture(), prize = onlyPrize(f, 1); prize.slots[0].capacity = capacity as number; prize.quota = 100;
    expect(effectiveFulfillmentCapacity(prize, now)).toBe(0);
    const errors = publishChecks(f.activity, f.state, ["gp"], now).find((check) => check.key === "fulfillment")!.errors;
    expect(errors.some((error) => error.includes("容量"))).toBe(true);
    expect(errors.some((error) => error.includes("增加至少"))).toBe(false);
  });
  it("invalid time windows are excluded and named before quota shortfalls", () => {
    const f = fixture(), prize = onlyPrize(f, 1); prize.slots[0].endAt = prize.slots[0].startAt;
    expect(effectiveFulfillmentCapacity(prize, now)).toBe(0);
    expect(checksFor(f).some((error) => error.includes("配置错误"))).toBe(true);
    expect(checksFor(f).some((error) => error.includes("增加至少"))).toBe(false);
  });
  it("legal zero-capacity slots do not add seats; zero-quota probability0 configuration can save", () => {
    const f = fixture({ status: "DRAFT", publishedAt: undefined }), prize = f.activity.pool[1];
    prize.quota = 0; prize.probability = 0; prize.slots[0].capacity = 0; f.activity.noWinProbability += 25;
    expect(effectiveFulfillmentCapacity(prize, now)).toBe(0);
    expect(f.run({ type: "SAVE_ACTIVITY", activity: f.activity }).ok).toBe(true);
    expect(checksFor(f)).toEqual([]);
  });
  it("one probability-positive empty direct prize blocks even if other prizes have stock", () => {
    const f = fixture({ status: "DRAFT", publishedAt: undefined }); f.activity.pool[0].quota = 0;
    expect(checksFor(f).some((error) => error.includes(f.activity.pool[0].name) && error.includes("真实可发放单位"))).toBe(true);
    expect(f.run({ type: "STATUS", activityId: f.activity.id, status: "PUBLISHED" }).ok).toBe(false);
  });
  it("positive probability requires actual reservation capacity and unassigned codes", () => {
    const f = fixture(); f.activity.pool[1].slots[0].capacity = 0;
    expect(checksFor(f).some((error) => error.includes("履约容量仅为 0"))).toBe(true);
    const g = fixture(); g.activity.pool[3].codes = [];
    expect(checksFor(g)).toContain("兑换码不足：已导入数量不得少于奖品配置数量");
  });
  it("each virtual voucher and link requires valid content and expiry", () => {
    for (const method of ["VIRTUAL_VOUCHER", "LINK"] as const) {
      const f = fixture(), prize = onlyPrize(f, 3); Object.assign(prize, { method, codes: [], voucherName: "演示凭证", voucherDescription: "仅本地有效", link: "https://example.com/demo" });
      expect(checksFor(f)).toEqual([]);
      const valid = structuredClone(prize);
      if (method === "LINK") prize.link = "https://"; else prize.voucherDescription = "";
      expect(checksFor(f).length).toBeGreaterThan(0);
      Object.assign(prize, valid); prize.claimEnd = prize.claimStart;
      expect(checksFor(f).length).toBeGreaterThan(0); expect(winnable(f.state, f.activity.id, prize, now)).toBe(0);
    }
  });
  it("publish checklist collects errors and maps each to the right editor step", () => {
    const f = fixture(); f.activity.name = ""; f.activity.noWinProbability = 19; f.activity.pool[1].quota = 100; f.activity.pool[3].codes = [];
    const checks = publishChecks(f.activity, f.state, ["gp"], now);
    expect(checks.filter((check) => check.errors.length).map((check) => [check.key, check.step])).toEqual([["basic", 0], ["lottery", 2], ["fulfillment", 3], ["codes", 3]]);
  });
  it("runtime retains seat reservations for unbooked winners and exhaustion probability becomes NONE", () => {
    const f = fixture({ grantCount: 4, drawLimit: 4, winLimit: 4 }), pickup = f.activity.pool[1];
    f.activity.pool = [pickup, f.activity.pool[0]]; pickup.probability = 50; pickup.perPersonLimit = 4; pickup.slots[0].capacity = 2; f.activity.pool[1].probability = 50; f.activity.noWinProbability = 0;
    const participant = f.complete(); f.draw("pickup-1"); f.draw("pickup-2");
    expect(fulfillmentCapacity(f.state, f.activity.id, pickup, now)).toMatchObject({ remainingSlots: 2, unreservedPromises: 2, availableForNewWins: 0 });
    expect(f.draw("no-extra-seat").ok).toBe(true); expect(f.state.draws.at(-1)?.poolItemId).toBeNull();
    expect(f.state.awards).toHaveLength(2); expect(chances(f.state, participant).used).toBe(3);
  });
  it("normal stock exhaustion does not redistribute the exhausted prize probability", () => {
    const f = fixture({ winLimit: 2 }); f.activity.pool[0].quota = 1; f.complete(); f.draw("last-direct");
    expect(quota(f.state, f.activity.id, f.activity.pool[0]).available).toBe(0);
    expect(f.draw("same-interval").ok).toBe(true); expect(f.state.draws.at(-1)?.poolItemId).toBeNull(); expect(f.state.awards).toHaveLength(1);
  });
});

describe("V2.1 code lifecycle", () => {
  it("trims rows, detects batch/current/global duplicates and returns partial-failure detail", () => {
    const f = fixture(), prize = f.activity.pool[3];
    const result = f.run({ type: "IMPORT_CODES", activityId: f.activity.id, poolItemId: prize.id, codes: [" CODE001 ", "CODE001", prize.codes[0].code, "BAD CODE", "", "X".repeat(129), "CODE002"] });
    expect(result.ok).toBe(true); expect(result.codeImport).toMatchObject({ imported: 2, duplicate: 2, invalid: 2, ignored: 1 });
    expect(result.codeImport?.failures).toHaveLength(4);
    expect(f.state.activities[0].pool[3].codes.slice(-2)).toEqual([{ code: "CODE001" }, { code: "CODE002" }]);
    const copied = f.run({ type: "COPY_ACTIVITY", activityId: f.activity.id });
    const copy = f.state.activities.find((activity) => activity.id === copied.resultId)!;
    expect(f.run({ type: "IMPORT_CODES", activityId: copy.id, poolItemId: copy.pool[3].id, codes: ["CODE001"] }).codeImport).toMatchObject({ imported: 0, duplicate: 1 });
  });
  it("98 valid, 2 duplicate and 1 illegal rows are counted and invalid-only imports write no codes", () => {
    const f = fixture(), prize = f.activity.pool[3], rows = Array.from({ length: 98 }, (_, index) => `V21-CODE-${index}`);
    const result = f.run({ type: "IMPORT_CODES", activityId: f.activity.id, poolItemId: prize.id, codes: [...rows, rows[0], rows[1], "BAD CODE"] });
    expect(result.codeImport).toMatchObject({ imported: 98, duplicate: 2, invalid: 1 });
    const before = structuredClone(f.state.activities[0].pool[3].codes);
    expect(f.run({ type: "IMPORT_CODES", activityId: f.activity.id, poolItemId: prize.id, codes: ["BAD\nCODE", ""] }).ok).toBe(false);
    expect(f.state.activities[0].pool[3].codes).toEqual(before);
  });
  it("CSV parses literal values and duplicate rows reach the report rather than silent success", () => {
    const rows = parseMarketingCodeRows('code\n"0001"\n"0001"\n"CO,DE"');
    expect(inspectMarketingCodes(rows)).toMatchObject({ codes: ["0001", "CO,DE"], report: { imported: 2, duplicate: 1 } });
    expect(() => parseMarketingCodeRows("code,name\n001,姓名")).toThrow("仅支持一列");
  });
  it("draft supports single AVAILABLE deletion, clear and reimport", () => {
    const f = fixture({ status: "DRAFT", publishedAt: undefined }), prize = f.activity.pool[3], command = { type: "DELETE_CODES" as const, activityId: f.activity.id, poolItemId: prize.id };
    const code = prize.codes[0].code;
    expect(f.run({ ...command, codes: [code] }).ok).toBe(true); expect(codeInventory(f.state.activities[0].pool[3]).imported).toBe(9);
    expect(f.run({ ...command, codes: f.state.activities[0].pool[3].codes.map((row) => row.code) }).ok).toBe(true); expect(f.state.activities[0].pool[3].codes).toEqual([]);
    expect(f.run({ type: "IMPORT_CODES", activityId: f.activity.id, poolItemId: prize.id, codes: [code] }).ok).toBe(true);
    expect(f.state.audits.filter((row) => row.action === "DELETE_CODES" && row.result === "SUCCESS")).toHaveLength(2);
    expect(f.state.redemptions).toEqual([]);
  });
  it("ASSIGNED cannot delete alone or inside bulk removal, even in a legacy draft", () => {
    const f = fixture(); f.complete(); f.draw("assign", 0.65);
    const prize = f.state.activities[0].pool[3], code = prize.codes.find((code) => code.assignedAwardId)!;
    f.state.activities[0].status = "DRAFT"; f.state.activities[0].publishedAt = undefined;
    for (const codes of [[code.code], prize.codes.map((row) => row.code)]) expect(f.run({ type: "DELETE_CODES", activityId: f.activity.id, poolItemId: prize.id, codes }).error).toContain("ASSIGNED");
    expect(f.state.activities[0].pool[3].codes).toEqual(prize.codes); expect(f.state.awards).toHaveLength(1);
  });
  it("assigned codes cannot be erased or unassigned via generic save commands", () => {
    const f = fixture(); f.complete(); f.draw("assign", 0.65); f.state.activities[0].publishedAt = undefined; f.state.activities[0].status = "DRAFT";
    const original = structuredClone(f.state.activities[0]), prize = original.pool[3], edit = { ...prize, codes: prize.codes.filter((code) => !code.assignedAwardId) };
    expect(f.run({ type: "SAVE_ACTIVITY_PRIZE", activityId: f.activity.id, prize: edit }).error).toContain("ASSIGNED");
    expect(f.run({ type: "SAVE_ACTIVITY", activity: { ...original, pool: original.pool.map((row) => row.id === prize.id ? edit : row) } }).error).toContain("ASSIGNED");
    expect(f.state.activities[0]).toEqual(original);
  });
  it("published can append and delete only surplus AVAILABLE codes above remaining quota", () => {
    const f = fixture(); f.complete(); f.draw("assign", 0.65);
    const prize = f.state.activities[0].pool[3], command = { type: "DELETE_CODES" as const, activityId: f.activity.id, poolItemId: prize.id };
    expect(quota(f.state, f.activity.id, prize).available).toBe(9);
    const availableCode = prize.codes.find((row) => !row.assignedAwardId)!.code;
    expect(f.run({ ...command, codes: [availableCode] }).error).toBe("删除后剩余兑换码不足以覆盖当前剩余奖品配额。");
    expect(f.run({ type: "IMPORT_CODES", activityId: f.activity.id, poolItemId: prize.id, codes: ["SURPLUS"] }).ok).toBe(true);
    expect(f.run({ ...command, codes: [availableCode] }).ok).toBe(true);
    expect(codeInventory(f.state.activities[0].pool[3])).toEqual({ imported: 10, assigned: 1, remaining: 9 });
  });
  it("retry/reload never reassigns another code, and copy has no codes or business facts", () => {
    const f = fixture(); f.complete(); const result = f.draw("assign", 0.65), before = structuredClone(f.state);
    expect(f.draw("assign", 0.95).resultId).toBe(result.resultId);
    const stored = decodeMarketing(JSON.stringify(f.state)).state!;
    expect(executeMarketing(stored, { type: "DRAW", activityId: f.activity.id, userId: f.users[0].id, operationId: "assign" }, { ...f.ctx, random: () => { throw new Error("must reuse"); } }).state).toEqual(before);
    const copyId = f.run({ type: "COPY_ACTIVITY", activityId: f.activity.id }).resultId!, copy = f.state.activities.find((activity) => activity.id === copyId)!;
    expect(copy.pool.every((prize) => !prize.codes.length && quota(f.state, copy.id, prize).occupied === 0)).toBe(true);
    for (const rows of [f.state.participations, f.state.bookings, f.state.chances, f.state.draws, f.state.awards, f.state.redemptions]) expect(rows.some((row) => row.activityId === copyId)).toBe(false);
  });
});

describe("V2.1 semantic permissions, staff and statistics", () => {
  const staff: MarketingPermissions = { brands: ["gp"], view: true, manage: false, redeem: true, preview: false };
  it("redemption-only staff can walk-in/signin/complete without preview or manage", () => {
    const f = fixture(), result = f.run({ type: "REGISTER", activityId: f.activity.id, userId: f.users[0].id, slotId: f.activity.slots[0].id, walkIn: true }, { access: staff });
    expect(result.ok).toBe(true); expect(f.state.bookings[0].source).toBe("WALK_IN");
    const credential = f.state.participations[0].credential;
    for (const action of ["CHECKIN", "COMPLETE"] as const) expect(f.run({ type: "VERIFY", credential, action, slotId: f.activity.slots[0].id, location: f.activity.location }, { access: staff }).ok).toBe(true);
    expect(f.state.chances).toHaveLength(1);
    const before = f.state;
    for (const command of [{ type: "SAVE_ACTIVITY" as const, activity: { ...f.activity, name: "禁止编辑" } }, { type: "STATUS" as const, activityId: f.activity.id, status: "PAUSED" as const }, { type: "IMPORT_CODES" as const, activityId: f.activity.id, poolItemId: f.activity.pool[3].id, codes: ["STAFF-CODE"] }]) {
      expect(f.run(command, { access: staff }).ok).toBe(false); expect(f.state).toBe(before);
    }
  });
  it("manager without redemption capability cannot walk-in or verify", () => {
    const f = fixture(), access = { ...staff, manage: true, redeem: false };
    expect(f.run({ type: "SAVE_ACTIVITY", activity: { ...f.activity, name: "合法改说明" } }, { access }).ok).toBe(true);
    expect(f.run({ type: "REGISTER", activityId: f.activity.id, userId: f.users[0].id, slotId: f.activity.slots[0].id, walkIn: true }, { access }).ok).toBe(false);
    expect(f.run({ type: "VERIFY", credential: "ACT-any", action: "CHECKIN", location: f.activity.location }, { access }).ok).toBe(false);
  });
  it("view-only denies every write category without even appending an audit", () => {
    const f = fixture(); f.complete(); f.draw("existing", 0.3);
    const access = { ...staff, redeem: false }, before = f.state, prize = f.state.activities[0].pool[1];
    const commands: MarketingCommand[] = [
      { type: "SAVE_ACTIVITY", activity: f.activity }, { type: "STATUS", activityId: f.activity.id, status: "PAUSED" }, { type: "COPY_ACTIVITY", activityId: f.activity.id }, { type: "DELETE_ACTIVITY", activityId: f.activity.id },
      { type: "SAVE_ACTIVITY_PRIZE", activityId: f.activity.id, prize }, { type: "DELETE_ACTIVITY_PRIZE", activityId: f.activity.id, poolItemId: prize.id },
      { type: "IMPORT_CODES", activityId: f.activity.id, poolItemId: f.activity.pool[3].id, codes: ["READONLY"] }, { type: "DELETE_CODES", activityId: f.activity.id, poolItemId: f.activity.pool[3].id, codes: [f.activity.pool[3].codes[0].code] },
      { type: "SAVE_ACTIVITY_SLOT", activityId: f.activity.id, slot: f.activity.slots[0] }, { type: "DELETE_ACTIVITY_SLOT", activityId: f.activity.id, slotId: f.activity.slots[0].id },
      { type: "ADD_QUOTA", activityId: f.activity.id, poolItemId: prize.id, count: 1 }, { type: "ADD_PRIZE_SLOT", activityId: f.activity.id, poolItemId: prize.id, slot: { ...prize.slots[0], id: "other" } },
      { type: "REGISTER", activityId: f.activity.id, userId: f.users[0].id }, { type: "REGISTER", activityId: f.activity.id, userId: f.users[0].id, walkIn: true },
      { type: "CANCEL_BOOKING", bookingId: f.state.bookings[0].id }, { type: "RESCHEDULE", bookingId: f.state.bookings[0].id, slotId: "other" },
      { type: "DRAW", activityId: f.activity.id, userId: f.users[0].id, operationId: "existing" }, { type: "BOOK_PRIZE", awardId: f.state.awards[0].id, slotId: prize.slots[0].id },
      { type: "VERIFY", credential: f.state.participations[0].credential, action: "COMPLETE", location: f.activity.location },
    ];
    expect(canViewMarketing(access)).toBe(true);
    for (const command of commands) { expect(f.run(command, { access }).ok).toBe(false); expect(f.state).toBe(before); }
  });
  it("explicit view denial and foreign-brand credentials cannot bypass access via direct references", () => {
    const f = fixture(); f.complete();
    expect(canViewMarketing({ ...staff, view: false })).toBe(false);
    expect(resolveCredential(f.state, f.state.participations[0].credential, { ...f.ctx, access: { ...staff, redeem: false, view: false } }).error).toBeTruthy();
    expect(f.run({ type: "REGISTER", activityId: f.activity.id, userId: f.users[0].id, walkIn: true, slotId: f.activity.slots[0].id }, { access: { ...staff, brands: ["un"] } }).ok).toBe(false);
    expect(f.state.participations).toHaveLength(1);
  });
  it("walk-in protects capacity and one active identity/booking, including customer aliases", () => {
    const f = fixture(); f.activity.slots[0].capacity = 1;
    const command = { type: "REGISTER" as const, activityId: f.activity.id, userId: f.users[0].id, walkIn: true, slotId: f.activity.slots[0].id };
    expect(f.run(command, { access: staff }).ok).toBe(true); expect(f.run(command, { access: staff }).ok).toBe(true);
    const alias = { ...f.users[0], id: "staff-alias", openid: "staff-alias-openid" }; f.members.brandUsers.push(alias);
    expect(f.run({ ...command, userId: alias.id }, { access: staff }).ok).toBe(true);
    const other = f.users.find((user) => user.customer_id !== f.users[0].customer_id)!;
    expect(f.run({ ...command, userId: other.id }, { access: staff }).ok).toBe(false);
    expect(f.state.participations).toHaveLength(1); expect(f.state.bookings).toHaveLength(1); expect(f.state.chances).toEqual([]);
  });
  it("walk-in checks allowWalkIn, status and session window, including booking-disabled activities", () => {
    for (const patch of [{ allowWalkIn: false }, { status: "PAUSED" as const }, { status: "DRAFT" as const }]) {
      const f = fixture(patch); expect(f.run({ type: "REGISTER", activityId: f.activity.id, userId: f.users[0].id, walkIn: true, slotId: f.activity.slots[0].id }, { access: staff }).ok).toBe(false);
    }
    const f = fixture(); expect(f.run({ type: "REGISTER", activityId: f.activity.id, userId: f.users[0].id, walkIn: true, slotId: f.activity.slots[0].id }, { access: staff, now: Date.parse(f.activity.slots[0].checkinEnd) }).ok).toBe(false);
    const g = fixture({ bookingEnabled: false, slots: [], allowWalkIn: false }); expect(g.run({ type: "REGISTER", activityId: g.activity.id, userId: g.users[0].id, walkIn: true }, { access: staff }).ok).toBe(false);
  });
  it("list/detail metrics exclude cancellations/no-shows and keep people separate from counts", () => {
    const f = fixture({ winLimit: 2 }); f.complete(); f.draw("none", 0.95); f.draw("winner");
    const other = f.users.find((user) => user.customer_id !== f.users[0].customer_id)!;
    f.run({ type: "REGISTER", activityId: f.activity.id, userId: other.id, slotId: f.activity.slots[0].id });
    const otherBooking = f.state.bookings.find((booking) => booking.participationId !== f.state.participations[0].id)!;
    expect(activityMetrics(f.state, f.activity, now).map((metric) => metric.rows.length)).toEqual([2, 1, 1, 1, 2, 1, 1, 0]);
    f.run({ type: "CANCEL_BOOKING", bookingId: otherBooking.id });
    expect(activityMetrics(f.state, f.activity, now)[0].rows).toHaveLength(1); expect(f.state.bookings).toHaveLength(2);
    f.run({ type: "REGISTER", activityId: f.activity.id, userId: other.id, slotId: f.activity.slots[0].id });
    const later = Date.parse(f.activity.slots[0].checkinEnd);
    expect(activityMetrics(f.state, f.activity, later).map((metric) => metric.rows.length)).toEqual([1, 1, 1, 1, 2, 1, 1, 0]);
    expect(f.state.bookings).toHaveLength(3);
  });
  it("missing, disabled, deleted or invalid sessions exclude expired bookings without dropping history", () => {
    for (const change of ["missing", "disabled", "deleted", "invalid"]) {
      const f = fixture(); expect(f.run({ type: "REGISTER", activityId: f.activity.id, userId: f.users[0].id, slotId: f.activity.slots[0].id }).ok).toBe(true);
      if (change === "missing") f.state.activities[0].slots = [];
      else if (change === "disabled") f.state.activities[0].slots[0].disabled = true;
      else if (change === "deleted") f.state.activities[0].slots[0].deleted = true;
      else f.state.activities[0].slots[0].endAt = "not-a-date";
      expect(activityMetrics(f.state, f.state.activities[0], now)[0].rows).toHaveLength(0);
      expect(f.state.bookings).toHaveLength(1); expect(f.state.participations).toHaveLength(1);
    }
  });
  it("V2 loads user edits unchanged; V2.1 empty-time drafts roundtrip without seeding/migration", () => {
    const f = fixture(); f.complete(); f.draw("assign", 0.65); f.state.activities[0].name = "原V2用户修改";
    const raw = JSON.stringify(f.state); expect(decodeMarketing(raw).state).toEqual(f.state);
    const draft = createMarketingActivity("gp", now); expect(f.run({ type: "SAVE_ACTIVITY", activity: draft }).ok).toBe(true);
    const rows = new Map([["sales", "SALES_USER_EDITS"], ["members", "MEMBER_USER_EDITS"], [MARKETING_STORAGE_KEY, raw]]);
    saveMarketing({ getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => { rows.set(key, value); } }, f.state);
    expect(decodeMarketing(rows.get(MARKETING_STORAGE_KEY)!).state).toEqual(f.state);
    expect(rows.get("sales")).toBe("SALES_USER_EDITS"); expect(rows.get("members")).toBe("MEMBER_USER_EDITS");
  });
});
