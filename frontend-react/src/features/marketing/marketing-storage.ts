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
    pool: activity.pool.map((item: ActivityPrize & { prizeId?: string }) => {
      const definition = parsed.prizes?.find((row) => row.id === item.prizeId);
      const { prizeId, ...retained } = item;
      return { ...retained, activityId: activity.id, legacyPrizeId: prizeId,
        name: item.name ?? definition?.name ?? item.label, description: item.description ?? definition?.description ?? "",
        image: item.image ?? definition?.image ?? "", prizeType: item.prizeType ?? physicalType(item.method),
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
      [row.bookingEnabled, row.allowWalkIn, row.lotteryEnabled].every((field) => typeof field === "boolean") &&
      [row.grantCount, row.drawLimit, row.winLimit, row.noWinProbability].every((field) => typeof field === "number" && Number.isFinite(field) || row.status === "DRAFT" && field === null) &&
      (row.dailyLimit === null || typeof row.dailyLimit === "number" && Number.isFinite(row.dailyLimit)) &&
      Array.isArray(row.slots) && Array.isArray(row.pool) && row.pool.every((item) => typeof item.label === "string" && Array.isArray(item.slots))) &&
      parsed.participations.every((row) => typeof row.activityId === "string" && typeof row.subjectKey === "string" && typeof row.credential === "string" && Array.isArray(row.identities) && row.identities.every((ref) => typeof ref.userId === "string" && typeof ref.brand === "string") &&
        (row.participantId === undefined || typeof row.participantId === "string" && Boolean(row.participantId)) &&
        (row.participationChannel === undefined || ["WECHAT_MINIPROGRAM", "WECHAT_H5", "WEB_H5", "QR_H5", "STAFF", "OTHER"].includes(row.participationChannel)) &&
        (row.identity === undefined || row.identity && typeof row.identity === "object" && !Array.isArray(row.identity) && ["memberId", "unionId", "openId", "wechatAppId", "phone", "phoneCountryCode", "externalUserId", "anonymousId", "sessionId", "displayName"].every((key) => {
          const value = row.identity?.[key as keyof NonNullable<typeof row.identity>]; return value === undefined || value === null || typeof value === "string";
        }))) &&
      parsed.bookings.every((row) => typeof row.participationId === "string" && typeof row.slotId === "string" && ["ACTIVITY", "PRIZE"].includes(row.kind) && typeof row.status === "string") &&
      parsed.chances.every((row) => Number.isInteger(row.count) && row.count > 0) &&
      parsed.draws.every((row) => typeof row.operationId === "string" && typeof row.participationId === "string") &&
      parsed.awards.every((row) => [row.credential, row.prizeName, row.location, row.instructions, row.claimStart, row.claimEnd].every((field) => typeof field === "string"));
    if (shapes && parsed.version === 1) return { state: migrateV1(parsed), originalV1: value };
    const owned = shapes && parsed.activities.every((row) => typeof row.allowCancel === "boolean" && typeof row.allowReschedule === "boolean" && row.pool.every((item) =>
      item.activityId === row.id && ["PHYSICAL", "VIRTUAL", "UNKNOWN"].includes(item.prizeType) &&
      (item.fulfillmentMode === undefined || ["DIRECT", "RESERVATION"].includes(item.fulfillmentMode)) &&
      [item.name, item.description, item.image, item.voucherName, item.voucherDescription, item.link].every((field) => typeof field === "string") && Array.isArray(item.codes) && item.codes.every((code) => typeof code.code === "string")));
    const records = owned && parsed.bookings.every((row) => ["USER", "WALK_IN", "UNKNOWN"].includes(row.source)) && parsed.awards.every((row) => ["PHYSICAL", "VIRTUAL", "UNKNOWN"].includes(row.prizeType) && (row.fulfillmentMode === undefined || ["DIRECT", "RESERVATION"].includes(row.fulfillmentMode))) && parsed.redemptions.every((row) =>
      [row.activityId, row.participationId, row.credential, row.actorId, row.occurredAt].every((field) => typeof field === "string") && ["CHECKIN", "COMPLETE", "PRIZE_CLAIM", "EXPERIENCE_CLAIM"].includes(row.type));
    const codes = owned ? parsed.activities.flatMap((activity) => activity.pool.flatMap((item) => item.codes.map((code) => ({ ...code, activityId: activity.id, prizeId: item.id })))) : [];
    const validAllocations = records && new Set(codes.map((row) => row.code)).size === codes.length && codes.every((code) => !code.assignedAwardId || parsed.awards.some((award) => award.id === code.assignedAwardId && award.activityId === code.activityId && award.poolItemId === code.prizeId && award.virtualContent?.code === code.code)) && parsed.awards.every((award) => award.prizeType !== "VIRTUAL" || award.method !== "REDEMPTION_CODE" || codes.some((code) => code.assignedAwardId === award.id && code.code === award.virtualContent?.code));
    if (parsed.version === 2 && validAllocations) return { state: { ...parsed, version: 2, revision: parsed.revision ?? 0 } };
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
