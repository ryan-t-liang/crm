import type { MarketingState } from "@/types/marketing";

export const MARKETING_STORAGE_KEY = "kivisense-marketing-prototype-v1";
export function decodeMarketing(value: string): { state?: MarketingState; issue?: string } {
  try {
    const parsed = JSON.parse(value) as MarketingState;
    const arrays = [parsed?.activities, parsed?.prizes, parsed?.participations, parsed?.bookings, parsed?.chances, parsed?.draws, parsed?.awards, parsed?.audits];
    const objectRows = arrays.every((rows) => Array.isArray(rows) && rows.every((row) => row && typeof row === "object" && typeof row.id === "string"));
    const activityShapes = Array.isArray(parsed?.activities) && parsed.activities.every((row) =>
      [row.name, row.brand, row.description, row.mode, row.location, row.status, row.startAt, row.endAt, row.bookingStart, row.bookingEnd, row.lotteryStart, row.lotteryEnd].every((field) => typeof field === "string") &&
      [row.bookingEnabled, row.allowWalkIn, row.lotteryEnabled].every((field) => typeof field === "boolean") &&
      [row.grantCount, row.drawLimit, row.winLimit, row.noWinProbability].every((field) => (typeof field === "number" && Number.isFinite(field)) || (row.status === "DRAFT" && field === null)) &&
      (row.dailyLimit === null || (typeof row.dailyLimit === "number" && Number.isFinite(row.dailyLimit))) &&
      Array.isArray(row.slots) && Array.isArray(row.pool) && row.pool.every((item) => typeof item.label === "string" && Array.isArray(item.slots)));
    const recordShapes = objectRows && parsed.participations.every((row) => typeof row.activityId === "string" && typeof row.subjectKey === "string" && typeof row.credential === "string" && Array.isArray(row.identities) && row.identities.every((ref) => typeof ref.userId === "string" && typeof ref.brand === "string")) &&
      parsed.bookings.every((row) => typeof row.participationId === "string" && typeof row.slotId === "string" && ["ACTIVITY", "PRIZE"].includes(row.kind) && typeof row.status === "string") &&
      parsed.chances.every((row) => Number.isInteger(row.count) && row.count > 0) &&
      parsed.draws.every((row) => typeof row.operationId === "string" && typeof row.participationId === "string") &&
      parsed.awards.every((row) => [row.credential, row.prizeName, row.location, row.instructions, row.claimStart, row.claimEnd].every((field) => typeof field === "string"));
    if (parsed?.version === 1 && recordShapes && activityShapes) return { state: { ...parsed, revision: parsed.revision ?? 0 } };
    return { issue: "营销数据版本 / 集合 / 字段不兼容，原数据已保留；请备份或明确重置营销数据。" };
  } catch {
    return { issue: "营销本地数据无法读取，原内容已保留，不自动清库。" };
  }
}
