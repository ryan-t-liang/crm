import type { MarketingActivity, MarketingAward, MarketingDrawProbabilitySnapshot, MarketingParticipation, MarketingParticipationChannel, MarketingState } from "@/types/marketing";

/** Fictional persisted DEMO_SEED records. Call on a freshly created activity/seed,
 * never automatically merge these into a user's existing LocalStorage activity. */
export function appendMarketingIllustrations(state: MarketingState, activity: MarketingActivity, now: number) {
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  const key = `${activity.id}:illustration`;
  const usesSession = activity.bookingEnabled;
  const slot = { id: `${key}:slot`, label: "活动场次", startAt: at(-30), endAt: at(180), bookingClosesAt: at(-31), checkinStart: at(-45), checkinEnd: at(210), location: activity.location, capacity: 35, createdAt: at(-1440) };
  if (usesSession) activity.slots.push(slot);
  const sessionPrizes = usesSession && activity.lotteryEnabled ? activity.pool.map((prize) => ({
    sessionId: slot.id, prizeId: prize.id, enabled: true, probability: prize.defaultProbability ?? prize.probability,
    allocatedQuantity: prize.quantityMode === "UNLIMITED" ? undefined : prize.quantityLimit ?? prize.quota,
  })) : [];
  if (usesSession && activity.lotteryEnabled) activity.sessionPrizes = [...(activity.sessionPrizes ?? []).filter((row) => row.sessionId !== slot.id), ...sessionPrizes];
  activity.sessionPrizeConfigVersion = Math.max(1, activity.sessionPrizeConfigVersion ?? 0);
  if (activity.lotteryEnabled) activity.winLimit = Math.max(activity.winLimit, 2);
  activity.createdAt = at(-1440); activity.publishedAt = at(-120);
  const channels: MarketingParticipationChannel[] = ["WECHAT_MINIPROGRAM", "WECHAT_H5", "WEB_H5", "QR_H5", "STAFF"];
  const genders = ["MALE", "FEMALE", "UNDISCLOSED", null] as const;
  const drawSnapshot = (): MarketingDrawProbabilitySnapshot[] => activity.pool.map((item) => {
    const config = sessionPrizes.find((row) => row.prizeId === item.id);
    const probability = config?.probability ?? item.defaultProbability ?? item.probability;
    const won = usesSession ? state.awards.filter((award) => award.activityId === activity.id && award.poolItemId === item.id && state.draws.find((draw) => draw.id === award.drawId)?.sessionId === slot.id).length : 0;
    const remaining = usesSession && item.quantityMode !== "UNLIMITED" ? Math.max(0, (config?.allocatedQuantity ?? 0) - won) : undefined;
    return { prizeId: item.id, prizeName: item.name, configuredProbability: probability, effectiveProbability: remaining === undefined || remaining > 0 ? probability : 0,
      quantityMode: item.quantityMode ?? "LIMITED", sessionRemaining: remaining };
  });
  const clueLabels = ["线索一", "线索二", "线索三", "线索四"];
  for (let index = 0; index < 30; index++) {
    const number = String(index + 1).padStart(2, "0"), prefix = `${key}:${number}`, completed = index >= 6;
    const participant: MarketingParticipation = {
      id: `${prefix}:participant`, activityId: activity.id, participantId: `${prefix}:subject`, subjectKey: `participant:${prefix}:subject`, identities: [],
      identity: { displayName: `示意用户 ${number}`, openId: `demo-openid-${activity.brand}-${number}`, wechatAppId: "demo-app", phoneCountryCode: "86", phone: `138000000${number}`, gender: genders[index % genders.length] },
      participationChannel: channels[index % channels.length], credential: `ACT-DEMO-${prefix}`, registeredAt: at(-50 - index),
      checkedInAt: completed ? at(-25) : undefined, completedAt: completed ? at(-20) : undefined, completionActorId: completed ? "prototype" : undefined, ruleVersion: activity.ruleVersion,
      taskClues: clueLabels.map((label, clueIndex) => ({ id: `${prefix}:clue-${clueIndex + 1}`, label, completed: completed || clueIndex !== 2, ...(completed ? { completedAt: at(-20) } : {}) })),
    };
    state.participations.push(participant);
    if (usesSession) state.bookings.push({ id: `${prefix}:booking`, activityId: activity.id, participationId: participant.id, kind: "ACTIVITY", slotId: slot.id,
      status: completed ? "CHECKED_IN" : index >= 3 ? "CANCELED" : "BOOKED", createdAt: participant.registeredAt, canceledAt: index >= 3 && !completed ? at(-40) : undefined, source: "USER" });
    if (!completed) continue;
    for (const type of ["CHECKIN", "COMPLETE"] as const) state.redemptions.push({ id: `${prefix}:${type}`, activityId: activity.id, participationId: participant.id, targetId: participant.id,
      type, credential: participant.credential, occurredAt: type === "CHECKIN" ? participant.checkedInAt! : participant.completedAt!, actorId: "prototype", result: "SUCCESS", source: "DEMO_SEED", detail: "虚构示意：活动签到 / 完成，并非真实用户操作。" });
    if (!activity.lotteryEnabled) continue;
    state.chances.push({ id: `${prefix}:chance`, activityId: activity.id, participationId: participant.id, count: activity.grantCount, grantedAt: participant.completedAt!, ruleVersion: activity.ruleVersion });
    // Primary draws: four non-winning, then five examples per demonstration
    // prize. Six valid second attempts bring the illustrative draw rows to 30.
    const prizeIndex = index < 10 ? -1 : Math.floor((index - 10) / 5), prize = activity.pool[prizeIndex];
    const drawId = `${prefix}:draw`, awardId = `${prefix}:award`;
    state.draws.push({ id: drawId, operationId: `${prefix}:operation`, activityId: activity.id, participationId: participant.id, occurredAt: at(-15), poolItemId: prize?.id ?? null,
      ruleVersion: activity.ruleVersion, randomValue: prize ? [0.1, 0.3, 0.5, 0.7][prizeIndex] : 0.95, ...(usesSession ? { sessionId: slot.id } : {}),
      drawConfigVersion: activity.sessionPrizeConfigVersion, probabilitySnapshot: drawSnapshot() });
    const addSecondIllustrationDraw = () => state.draws.push({ id: `${prefix}:draw:extra`, operationId: `${prefix}:operation:extra`, activityId: activity.id,
      participationId: participant.id, occurredAt: at(-14), poolItemId: null, ruleVersion: activity.ruleVersion, randomValue: 0.95, ...(usesSession ? { sessionId: slot.id } : {}),
      drawConfigVersion: activity.sessionPrizeConfigVersion, probabilitySnapshot: drawSnapshot() });
    if (!prize) { if (index < 12) addSecondIllustrationDraw(); continue; }
    const reserved = ["PICKUP", "EXPERIENCE"].includes(prize.method), fulfilled = prize.prizeType === "PHYSICAL" && (index - 10) % 5 >= (reserved ? 3 : 2);
    const code = prize.method === "REDEMPTION_CODE" ? prize.codes.find(row => !row.assignedAwardId) : undefined;
    if (code) { code.assignedAwardId = awardId; code.assignedAt = at(-15); }
    const award: MarketingAward = { id: awardId, drawId, participationId: participant.id, activityId: activity.id, poolItemId: prize.id, credential: `WIN-DEMO-${prefix}`,
      prizeName: prize.name, awardLabel: prize.label, prizeType: prize.prizeType, image: prize.image, description: prize.description, method: prize.method, fulfillmentMode: reserved ? "RESERVATION" : "DIRECT",
      location: prize.location, instructions: prize.instructions, claimStart: prize.claimStart, claimEnd: prize.claimEnd, ruleVersion: activity.ruleVersion, wonAt: at(-15),
      virtualContent: code ? { code: code.code } : undefined, issuedAt: code ? at(-15) : undefined, fulfilledAt: fulfilled ? at(-5) : undefined };
    state.awards.push(award);
    if (reserved) state.bookings.push({ id: `${prefix}:prize-booking`, activityId: activity.id, participationId: participant.id, kind: "PRIZE", poolItemId: prize.id, awardId,
      slotId: prize.slots[0].id, status: fulfilled ? "FULFILLED" : "BOOKED", createdAt: at(-10), source: "USER" });
    if (fulfilled) state.redemptions.push({ id: `${prefix}:claim`, activityId: activity.id, participationId: participant.id, awardId, targetId: awardId,
      type: prize.method === "EXPERIENCE" ? "EXPERIENCE_CLAIM" : "PRIZE_CLAIM", credential: award.credential, occurredAt: award.fulfilledAt!, actorId: "prototype", result: "SUCCESS", source: "DEMO_SEED", detail: "虚构示意：已核销，保留直接领取 / 预约领取两种路径。" });
    if (index < 12) addSecondIllustrationDraw();
  }
}
