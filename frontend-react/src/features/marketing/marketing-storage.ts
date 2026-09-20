import type { ActivityPrize, MarketingAward, MarketingRedemption, MarketingState } from "@/types/marketing";

export const MARKETING_STORAGE_KEY = "kivisense-marketing-prototype-v1";
export const MARKETING_V1_BACKUP_KEY = `${MARKETING_STORAGE_KEY}:backup-v1`;
interface StoredShape extends Omit<MarketingState, "version"> {
  version: number;
  prizes?: { id: string; name: string; description: string; image: string; method: string }[];
}
export interface DecodedMarketing { state?: MarketingState; issue?: string; originalV1?: string }
const physicalType = (method: string): ActivityPrize["prizeType"] => ["DIRECT", "PICKUP", "EXPERIENCE"].includes(method) ? "PHYSICAL" : "UNKNOWN";

function migrateV1(parsed: StoredShape): MarketingState {
  const activities = parsed.activities.map((activity) => ({
    ...activity, allowCancel: activity.allowCancel ?? true, allowReschedule: activity.allowReschedule ?? true,
    sessionPrizes: activity.sessionPrizes ?? [], sessionPrizeConfigVersion: activity.sessionPrizeConfigVersion ?? 1,
    pool: activity.pool.map((item: ActivityPrize & { prizeId?: string }) => {
      const definition = parsed.prizes?.find((row) => row.id === item.prizeId);
      const { prizeId, ...retained } = item;
      const quantityMode = item.quantityMode ?? "LIMITED";
      return { ...retained, activityId: activity.id, legacyPrizeId: prizeId,
        name: item.name ?? definition?.name ?? item.label, description: item.description ?? definition?.description ?? "",
        image: item.image ?? definition?.image ?? "", prizeType: item.prizeType ?? physicalType(item.method),
        quantityMode, quantityLimit: quantityMode === "UNLIMITED" ? null : item.quantityLimit ?? item.quota,
        defaultProbability: item.defaultProbability ?? item.probability,
        codes: item.codes ?? [], voucherName: item.voucherName ?? "", voucherDescription: item.voucherDescription ?? "", link: item.link ?? "" };
    }),
  }));
  const awards: MarketingAward[] = parsed.awards.map((award) => {
    // Missing historic metadata is not replaced with today's mutable definition.
    return { ...award, prizeType: award.prizeType ?? physicalType(award.method), image: award.image ?? "",
      description: award.description ?? "", awardLabel: award.awardLabel ?? award.prizeName };
  });
  const redemptions: MarketingRedemption[] = [];
  for (const audit of parsed.audits) {
    if (!["CHECKIN", "COMPLETE", "CLAIM"].includes(audit.action) || !audit.activityId) continue;
    const award = audit.action === "CLAIM" ? awards.find((row) => row.id === audit.targetId && row.activityId === audit.activityId) : undefined;
    const participant = parsed.participations.find((row) => row.activityId === audit.activityId && row.id === (award?.participationId ?? audit.targetId));
    if (!participant || audit.action === "CLAIM" && !award) continue;
    const type = audit.action === "CLAIM" ? award?.method === "EXPERIENCE" ? "EXPERIENCE_CLAIM" : "PRIZE_CLAIM" : audit.action as "CHECKIN" | "COMPLETE";
    if (audit.result === "SUCCESS" && (audit.action === "CLAIM" ? award?.fulfilledAt !== audit.occurredAt : audit.action === "CHECKIN" ? participant.checkedInAt !== audit.occurredAt : participant.completedAt !== audit.occurredAt)) continue;
    const record: MarketingRedemption = { id: `legacy-redemption:${audit.id}`, activityId: audit.activityId,
      participationId: participant.id, awardId: award?.id, type, targetId: audit.targetId,
      occurredAt: audit.occurredAt, actorId: audit.actorId, result: audit.result,
      credential: award?.credential ?? participant.credential, detail: audit.detail, source: "LEGACY_AUDIT" };
    redemptions.push(record);
    if (type === "CHECKIN" && audit.result === "SUCCESS" && participant.completedAt === audit.occurredAt && activities.find((row) => row.id === audit.activityId)?.completion === "CHECKIN") redemptions.push({ ...record, id: `${record.id}:complete`, type: "COMPLETE", detail: "旧规则签到即完成，同次真实业务事实" });
  }
  return { version: 2, revision: parsed.revision ?? 0, seededAt: parsed.seededAt, activities,
    participations: parsed.participations, bookings: parsed.bookings.map((row) => ({ ...row, source: row.source ?? "UNKNOWN" })),
    chances: parsed.chances, draws: parsed.draws, awards, audits: parsed.audits, redemptions };
}
export function decodeMarketing(value: string): DecodedMarketing {
  try {
    const parsed = JSON.parse(value) as StoredShape;
    const arrays = [parsed?.activities, parsed?.participations, parsed?.bookings, parsed?.chances, parsed?.draws, parsed?.awards, parsed?.audits, parsed?.version === 1 ? parsed?.prizes : parsed?.redemptions];
    const objects = arrays.every((rows) => Array.isArray(rows) && rows.every((row) => row && typeof row === "object" && typeof row.id === "string"));
    const shapes = objects && parsed.activities.every((row) =>
      [row.name, row.brand, row.description, row.mode, row.location, row.status, row.startAt, row.endAt, row.bookingStart, row.bookingEnd, row.lotteryStart, row.lotteryEnd].every((field) => typeof field === "string") &&
      (row.ruleContent === undefined || typeof row.ruleContent === "string") &&
      (row.ruleContentFormat === undefined || row.ruleContentFormat === "html") &&
      (row.activityCode === undefined || typeof row.activityCode === "string" && /^ACT[A-Z0-9-]+$/.test(row.activityCode)) &&
      (row.createdBy === undefined || typeof row.createdBy === "string") &&
      [row.bookingEnabled, row.allowWalkIn, row.lotteryEnabled].every((field) => typeof field === "boolean") &&
      [row.grantCount, row.drawLimit, row.winLimit, row.noWinProbability].every((field) => typeof field === "number" && Number.isFinite(field) || row.status === "DRAFT" && field === null) &&
      (row.dailyLimit === null || typeof row.dailyLimit === "number" && Number.isFinite(row.dailyLimit)) &&
      Array.isArray(row.slots) && Array.isArray(row.pool) && row.pool.every((item) => typeof item.label === "string" && Array.isArray(item.slots)) &&
      (row.sessionPrizeConfigVersion === undefined || Number.isInteger(row.sessionPrizeConfigVersion) && row.sessionPrizeConfigVersion > 0) &&
      (row.sessionPrizes === undefined || Array.isArray(row.sessionPrizes) && row.sessionPrizes.every((item) =>
        typeof item.sessionId === "string" && typeof item.prizeId === "string" && typeof item.enabled === "boolean" &&
        typeof item.probability === "number" && Number.isFinite(item.probability) && item.probability >= 0 && item.probability <= 100 &&
        (item.allocatedQuantity === undefined || Number.isInteger(item.allocatedQuantity) && item.allocatedQuantity >= 0)))) &&
      parsed.participations.every((row) => typeof row.activityId === "string" && typeof row.subjectKey === "string" && typeof row.credential === "string" && Array.isArray(row.identities) && row.identities.every((ref) => typeof ref.userId === "string" && typeof ref.brand === "string") &&
        (row.participantId === undefined || typeof row.participantId === "string" && Boolean(row.participantId)) &&
        (row.participationChannel === undefined || ["WECHAT_MINIPROGRAM", "WECHAT_H5", "WEB_H5", "QR_H5", "STAFF", "OTHER"].includes(row.participationChannel)) &&
        (row.identity === undefined || row.identity && typeof row.identity === "object" && !Array.isArray(row.identity) && ["memberId", "unionId", "openId", "wechatAppId", "phone", "phoneCountryCode", "externalUserId", "anonymousId", "sessionId", "displayName"].every((key) => {
          const value = row.identity?.[key as keyof NonNullable<typeof row.identity>]; return value === undefined || value === null || typeof value === "string";
        }) && (row.identity.gender === undefined || row.identity.gender === null || ["MALE", "FEMALE", "UNDISCLOSED"].includes(row.identity.gender)))) &&
      parsed.bookings.every((row) => typeof row.participationId === "string" && typeof row.slotId === "string" && ["ACTIVITY", "PRIZE"].includes(row.kind) && typeof row.status === "string") &&
      parsed.chances.every((row) => Number.isInteger(row.count) && row.count > 0) &&
      parsed.draws.every((row) => typeof row.operationId === "string" && typeof row.participationId === "string" &&
        (row.sessionId === undefined || typeof row.sessionId === "string" && Boolean(row.sessionId)) &&
        (row.drawConfigVersion === undefined || Number.isInteger(row.drawConfigVersion) && row.drawConfigVersion > 0) &&
        (row.probabilitySnapshot === undefined || Array.isArray(row.probabilitySnapshot) && row.probabilitySnapshot.every((item) =>
          typeof item.prizeId === "string" && [item.configuredProbability, item.effectiveProbability].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100) &&
          ["LIMITED", "UNLIMITED"].includes(item.quantityMode) && (item.sessionRemaining === undefined || Number.isInteger(item.sessionRemaining) && item.sessionRemaining >= 0)))) &&
      parsed.awards.every((row) => [row.credential, row.prizeName, row.location, row.instructions, row.claimStart, row.claimEnd].every((field) => typeof field === "string"));
    if (shapes && parsed.version === 1) return { state: migrateV1(parsed), originalV1: value };
    const owned = shapes && parsed.activities.every((row) => typeof row.allowCancel === "boolean" && typeof row.allowReschedule === "boolean" && row.pool.every((item) =>
      item.activityId === row.id && ["PHYSICAL", "VIRTUAL", "UNKNOWN"].includes(item.prizeType) &&
      (item.fulfillmentMode === undefined || ["DIRECT", "RESERVATION"].includes(item.fulfillmentMode)) &&
      (item.quantityMode === undefined
        ? item.quantityLimit === undefined || item.quantityLimit === null || Number.isInteger(item.quantityLimit) && item.quantityLimit >= 0
        : item.quantityMode === "UNLIMITED"
          ? item.quantityLimit === undefined || item.quantityLimit === null
          : item.quantityMode === "LIMITED" && typeof item.quantityLimit === "number" && Number.isInteger(item.quantityLimit) && item.quantityLimit >= 0) &&
      (item.defaultProbability === undefined || typeof item.defaultProbability === "number" && Number.isFinite(item.defaultProbability) && item.defaultProbability >= 0 && item.defaultProbability <= 100) &&
      [item.name, item.description, item.image, item.voucherName, item.voucherDescription, item.link].every((field) => typeof field === "string") && Array.isArray(item.codes) && item.codes.every((code) => typeof code.code === "string")));
    const records = owned && parsed.bookings.every((row) => ["USER", "WALK_IN", "UNKNOWN"].includes(row.source)) && parsed.awards.every((row) => ["PHYSICAL", "VIRTUAL", "UNKNOWN"].includes(row.prizeType) && (row.fulfillmentMode === undefined || ["DIRECT", "RESERVATION"].includes(row.fulfillmentMode))) && parsed.redemptions.every((row) =>
      [row.activityId, row.participationId, row.credential, row.actorId, row.occurredAt].every((field) => typeof field === "string") && ["CHECKIN", "COMPLETE", "PRIZE_CLAIM", "EXPERIENCE_CLAIM"].includes(row.type));
    const codes = owned ? parsed.activities.flatMap((activity) => activity.pool.flatMap((item) => item.codes.map((code) => ({ ...code, activityId: activity.id, prizeId: item.id })))) : [];
    const validSessionPrizes = owned && parsed.activities.every((activity) => {
      const rows = activity.sessionPrizes ?? [];
      const unique = new Set(rows.map((row) => `${row.sessionId}:${row.prizeId}`)).size === rows.length;
      const references = rows.every((row) => activity.slots.some((slot) => slot.id === row.sessionId && !slot.deleted) && activity.pool.some((prize) => prize.id === row.prizeId));
      const sessions = [...new Set(rows.map((row) => row.sessionId))];
      const probabilities = sessions.every((sessionId) => rows.filter((row) => row.sessionId === sessionId && row.enabled).reduce((sum, row) => sum + row.probability, 0) <= 100);
      const quantities = rows.every((row) => {
        const prize = activity.pool.find((item) => item.id === row.prizeId);
        if (!prize) return false;
        const drawIds = new Set(parsed.draws.filter((draw) => draw.activityId === activity.id && draw.sessionId === row.sessionId).map((draw) => draw.id));
        const won = parsed.awards.filter((award) => award.activityId === activity.id && award.poolItemId === row.prizeId && drawIds.has(award.drawId)).length;
        if (!row.enabled && row.probability !== 0) return false;
        if (prize.quantityMode === "UNLIMITED") return row.allocatedQuantity === undefined;
        if (!Number.isInteger(row.allocatedQuantity) || row.allocatedQuantity! < 0) return false;
        const allocated = row.allocatedQuantity!;
        return allocated >= won && (row.enabled || allocated === won);
      });
      const totals = activity.pool.every((prize) => {
        if (prize.quantityMode === "UNLIMITED") return true;
        const limit = prize.quantityLimit !== undefined && prize.quantityLimit !== null ? prize.quantityLimit : prize.quota;
        const won = parsed.awards.filter((award) => award.activityId === activity.id && award.poolItemId === prize.id).length;
        const reserved = rows.filter((row) => row.prizeId === prize.id && row.enabled).reduce((sum, row) => {
          const slot = activity.slots.find((candidate) => candidate.id === row.sessionId);
          const activityEnd = Date.parse(activity.endAt), sessionEnd = slot ? Date.parse(slot.endAt) : Number.NaN;
          const ended = activity.status === "CANCELED" || slot?.disabled || slot?.deleted || Number.isFinite(activityEnd) && Date.now() >= activityEnd || Number.isFinite(sessionEnd) && Date.now() >= sessionEnd;
          if (ended) return sum;
          const drawIds = new Set(parsed.draws.filter((draw) => draw.activityId === activity.id && draw.sessionId === row.sessionId).map((draw) => draw.id));
          const sessionWon = parsed.awards.filter((award) => award.activityId === activity.id && award.poolItemId === prize.id && drawIds.has(award.drawId)).length;
          return sum + Math.max(0, (row.allocatedQuantity ?? 0) - sessionWon);
        }, 0);
        return won + reserved <= limit;
      });
      return unique && references && probabilities && quantities && totals && (!rows.length || Number.isInteger(activity.sessionPrizeConfigVersion) && activity.sessionPrizeConfigVersion! > 0);
    });
    const validDrawSnapshots = owned && parsed.draws.every((draw) => {
      const usesSessionPrizeContract = draw.sessionId !== undefined || draw.drawConfigVersion !== undefined || draw.probabilitySnapshot !== undefined;
      // Historical V2 draws predate the session-prize contract. Keep their
      // previous read compatibility and show missing relations as "待核对".
      if (!usesSessionPrizeContract) return true;
      const activity = parsed.activities.find((row) => row.id === draw.activityId);
      const participation = parsed.participations.find((row) => row.id === draw.participationId && row.activityId === draw.activityId);
      if (!activity || !participation || draw.poolItemId !== null && !activity.pool.some((prize) => prize.id === draw.poolItemId)) return false;
      const hasVersion = Number.isInteger(draw.drawConfigVersion) && draw.drawConfigVersion! > 0;
      const hasSnapshot = Array.isArray(draw.probabilitySnapshot);
      if (draw.sessionId !== undefined && (!activity.slots.some((slot) => slot.id === draw.sessionId && !slot.deleted) || !hasVersion || !hasSnapshot)) return false;
      if (draw.drawConfigVersion !== undefined || draw.probabilitySnapshot !== undefined) {
        if (!hasVersion || !hasSnapshot) return false;
        const snapshot = draw.probabilitySnapshot!;
        if (!snapshot.length || new Set(snapshot.map((row) => row.prizeId)).size !== snapshot.length || snapshot.reduce((sum, row) => sum + row.configuredProbability, 0) > 100 || snapshot.reduce((sum, row) => sum + row.effectiveProbability, 0) > 100) return false;
        if (!snapshot.every((row) => {
          const prize = activity.pool.find((item) => item.id === row.prizeId);
          if (!prize || row.effectiveProbability > row.configuredProbability) return false;
          return draw.sessionId === undefined || row.quantityMode === "UNLIMITED" ? row.sessionRemaining === undefined : Number.isInteger(row.sessionRemaining) && row.sessionRemaining! >= 0;
        })) return false;
        if (draw.poolItemId !== null && !snapshot.some((row) => row.prizeId === draw.poolItemId && row.effectiveProbability > 0)) return false;
      }
      return true;
    });
    const validNewAwardDrawLinks = records && parsed.awards.every((award) => {
      const draw = parsed.draws.find((row) => row.id === award.drawId);
      if (!draw || draw.sessionId === undefined && draw.drawConfigVersion === undefined && draw.probabilitySnapshot === undefined) return true;
      return draw.activityId === award.activityId && draw.participationId === award.participationId && draw.poolItemId === award.poolItemId;
    });
    const validAllocations = records && validSessionPrizes && validDrawSnapshots && validNewAwardDrawLinks && new Set(codes.map((row) => row.code)).size === codes.length && codes.every((code) => !code.assignedAwardId || parsed.awards.some((award) => award.id === code.assignedAwardId && award.activityId === code.activityId && award.poolItemId === code.prizeId && award.virtualContent?.code === code.code)) && parsed.awards.every((award) => award.prizeType !== "VIRTUAL" || award.method !== "REDEMPTION_CODE" || codes.some((code) => code.assignedAwardId === award.id && code.code === award.virtualContent?.code));
    const activityCodes = parsed.activities?.flatMap(row => row.activityCode ? [row.activityCode] : []) ?? [];
    if (parsed.version === 2 && validAllocations && new Set(activityCodes).size === activityCodes.length) return { state: { ...parsed, version: 2, revision: parsed.revision ?? 0 } };
    return { issue: "营销数据版本 / 集合 / 字段不兼容，原数据已保留；请备份或明确重置营销数据。" };
  } catch { return { issue: "营销本地数据无法读取，原内容已保留，不自动清库。" }; }
}
export function saveMarketing(storage: Pick<Storage, "getItem" | "setItem">, state: MarketingState, originalV1?: string) {
  if (originalV1) {
    if (storage.getItem(MARKETING_STORAGE_KEY) !== originalV1) throw new Error("营销原文已被另一页面修改，请刷新核对；不覆盖新修改。");
    const backup = storage.getItem(MARKETING_V1_BACKUP_KEY);
    if (backup !== null && backup !== originalV1) throw new Error("已有另一份V1备份，不覆盖旧备份或当前原文；请先手动备份。");
    if (backup === null) storage.setItem(MARKETING_V1_BACKUP_KEY, originalV1);
  }
  storage.setItem(MARKETING_STORAGE_KEY, JSON.stringify(state));
}
