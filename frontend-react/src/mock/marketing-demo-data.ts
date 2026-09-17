import type { MemberOperationsState, SowindBrandCode } from "@/types/member-operations";
import type { MarketingActivity, MarketingPrize, MarketingSlot, MarketingState } from "@/types/marketing";

export const marketingDemoPrizes: MarketingPrize[] = [
  { id: "prize-demo-direct", name: "工坊纪念礼（演示）", description: "演示现场礼品，不是真实库存。", image: "", method: "DIRECT" },
  { id: "prize-demo-pickup", name: "定制礼领取（演示）", description: "预约到店领取演示。", image: "", method: "PICKUP" },
  { id: "prize-demo-experience", name: "工坊体验（演示）", description: "独立时段容量的预约体验。", image: "", method: "EXPERIENCE" },
];
export function createMarketingSlot(id: string, now: number, capacity = 10): MarketingSlot {
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  return { id, label: "体验场次（演示）", startAt: at(30), endAt: at(120), bookingClosesAt: at(20), checkinStart: at(-30), checkinEnd: at(150), location: "演示工作室", capacity };
}
export function createMarketingActivity(brand: SowindBrandCode, now: number, prizes = marketingDemoPrizes): MarketingActivity {
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  return { id: crypto.randomUUID(), name: "新活动", brand, description: "免费单人活动（演示）", cover: "", mode: "OFFLINE", location: "演示工作室", status: "DRAFT", ruleVersion: 1,
    startAt: at(-60), endAt: at(360), bookingEnabled: true, allowWalkIn: true, bookingStart: at(-1440), bookingEnd: at(180), completion: "STAFF", slots: [createMarketingSlot(crypto.randomUUID(), now, 10)],
    lotteryEnabled: true, lotteryStart: at(-60), lotteryEnd: at(480), grantCount: 2, drawLimit: 2, dailyLimit: null, winLimit: 1, noWinProbability: 20,
    pool: prizes.map((prize, index) => ({ id: crypto.randomUUID(), prizeId: prize.id, label: prize.name, quota: 10, probability: index === 2 ? 20 : 30, perPersonLimit: 1, method: prize.method, location: "演示工作室", instructions: "凭获奖权益码到演示工作室办理；预约型须先选择履约时段。", claimStart: at(-60), claimEnd: at(8 * 1440), slots: prize.method === "DIRECT" ? [] : [createMarketingSlot(crypto.randomUUID(), now, 20)] })), createdAt: at(0) };
}
/** Called ONLY when the marketing namespace is absent or the user explicitly resets it. */
export function createMarketingDemoState(members: MemberOperationsState, now: number): MarketingState {
  const brands = [...new Set(members.brandUsers.map((row) => row.brand))];
  const state: MarketingState = { version: 1, revision: 0, seededAt: new Date(now).toISOString(), activities: [], prizes: structuredClone(marketingDemoPrizes), participations: [], bookings: [], chances: [], draws: [], awards: [], audits: [] };
  if (!brands.length) return state; // Never invent identities or a new brand collection.
  const names = ["预约制表工坊（演示）", "开放日现场活动（演示）", "品牌沙龙签到（无抽奖演示）", "已结束活动 · 仍可领奖（演示）"];
  state.activities = names.map((name, index) => {
    const activity = createMarketingActivity(brands[index % brands.length], now);
    activity.id = `activity-demo-${index + 1}`; activity.name = name; activity.status = "PUBLISHED"; activity.publishedAt = activity.createdAt;
    if (index === 0) activity.slots.push({ ...activity.slots[0], id: "slot-demo-full", label: "满额场（演示）", capacity: 1 });
    if (index === 1) { activity.bookingEnabled = false; activity.completion = "CHECKIN"; }
    if (index === 2) { activity.lotteryEnabled = false; activity.completion = "CHECKIN"; }
    if (index === 3) {
      const at = (days: number) => new Date(now + days * 86_400_000).toISOString();
      activity.startAt = at(-3); activity.endAt = at(-2); activity.bookingStart = at(-5); activity.bookingEnd = at(-3); activity.lotteryStart = at(-3); activity.lotteryEnd = at(-1); activity.slots = [];
      activity.createdAt = at(-5); activity.publishedAt = at(-4);
      activity.bookingEnabled = false; activity.grantCount = 4; activity.drawLimit = 4; activity.winLimit = 3;
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
  if (fullUser) { const row = addParticipant(first, fullUser.id, "participation-demo-full"); state.bookings.push({ id: "booking-demo-full", activityId: first.id, participationId: row.id, kind: "ACTIVITY", slotId: "slot-demo-full", status: "BOOKED", createdAt: state.seededAt }); }
  const ended = state.activities[3], historicalUser = members.brandUsers.find((row) => row.brand === ended.brand && row.is_deleted === 0);
  if (historicalUser) {
    const participant = addParticipant(ended, historicalUser.id, "participation-demo-ended", true);
    state.chances.push({ id: "chance-demo-ended", participationId: participant.id, activityId: ended.id, count: 4, grantedAt: participant.completedAt!, ruleVersion: 1 });
    ended.pool.forEach((item, index) => {
      const drawId = `draw-demo-${index}`, awardId = `award-demo-${index}`;
      state.draws.push({ id: drawId, operationId: `operation-demo-${index}`, participationId: participant.id, activityId: ended.id, occurredAt: participant.completedAt!, poolItemId: item.id, ruleVersion: 1, randomValue: [0.1, 0.5, 0.7][index] });
      state.awards.push({ id: awardId, drawId, participationId: participant.id, activityId: ended.id, poolItemId: item.id, credential: `WIN-DEMO-${index}`, prizeName: item.label, method: item.method, location: item.location, instructions: item.instructions, claimStart: item.claimStart, claimEnd: item.claimEnd, ruleVersion: 1, wonAt: participant.completedAt!, fulfilledAt: index === 0 ? new Date(now - 86_400_000).toISOString() : undefined });
      if (index === 1) state.bookings.push({ id: "booking-demo-prize", activityId: ended.id, participationId: participant.id, kind: "PRIZE", poolItemId: item.id, awardId, slotId: item.slots[0].id, status: "BOOKED", createdAt: state.seededAt });
    });
    state.draws.push({ id: "draw-demo-no-win", operationId: "operation-demo-no-win", participationId: participant.id, activityId: ended.id, occurredAt: participant.completedAt!, poolItemId: null, ruleVersion: 1, randomValue: 0.95 });
  }
  state.audits.push({ id: "audit-demo-seed", action: "DEMO_SEED", targetId: "", actorId: "prototype", occurredAt: state.seededAt, result: "SUCCESS", detail: "初始化一次：全部虚构演示，历史结果为明确种子，不是生产抽奖。" });
  return state;
}
