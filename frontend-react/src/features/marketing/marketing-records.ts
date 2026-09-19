import type { MarketingActivity, MarketingAward, MarketingBooking, MarketingDraw, MarketingParticipation, MarketingState } from "@/types/marketing";
import { parseCreatedAt } from "@/features/dashboard/dashboard-model";
import { bookingStatus, isAwardFulfilled, needsReservation, slotFor } from "./marketing-model";

/** Read-side phases, not a replacement for the operational booking/award contracts. */
export type DrawRecordPhase = 1 | 2 | 3 | 4 | 5;
export const drawRecordLabels: Record<DrawRecordPhase, string> = { 1: "未抽奖", 2: "已抽奖", 3: "已核销", 4: "已预约", 5: "已核销" };
export const drawPhaseOptions = [
  { value: "1", label: "未抽奖" }, { value: "2", label: "已抽奖" },
  { value: "3", label: "已核销 · 无需预约" }, { value: "4", label: "已预约" },
  { value: "5", label: "已核销 · 需要预约" },
];
export interface ActivityDrawRecord {
  id: string; participant?: MarketingParticipation; draw?: MarketingDraw; award?: MarketingAward;
  phase: DrawRecordPhase; note: string; reservation: boolean;
}
export function prizeBookingRecords(state: MarketingState, activityId: string, participationId: string, awardId?: string) {
  return state.bookings.filter(row => row.activityId === activityId && row.kind === "PRIZE" && row.participationId === participationId && (!awardId || row.awardId === awardId));
}
function awardPhase(state: MarketingState, award: MarketingAward, now: number): Pick<ActivityDrawRecord, "phase" | "note" | "reservation"> {
  const reservation = needsReservation(award);
  // Direct virtual issuance is not proof of external redemption.
  if (award.fulfilledAt && isAwardFulfilled(award)) return { phase: reservation ? 5 : 3, note: "", reservation };
  const bookings = prizeBookingRecords(state, award.activityId, award.participationId, award.id);
  const active = bookings.find(row => row.status === "BOOKED" && bookingStatus(row, slotFor(state, row), now) === "BOOKED");
  if (reservation && active && now < parseCreatedAt(award.claimEnd)) return { phase: 4, note: "待核销", reservation };
  const latest = bookings.at(-1);
  const note = award.prizeType === "UNKNOWN" ? "奖品类型待核对"
    : award.prizeType === "VIRTUAL" && !reservation ? isAwardFulfilled(award) ? "已发放 · 未记录外部核销" : "发放资料待核对"
    : award.fulfilledAt || latest?.status === "FULFILLED" ? "核销资料待核对"
    : now >= parseCreatedAt(award.claimEnd) ? "领奖已过期"
    : latest && bookingStatus(latest, slotFor(state, latest), now) === "INVALID" ? "预约场次待核对"
    : latest && bookingStatus(latest, slotFor(state, latest), now) === "NO_SHOW" ? "预约未到场"
    : latest?.status === "CANCELED" ? "预约已取消 · 可重新预约"
    : reservation ? "待预约" : "待核销";
  return { phase: 2, note, reservation };
}
export function activityDrawRecords(state: MarketingState, activity: MarketingActivity, now: number): ActivityDrawRecord[] {
  const participants = state.participations.filter(row => row.activityId === activity.id);
  const draws = state.draws.filter(row => row.activityId === activity.id);
  const awards = state.awards.filter(row => row.activityId === activity.id);
  const records = draws.flatMap<ActivityDrawRecord>(draw => {
    const participant = participants.find(row => row.id === draw.participationId);
    const matches = awards.filter(row => row.drawId === draw.id && row.participationId === draw.participationId);
    return matches.length ? matches.map(award => ({ id: `award:${award.id}`, participant, draw, award, ...awardPhase(state, award, now) }))
      : [{ id: `draw:${draw.id}`, participant, draw, phase: 2 as const, reservation: false, note: draw.poolItemId ? "中奖权益待核对" : "未中奖" }];
  });
  // Preserve disconnected historic awards instead of silently hiding them.
  for (const award of awards.filter(row => !draws.some(draw => draw.id === row.drawId && draw.participationId === row.participationId))) {
    const status = awardPhase(state, award, now);
    records.push({ id: `award:${award.id}`, participant: participants.find(row => row.id === award.participationId), award, ...status, note: ["抽奖来源待核对", status.note].filter(Boolean).join(" · ") });
  }
  for (const participant of participants.filter(row => !draws.some(draw => draw.participationId === row.id) && !awards.some(award => award.participationId === row.id))) {
    records.push({ id: `pending:${participant.id}`, participant, phase: 1, reservation: false, note: participant.completedAt ? "" : "待完成活动" });
  }
  return records.reverse();
}
export const activityBookingLabels = { PENDING: "待核销", REDEEMED: "已核销", CANCELED: "已取消" };
export function activityBookingPhase(booking: MarketingBooking): keyof typeof activityBookingLabels {
  return booking.status === "CANCELED" ? "CANCELED" : ["CHECKED_IN", "FULFILLED"].includes(booking.status) ? "REDEEMED" : "PENDING";
}
export type ActivityDetailPrimaryTab = "overview" | "settings" | "participants" | "awards";
export type ActivityDetailSecondaryTab = "basic" | "booking" | "lottery" | "prizes" | "users" | "bookings" | "draws" | "awards" | "redemptions";
export function activityDetailLocation(requested?: string, requestedSecondary?: string): { primary: ActivityDetailPrimaryTab; secondary: ActivityDetailSecondaryTab } {
  if (requested === "settings") return { primary: "settings", secondary: ["booking", "lottery", "prizes"].includes(requestedSecondary ?? "") ? requestedSecondary as ActivityDetailSecondaryTab : "basic" };
  if (requested === "participants") return { primary: "participants", secondary: ["bookings", "draws"].includes(requestedSecondary ?? "") ? requestedSecondary as ActivityDetailSecondaryTab : "users" };
  if (requested === "awards") return { primary: "awards", secondary: ["bookings", "redemptions"].includes(requestedSecondary ?? "") ? requestedSecondary as ActivityDetailSecondaryTab : "awards" };
  if (requested === "overview") return { primary: "overview", secondary: "basic" };
  // Stable compatibility for older bookmarks and member-record links.
  if (requested === "bookings") return { primary: "participants", secondary: "bookings" };
  if (requested === "prizes") return { primary: "settings", secondary: "prizes" };
  if (requested === "draws") return { primary: "participants", secondary: "draws" };
  if (requested === "prize-bookings") return { primary: "awards", secondary: "bookings" };
  if (requested === "redemptions") return { primary: "awards", secondary: "redemptions" };
  if (requested === "lottery") return { primary: "settings", secondary: "lottery" };
  return { primary: "overview", secondary: "basic" };
}
/** Legacy single-level route adapter retained for existing links and consumers. */
export function activityDetailTab(requested?: string): "bookings" | "prizes" | "draws" {
  return requested === "prizes" ? "prizes" : ["draws", "awards", "prize-bookings", "redemptions", "lottery"].includes(requested ?? "") ? "draws" : "bookings";
}
export function participantGender(participant?: MarketingParticipation) {
  const gender = participant?.identity?.gender;
  return gender === "MALE" ? "男" : gender === "FEMALE" ? "女" : gender === "UNDISCLOSED" ? "不愿透露" : "未记录";
}
