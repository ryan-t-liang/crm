import type { MemberOperationsState, SowindBrandCode } from "@/types/member-operations";
import type { ActivityPrize, MarketingActivity, MarketingSlot, MarketingState } from "@/types/marketing";

const marketingDemoPrizes = [
  { id: "prize-demo-direct", name: "工坊纪念礼（演示）", description: "演示现场礼品，不是真实库存。", image: "", method: "DIRECT" },
  { id: "prize-demo-pickup", name: "定制礼领取（演示）", description: "预约到店领取演示。", image: "", method: "PICKUP" },
  { id: "prize-demo-experience", name: "工坊体验（演示）", description: "独立时段容量的预约体验。", image: "", method: "EXPERIENCE" },
  { id: "prize-demo-code", name: "品牌兑换码（演示）", description: "仅保存演示兑换码，不调用外部发券系统。", image: "", method: "REDEMPTION_CODE" },
] satisfies Pick<ActivityPrize, "id" | "name" | "description" | "image" | "method">[];
function createDemoMarketingSlot(id: string, now: number, capacity = 10): MarketingSlot {
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  return { id, label: "体验场次（演示）", startAt: at(30), endAt: at(120), bookingClosesAt: at(20), checkinStart: at(-30), checkinEnd: at(150), location: "演示工作室", capacity };
}
/** Suggestions are never in the past. An unset parent window keeps every time unset. */
export function createMarketingSlot(id: string, parentStart: string, capacity = 10, now = Date.now()): MarketingSlot {
  const start = Date.parse(parentStart), at = (minutes: number) => Number.isFinite(start) ? new Date(Math.max(start, now + 30 * 60_000) + minutes * 60_000).toISOString() : "";
  return { id, label: "新场次", startAt: at(0), endAt: at(60), bookingClosesAt: at(-10), checkinStart: at(-10), checkinEnd: at(70), location: "", capacity };
}
/** Operator-created drafts are distinct from runnable demonstration fixtures.
 * Empty strings preserve the V2 time contract without rewriting existing LocalStorage. */
export function createMarketingActivity(brand: SowindBrandCode, now: number): MarketingActivity {
  return { id: crypto.randomUUID(), name: "新活动", brand, description: "", ruleContent: "", cover: "", mode: "OFFLINE", location: "", status: "DRAFT", ruleVersion: 1,
    startAt: "", endAt: "", bookingEnabled: true, allowWalkIn: true, allowCancel: true, allowReschedule: true, bookingStart: "", bookingEnd: "", completion: "STAFF", slots: [],
    lotteryEnabled: true, lotteryStart: "", lotteryEnd: "", grantCount: 2, drawLimit: 2, dailyLimit: null, winLimit: 1, noWinProbability: 100, pool: [], createdAt: new Date(now).toISOString() };
}
/** Dynamic dates and virtual stock belong only to demo seeding / isolated QA fixtures. */
export function createDemoMarketingActivity(brand: SowindBrandCode, now: number, prizes = marketingDemoPrizes): MarketingActivity {
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  const activityId = crypto.randomUUID();
  return { id: activityId, name: "新活动", brand, description: "参与品牌体验，完成互动后可参与抽奖。", ruleContent: "完成活动后获得抽奖机会；中奖后按奖品领取方式在有效期内领取。", cover: "", mode: "OFFLINE", location: "演示工作室", status: "DRAFT", ruleVersion: 1,
    startAt: at(-60), endAt: at(360), bookingEnabled: true, allowWalkIn: true, allowCancel: true, allowReschedule: true, bookingStart: at(-1440), bookingEnd: at(180), completion: "STAFF", slots: [createDemoMarketingSlot(crypto.randomUUID(), now, 10)],
    lotteryEnabled: true, lotteryStart: at(-60), lotteryEnd: at(480), grantCount: 2, drawLimit: 2, dailyLimit: null, winLimit: 1, noWinProbability: 20,
    pool: prizes.map((prize, index) => ({ ...createActivityPrize(activityId, now), name: prize.name, image: prize.image, description: prize.description, label: ["一等奖", "二等奖", "体验奖", "虚拟奖"][index] ?? "奖项", quota: 10, probability: [20, 25, 15, 20][index] ?? 0, method: prize.method,
      prizeType: prize.method === "REDEMPTION_CODE" ? "VIRTUAL" : "PHYSICAL",
      location: prize.method === "REDEMPTION_CODE" ? "" : "演示工作室",
      codes: prize.method === "REDEMPTION_CODE" ? Array.from({ length: 10 }, (_, number) => ({ code: `DEMO-${activityId}-${number + 1}` })) : [],
      slots: ["PICKUP", "EXPERIENCE"].includes(prize.method) ? [createDemoMarketingSlot(crypto.randomUUID(), now, 20)] : [] })), createdAt: at(0) };
}
export function createActivityPrize(activityId: string, now: number): ActivityPrize {
  return { id: crypto.randomUUID(), activityId, name: "新奖品", label: "奖项", description: "演示奖品说明", image: "", prizeType: "PHYSICAL",
    quota: 1, probability: 0, perPersonLimit: 1, method: "DIRECT", location: "演示工作室", instructions: "请在领取有效期内出示中奖凭证。",
    claimStart: new Date(now - 3_600_000).toISOString(), claimEnd: new Date(now + 8 * 86_400_000).toISOString(), slots: [], codes: [], voucherName: "", voucherDescription: "", link: "" };
}
/** Called ONLY when the marketing namespace is absent or the user explicitly resets it. */
export function createMarketingDemoState(members: MemberOperationsState, now: number): MarketingState {
  const brands = [...new Set(members.brandUsers.map((row) => row.brand))];
  const state: MarketingState = { version: 2, revision: 0, seededAt: new Date(now).toISOString(), activities: [], participations: [], bookings: [], chances: [], draws: [], awards: [], audits: [], redemptions: [] };
  if (!brands.length) return state; // Never invent identities or a new brand collection.
  const names = ["预约制表工坊（演示）", "开放日现场活动（演示）", "品牌沙龙签到（无抽奖演示）", "已结束活动 · 仍可领奖（演示）"];
  state.activities = names.map((name, index) => {
    const activity = createDemoMarketingActivity(brands[index % brands.length], now);
    activity.id = `activity-demo-${index + 1}`; activity.name = name; activity.status = "PUBLISHED"; activity.publishedAt = activity.createdAt;
    activity.pool.forEach((item) => { item.activityId = activity.id; });
    if (index === 0) activity.slots.push({ ...activity.slots[0], id: "slot-demo-full", label: "满额场（演示）", capacity: 1 });
    if (index === 1) { activity.bookingEnabled = false; activity.completion = "CHECKIN"; }
    if (index === 2) { activity.lotteryEnabled = false; activity.completion = "CHECKIN"; }
    if (index === 3) {
      const at = (days: number) => new Date(now + days * 86_400_000).toISOString();
      activity.startAt = at(-3); activity.endAt = at(-2); activity.bookingStart = at(-5); activity.bookingEnd = at(-3); activity.lotteryStart = at(-3); activity.lotteryEnd = at(-1); activity.slots = [];
      activity.createdAt = at(-5); activity.publishedAt = at(-4);
      activity.bookingEnabled = false; activity.grantCount = 5; activity.drawLimit = 5; activity.winLimit = 4;
      activity.pool.forEach((item) => { item.quota = 1; item.claimStart = at(-3); if (item.method === "EXPERIENCE") { item.claimEnd = new Date(now - 3_600_000).toISOString(); item.slots = []; } });
    }
    return activity;
  });
  const addParticipant = (activity: MarketingActivity, userId: string, id: string, completed = false) => {
    const user = members.brandUsers.find((row) => row.id === userId)!;
    const customer = members.customers.some((row) => row.id === user.customer_id);
    const stamp = completed ? new Date(now - 2.5 * 86_400_000).toISOString() : state.seededAt;
    const row = { id, activityId: activity.id, subjectKey: customer ? `customer:${user.customer_id}` : `user:${user.id}`, identities: [{ userId, brand: user.brand, openid: user.openid, unionid: user.unionid }], credential: `ACT-DEMO-${id}`, registeredAt: stamp, checkedInAt: completed ? stamp : undefined, completedAt: completed ? stamp : undefined, ruleVersion: 1 };
    state.participations.push(row); return row;
  };
  const first = state.activities[0], fullUser = members.brandUsers.filter((row) => row.brand === first.brand && row.is_deleted === 0)[1];
  if (fullUser) { const row = addParticipant(first, fullUser.id, "participation-demo-full"); state.bookings.push({ id: "booking-demo-full", activityId: first.id, participationId: row.id, kind: "ACTIVITY", slotId: "slot-demo-full", status: "BOOKED", createdAt: state.seededAt, source: "USER" }); }
  const ended = state.activities[3], historicalUser = members.brandUsers.find((row) => row.brand === ended.brand && row.is_deleted === 0);
  if (historicalUser) {
    const participant = addParticipant(ended, historicalUser.id, "participation-demo-ended", true);
    state.chances.push({ id: "chance-demo-ended", participationId: participant.id, activityId: ended.id, count: 5, grantedAt: participant.completedAt!, ruleVersion: 1 });
    ended.pool.forEach((item, index) => {
      const drawId = `draw-demo-${index}`, awardId = `award-demo-${index}`;
      state.draws.push({ id: drawId, operationId: `operation-demo-${index}`, participationId: participant.id, activityId: ended.id, occurredAt: participant.completedAt!, poolItemId: item.id, ruleVersion: 1, randomValue: [0.1, 0.3, 0.5, 0.7][index] });
      if (item.method === "REDEMPTION_CODE") { item.codes[0].assignedAwardId = awardId; item.codes[0].assignedAt = participant.completedAt; }
      state.awards.push({ id: awardId, drawId, participationId: participant.id, activityId: ended.id, poolItemId: item.id, credential: `WIN-DEMO-${index}`, prizeName: item.name, awardLabel: item.label, prizeType: item.prizeType, image: item.image, description: item.description, method: item.method, location: item.location, instructions: item.instructions, claimStart: item.claimStart, claimEnd: item.claimEnd, ruleVersion: 1, wonAt: participant.completedAt!, virtualContent: item.method === "REDEMPTION_CODE" ? { code: item.codes[0].code } : undefined, issuedAt: item.prizeType === "VIRTUAL" ? participant.completedAt : undefined, fulfilledAt: index === 0 ? new Date(now - 86_400_000).toISOString() : undefined });
      if (index === 0) state.redemptions.push({ id: "redemption-demo-claimed", activityId: ended.id, participationId: participant.id, awardId, targetId: awardId, type: "PRIZE_CLAIM", credential: `WIN-DEMO-${index}`, occurredAt: new Date(now - 86_400_000).toISOString(), actorId: "prototype", result: "SUCCESS", detail: "明确虚构历史实体领取（演示种子）", source: "DEMO_SEED" });
      if (index === 1) state.bookings.push({ id: "booking-demo-prize", activityId: ended.id, participationId: participant.id, kind: "PRIZE", poolItemId: item.id, awardId, slotId: item.slots[0].id, status: "BOOKED", createdAt: state.seededAt, source: "USER" });
    });
    state.draws.push({ id: "draw-demo-no-win", operationId: "operation-demo-no-win", participationId: participant.id, activityId: ended.id, occurredAt: participant.completedAt!, poolItemId: null, ruleVersion: 1, randomValue: 0.95 });
  }
  state.audits.push({ id: "audit-demo-seed", action: "DEMO_SEED", targetId: "", actorId: "prototype", occurredAt: state.seededAt, result: "SUCCESS", detail: "初始化一次：全部虚构演示，历史结果为明确种子，不是生产抽奖。" });
  return state;
}
