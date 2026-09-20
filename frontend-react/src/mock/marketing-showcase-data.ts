import type { MarketingAward, MarketingState } from "@/types/marketing";
import type { SowindBrandCode } from "@/types/member-operations";
import { createActivityPrize, createMarketingActivity } from "./marketing-demo-data";

export const MARKETING_SHOWCASE_ID = "activity-demo-redemption-200-v1";

/** User-requested, versioned addition of ONE independent fictional activity.
 * Never replace, reseed, merge into, or change any existing activity/record. */
export function appendMarketingShowcase(source: MarketingState, brand: SowindBrandCode, now: number): MarketingState {
  if (source.activities.some(row => row.id === MARKETING_SHOWCASE_ID) || source.audits.some(row => row.id === `${MARKETING_SHOWCASE_ID}:seed`)) return source;
  const state = structuredClone(source), id = MARKETING_SHOWCASE_ID;
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  const activity = { ...createMarketingActivity(brand, now), id, name: "Kivisense 品牌体验日（200条演示）", status: "PUBLISHED" as const,
    location: "Kivisense 体验空间", createdBy: "prototype", createdAt: at(-2880), publishedAt: at(-1440),
    startAt: at(-120), endAt: at(7 * 1440), bookingStart: at(-2880), bookingEnd: at(6 * 1440),
    lotteryStart: at(-120), lotteryEnd: at(7 * 1440), noWinProbability: 20,
    description: "独立虚构活动，预约和抽奖各200条；不涉及真实客户或奖品发放。",
    ruleContent: "完成活动后获得2次抽奖机会。咖啡券现场核销，DIY皮牌需预约兑奖时段，京东购物卡为虚构兑换码。" };
  const session = { id: `${id}:session`, label: "品牌体验", location: activity.location, startAt: at(-120), endAt: at(1440), bookingClosesAt: at(-121), checkinStart: at(-150), checkinEnd: at(1440), capacity: 250 };
  const future = { ...session, id: `${id}:future`, label: "品牌体验", startAt: at(2 * 1440), endAt: at(2 * 1440 + 120), bookingClosesAt: at(2 * 1440 - 10), checkinStart: at(2 * 1440 - 15), checkinEnd: at(2 * 1440 + 120), capacity: 50 };
  activity.slots = [session, future];
  const pickupId = `${id}:pickup`, pickupSlot = { ...session, id: `${id}:pickup-slot`, label: "兑奖时段", capacity: 100, bookingClosesAt: at(1440) };
  activity.pickupSchedules = [{ id: pickupId, activityId: id, name: "DIY皮牌兑奖预约", location: activity.location, startAt: at(-120), endAt: at(8 * 1440), slots: [pickupSlot, { ...pickupSlot, id: `${id}:pickup-next`, startAt: at(1440 + 60), endAt: at(1440 + 180), bookingClosesAt: at(1440 + 180), checkinStart: at(1440 + 60), checkinEnd: at(1440 + 180) }] }];
  activity.pool = ["咖啡券", "DIY皮牌", "京东购物卡"].map((name, index) => ({ ...createActivityPrize(id, now), id: `${id}:prize-${index}`, name,
    description: "虚构演示奖品，不可真实兑换。", label: ["咖啡礼遇", "手作礼遇", "购物礼遇"][index],
    prizeType: index === 2 ? "VIRTUAL" as const : "PHYSICAL" as const,
    method: index === 2 ? "REDEMPTION_CODE" as const : index === 1 ? "PICKUP" as const : "DIRECT" as const,
    fulfillmentMode: index === 1 ? "RESERVATION" as const : "DIRECT" as const,
    location: index === 2 ? "" : activity.location, quantityLimit: 200, quota: 200,
    probability: [30, 30, 20][index], defaultProbability: [30, 30, 20][index],
    claimStart: at(-120), claimEnd: at(8 * 1440), pickupScheduleId: index === 1 ? pickupId : undefined,
    codes: index === 2 ? Array.from({ length: 200 }, (_, n) => ({ code: `DEMO-JD-${id}-${n + 1}` })) : [],
  }));
  // First session inherits activity defaults; the future session demonstrates
  // an explicit whole-pool override and reserves only 20 per prize.
  activity.sessionPrizes = [];
  state.activities.unshift(activity);
  const clueLabels = ["线索一", "线索二", "线索三", "线索四"];
  for (let index = 0; index < 200; index++) {
    const prefix = `${id}:${index + 1}`, completed = index >= 40;
    const participant = { id: `${prefix}:participant`, activityId: id, participantId: `${prefix}:identity`, subjectKey: `participant:${prefix}:identity`, identities: [],
      identity: { displayName: `演示用户${String(index + 1).padStart(3, "0")}`, openId: `${prefix}:openid`, phoneCountryCode: "86", phone: `1380000${String(index + 1).padStart(4, "0")}`, gender: index % 2 ? "FEMALE" as const : "MALE" as const },
      participationChannel: "WECHAT_MINIPROGRAM" as const, credential: `ACT-${prefix}`, registeredAt: at(-500 + index), ruleVersion: 1,
      checkedInAt: completed ? at(-60) : undefined, completedAt: completed ? at(-55) : undefined,
      taskClues: clueLabels.map((label, clueIndex) => ({ id: `${prefix}:clue-${clueIndex + 1}`, label, completed: completed || clueIndex !== 2, ...(completed ? { completedAt: at(-55) } : {}) })) };
    state.participations.push(participant);
    state.bookings.push({ id: `${prefix}:booking`, activityId: id, participationId: participant.id, kind: "ACTIVITY", slotId: session.id,
      status: completed ? "CHECKED_IN" : index < 20 ? "BOOKED" : "CANCELED", createdAt: participant.registeredAt, source: "USER", canceledAt: !completed && index >= 20 ? at(-200) : undefined });
    if (!completed) continue;
    state.chances.push({ id: `${prefix}:chance`, activityId: id, participationId: participant.id, count: 2, grantedAt: at(-55), ruleVersion: 1 });
    for (const type of ["CHECKIN", "COMPLETE"] as const) state.redemptions.push({ id: `${prefix}:${type}`, activityId: id, participationId: participant.id, targetId: participant.id, type, credential: participant.credential, occurredAt: type === "CHECKIN" ? at(-60) : at(-55), actorId: "prototype", result: "SUCCESS", source: "DEMO_SEED", detail: "虚构演示记录" });
    const prizeIndex = index % 10 < 3 ? 0 : index % 10 < 6 ? 1 : index % 10 < 8 ? 2 : -1;
    const prize = activity.pool[prizeIndex], drawId = `${prefix}:draw`, awardId = `${prefix}:award`;
    const snapshot = activity.pool.map(item => ({ prizeId: item.id, prizeName: item.name, configuredProbability: item.probability, effectiveProbability: item.probability, quantityMode: "LIMITED" as const,
      sessionRemaining: 180 - state.awards.filter(award => award.activityId === id && award.poolItemId === item.id).length }));
    state.draws.push({ id: drawId, operationId: drawId, activityId: id, participationId: participant.id, sessionId: session.id, occurredAt: at(-50 + index / 10), poolItemId: prize?.id ?? null, ruleVersion: 1, drawConfigVersion: 1, probabilitySnapshot: snapshot, randomValue: [0.1, 0.4, 0.7][prizeIndex] ?? 0.9 });
    if (index < 80) state.draws.push({ id: `${drawId}:extra`, operationId: `${drawId}:extra`, activityId: id, participationId: participant.id, sessionId: session.id, occurredAt: at(-50 + index / 10 + 0.01), poolItemId: null, ruleVersion: 1, drawConfigVersion: 1, probabilitySnapshot: snapshot.map(row => ({ ...row, sessionRemaining: row.sessionRemaining - (row.prizeId === prize?.id ? 1 : 0) })), randomValue: 0.95 });
    if (!prize) continue;
    const reserved = prizeIndex === 1, fulfilled = prizeIndex === 0 && index % 3 === 0 || reserved && index % 3 === 0;
    const code = prize.codes.find(row => !row.assignedAwardId);
    if (code) { code.assignedAwardId = awardId; code.assignedAt = at(-30); }
    const award: MarketingAward = { id: awardId, drawId, activityId: id, participationId: participant.id, poolItemId: prize.id, credential: `WIN-${prefix}`, prizeName: prize.name, awardLabel: prize.label,
      prizeType: prize.prizeType, image: prize.image, description: prize.description, method: prize.method, fulfillmentMode: prize.fulfillmentMode,
      location: prize.location, instructions: prize.instructions, claimStart: prize.claimStart, claimEnd: prize.claimEnd, ruleVersion: 1, wonAt: at(-50 + index / 10),
      virtualContent: code ? { code: code.code } : undefined, issuedAt: code ? at(-30) : undefined, fulfilledAt: fulfilled ? at(-5) : undefined };
    state.awards.push(award);
    if (reserved && index % 3 !== 2) state.bookings.push({ id: `${prefix}:prize-booking`, activityId: id, participationId: participant.id, kind: "PRIZE", poolItemId: prize.id, awardId, scheduleId: pickupId, slotId: pickupSlot.id, status: fulfilled ? "FULFILLED" : "BOOKED", createdAt: at(-10), source: "USER" });
    if (fulfilled) state.redemptions.push({ id: `${prefix}:claim`, activityId: id, participationId: participant.id, awardId, targetId: awardId, type: "PRIZE_CLAIM", credential: award.credential, occurredAt: at(-5), actorId: "prototype", result: "SUCCESS", source: "DEMO_SEED", detail: "虚构兑奖核销记录" });
  }
  state.revision += 1;
  state.audits.push({ id: `${id}:seed`, activityId: id, action: "DEMO_SEED", targetId: id, actorId: "prototype", occurredAt: at(0), result: "SUCCESS", detail: "用户授权新增独立演示活动：活动预约200条、抽奖200条。原活动与所有历史记录保留。" });
  return state;
}
