import type { DemoUser } from "@/types/crm";
import type { MemberOperationsState, SowindBrandCode, SowindBrandUser } from "@/types/member-operations";
import type { ActivityPrize, MarketingActivity, MarketingAward, MarketingBooking, MarketingDrawProbabilitySnapshot, MarketingParticipantIdentity, MarketingParticipation, MarketingParticipationChannel, MarketingPickupSchedule, MarketingPoolItem, MarketingSlot, MarketingState, MarketingStatus, SessionPrize } from "@/types/marketing";
import { readBrandPhone } from "@/features/member-operations/sowind-read";
import { matchPurchaseIntentMember } from "@/features/member-operations/member-model";
import { memberAccess, parseCreatedAt, shanghaiDate } from "@/features/dashboard/dashboard-model";
import { inspectMarketingCodes, validMarketingCode, type MarketingCodeImportReport } from "./marketing-code-import";
import { activityCodes, nextActivityCode } from "./marketing-activity-code";
import { availablePickupSlots, bookingScheduleId, executePickupCommand, pickupBookedCount, pickupScheduleForPrize, pickupSchedules, pickupSlotForBooking, type PickupCommand } from "./marketing-pickup";

// Existing access fixtures without view remain compatible; concrete role mappings always expose it.
export interface MarketingPermissions { brands: SowindBrandCode[]; view?: boolean; manage: boolean; redeem: boolean; preview: boolean }
export const canViewMarketing = (access: MarketingPermissions) => access.view ?? access.brands.length > 0;
export function marketingPermissions(actor: DemoUser): MarketingPermissions { const brands = memberAccess(actor).brands, hq = actor.role === "HQ_ADMIN"; return { brands, view: hq, manage: hq, redeem: hq, preview: hq }; }
export function activityCreationIssue(access: MarketingPermissions) { return !access.brands.length ? "当前账号没有可管理的品牌。" : !access.manage ? "当前账号没有活动管理权限。" : ""; }
export interface MarketingContext { actor: DemoUser; members: MemberOperationsState; now: number; random?: () => number; id?: () => string; access?: MarketingPermissions }
export type MarketingCommand =
  | PickupCommand
  | { type: "SAVE_ACTIVITY"; activity: MarketingActivity; section?: "basic" | "information" | "booking" | "lottery" }
  | { type: "STATUS"; activityId: string; status: MarketingStatus }
  | { type: "COPY_ACTIVITY"; activityId: string }
  | { type: "DELETE_ACTIVITY"; activityId: string }
  | { type: "SAVE_ACTIVITY_PRIZE"; activityId: string; prize: ActivityPrize; newPickupSchedule?: MarketingPickupSchedule }
  | { type: "DELETE_ACTIVITY_PRIZE"; activityId: string; poolItemId: string }
  | { type: "IMPORT_CODES"; activityId: string; poolItemId: string; codes: string[] }
  | { type: "DELETE_CODES"; activityId: string; poolItemId: string; codes: string[] }
  | { type: "SAVE_ACTIVITY_SLOT"; activityId: string; slot: MarketingSlot }
  | { type: "DELETE_ACTIVITY_SLOT"; activityId: string; slotId: string }
  | { type: "SAVE_SESSION_PRIZES"; activityId: string; sessionId: string; prizes: SessionPrize[]; allowQuantityEdit?: boolean }
  | { type: "COPY_SESSION_PRIZES"; activityId: string; sourceSessionId: string; targetSessionId: string }
  | { type: "ADJUST_SESSION_PRIZE_QUANTITY"; activityId: string; sessionId: string; prizeId: string; direction: "INCREASE" | "DECREASE"; count: number }
  | { type: "ADD_QUOTA"; activityId: string; poolItemId: string; count: number }
  | { type: "ADD_PRIZE_SLOT"; activityId: string; poolItemId: string; slot: MarketingSlot }
  | { type: "REGISTER"; activityId: string; userId?: string; participantId?: string; identity?: MarketingParticipantIdentity; participationChannel?: MarketingParticipationChannel; slotId?: string; walkIn?: boolean }
  | { type: "CANCEL_BOOKING"; bookingId: string }
  | { type: "RESCHEDULE"; bookingId: string; slotId: string }
  | { type: "DRAW"; activityId: string; userId?: string; participationId?: string; participantId?: string; operationId: string }
  | { type: "BOOK_PRIZE"; awardId: string; slotId: string }
  | { type: "VERIFY"; credential: string; action: "CHECKIN" | "COMPLETE" | "CLAIM"; location: string; slotId?: string };
export interface MarketingResult { state: MarketingState; ok: boolean; error?: string; resultId?: string; codeImport?: MarketingCodeImportReport }
const time = parseCreatedAt;
const positive = (value: number) => Number.isInteger(value) && value > 0;
const nonnegative = (value: number) => Number.isInteger(value) && value >= 0;
const windowValid = (start: string, end: string) => Number.isFinite(time(start)) && Number.isFinite(time(end)) && time(start) < time(end);
const inWindow = (now: number, start: string, end: string) => now >= time(start) && now < time(end);
const activeBooking = (row: MarketingBooking) => ["BOOKED", "CHECKED_IN", "FULFILLED"].includes(row.status);
export const claimLabels = { DIRECT: "现场直接领取", PICKUP: "预约后领取", EXPERIENCE: "预约后体验", REDEMPTION_CODE: "兑换码", VIRTUAL_VOUCHER: "虚拟凭证", LINK: "领取链接" };
export const prizeTypeLabels = { PHYSICAL: "实体奖品", VIRTUAL: "虚拟奖品", UNKNOWN: "待补充奖品类型" };
export const redemptionLabels = { CHECKIN: "活动签到", COMPLETE: "活动完成", PRIZE_CLAIM: "奖品领取", EXPERIENCE_CLAIM: "体验核销" };
export const participationMode = (activity: Pick<MarketingActivity, "bookingEnabled">) => activity.bookingEnabled ? "RESERVATION" as const : "DIRECT" as const;
export const prizeQuantityMode = (item: Pick<ActivityPrize, "quantityMode">) => item.quantityMode ?? "LIMITED";
export const prizeQuantityLimit = (item: Pick<ActivityPrize, "quantityMode" | "quantityLimit" | "quota">) => prizeQuantityMode(item) === "UNLIMITED" ? null : item.quantityLimit !== undefined ? item.quantityLimit : item.quota;
export const prizeDefaultProbability = (item: Pick<ActivityPrize, "defaultProbability" | "probability">) => item.defaultProbability ?? item.probability;
/** Legacy records get one uniform mode, never a per-session fallback. */
export const lotteryScope = (activity: Pick<MarketingActivity, "lotteryScope" | "bookingEnabled" | "sessionPrizes">): "ACTIVITY" | "SESSION" => activity.lotteryScope ?? (activity.bookingEnabled && activity.sessionPrizes?.length ? "SESSION" : "ACTIVITY");
export function normalizedPrizeContract(item: ActivityPrize): ActivityPrize {
  const quantityMode = prizeQuantityMode(item), quantityLimit = prizeQuantityLimit(item), defaultProbability = prizeDefaultProbability(item);
  return { ...item, quantityMode, quantityLimit, defaultProbability, quota: quantityLimit ?? 0, probability: defaultProbability };
}
export const sessionPrizeConfigurations = (activity: Pick<MarketingActivity, "sessionPrizes">, sessionId: string) => (activity.sessionPrizes ?? []).filter((row) => row.sessionId === sessionId);
export const readActivityRule = (activity: Pick<MarketingActivity, "ruleContent">) => activity.ruleContent ?? "";
export const fulfillmentMode = (item: Pick<ActivityPrize, "method" | "fulfillmentMode">) => item.fulfillmentMode ?? (["PICKUP", "EXPERIENCE"].includes(item.method) ? "RESERVATION" as const : "DIRECT" as const);
export const needsReservation = (item: Pick<ActivityPrize, "prizeType" | "method" | "fulfillmentMode">) => fulfillmentMode(item) === "RESERVATION";
export const participationChannelLabels: Record<MarketingParticipationChannel, string> = { WECHAT_MINIPROGRAM: "微信小程序", WECHAT_H5: "微信 H5", WEB_H5: "网页 H5", QR_H5: "线下二维码", STAFF: "现场登记", OTHER: "其他" };
export const participantChannel = (row: MarketingParticipation): MarketingParticipationChannel => row.participationChannel ?? "OTHER";
export function participantIdentity(row: MarketingParticipation, members?: MemberOperationsState): MarketingParticipantIdentity {
  const ref = row.identities[0];
  const user = members?.brandUsers.find((candidate) => candidate.id === (row.identity?.memberId ?? ref?.userId));
  const phone = user && members ? readBrandPhone(user, members.userProfiles) : undefined;
  return { memberId: ref?.userId ?? null, unionId: ref?.unionid ?? null, openId: ref?.openid ?? null,
    phone: phone?.number ?? null, phoneCountryCode: phone?.country ?? null, ...row.identity };
}
export function participantDisplayName(row: MarketingParticipation, members: MemberOperationsState) {
  const value = participantIdentity(row, members);
  if (value.displayName?.trim()) return value.displayName;
  if (value.memberId) {
    const profile = members.userProfiles.find((candidate) => candidate.user_id === value.memberId);
    const name = [profile?.last_name, profile?.first_name].filter(Boolean).join(" ");
    return name || value.memberId;
  }
  return `匿名参与者 #${(row.participantId ?? row.id).slice(-6)}`;
}
/** Review-only: weak phone observations never create or select a CRM identity. */
export function participantIdentityReview(row: MarketingParticipation, members: MemberOperationsState, brand: SowindBrandCode): "VERIFIED" | "UNVERIFIED" | "UNLINKED" {
  const value = participantIdentity(row, members);
  if (value.memberId) return participationIssue(row, members) || !row.identities.some((ref) => ref.userId === value.memberId && ref.brand === brand) ? "UNVERIFIED" : "VERIFIED";
  const match = matchPurchaseIntentMember(members.brandUsers, members.userProfiles, { brand, tel: value.phone ?? null, tel_country_code: value.phoneCountryCode ?? null });
  return match.code === "AMBIGUOUS" ? "UNVERIFIED" : "UNLINKED";
}
export const marketingStatusLabels = { DRAFT: "草稿", PUBLISHED: "已发布", PAUSED: "暂停", CANCELED: "已取消" };
export function hasActivityBusinessData(state: MarketingState, activityId: string) {
  return [state.participations, state.bookings, state.chances, state.draws, state.awards, state.redemptions].some((rows) => rows.some((row) => row.activityId === activityId));
}
export function canDeleteDraft(state: MarketingState, activity: MarketingActivity) {
  return activity.status === "DRAFT" && !activity.publishedAt && !hasActivityBusinessData(state, activity.id) && !activity.pool.some((item) => item.codes.some((code) => code.assignedAwardId));
}
/** Virtual fulfillment means platform-side content issuance, never external redemption. */
function hasVirtualAwardContent(award: MarketingAward) {
  return award.method === "REDEMPTION_CODE" ? Boolean(award.virtualContent?.code) : award.method === "VIRTUAL_VOUCHER" ? Boolean(award.virtualContent?.name && award.virtualContent.description) : award.method === "LINK" && Boolean(award.virtualContent?.link && validMarketingLink(award.virtualContent.link));
}
export function isAwardFulfilled(award: MarketingAward) {
  if (award.prizeType === "PHYSICAL") return Boolean(award.fulfilledAt);
  if (award.prizeType !== "VIRTUAL" || !award.issuedAt) return false;
  return hasVirtualAwardContent(award) && (!needsReservation(award) || Boolean(award.fulfilledAt));
}
export function awardFulfillmentLabel(state: MarketingState, award: MarketingAward, now: number) {
  if (award.prizeType === "VIRTUAL" && !needsReservation(award)) {
    if (!isAwardFulfilled(award)) return "发放资料待核对";
    const label = award.method === "REDEMPTION_CODE" ? "兑换码已分配" : award.method === "VIRTUAL_VOUCHER" ? "权益已生成" : "领取链接已生成";
    return `${label}${now >= time(award.claimEnd) ? "（已过有效期）" : ""}`;
  }
  if (!["PHYSICAL", "VIRTUAL"].includes(award.prizeType)) return "奖品类型待核对";
  if (award.prizeType === "VIRTUAL" && (!hasVirtualAwardContent(award) || award.fulfilledAt && !isAwardFulfilled(award))) return "发放资料待核对";
  if (award.fulfilledAt) return award.method === "EXPERIENCE" ? "体验已完成" : "已领取";
  if (now >= time(award.claimEnd)) return "已过期（已中奖数量不恢复）";
  if (needsReservation(award)) {
    const booking = state.bookings.find((row) => row.awardId === award.id && row.status === "BOOKED");
    return booking && bookingStatus(booking, slotFor(state, booking), now) === "BOOKED" ? "已预约 / 待领取" : "待预约";
  }
  return "待领取";
}
export function phase(now: number, start: string, end: string) { return !windowValid(start, end) ? "待配置" : now < time(start) ? "未开始" : now >= time(end) ? "已截止" : "有效期内"; }
export function bookingStatus(row: MarketingBooking, slot: MarketingSlot | undefined, now: number) {
  if (["BOOKED", "CHECKED_IN"].includes(row.status) && (!slot || row.kind === "ACTIVITY" && slot.disabled || slot.deleted || !windowValid(slot.startAt, slot.endAt) || !windowValid(slot.checkinStart, slot.checkinEnd))) return "INVALID";
  return row.status === "BOOKED" && slot && now >= time(slot.checkinEnd) ? "NO_SHOW" : row.status;
}
export const bookingLabels: Record<string, string> = { BOOKED: "待到场", CHECKED_IN: "已签到", CANCELED: "已取消", NO_SHOW: "已爽约", FULFILLED: "已领取", INVALID: "已失效 / 场次待核对" };
export function quota(state: MarketingState, activityId: string, item: MarketingPoolItem) {
  const awards = state.awards.filter((row) => row.activityId === activityId && row.poolItemId === item.id);
  const issued = awards.filter(isAwardFulfilled).length;
  const limit = prizeQuantityLimit(item), unlimited = limit === null;
  return { total: unlimited ? Number.POSITIVE_INFINITY : limit, occupied: awards.length, held: awards.length - issued, issued, available: unlimited ? Number.POSITIVE_INFINITY : Math.max(0, limit - awards.length), unlimited };
}
export function drawSessionId(state: MarketingState, drawId: string) {
  // Legacy draws intentionally remain session-unknown. Inferring from a current
  // booking would rewrite history after a reschedule.
  return state.draws.find((row) => row.id === drawId)?.sessionId;
}
export function sessionWonCount(state: MarketingState, activityId: string, sessionId: string, prizeId: string) {
  return state.awards.filter((award) => award.activityId === activityId && award.poolItemId === prizeId && drawSessionId(state, award.drawId) === sessionId).length;
}
export function sessionCanProduceFutureDraw(activity: MarketingActivity, sessionId: string, now = Date.now()) {
  const session = activity.slots.find((row) => row.id === sessionId);
  return Boolean(session && !session.disabled && !session.deleted && activity.status !== "CANCELED" && now < time(session.endAt) && now < time(activity.endAt));
}
export function sessionPrizeEffectiveReserved(state: MarketingState, activity: MarketingActivity, sessionId: string, item: ActivityPrize, now = Date.now()) {
  if (lotteryScope(activity) !== "SESSION") return 0;
  const config = sessionPrizeConfigurations(activity, sessionId).find((row) => row.prizeId === item.id);
  if (!config?.enabled || prizeQuantityMode(item) === "UNLIMITED" || !sessionCanProduceFutureDraw(activity, sessionId, now)) return 0;
  return Math.max(0, (config.allocatedQuantity ?? 0) - sessionWonCount(state, activity.id, sessionId, item.id));
}
export function activityPrizeAllocation(state: MarketingState, activity: MarketingActivity, item: ActivityPrize, now = Date.now()) {
  const quantityLimit = prizeQuantityLimit(item);
  const allocated = (activity.sessionPrizes ?? []).filter((row) => row.prizeId === item.id).reduce((sum, row) => sum + (row.allocatedQuantity ?? 0), 0);
  const won = state.awards.filter((row) => row.activityId === activity.id && row.poolItemId === item.id).length;
  const reserved = [...new Set((activity.sessionPrizes ?? []).filter((row) => row.prizeId === item.id).map((row) => row.sessionId))]
    .reduce((sum, sessionId) => sum + sessionPrizeEffectiveReserved(state, activity, sessionId, item, now), 0);
  const remaining = quantityLimit === null ? null : Math.max(0, quantityLimit - won);
  return {
    quantityMode: prizeQuantityMode(item), quantityLimit, allocated, won, reserved,
    unallocated: remaining === null ? null : Math.max(0, remaining - reserved),
    remaining,
  };
}
export function sessionPrizeAllocation(state: MarketingState, activity: MarketingActivity, sessionId: string, item: ActivityPrize, now = Date.now()) {
  const config = sessionPrizeConfigurations(activity, sessionId).find((row) => row.prizeId === item.id);
  const won = sessionWonCount(state, activity.id, sessionId, item.id);
  const allocated = prizeQuantityMode(item) === "UNLIMITED" ? undefined : config?.allocatedQuantity ?? 0;
  const remaining = allocated === undefined ? null : Math.max(0, allocated - won);
  const released = remaining !== null && !sessionCanProduceFutureDraw(activity, sessionId, now) ? remaining : 0;
  return { config, won, allocated, remaining, effectiveReserved: sessionPrizeEffectiveReserved(state, activity, sessionId, item, now), released };
}
export function codeInventory(item: ActivityPrize) {
  const assigned = item.codes.filter((row) => row.assignedAwardId).length;
  return { imported: item.codes.length, assigned, remaining: item.codes.filter((row) => !row.assignedAwardId && validMarketingCode(row.code)).length };
}
export function effectiveFulfillmentSlots(item: ActivityPrize, now: number) {
  return item.slots.filter((slot) => !slot.disabled && !slot.deleted && !slotErrors(slot, item.claimStart, item.claimEnd, true).length && now < time(slot.bookingClosesAt) && now < time(slot.endAt));
}
export const effectiveFulfillmentCapacity = (item: ActivityPrize, now: number) => effectiveFulfillmentSlots(item, now).reduce((sum, slot) => sum + slot.capacity, 0);
/** Hold fulfillment capacity for winners who have not yet selected a slot.
 * A canceled booking releases a seat, not the winner's outstanding promise. */
export function fulfillmentCapacity(state: MarketingState, activityId: string, item: ActivityPrize, now: number) {
  const activity = state.activities.find(row => row.id === activityId);
  const schedule = activity && pickupScheduleForPrize(activity, item);
  const slots = activity ? availablePickupSlots(activity, item, now) : [];
  const remainingSlots = slots.reduce((sum, slot) => sum + Math.max(0, slot.capacity - slotOccupancy(state, activityId, "PRIZE", slot.id, item.id)), 0);
  const outstanding = state.awards.filter((row) => row.activityId === activityId && needsReservation(row) && activity?.pool.some(prize => prize.id === row.poolItemId && pickupScheduleForPrize(activity, prize)?.id === schedule?.id) && !row.fulfilledAt && now < time(row.claimEnd));
  const unreservedPromises = outstanding.filter((award) => !state.bookings.some((booking) => {
    return booking.awardId === award.id && booking.status !== "CANCELED";
  })).length;
  return { remainingSlots, unreservedPromises, availableForNewWins: Math.max(0, remainingSlots - unreservedPromises), shortfall: Math.max(0, unreservedPromises - remainingSlots) };
}
export function winnable(state: MarketingState, activityId: string, item: ActivityPrize, now: number) {
  const activity = state.activities.find(row => row.id === activityId);
  if (!activity || prizeErrors(item, activity, true).length) return 0;
  if (item.prizeType === "UNKNOWN" || !windowValid(item.claimStart, item.claimEnd) || now >= time(item.claimEnd) || item.prizeType === "PHYSICAL" && !["DIRECT", "PICKUP", "EXPERIENCE"].includes(item.method) || item.prizeType === "VIRTUAL" && !["REDEMPTION_CODE", "VIRTUAL_VOUCHER", "LINK"].includes(item.method)) return 0;
  if (item.method === "VIRTUAL_VOUCHER" && (!item.voucherName.trim() || !item.voucherDescription.trim()) || item.method === "LINK" && !validMarketingLink(item.link)) return 0;
  const available = quota(state, activityId, item).available;
  const contentStock = item.prizeType === "VIRTUAL" && item.method === "REDEMPTION_CODE" ? Math.min(available, codeInventory(item).remaining) : available;
  return needsReservation(item) ? Math.min(contentStock, fulfillmentCapacity(state, activityId, item, now).availableForNewWins) : contentStock;
}
function slotErrors(slot: MarketingSlot, start: string, end: string, fulfillment = false) {
  const errors: string[] = [];
  if (typeof slot.label !== "string" || !slot.label.trim() || typeof slot.location !== "string" || !slot.location.trim() || !(fulfillment ? nonnegative(slot.capacity) : positive(slot.capacity))) errors.push(fulfillment ? "领奖时段须有名称、地点和合法非负整数容量" : "场次须有名称、地点和正整数容量");
  if (!windowValid(start, end) || !windowValid(slot.startAt, slot.endAt) || time(slot.startAt) < time(start) || time(slot.endAt) > time(end)) errors.push("场次须落在对应活动 / 奖品有效期内");
  if (!Number.isFinite(time(slot.bookingClosesAt)) || time(slot.bookingClosesAt) > time(slot.startAt)) errors.push("预约截止不得晚于场次开始");
  if (!windowValid(slot.checkinStart, slot.checkinEnd) || time(slot.checkinStart) > time(slot.startAt) || time(slot.checkinEnd) < time(slot.endAt)) errors.push("签到窗口须覆盖场次，宽限通过窗口明确配置");
  return errors;
}
export function validMarketingLink(link: string) {
  try { const url = new URL(link); return /^https?:\/\//i.test(link) && ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password && !/\s/.test(link); } catch { return false; }
}
function partialWindowError(label: string, start: string, end: string) {
  return start && !Number.isFinite(time(start)) || end && !Number.isFinite(time(end)) || start && end && !windowValid(start, end) ? [`${label}时间非法或结束时间早于开始`] : [];
}
export function prizeErrors(item: ActivityPrize, activity: MarketingActivity, complete = true): string[] {
  const errors: string[] = [];
  const quantityMode = prizeQuantityMode(item), quantityLimit = prizeQuantityLimit(item), defaultProbability = prizeDefaultProbability(item);
  if (item.fulfillmentMode !== undefined && !["DIRECT", "RESERVATION"].includes(item.fulfillmentMode)) errors.push("选择有效奖品领取方式");
  if (!["LIMITED", "UNLIMITED"].includes(quantityMode) || quantityMode === "LIMITED" && (quantityLimit === null || !nonnegative(quantityLimit)) || item.activityId !== activity.id || !item.id || !positive(item.perPersonLimit) || !Number.isFinite(defaultProbability) || defaultProbability < 0 || defaultProbability > 100) errors.push("奖品归属须正确，限量奖品须填写非负整数可发放数量，个人上限须为正整数，概率须为0–100的数字");
  if (new Set(item.codes.map((row) => row.code)).size !== item.codes.length || item.codes.some((row) => !row.code.trim() || row.code !== row.code.trim())) errors.push("兑换码不能为空或重复");
  errors.push(...partialWindowError("奖品有效期", item.claimStart, item.claimEnd));
  if (needsReservation(item) && quantityMode !== "LIMITED") errors.push("预约领取奖品必须设置有限的可发放数量");
  if (needsReservation(item) && !pickupScheduleForPrize(activity, item)) errors.push("预约领取奖品必须选择当前活动的兑奖预约设置");
  item.slots.forEach((slot) => {
    if (!nonnegative(slot.capacity)) errors.push("领奖时段容量须为合法非负整数");
    errors.push(...partialWindowError("领奖时段", slot.startAt, slot.endAt), ...partialWindowError("领奖签到窗口", slot.checkinStart, slot.checkinEnd));
  });
  if (!complete) return errors;
  if (!item.name.trim() || !item.label.trim() || !item.description.trim() || !item.instructions.trim()) errors.push("填写奖品名称、奖项、说明及使用说明");
  if (!windowValid(item.claimStart, item.claimEnd) || time(item.claimEnd) < time(activity.lotteryEnd)) errors.push("奖品有效期无效或领取截止早于抽奖截止");
  if (item.prizeType === "PHYSICAL") {
    if (!["DIRECT", "PICKUP", "EXPERIENCE"].includes(item.method) || !item.location.trim()) errors.push("实体奖品须配置实体领取方式和地点");
  } else if (item.prizeType === "VIRTUAL") {
    if (!["REDEMPTION_CODE", "VIRTUAL_VOUCHER", "LINK"].includes(item.method)) errors.push("虚拟奖品须配置虚拟发放方式");
    if (item.method === "REDEMPTION_CODE" && quantityMode === "LIMITED" && item.codes.filter((row) => validMarketingCode(row.code)).length < (quantityLimit ?? 0)) errors.push("兑换码不足：已导入数量不得少于可发放数量");
    if (item.method === "VIRTUAL_VOUCHER" && (!item.voucherName.trim() || !item.voucherDescription.trim())) errors.push("填写虚拟凭证名称和说明");
    if (item.method === "LINK" && !validMarketingLink(item.link)) errors.push("领取链接须使用有效的 HTTP / HTTPS 地址");
  } else errors.push("待补充奖品类型，不能发布");
  if (needsReservation(item)) {
    if (!pickupScheduleForPrize(activity, item)?.slots.some(slot => !slot.deleted)) errors.push("预约型奖品的兑奖预约设置尚无兑奖时段");
  }
  if (new Set(item.slots.map((slot) => slot.id)).size !== item.slots.length) errors.push("领奖场次标识不能重复");
  return errors;
}
function sessionPrizeErrors(state: MarketingState, activity: MarketingActivity, sessionId: string, rows: SessionPrize[], now = Date.now()) {
  const errors: string[] = [];
  if (!activity.slots.some((slot) => slot.id === sessionId && !slot.deleted)) errors.push("活动场次不存在或已删除");
  if (new Set(rows.map((row) => row.prizeId)).size !== rows.length) errors.push("同一场次的奖品配置不能重复");
  const totalProbability = rows.filter((row) => row.enabled).reduce((sum, row) => sum + row.probability, 0);
  if (rows.some((row) => row.sessionId !== sessionId || typeof row.enabled !== "boolean" || !activity.pool.some((item) => item.id === row.prizeId) || !Number.isFinite(row.probability) || row.probability < 0 || row.probability > 100)) errors.push("场次奖品归属或中奖概率无效");
  if (totalProbability > 100) errors.push(`当前中奖概率合计为${totalProbability}%，请调整至100%以内。`);
  for (const row of rows) {
    const item = activity.pool.find((prize) => prize.id === row.prizeId);
    if (!item) continue;
    const won = sessionWonCount(state, activity.id, sessionId, item.id);
    if (!row.enabled && row.probability !== 0) errors.push(`${item.name}未参与本场时中奖概率须为0%`);
    if (prizeQuantityMode(item) === "UNLIMITED") {
      if (row.allocatedQuantity !== undefined) errors.push(`${item.name}为不限量奖品，本场不填写分配数量`);
      continue;
    }
    if (row.allocatedQuantity === undefined) errors.push(`${item.name}须填写本场可发放数量`);
    const allocated = row.allocatedQuantity ?? 0;
    if (!nonnegative(allocated)) errors.push(`${item.name}本场分配须为非负整数`);
    if (allocated < won) errors.push(`当前场次已有${won}份中奖记录，本场可发放数量不能低于${won}份。`);
    if (!row.enabled && allocated !== won) errors.push(`${item.name}停止参与本场后，本场可发放数量须保留为已中奖的${won}份。`);
  }
  for (const item of activity.pool) {
    const won = sessionWonCount(state, activity.id, sessionId, item.id);
    if (won > 0 && !rows.some((row) => row.prizeId === item.id)) errors.push(`${item.name}已有${won}份中奖记录，不能移除其场次配置`);
  }
  for (const item of activity.pool.filter((prize) => prizeQuantityMode(prize) === "LIMITED")) {
    const otherReserved = [...new Set((activity.sessionPrizes ?? []).filter((row) => row.sessionId !== sessionId && row.prizeId === item.id).map((row) => row.sessionId))]
      .reduce((sum, otherSessionId) => sum + sessionPrizeEffectiveReserved(state, activity, otherSessionId, item, now), 0);
    const currentWon = sessionWonCount(state, activity.id, sessionId, item.id);
    const currentReserved = sessionCanProduceFutureDraw(activity, sessionId, now)
      ? rows.filter((row) => row.prizeId === item.id && row.enabled).reduce((sum, row) => sum + Math.max(0, (row.allocatedQuantity ?? 0) - currentWon), 0)
      : 0;
    const totalWon = state.awards.filter((award) => award.activityId === activity.id && award.poolItemId === item.id).length;
    const limit = prizeQuantityLimit(item) ?? 0;
    if (totalWon + otherReserved + currentReserved > limit) errors.push(`当前可分配数量不足，请调整本场数量。`);
  }
  return [...new Set(errors)];
}
export function sessionPrizeReadiness(state: MarketingState, activity: MarketingActivity, now = Date.now()) {
  if (lotteryScope(activity) !== "SESSION" || !activity.lotteryEnabled) return [];
  return activity.slots.filter((slot) => !slot.disabled && !slot.deleted && sessionCanProduceFutureDraw(activity, slot.id, now)).flatMap((slot) => {
    const rows = sessionPrizeConfigurations(activity, slot.id);
    if (!rows.length) {
      return [{ sessionId: slot.id, label: slot.label, errors: ["请配置本场奖品、概率和数量"] }];
    }
    const errors = sessionPrizeErrors(state, activity, slot.id, rows, now);
    const hasWinnablePrize = rows.some((row) => {
      if (!row.enabled || row.probability <= 0) return false;
      const item = activity.pool.find((prize) => prize.id === row.prizeId);
      if (!item || winnable(state, activity.id, item, now) < 1) return false;
      return prizeQuantityMode(item) === "UNLIMITED" || (row.allocatedQuantity ?? 0) > sessionWonCount(state, activity.id, slot.id, item.id);
    });
    if (!hasWinnablePrize) errors.push("至少启用一个有中奖概率且可发放的奖品");
    return errors.length ? [{ sessionId: slot.id, label: slot.label, errors: [...new Set(errors)] }] : [];
  });
}
export interface MarketingPublishCheck { key: string; label: string; step: number; errors: string[] }
export function publishChecks(activity: MarketingActivity, state: MarketingState, brands: SowindBrandCode[], now = Date.now()): MarketingPublishCheck[] {
  const checks: MarketingPublishCheck[] = [
    { key: "basic", label: "基本信息", step: 0, errors: [] }, { key: "booking", label: "参与设置", step: 1, errors: [] },
    { key: "lottery", label: "抽奖概率与次数", step: 2, errors: [] }, { key: "inventory", label: "实体奖品可发放数量与有效期", step: 3, errors: [] },
    { key: "fulfillment", label: "预约型奖品领奖容量", step: 3, errors: [] }, { key: "virtual", label: "虚拟奖品发放内容", step: 3, errors: [] },
    { key: "codes", label: "兑换码数量", step: 3, errors: [] },
  ];
  const errors = checks[0].errors;
  if (!activity.name.trim() || !brands.includes(activity.brand)) errors.push("填写活动名称及有效授权品牌");
  if (!windowValid(activity.startAt, activity.endAt)) errors.push("活动起止时间无效");
  if (activity.mode === "OFFLINE" && !activity.location.trim()) errors.push("线下活动须填写地点");
  if (activity.completion === "CHECKIN" && activity.mode !== "OFFLINE") errors.push("到场即完成仅适用于线下活动");
  if (activity.bookingEnabled) {
    if (!windowValid(activity.bookingStart, activity.bookingEnd) || time(activity.bookingEnd) > time(activity.endAt)) checks[1].errors.push("预约开放期无效或超过活动结束");
    if (!activity.slots.some((slot) => !slot.disabled && !slot.deleted)) checks[1].errors.push("开启预约须配置活动场次");
    activity.slots.filter((slot) => !slot.disabled && !slot.deleted).forEach((slot) => checks[1].errors.push(...slotErrors(slot, activity.startAt, activity.endAt)));
  }
  if (activity.lotteryEnabled) {
    const errors = checks[2].errors;
    if (!windowValid(activity.lotteryStart, activity.lotteryEnd) || time(activity.lotteryEnd) < time(activity.endAt)) errors.push("抽奖截止不得早于活动结束");
    if (!positive(activity.grantCount) || !positive(activity.drawLimit) || !positive(activity.winLimit) || activity.grantCount > activity.drawLimit || (activity.dailyLimit !== null && !positive(activity.dailyLimit))) errors.push("次数 / 中奖上限须为正整数，发放次数不得超过累计上限");
    if (!activity.pool.length) errors.push("开启抽奖须配置奖品");
    const probabilities = activity.pool.map(prizeDefaultProbability);
    if (lotteryScope(activity) === "ACTIVITY" && (probabilities.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) || probabilities.reduce((sum, value) => sum + value, 0) > 100)) errors.push("奖品中奖概率合计不能超过100%，未中奖概率由系统自动计算");
    if (lotteryScope(activity) === "SESSION") {
      if (!activity.bookingEnabled) errors.push("按场次抽奖须使用预约参与");
      const sessionIssues = sessionPrizeReadiness(state, activity, now);
      if (sessionIssues.length) errors.push(`还有${sessionIssues.length}个活动场次尚未完成奖品配置：${sessionIssues.map((issue) => issue.label).join("、")}`);
    } else if (!activity.pool.some((item) => prizeDefaultProbability(item) > 0 && winnable(state, activity.id, item, now) > 0)) errors.push("发布时须有可中奖概率和可发放奖品");
    activity.pool.forEach((item) => {
      const completeErrors = prizeErrors(item, activity), target = item.prizeType === "VIRTUAL" ? checks[5] : checks[3];
      completeErrors.forEach((error) => (error.includes("领奖时段") || error.includes("预约型奖品") ? checks[4] : error.includes("兑换码不足") ? checks[6] : target).errors.push(error));
      if (needsReservation(item) && !completeErrors.some((error) => error.includes("时段") || error.includes("场次") || error.includes("有效期"))) {
        const capacity = fulfillmentCapacity(state, activity.id, item, now).remainingSlots;
        if (capacity < 1) checks[4].errors.push(`${item.name}：兑奖预约设置没有可预约名额，请配置有效时段及容量。`);
      }
      if (lotteryScope(activity) === "ACTIVITY" && prizeDefaultProbability(item) > 0 && winnable(state, activity.id, item, now) < 1 && !completeErrors.length) target.errors.push(`${item.name}：中奖概率大于0，发布时必须至少有1个真实可发放单位（数量、有效期、领奖预约名额或兑换码不足）。`);
    });
  }
  if (new Set(activity.slots.map((slot) => slot.id)).size !== activity.slots.length || new Set(activity.pool.map((item) => item.id)).size !== activity.pool.length) errors.push("场次 / 活动奖品标识不能重复");
  const codes = activity.pool.flatMap((item) => item.codes.map((row) => row.code));
  if (new Set(codes).size !== codes.length) errors.push("同一兑换码不能出现在多个奖品中");
  return checks.map((check) => ({ ...check, errors: [...new Set(check.errors)] }));
}
export function validateActivity(activity: MarketingActivity, state: MarketingState, brands: SowindBrandCode[], now = Date.now()): string[] { return [...new Set(publishChecks(activity, state, brands, now).flatMap((check) => check.errors))]; }
export function draftActivityErrors(activity: MarketingActivity) {
  const errors = activity.pool.flatMap((item) => prizeErrors(item, activity, false));
  if (activity.lotteryScope !== undefined && !["ACTIVITY", "SESSION"].includes(activity.lotteryScope)) errors.push("请选择按活动抽奖或按场次抽奖");
  if (activity.lotteryEnabled && lotteryScope(activity) === "SESSION" && !activity.bookingEnabled) errors.push("按场次抽奖须使用预约参与，以确定参与者所属场次");
  if (activity.ruleContent !== undefined && typeof activity.ruleContent !== "string") errors.push("活动规则须为文本");
  if (activity.ruleContentFormat !== undefined && activity.ruleContentFormat !== "html") errors.push("活动规则格式无效");
  for (const [label, start, end] of [["活动", activity.startAt, activity.endAt], ["预约", activity.bookingStart, activity.bookingEnd], ["抽奖", activity.lotteryStart, activity.lotteryEnd]]) errors.push(...partialWindowError(label, start, end));
  if (!Number.isFinite(activity.noWinProbability) || activity.noWinProbability < 0 || activity.noWinProbability > 100) errors.push("未中奖概率须为0–100的数字");
  if ([activity.grantCount, activity.drawLimit, activity.winLimit].some((count) => !nonnegative(count)) || activity.dailyLimit !== null && !positive(activity.dailyLimit)) errors.push("次数须为合法非负整数，每日上限须为正整数");
  activity.slots.forEach((slot) => {
    if (!nonnegative(slot.capacity)) errors.push("场次容量须为合法非负整数");
    errors.push(...partialWindowError("活动场次", slot.startAt, slot.endAt), ...partialWindowError("签到窗口", slot.checkinStart, slot.checkinEnd));
  });
  const defaultProbabilityTotal = activity.pool.reduce((sum, item) => sum + prizeDefaultProbability(item), 0);
  if (lotteryScope(activity) === "ACTIVITY" && defaultProbabilityTotal > 100) errors.push(`奖品中奖概率合计为${defaultProbabilityTotal}%，请调整至100%以内`);
  return [...new Set(errors)];
}
function assignedCodesPreserved(before: ActivityPrize[], after: ActivityPrize[]) {
  return before.every((item) => item.codes.filter((code) => code.assignedAwardId).every((code) => after.find((row) => row.id === item.id)?.codes.some((row) => JSON.stringify(row) === JSON.stringify(code))));
}
interface ParticipationIdentity { error?: string; user?: SowindBrandUser; subjectKey?: string; participation?: MarketingParticipation }
export function identityFor(members: MemberOperationsState, userId: string, activity: MarketingActivity): ParticipationIdentity {
  const user = members.brandUsers.find((row) => row.id === userId);
  if (!user || user.brand !== activity.brand || user.is_deleted !== 0) return { error: "会员身份缺失、品牌不符或未确认有效，先核对品牌档案" };
  const customer = user.customer_id !== null && members.customers.some((row) => row.id === user.customer_id);
  return { user, subjectKey: customer ? `customer:${user.customer_id}` : `user:${user.id}` };
}
export function participationFor(state: MarketingState, activity: MarketingActivity, members: MemberOperationsState, userId: string): ParticipationIdentity {
  const identity = identityFor(members, userId, activity);
  if (identity.error || !identity.user) return { error: identity.error };
  // Also follow current, reliable customer links of previously snapshotted identities.
  // The original subject stays frozen; a reassigned user's other alias must not mint fresh chances.
  const currentCustomerMatch = (row: MarketingParticipation) => identity.subjectKey?.startsWith("customer:") && row.identities.some((ref) => {
    const user = members.brandUsers.find((candidate) => candidate.id === ref.userId && candidate.brand === ref.brand && candidate.brand === activity.brand && candidate.openid === ref.openid && candidate.unionid === ref.unionid && candidate.is_deleted === 0);
    return user?.customer_id !== null && user?.customer_id !== undefined && `customer:${user.customer_id}` === identity.subjectKey && members.customers.some((customer) => customer.id === user.customer_id);
  });
  const matches = state.participations.filter((row) => row.activityId === activity.id && (row.subjectKey === identity.subjectKey || row.identities.some((ref) => ref.userId === userId) || currentCustomerMatch(row)));
  if (matches.length > 1) return { error: "存在相互冲突的参与身份，暂停抽奖并待核对，不自动合并" };
  const participation = matches[0];
  const ref = participation?.identities.find((row) => row.userId === userId);
  if (ref && (ref.brand !== identity.user.brand || ref.openid !== identity.user.openid || ref.unionid !== identity.user.unionid)) return { error: "已有参与身份引用发生变化，待核对；不重新发放额度" };
  return { ...identity, participation };
}
export function participationIssue(row: MarketingParticipation, members: MemberOperationsState) {
  return row.identities.some((ref) => !members.brandUsers.some((user) => user.id === ref.userId && user.brand === ref.brand && user.openid === ref.openid && user.unionid === ref.unionid && user.is_deleted === 0)) ? "参与身份引用待核对" : "";
}

const identityKeys = ["memberId", "unionId", "openId", "wechatAppId", "phone", "phoneCountryCode", "externalUserId", "anonymousId", "sessionId", "displayName", "gender"] as const;
export function participantIdentityIssue(identity: MarketingParticipantIdentity | undefined, channel?: MarketingParticipationChannel) {
  if (channel !== undefined && !Object.prototype.hasOwnProperty.call(participationChannelLabels, channel)) return "参与渠道无效";
  if (identity === undefined) return "";
  if (!identity || typeof identity !== "object" || Array.isArray(identity) || identityKeys.some((key) => identity[key] !== undefined && identity[key] !== null && typeof identity[key] !== "string")) return "参与身份字段须为空值或文本";
  if (identity.gender !== undefined && identity.gender !== null && !["MALE", "FEMALE", "UNDISCLOSED"].includes(identity.gender)) return "参与性别选项无效";
  if (identity.openId?.trim() && !identity.wechatAppId?.trim()) return "OpenID 需同时保存所属微信应用";
  return "";
}
/** External identity is only an observation. Reuse requires an internal key or
 * the existing explicitly selected CRM-member/customer boundary. */
function requestedParticipation(state: MarketingState, activity: MarketingActivity, members: MemberOperationsState, request: Extract<MarketingCommand, { type: "REGISTER" | "DRAW" }>): ParticipationIdentity {
  const internalId = request.type === "DRAW" ? request.participationId : undefined;
  if (internalId !== undefined && (typeof internalId !== "string" || !internalId)) return { error: "参与记录标识无效" };
  if (request.participantId !== undefined && (typeof request.participantId !== "string" || !request.participantId.trim())) return { error: "参与用户标识无效" };
  const internalRows = state.participations.filter((row) => row.activityId === activity.id && (internalId ? row.id === internalId : request.participantId ? (row.participantId ?? row.id) === request.participantId : false));
  if (internalRows.length > 1) return { error: "内部参与身份存在冲突，不自动合并" };
  const internal = internalRows[0];
  if (internalId && !internal) return { error: "参与记录不存在或不属于当前活动" };
  const newIdentity = request.type === "REGISTER" ? request.identity : undefined;
  if (request.userId && newIdentity?.memberId && request.userId !== newIdentity.memberId) return { error: "会员身份引用冲突，待核验" };
  const memberId = request.userId || newIdentity?.memberId || internal?.identity?.memberId || internal?.identities[0]?.userId;
  if (memberId) {
    const member = participationFor(state, activity, members, memberId);
    if (member.error) return member;
    if (internal && member.participation && internal.id !== member.participation.id) return { error: "会员已有其他参与记录，身份待核验；不自动合并" };
    if (internal && !member.participation && (request.type === "DRAW" || internal.identities.length > 0 || internal.identity?.memberId)) return { error: "已有参与身份不能改绑其他会员，身份待核验；请明确核对关联" };
    return { ...member, participation: internal ?? member.participation, subjectKey: internal?.subjectKey ?? member.subjectKey };
  }
  if (request.type === "DRAW" && !internal) return { error: "请选择已存在的参与记录" };
  return { participation: internal, subjectKey: internal?.subjectKey };
}
export function chances(state: MarketingState, row: MarketingParticipation) {
  const earned = state.chances.filter((item) => item.participationId === row.id).reduce((sum, item) => sum + item.count, 0);
  const used = state.draws.filter((item) => item.participationId === row.id).length;
  return { earned, used, remaining: Math.max(0, earned - used) };
}
function activeActivityBookings(state: MarketingState, participationId: string) {
  return state.bookings.filter((row) => row.participationId === participationId && row.kind === "ACTIVITY" && activeBooking(row));
}
function drawRules(state: MarketingState, activity: MarketingActivity, row: MarketingParticipation, now: number) {
  const wins = state.awards.filter((award) => award.participationId === row.id);
  let sessionId: string | undefined;
  let configured: Array<{ item: ActivityPrize; probability: number; sessionRemaining?: number }>;
  if (activity.bookingEnabled) {
    const bookings = activeActivityBookings(state, row.id);
    if (bookings.length > 1) return { error: "参与者存在多个有效活动预约，请先核对场次" };
    const booking = bookings[0], slot = booking && activity.slots.find((candidate) => candidate.id === booking.slotId);
    if (!booking || !slot || slot.disabled || slot.deleted) return { error: "预约参与者缺少当前有效场次，不能抽奖" };
    if (!inWindow(now, slot.startAt, slot.endAt)) return { error: now >= time(slot.endAt) ? "当前活动场次已结束，不能产生新的抽奖记录" : "当前活动场次尚未开始，不能抽奖" };
    sessionId = slot.id;
    const rows = lotteryScope(activity) === "SESSION" ? sessionPrizeConfigurations(activity, sessionId) : [];
    if (lotteryScope(activity) === "SESSION" && !rows.length) return { error: "当前场次尚未配置奖池，不能抽奖" };
    const errors = lotteryScope(activity) === "SESSION" ? sessionPrizeErrors(state, activity, sessionId, rows, now) : [];
    if (errors.length) return { error: errors.join("；") };
    configured = lotteryScope(activity) === "ACTIVITY" ? activity.pool.map(item => ({ item, probability: prizeDefaultProbability(item), sessionRemaining: activityPrizeAllocation(state, activity, item, now).remaining ?? undefined })) : rows.filter((config) => config.enabled).flatMap((config) => {
      const item = activity.pool.find((candidate) => candidate.id === config.prizeId);
      if (!item) return [];
      const allocation = sessionPrizeAllocation(state, activity, sessionId!, item, now);
      return [{ item, probability: config.probability, sessionRemaining: allocation.remaining ?? undefined }];
    });
  } else {
    if (lotteryScope(activity) === "SESSION") return { error: "按场次抽奖必须关联有效活动场次" };
    configured = activity.pool.map((item) => ({ item, probability: prizeDefaultProbability(item) }));
  }
  const configuredTotal = configured.reduce((sum, rule) => sum + rule.probability, 0);
  if (configured.some(rule => !Number.isFinite(rule.probability) || rule.probability < 0 || rule.probability > 100)) return { error: "中奖概率须为0至100的有效数字" };
  if (configuredTotal > 100) return { error: `当前中奖概率合计为${configuredTotal}%，请调整至100%以内。` };
  const rules = configured.map((rule) => {
    const remaining = rule.sessionRemaining;
    const available = winnable(state, activity.id, rule.item, now) > 0 && (remaining === undefined || remaining > 0);
    const belowPersonalLimit = wins.filter((award) => award.poolItemId === rule.item.id).length < rule.item.perPersonLimit;
    return { ...rule, effectiveProbability: available && belowPersonalLimit ? rule.probability : 0 };
  });
  const snapshot: MarketingDrawProbabilitySnapshot[] = rules.map((rule) => ({
    prizeId: rule.item.id, prizeName: rule.item.name, configuredProbability: rule.probability, effectiveProbability: rule.effectiveProbability,
    quantityMode: prizeQuantityMode(rule.item), sessionRemaining: rule.sessionRemaining,
  }));
  return { sessionId, rules, snapshot, version: sessionId ? activity.sessionPrizeConfigVersion ?? 1 : activity.ruleVersion };
}
export function drawBlock(state: MarketingState, activity: MarketingActivity, row: MarketingParticipation | undefined, ctx: MarketingContext) {
  if (activity.status !== "PUBLISHED") return "活动未发布、暂停或取消，不能新抽奖";
  if (!activity.lotteryEnabled) return "本活动未开启抽奖";
  if (!row?.completedAt) return "尚未完成参与，不发放抽奖机会";
  if (participationIssue(row, ctx.members)) return "参与身份引用待核对";
  if (!inWindow(ctx.now, activity.lotteryStart, activity.lotteryEnd)) return "未到抽奖时间或抽奖已截止";
  const configuration = row ? drawRules(state, activity, row, ctx.now) : undefined;
  if (!configuration || "error" in configuration) return configuration?.error ?? "缺少有效抽奖配置";
  const balance = chances(state, row), attempts = state.draws.filter((item) => item.participationId === row.id), wins = state.awards.filter((item) => item.participationId === row.id);
  if (!balance.remaining) return "剩余机会为0";
  if (attempts.length >= activity.drawLimit) return "已达到活动累计抽奖上限";
  if (activity.dailyLimit !== null && attempts.filter((item) => shanghaiDate(time(item.occurredAt)) === shanghaiDate(ctx.now)).length >= activity.dailyLimit) return "已达到今日抽奖上限";
  if (wins.length >= activity.winLimit) return "已达到累计中奖上限；剩余次数保留但不可再用";
  if (!configuration.rules.some((rule) => rule.effectiveProbability > 0)) return "无有效可中奖数量 / 领奖预约名额 / 兑换码 / 概率，不扣次数";
  return "";
}
export function resolveCredential(state: MarketingState, credential: string, ctx: MarketingContext) {
  const access = ctx.access ?? marketingPermissions(ctx.actor);
  if (!access.redeem && !canViewMarketing(access)) return { error: "无效凭证或无权访问" };
  const participation = state.participations.find((row) => row.credential === credential);
  const award = state.awards.find((row) => row.credential === credential);
  const activity = state.activities.find((row) => row.id === (participation?.activityId ?? award?.activityId));
  if (!activity || !(ctx.access ?? marketingPermissions(ctx.actor)).brands.includes(activity.brand)) return { error: "无效凭证或无权访问" };
  const participant = participation ?? state.participations.find((row) => row.id === award?.participationId);
  if (!participant || participationIssue(participant, ctx.members)) return { error: "参与身份引用待核对，不能自动绑定其他会员" };
  return { activity, participation: participant, award, kind: award ? "PRIZE" : "ACTIVITY" };
}
export function slotFor(state: MarketingState, booking: MarketingBooking) {
  const activity = state.activities.find((row) => row.id === booking.activityId);
  return booking.kind === "ACTIVITY" ? activity?.slots.find((slot) => slot.id === booking.slotId) : activity && pickupSlotForBooking(activity, booking);
}
export function slotOccupancy(state: MarketingState, activityId: string, kind: "ACTIVITY" | "PRIZE", slotId: string, poolItemId?: string) {
  const activity = state.activities.find(row => row.id === activityId), prize = activity?.pool.find(row => row.id === poolItemId);
  const schedule = activity && prize && pickupScheduleForPrize(activity, prize);
  if (kind === "PRIZE") return activity && schedule ? pickupBookedCount(state, activity, schedule.id, slotId) : 0;
  return state.bookings.filter(row => row.activityId === activityId && row.kind === kind && row.slotId === slotId && activeBooking(row)).length;
}
export function activityMetrics(state: MarketingState, activity: MarketingActivity, now: number) {
  const participants = state.participations.filter((row) => row.activityId === activity.id), draws = state.draws.filter((row) => row.activityId === activity.id), awards = state.awards.filter((row) => row.activityId === activity.id);
  const metrics = [
    { label: "当前有效预约人数", kind: "参与主体", rows: participants.filter((row) => state.bookings.some((booking) => booking.participationId === row.id && booking.kind === "ACTIVITY" && ["BOOKED", "CHECKED_IN"].includes(bookingStatus(booking, slotFor(state, booking), now)))) },
    { label: "到场人数", kind: "参与主体", rows: participants.filter((row) => row.checkedInAt) }, { label: "完成人数", kind: "参与主体", rows: participants.filter((row) => row.completedAt) },
    { label: "抽奖人数", kind: "参与主体", rows: participants.filter((row) => draws.some((draw) => draw.participationId === row.id)) }, { label: "抽奖次数", kind: "抽奖结果（含未中奖）", rows: draws },
    { label: "中奖人数", kind: "参与主体", rows: participants.filter((row) => awards.some((award) => award.participationId === row.id)) }, { label: "中奖份数", kind: "获奖权益", rows: awards }, { label: "已领取 / 发放份数", kind: "实体领取 / 虚拟平台侧发放（非外部兑换）", rows: awards.filter(isAwardFulfilled) },
  ]; return metrics;
}

/** One action owns validation, result generation, chances and stock. Provider persists once. */
export function executeMarketing(input: MarketingState, command: MarketingCommand, ctx: MarketingContext): MarketingResult {
  const access = ctx.access ?? marketingPermissions(ctx.actor), stamp = new Date(ctx.now).toISOString();
  const pickupCommand = ["SAVE_PICKUP_SCHEDULE", "SAVE_PICKUP_SLOT", "ADJUST_PICKUP_CAPACITY", "SET_PICKUP_SLOT_OPEN", "DELETE_PICKUP_SLOT", "GENERATE_PICKUP_SLOTS"].includes(command.type);
  const management = pickupCommand || ["SAVE_ACTIVITY", "STATUS", "COPY_ACTIVITY", "DELETE_ACTIVITY", "ADD_QUOTA", "ADD_PRIZE_SLOT", "SAVE_ACTIVITY_PRIZE", "DELETE_ACTIVITY_PRIZE", "IMPORT_CODES", "DELETE_CODES", "SAVE_ACTIVITY_SLOT", "DELETE_ACTIVITY_SLOT", "SAVE_SESSION_PRIZES", "COPY_SESSION_PRIZES", "ADJUST_SESSION_PRIZE_QUANTITY"].includes(command.type);
  // Denied capabilities do not even write an audit. View-only truly means no writes.
  if (management && !access.manage) return { state: input, ok: false, error: "无权管理活动规则" };
  if ((command.type === "VERIFY" || command.type === "REGISTER" && command.walkIn) && !access.redeem) return { state: input, ok: false, error: "无权执行核销或现场报名" };
  if (["DRAW", "CANCEL_BOOKING", "RESCHEDULE", "BOOK_PRIZE"].includes(command.type) && !access.preview || command.type === "REGISTER" && !command.walkIn && !access.preview) return { state: input, ok: false, error: "无权操作用户预览" };
  const id = ctx.id ?? (() => crypto.randomUUID());
  let activityId: string | undefined;
  let targetId = "";
  let state = structuredClone(input);
  let redemptionTarget: { participationId: string; awardId?: string; credential: string; type: "CHECKIN" | "COMPLETE" | "PRIZE_CLAIM" | "EXPERIENCE_CLAIM" } | undefined;
  const recordRedemption = (type: NonNullable<typeof redemptionTarget>["type"], result: "SUCCESS" | "REJECTED", detail: string) => {
    if (!redemptionTarget || !activityId) return;
    state.redemptions.push({ id: id(), activityId, ...redemptionTarget, type, targetId, occurredAt: stamp, actorId: ctx.actor.id, result, detail, source: "REDEMPTION_SURFACE" });
  };
  const audit = (result: "SUCCESS" | "REJECTED", detail: string, targetId = "") => { state.revision++; state.audits.push({ id: id(), activityId, action: command.type === "VERIFY" ? command.action : command.type, targetId, actorId: ctx.actor.id, occurredAt: stamp, result, detail }); };
  const reject = (error: string): MarketingResult => { if (activityId) { state = structuredClone(input); if (redemptionTarget) recordRedemption(redemptionTarget.type, "REJECTED", error); audit("REJECTED", error, targetId || activityId); } else state = input; return { state, ok: false, error }; };
  const done = (resultId?: string, detail = "操作完成"): MarketingResult => { audit("SUCCESS", detail, resultId); return { state, ok: true, resultId }; };
  const allowedActivity = (target: string) => state.activities.find((row) => row.id === target && access.brands.includes(row.brand));
  if (command.type === "SAVE_ACTIVITY") {
    if (!access.manage || !access.brands.includes(command.activity.brand)) return reject("无权编辑此品牌活动");
    const existing = state.activities.find((row) => row.id === command.activity.id);
    if (existing && !access.brands.includes(existing.brand)) return reject("无权编辑活动");
    activityId = command.activity.id;
    if (!existing && command.section && !["basic", "information"].includes(command.section)) return reject("请先创建活动，再配置业务规则");
    if (!existing && !command.activity.lotteryScope) return reject("创建活动时请选择抽奖方式");
    if (existing && lotteryScope(existing) !== lotteryScope(command.activity)) return reject("抽奖方式在创建时确定，不能在同一活动中切换；请新建活动");
    const fields: Record<"basic" | "information" | "booking" | "lottery", Array<keyof MarketingActivity>> = {
      information: ["name", "brand", "mode", "location", "startAt", "endAt", "bookingEnabled", "lotteryEnabled", "ruleContent", "ruleContentFormat", "bookingStart", "bookingEnd", "completion", "allowCancel", "allowReschedule", "allowWalkIn", "slots"],
      basic: ["name", "brand", "mode", "location", "startAt", "endAt", "bookingEnabled", "lotteryEnabled", "ruleContent", "ruleContentFormat"],
      booking: ["bookingStart", "bookingEnd", "completion", "allowCancel", "allowReschedule", "allowWalkIn", "slots"],
      lottery: ["lotteryStart", "lotteryEnd", "grantCount", "drawLimit", "dailyLimit", "winLimit", "noWinProbability"],
    };
    const candidate: MarketingActivity = { ...(existing && command.section ? { ...existing, ...Object.fromEntries(fields[command.section].map(key => [key, command.activity[key]])) } : command.activity), createdBy: existing ? existing.createdBy : ctx.actor.id };
    // Session allocations have one dedicated write path. A stale activity form
    // must never erase or overwrite live allocation and probability history.
    if (existing) {
      candidate.lotteryScope = lotteryScope(existing);
      candidate.pickupSchedules = structuredClone(existing.pickupSchedules);
      candidate.status = existing.status;
      candidate.pool = structuredClone(existing.pool);
      candidate.sessionPrizes = structuredClone(existing.sessionPrizes ?? []);
      candidate.sessionPrizeConfigVersion = existing.sessionPrizeConfigVersion ?? 1;
    } else {
      candidate.sessionPrizes = [];
      candidate.sessionPrizeConfigVersion = 1;
    }
    // Switching an editable draft online cannot retain an offline-only completion rule.
    if (existing && ["basic", "information"].includes(command.section ?? "") && existing.mode !== "ONLINE" && candidate.mode === "ONLINE") candidate.completion = "STAFF";
    const code = existing ? activityCodes(state).get(existing.id)! : nextActivityCode(state, stamp);
    if (existing && command.activity.activityCode !== undefined && command.activity.activityCode !== code) return reject("活动编号由系统生成，不可修改");
    const basicPrizeErrors = draftActivityErrors(candidate);
    if (basicPrizeErrors.length) return reject([...new Set(basicPrizeErrors)].join("；"));
    if (new Set(candidate.pool.map((row) => row.id)).size !== candidate.pool.length || new Set(candidate.slots.map((row) => row.id)).size !== candidate.slots.length) return reject("活动奖品 / 场次标识不能重复");
    if ((candidate.sessionPrizes ?? []).some((row) => !candidate.slots.some((slot) => slot.id === row.sessionId) || !candidate.pool.some((item) => item.id === row.prizeId))) return reject("场次奖品配置引用了已移除的场次或奖品，请使用对应的管理操作");
    const allCodes = state.activities.filter((row) => row.id !== activityId).flatMap((row) => row.pool.flatMap((item) => item.codes.map((code) => code.code))).concat(candidate.pool.flatMap((item) => item.codes.map((code) => code.code)));
    if (new Set(allCodes).size !== allCodes.length) return reject("兑换码已存在，不允许跨奖品或活动重复导入");
    if (candidate.pool.some((item) => item.codes.some((code) => code.assignedAwardId && !existing?.pool.find((row) => row.id === item.id)?.codes.some((old) => JSON.stringify(old) === JSON.stringify(code))))) return reject("兑换码分配状态仅由抽奖动作修改");
    if (existing && !assignedCodesPreserved(existing.pool, candidate.pool)) return reject("已分配兑换码永久保留，不允许删除或修改分配状态");
    if (existing && (existing.publishedAt || hasActivityBusinessData(state, existing.id))) {
      // Focused prototype editors change only their explicit field group, never stored history.
      if (command.section) {
        if (candidate.brand !== existing.brand) return reject("已有发布或业务历史的活动不能变更品牌归属");
        if (hasActivityBusinessData(state, existing.id) && candidate.bookingEnabled !== existing.bookingEnabled) return reject("已有参与历史的活动不能切换预约 / 直接参与模式。");
        if (!candidate.name.trim()) return reject("填写活动名称");
        if (command.section === "booking" || command.section === "information") {
          for (const old of existing.slots) {
            const used = state.bookings.some(row => row.activityId === existing.id && row.kind === "ACTIVITY" && row.slotId === old.id) || state.draws.some((row) => row.activityId === existing.id && row.sessionId === old.id);
            if (!used) continue;
            const slot = candidate.slots.find(row => row.id === old.id);
            if (!slot) return reject("已有预约历史的场次不能删除");
            if (slot.capacity < slotOccupancy(state, existing.id, "ACTIVITY", old.id)) return reject("场次容量不能低于已有有效预约人数");
            if (JSON.stringify({ ...slot, capacity: old.capacity, label: old.label }) !== JSON.stringify(old)) return reject("已有预约的场次仅可改名称与安全容量；地点和时间不覆盖既有预约");
          }
        }
        state.activities[state.activities.indexOf(existing)] = { ...candidate, activityCode: code };
        return done(activityId, `更新活动${command.section === "basic" ? "信息" : command.section === "booking" ? "预约设置" : "抽奖设置"}；历史参与、预约、次数及中奖快照保留`);
      }
      const descriptive = { ...existing, activityCode: code, name: candidate.name, description: candidate.description, cover: candidate.cover, ruleContent: readActivityRule(candidate), ruleContentFormat: candidate.ruleContentFormat };
      const { ruleContent: _newRule, ruleContentFormat: _newFormat, activityCode: _newCode, ...incomingBusiness } = { ...candidate, name: existing.name, description: existing.description, cover: existing.cover };
      const { ruleContent: _oldRule, ruleContentFormat: _oldFormat, activityCode: _oldCode, ...existingBusiness } = existing;
      if (JSON.stringify(incomingBusiness) !== JSON.stringify(existingBusiness)) return reject("发布后业务规则锁定；只可改名称、说明、活动规则文案和封面。实质变化请复制活动");
      state.activities[state.activities.indexOf(existing)] = descriptive;
    } else { const draft = { ...candidate, activityCode: code, status: "DRAFT" as const, publishedAt: undefined, ruleVersion: 1 }; if (!draft.name.trim()) return reject("填写活动名称"); const index = state.activities.findIndex((row) => row.id === draft.id); if (index < 0) state.activities.push(draft); else state.activities[index] = draft; }
    return done(activityId);
  }
  if (command.type === "CANCEL_BOOKING" || command.type === "RESCHEDULE") {
    const booking = state.bookings.find((row) => row.id === command.bookingId);
    const activity = booking && allowedActivity(booking.activityId);
    if (!booking || !activity || !access.preview) return reject("无权操作预约"); activityId = activity.id; targetId = booking.id;
    const participation = state.participations.find((row) => row.id === booking.participationId);
    if (!participation || participationIssue(participation, ctx.members)) return reject("参与身份引用待核对");
    if (booking.kind === "ACTIVITY" && (booking.status !== "BOOKED" || bookingStatus(booking, slotFor(state, booking), ctx.now) !== "BOOKED")) return reject("已签到、取消或爽约，不能自行取消 / 改约");
    if (booking.kind === "PRIZE" && !["BOOKED", "NO_SHOW"].includes(booking.status)) return reject("此领奖预约已取消或已领取，不能取消 / 改约");
    if (booking.kind === "ACTIVITY" && (participation.checkedInAt || participation.completedAt || state.draws.some(row => row.participationId === participation.id))) return reject("参与主体已签到、完成或抽奖，不能自行取消或改约");
    if (booking.kind === "ACTIVITY" && !(command.type === "CANCEL_BOOKING" ? activity.allowCancel : activity.allowReschedule)) return reject("本活动不允许用户取消 / 改约");
    const oldSlot = slotFor(state, booking); if (!oldSlot || booking.kind === "ACTIVITY" && ctx.now >= time(oldSlot.bookingClosesAt)) return reject("预约截止已到，不能取消 / 改约");
    const award = booking.kind === "PRIZE" && state.awards.find(row => row.id === booking.awardId);
    if (booking.kind === "PRIZE" && (!award || award.fulfilledAt || !needsReservation(award))) return reject("领奖权益不存在、不需要预约或已经领取");
    if (command.type === "CANCEL_BOOKING") { booking.status = "CANCELED"; booking.canceledAt = stamp; return done(booking.id, "取消预约，释放时段；获奖资格保留"); }
    const item = activity.pool.find((item) => item.id === booking.poolItemId);
    const slots = booking.kind === "ACTIVITY" ? activity.slots.filter(slot => !slot.disabled && !slot.deleted && !slotErrors(slot, activity.startAt, activity.endAt).length) : item ? availablePickupSlots(activity, item, ctx.now) : [];
    const target = slots.find(slot => slot.id === command.slotId);
    if (!target || ctx.now >= time(target.bookingClosesAt) || ctx.now >= time(target.endAt) || (target.id !== booking.slotId && slotOccupancy(state, activity.id, booking.kind, target.id, booking.poolItemId) >= target.capacity)) return reject("目标时段无效、已截止或满额，原预约保留");
    if (booking.kind === "ACTIVITY" && (activity.status !== "PUBLISHED" || !inWindow(ctx.now, activity.bookingStart, activity.bookingEnd))) return reject("活动暂停 / 取消或预约未开放，不能改约");
    if (booking.kind === "PRIZE") { const award = state.awards.find((row) => row.id === booking.awardId); if (!award || !inWindow(ctx.now, award.claimStart, award.claimEnd)) return reject("获奖权益不在领取有效期内"); if (activity.status === "PAUSED") return reject("活动暂停，停止新的领奖预约 / 改约；既有权益与预约保留"); }
    if (booking.kind === "PRIZE" && award && (time(target.startAt) < time(award.claimStart) || time(target.endAt) > time(award.claimEnd))) return reject("目标时段超出中奖权益有效期，原预约保留");
    if (target.id === booking.slotId) return { state: input, ok: true, resultId: booking.id };
    booking.status = "CANCELED"; booking.canceledAt = stamp;
    state.bookings.push({ ...booking, id: id(), scheduleId: bookingScheduleId(activity, booking), status: "BOOKED", slotId: target.id, createdAt: stamp, canceledAt: undefined }); return done(booking.participationId, "改约成功，保留原取消记录");
  }
  if (command.type === "BOOK_PRIZE") {
    const award = state.awards.find((row) => row.id === command.awardId), activity = award && allowedActivity(award.activityId);
    if (!award || !activity || !access.preview) return reject("无权预约此权益"); activityId = activity.id; targetId = award.id;
    const participation = state.participations.find((row) => row.id === award.participationId);
    if (!participation || participationIssue(participation, ctx.members)) return reject("参与身份引用待核对");
    if (award.fulfilledAt || !needsReservation(award) || !inWindow(ctx.now, award.claimStart, award.claimEnd)) return reject("权益已领取、不需预约或不在有效期内");
    const existing = state.bookings.find((row) => row.awardId === award.id && row.status !== "CANCELED");
    if (existing) return existing.slotId === command.slotId ? { state: input, ok: true, resultId: existing.id } : reject("已有有效奖品预约，请改约或取消");
    if (activity.status === "PAUSED") return reject("活动暂停，停止新的领奖预约；已有领奖预约仍可领取，中奖权益保留");
    const item = activity.pool.find((row) => row.id === award.poolItemId), schedule = item && pickupScheduleForPrize(activity, item);
    const slot = item && availablePickupSlots(activity, item, ctx.now).find(row => row.id === command.slotId);
    if (!slot || !item || !schedule || time(slot.startAt) < time(award.claimStart) || time(slot.endAt) > time(award.claimEnd) || slotOccupancy(state, activity.id, "PRIZE", slot.id, item.id) >= slot.capacity) return reject("奖品时段无效、已满或已截止");
    const bookingId = id(); state.bookings.push({ id: bookingId, activityId: activity.id, participationId: award.participationId, kind: "PRIZE", poolItemId: award.poolItemId, awardId: award.id, scheduleId: schedule.id, slotId: slot.id, status: "BOOKED", createdAt: stamp, source: "USER" }); return done(bookingId);
  }
  if (command.type === "VERIFY") {
    if (!access.redeem) return reject("无权执行核销");
    const token = resolveCredential(state, command.credential, ctx); if (token.error || !token.activity || !token.participation) return reject(token.error ?? "凭证无效");
    const { activity, participation, award } = token; activityId = activity.id; targetId = award?.id ?? participation.id;
    redemptionTarget = { participationId: participation.id, awardId: award?.id, credential: command.credential, type: command.action === "CLAIM" ? award?.method === "EXPERIENCE" ? "EXPERIENCE_CLAIM" : "PRIZE_CLAIM" : command.action };
    if (command.action === "CLAIM") {
      if (!award) return reject("这是活动凭证，不是奖品领取凭证");
      if (award.prizeType !== "PHYSICAL" && !(award.prizeType === "VIRTUAL" && needsReservation(award))) return reject("直接发放虚拟奖品或待确认类型不由现场核销端发放");
      if (award.prizeType === "VIRTUAL" && !hasVirtualAwardContent(award)) return reject("虚拟发放资料缺失或无效，待核对；未标记发放");
      if (award.fulfilledAt) return { state: input, ok: true, resultId: award.id };
      if (!inWindow(ctx.now, award.claimStart, award.claimEnd)) return reject("奖品尚未到有效期或已过期，已中奖数量不退回");
      let location = award.location;
      let booking: MarketingBooking | undefined;
      if (needsReservation(award)) {
        booking = state.bookings.find((row) => row.awardId === award.id && row.status === "BOOKED"); const slot = booking && slotFor(state, booking);
        if (!booking || !slot || slot.deleted || command.slotId !== slot.id || !inWindow(ctx.now, slot.checkinStart, slot.checkinEnd)) return reject("需要有效奖品预约且在对应领奖时段窗口，不能直接发放"); location = slot.location;
      }
      if (command.location !== location) return reject("核销地点不符");
      award.fulfilledAt = stamp; if (award.prizeType === "VIRTUAL") award.issuedAt = stamp;
      if (booking) booking.status = "FULFILLED"; recordRedemption(redemptionTarget.type, "SUCCESS", "中奖权益已领取 / 使用"); return done(award.id, "奖品已发放，不重复扣减可发放数量");
    }
    if (award) return reject("这是奖品凭证，不能签到 / 确认活动完成");
    const booking = state.bookings.find((row) => row.participationId === participation.id && row.kind === "ACTIVITY" && ["BOOKED", "CHECKED_IN"].includes(row.status));
    const slot = booking && slotFor(state, booking);
    if (command.action === "CHECKIN") {
      if (participation.checkedInAt) return { state: input, ok: true, resultId: participation.id };
      if (activity.mode !== "OFFLINE") return reject("线上活动无入场签到，使用工作人员确认完成");
      if (activity.status === "DRAFT" || activity.status === "CANCELED") return reject("活动未发布 / 已取消，不能新签到");
      if (activity.bookingEnabled && (!booking || !slot || slot.disabled || slot.deleted || command.slotId !== slot.id || !inWindow(ctx.now, slot.checkinStart, slot.checkinEnd))) return reject("预约不存在、取消、场次不符或签到窗口已关闭，不能签到");
      if (!activity.bookingEnabled && !inWindow(ctx.now, activity.startAt, activity.endAt)) return reject("不在活动签到时间内");
      if (command.location !== (slot?.location ?? activity.location)) return reject("签到地点不符");
      participation.checkedInAt = stamp; if (booking) booking.status = "CHECKED_IN";
      recordRedemption("CHECKIN", "SUCCESS", "活动签到完成");
      if (activity.completion !== "CHECKIN") return done(participation.id, "签到完成，尚未确认参与完成，不发次数");
    } else {
      if (participation.completedAt) return { state: input, ok: true, resultId: participation.id };
      if (activity.status === "DRAFT" || (activity.status === "CANCELED" && !participation.checkedInAt)) return reject("活动未发布 / 取消且尚未到场，不能确认完成");
      if (activity.mode === "OFFLINE" && !participation.checkedInAt) return reject("线下须先签到，再确认完成");
      if (activity.mode === "ONLINE" && !inWindow(ctx.now, activity.startAt, activity.endAt)) return reject("不在活动举行期内");
      if (activity.mode === "OFFLINE" && command.location !== (slot?.location ?? activity.location)) return reject("完成确认地点不符");
    }
    participation.completedAt = stamp; participation.completionActorId = ctx.actor.id;
    recordRedemption("COMPLETE", "SUCCESS", "首次确认活动完成");
    if (activity.lotteryEnabled && !state.chances.some((row) => row.participationId === participation.id)) state.chances.push({ id: id(), activityId: activity.id, participationId: participation.id, count: activity.grantCount, grantedAt: stamp, ruleVersion: participation.ruleVersion });
    return done(participation.id, "首次完成，按锁定规则一次发放机会");
  }
  const activity = allowedActivity(command.activityId);
  if (!activity) return reject("活动不存在或不在品牌授权范围"); activityId = activity.id;
  if (management && !access.manage) return reject("无权管理活动规则");
  activity.lotteryScope = lotteryScope(activity);
  if (pickupCommand) {
    const result = executePickupCommand(state, activity, command as PickupCommand, ctx.now);
    return result.error ? reject(result.error) : done(result.id, result.detail);
  }
  if (command.type === "STATUS") {
    if (command.status === "PUBLISHED") { if (activity.status === "CANCELED") return reject("取消后不能恢复，请复制为新活动"); const errors = validateActivity(activity, state, access.brands, ctx.now); if (ctx.now >= time(activity.endAt)) errors.push("活动已结束，不能开始或恢复"); if (errors.length) return reject(errors.join("；")); activity.publishedAt ??= stamp; }
    if (command.status === "PAUSED" && activity.status !== "PUBLISHED") return reject("只有已发布活动可暂停");
    if (command.status === "DRAFT") return reject("发布状态不能退回草稿");
    activity.status = command.status;
    if (command.status === "CANCELED") state.bookings.forEach((row) => { if (row.activityId === activity.id && row.kind === "ACTIVITY" && row.status === "BOOKED") { row.status = "CANCELED"; row.canceledAt = stamp; } });
    return done(activity.id, "发布状态变更；既有获奖权益及奖品预约保留");
  }
  if (command.type === "SAVE_ACTIVITY_PRIZE") {
    if (!command.prize.name.trim()) return reject("请填写奖品名称");
    if (command.newPickupSchedule) {
      const schedule = command.newPickupSchedule;
      if (!needsReservation(command.prize) || command.prize.pickupScheduleId !== schedule.id || pickupSchedules(activity).some(row => row.id === schedule.id)) return reject("请选择当前奖品的新兑奖预约，已有预约设置须通过原入口编辑");
      if (new Set(schedule.slots.map(slot => slot.id)).size !== schedule.slots.length) return reject("兑奖时段标识不能重复");
      const saved = executePickupCommand(state, activity, { type: "SAVE_PICKUP_SCHEDULE", activityId: activity.id, schedule: { ...schedule, slots: [] } }, ctx.now);
      if (saved.error) return reject(saved.error);
      for (const slot of schedule.slots) {
        const result = executePickupCommand(state, activity, { type: "SAVE_PICKUP_SLOT", activityId: activity.id, scheduleId: schedule.id, slot }, ctx.now);
        if (result.error) return reject(result.error);
      }
    }
    const item = normalizedPrizeContract(command.prize), old = activity.pool.find((row) => row.id === item.id);
    const errors = prizeErrors(item, activity, false);
    if (errors.length) return reject([...new Set(errors)].join("；"));
    const limit = prizeQuantityLimit(item), allocation = activityPrizeAllocation(state, activity, item, ctx.now);
    if (limit !== null && allocation.won + allocation.reserved > limit) return reject(`当前已有${allocation.won}份中奖记录、${allocation.reserved}份有效场次占用，可发放数量不能低于两者合计。`);
    const won = state.awards.filter((row) => row.activityId === activity.id && row.poolItemId === item.id).length;
    if (limit !== null && won > limit) return reject(`当前已有${won}份中奖记录，可发放数量不能低于${won}份。`);
    if (old && !assignedCodesPreserved([old], [item])) return reject("已分配兑换码永久保留，不允许删除或修改分配状态");
    if (old) {
      const booked = state.bookings.some(row => row.activityId === activity.id && row.poolItemId === old.id && row.kind === "PRIZE");
      if (booked && pickupScheduleForPrize(activity, old)?.id !== pickupScheduleForPrize(activity, item)?.id) return reject("该奖品已有领奖预约记录，不能切换兑奖预约设置。");
      if (won && ["prizeType", "method", "fulfillmentMode", "claimStart", "claimEnd", "location", "quantityMode", "link", "voucherName", "voucherDescription"].some(key => normalizedPrizeContract(old)[key as keyof ActivityPrize] !== item[key as keyof ActivityPrize])) return reject("已有中奖权益的奖品类型、领取规则和有效期不能直接修改，请创建新奖品。");
      if ((won || activity.publishedAt) && prizeQuantityLimit(old) !== limit) return reject("已发布奖品请使用增加可发放数量；历史数量与权益保留。");
      if (JSON.stringify(old.slots) !== JSON.stringify(item.slots)) return reject("兑奖时段请通过兑奖预约设置专用操作维护。");
    } else if (item.slots.length) return reject("新奖品不能创建私有领奖时段，请关联兑奖预约设置。");
    if (lotteryScope(activity) === "ACTIVITY" && activity.pool.filter(prize => prize.id !== item.id).reduce((sum, prize) => sum + prizeDefaultProbability(prize), prizeDefaultProbability(item)) > 100) return reject("中奖概率合计不能超过100%。");
    if (item.codes.some((code) => code.assignedAwardId && !old?.codes.some((row) => JSON.stringify(row) === JSON.stringify(code)))) return reject("不允许修改兑换码分配状态");
    const codes = state.activities.flatMap((row) => row.pool.filter((prize) => row.id !== activity.id || prize.id !== item.id).flatMap((prize) => prize.codes.map((code) => code.code))).concat(item.codes.map((code) => code.code));
    if (new Set(codes).size !== codes.length) return reject("兑换码已存在，不允许重复导入");
    if (item.pickupScheduleId) {
      const selectedSchedule = pickupScheduleForPrize(activity, item);
      if (!selectedSchedule) return reject("兑奖预约设置不存在或不属于当前活动");
      activity.pickupSchedules ??= [];
      if (!activity.pickupSchedules.some(schedule => schedule.id === selectedSchedule.id)) activity.pickupSchedules.push(structuredClone(selectedSchedule));
      item.slots = [];
    }
    if (old) activity.pool[activity.pool.indexOf(old)] = structuredClone(item); else activity.pool.push(structuredClone(item));
    activity.sessionPrizeConfigVersion = (activity.sessionPrizeConfigVersion ?? 0) + 1;
    if (prizeQuantityMode(item) === "UNLIMITED") activity.sessionPrizes = (activity.sessionPrizes ?? []).map((row) => row.prizeId === item.id ? (() => { const { allocatedQuantity: _allocated, ...retained } = row; return retained; })() : row);
    return done(item.id, lotteryScope(activity) === "ACTIVITY" ? `保存奖品；中奖概率 ${old ? prizeDefaultProbability(old) : 0}% → ${prizeDefaultProbability(item)}%；历史快照保留` : "保存奖品资料；场次概率与历史快照保留");
  }
  if (command.type === "DELETE_ACTIVITY_PRIZE") {
    if (activity.publishedAt || state.draws.some((row) => row.activityId === activity.id && row.poolItemId === command.poolItemId) || state.awards.some((row) => row.activityId === activity.id && row.poolItemId === command.poolItemId)) return reject("已发布或已产生业务数据的活动奖品不能删除");
    activity.pool = activity.pool.filter((row) => row.id !== command.poolItemId);
    activity.sessionPrizes = (activity.sessionPrizes ?? []).filter((row) => row.prizeId !== command.poolItemId);
    return done(command.poolItemId);
  }
  if (command.type === "IMPORT_CODES") {
    const item = activity.pool.find((row) => row.id === command.poolItemId);
    if (!item || item.prizeType !== "VIRTUAL" || item.method !== "REDEMPTION_CODE") return reject("仅兑换码型虚拟奖品支持导入");
    const existing = new Set(state.activities.flatMap((row) => row.pool.flatMap((prize) => prize.codes.map((code) => code.code))));
    const { codes, report } = inspectMarketingCodes(command.codes, existing);
    if (!codes.length) return { ...reject(`成功导入：0，重复：${report.duplicate}，非法：${report.invalid}，忽略空值：${report.ignored}；未导入任何兑换码。`), codeImport: report };
    item.codes.push(...codes.map((code) => ({ code }))); return { ...done(item.id, `成功导入：${codes.length}，重复：${report.duplicate}，非法：${report.invalid}，忽略空值：${report.ignored}`), codeImport: report };
  }
  if (command.type === "DELETE_CODES") {
    const item = activity.pool.find((row) => row.id === command.poolItemId);
    if (!item || item.prizeType !== "VIRTUAL" || item.method !== "REDEMPTION_CODE") return reject("仅兑换码型虚拟奖品支持兑换码管理");
    const selected = new Set(command.codes);
    if (!selected.size || command.codes.some((code) => !item.codes.some((row) => row.code === code))) return reject("请选择当前奖品已有的兑换码");
    if (item.codes.some((row) => selected.has(row.code) && row.assignedAwardId)) return reject("已分配兑换码永久不能删除或重新分配。");
    const retained = item.codes.filter((row) => !selected.has(row.code));
    if (prizeQuantityMode(item) === "LIMITED" && (activity.publishedAt || activity.status !== "DRAFT") && codeInventory({ ...item, codes: retained }).remaining < quota(state, activity.id, item).available) return reject("删除后剩余兑换码不足以覆盖当前剩余可发放数量。");
    item.codes = retained; return done(item.id, `删除 ${selected.size} 个未分配兑换码，已分配代码及历史权益保持不变`);
  }
  if (command.type === "SAVE_ACTIVITY_SLOT" || command.type === "DELETE_ACTIVITY_SLOT") {
    if (!activity.bookingEnabled) return reject("直接参与活动不创建或配置活动场次");
    const slotId = command.type === "SAVE_ACTIVITY_SLOT" ? command.slot.id : command.slotId;
    const old = activity.slots.find((row) => row.id === slotId);
    const used = state.bookings.some((row) => row.activityId === activity.id && row.kind === "ACTIVITY" && row.slotId === slotId) || state.draws.some((row) => row.activityId === activity.id && row.sessionId === slotId);
    if (command.type === "DELETE_ACTIVITY_SLOT") {
      if (used) return reject("已有预约历史的场次不能删除");
      activity.slots = activity.slots.filter((row) => row.id !== slotId);
      activity.sessionPrizes = (activity.sessionPrizes ?? []).filter((row) => row.sessionId !== slotId);
      return done(slotId, "删除未使用的活动场次及其未使用奖品配置");
    }
    const errors = slotErrors(command.slot, activity.startAt, activity.endAt);
    if (errors.length) return reject(errors.join("；"));
    if (command.slot.capacity < slotOccupancy(state, activity.id, "ACTIVITY", slotId)) return reject("场次容量不能低于已有有效预约人数");
    if (used && old && JSON.stringify({ ...command.slot, capacity: old.capacity, label: old.label }) !== JSON.stringify(old)) return reject("已有预约的场次仅可改名称与安全容量；地点和时间不覆盖既有预约");
    if (old) activity.slots[activity.slots.indexOf(old)] = structuredClone(command.slot); else activity.slots.push(structuredClone(command.slot));
    return done(slotId, "调整活动场次，保留预约历史");
  }
  if (command.type === "SAVE_SESSION_PRIZES") {
    const slot = activity.slots.find((row) => row.id === command.sessionId && !row.disabled && !row.deleted);
    if (lotteryScope(activity) !== "SESSION" || !activity.bookingEnabled || !activity.lotteryEnabled || !slot) return reject("仅按场次抽奖的有效场次可以配置奖池");
    if (activity.status === "CANCELED" || ctx.now >= time(activity.endAt) || ctx.now >= time(slot.endAt)) return reject("活动或场次已结束，奖品配置只读");
    const current = sessionPrizeConfigurations(activity, slot.id);
    if (!command.prizes.length) return reject("请配置本场奖池；停止抽奖请关闭奖品参与");
    const submitted = command.prizes.map((row) => {
      const item = activity.pool.find((prize) => prize.id === row.prizeId);
      if (!item) return { ...row, sessionId: slot.id };
      const won = sessionWonCount(state, activity.id, slot.id, row.prizeId);
      if (!row.enabled) return { ...row, sessionId: slot.id, probability: 0, allocatedQuantity: prizeQuantityMode(item) === "UNLIMITED" ? undefined : won };
      return { ...row, sessionId: slot.id, allocatedQuantity: prizeQuantityMode(item) === "UNLIMITED" ? undefined : row.allocatedQuantity ?? 0 };
    });
    // Omitting an existing row means stop offering it in future draws; retain a
    // disabled row and the already-won floor instead of deleting its identity.
    const normalized = [...submitted, ...current.filter((row) => !submitted.some((candidate) => candidate.prizeId === row.prizeId)).map((row) => {
      const item = activity.pool.find((prize) => prize.id === row.prizeId);
      const won = sessionWonCount(state, activity.id, slot.id, row.prizeId);
      return { ...row, enabled: false, probability: 0, allocatedQuantity: item && prizeQuantityMode(item) === "UNLIMITED" ? undefined : won };
    })];
    const errors = sessionPrizeErrors(state, activity, slot.id, normalized, ctx.now);
    if (errors.length) return reject(errors.join("；"));
    const hasDraws = state.draws.some((draw) => draw.activityId === activity.id && draw.sessionId === slot.id);
    const quantityLocked = current.length > 0 && (hasDraws || ctx.now >= time(slot.startAt));
    if (quantityLocked && !command.allowQuantityEdit && normalized.some((row) => row.enabled && (current.find((old) => old.prizeId === row.prizeId)?.allocatedQuantity ?? 0) !== (row.allocatedQuantity ?? 0))) return reject("场次已开始或已有抽奖记录，请使用“调整数量”保留变更语义和审计记录");
    const probabilityChanges = normalized.flatMap((row) => {
      const before = current.find((old) => old.prizeId === row.prizeId)?.probability ?? 0;
      return before === row.probability ? [] : [`${row.prizeId}:${before}%→${row.probability}%`];
    });
    const quantityChanges = [...new Set([...current.map((row) => row.prizeId), ...normalized.map((row) => row.prizeId)])].flatMap((prizeId) => {
      const item = activity.pool.find((prize) => prize.id === prizeId);
      if (!item || prizeQuantityMode(item) === "UNLIMITED") return [];
      const before = current.find((row) => row.prizeId === prizeId)?.allocatedQuantity ?? 0;
      const after = normalized.find((row) => row.prizeId === prizeId)?.allocatedQuantity ?? 0;
      return before === after ? [] : [`${prizeId}: Before ${before}；After ${after}`];
    });
    activity.sessionPrizes = [...(activity.sessionPrizes ?? []).filter((row) => row.sessionId !== slot.id), ...structuredClone(normalized)];
    activity.sessionPrizeConfigVersion = (activity.sessionPrizeConfigVersion ?? 0) + 1;
    return done(slot.id, `保存场次奖品配置；概率变更 ${probabilityChanges.join("，") || "无"}；数量变更 ${quantityChanges.join("，") || "无"}；只影响未来抽奖`);
  }
  if (command.type === "COPY_SESSION_PRIZES") {
    const source = activity.slots.find((row) => row.id === command.sourceSessionId), target = activity.slots.find((row) => row.id === command.targetSessionId);
    if (lotteryScope(activity) !== "SESSION" || !activity.bookingEnabled || !activity.lotteryEnabled || !source || !target || source.id === target.id || source.disabled || source.deleted || target.disabled || target.deleted) return reject("仅按场次抽奖支持复制场次配置");
    if (activity.status === "CANCELED" || ctx.now >= time(activity.endAt) || ctx.now >= time(target.startAt)) return reject("活动已结束或目标场次已开始，不能覆盖奖品配置");
    if (state.draws.some((draw) => draw.activityId === activity.id && draw.sessionId === target.id)) return reject("目标场次已有抽奖记录，不能覆盖其配置");
    const copied = sessionPrizeConfigurations(activity, source.id).map((row) => ({ ...row, sessionId: target.id }));
    if (!copied.length) return reject("来源场次尚未配置奖品");
    const errors = sessionPrizeErrors(state, activity, target.id, copied, ctx.now);
    if (errors.length) return reject(errors.join("；"));
    activity.sessionPrizes = [...(activity.sessionPrizes ?? []).filter((row) => row.sessionId !== target.id), ...structuredClone(copied)];
    activity.sessionPrizeConfigVersion = (activity.sessionPrizeConfigVersion ?? 0) + 1;
    return done(target.id, `从场次 ${source.id} 复制奖品是否参与、概率和分配数量；不复制抽奖、中奖或剩余结果`);
  }
  if (command.type === "ADJUST_SESSION_PRIZE_QUANTITY") {
    if (!["INCREASE", "DECREASE"].includes(command.direction)) return reject("选择增加或减少数量");
    const slot = activity.slots.find((row) => row.id === command.sessionId), item = activity.pool.find((row) => row.id === command.prizeId);
    const config = (activity.sessionPrizes ?? []).find((row) => row.sessionId === command.sessionId && row.prizeId === command.prizeId);
    if (lotteryScope(activity) !== "SESSION" || !activity.bookingEnabled || !activity.lotteryEnabled || !slot || slot.disabled || slot.deleted || !item || !config || !config.enabled || prizeQuantityMode(item) !== "LIMITED") return reject("请选择按场次抽奖中已启用的限量奖品");
    if (activity.status === "CANCELED" || ctx.now >= time(activity.endAt) || ctx.now >= time(slot.endAt)) return reject("活动或场次已结束，奖品配置只读");
    if (!positive(command.count) || !Number.isSafeInteger(command.count)) return reject("调整数量须为安全正整数");
    const before = config.allocatedQuantity ?? 0, won = sessionWonCount(state, activity.id, slot.id, item.id);
    const unallocated = activityPrizeAllocation(state, activity, item, ctx.now).unallocated ?? 0;
    if (command.direction === "INCREASE" && command.count > unallocated) return reject(`当前奖品仅剩${unallocated}份活动可分配数量。`);
    const after = command.direction === "INCREASE" ? before + command.count : before - command.count;
    if (!Number.isSafeInteger(after)) return reject("调整后的本场可发放数量超出安全整数范围");
    if (after < won) return reject(`当前场次已有${won}份中奖记录，本场可发放数量不能低于${won}份。`);
    if (after < 0) return reject("本场分配数量不能小于0");
    config.allocatedQuantity = after;
    activity.sessionPrizeConfigVersion = (activity.sessionPrizeConfigVersion ?? 0) + 1;
    return done(config.prizeId, `Activity ${activity.id}；Session ${slot.id}；Prize ${item.id}；${command.direction === "INCREASE" ? "Increase" : "Decrease"}；Delta ${command.count}；Before ${before}；After ${after}；Operator ${ctx.actor.id}；Time ${stamp}；只影响未来抽奖`);
  }
  if (command.type === "COPY_ACTIVITY") {
    const copyId = id();
    const copySlot = (slot: MarketingSlot) => ({ ...slot, id: id(), startAt: "", endAt: "", bookingClosesAt: "", checkinStart: "", checkinEnd: "" });
    const sourceSchedules = pickupSchedules(activity);
    const scheduleIds = new Map(sourceSchedules.map(schedule => [schedule.id, id()]));
    const pickupCopies = sourceSchedules.map(schedule => ({ ...schedule, id: scheduleIds.get(schedule.id)!, activityId: copyId, startAt: "", endAt: "", slots: schedule.slots.map(copySlot) }));
    const copy = { ...activity, pickupSchedules: pickupCopies, id: copyId, name: `${activity.name} · 副本`, status: "DRAFT" as const, createdAt: stamp, createdBy: ctx.actor.id, publishedAt: undefined, ruleVersion: 1, startAt: "", endAt: "", bookingStart: "", bookingEnd: "", lotteryStart: "", lotteryEnd: "", slots: activity.slots.map(copySlot), pool: activity.pool.map((item) => ({ ...item, id: id(), activityId: copyId, claimStart: "", claimEnd: "", codes: [], pickupScheduleId: scheduleIds.get(pickupScheduleForPrize(activity, item)?.id ?? ""), slots: [] })), sessionPrizes: [], sessionPrizeConfigVersion: 1 };
    copy.activityCode = nextActivityCode(state, stamp);
    state.activities.push(copy); return done(copy.id, "仅复制配置结构；所有日期须重新填写，兑换码须重新导入，不复制业务记录或已发放数量");
  }
  if (command.type === "DELETE_ACTIVITY") { if (!canDeleteDraft(state, activity)) return reject("仅无任何业务记录、无已分配兑换码的未发布草稿可删除；其他活动请取消并保留历史权益"); state.activities = state.activities.filter((row) => row.id !== activity.id); return done(activity.id, "删除未使用草稿及其配置；操作审计保留"); }
  if (command.type === "ADD_QUOTA") {
    const item = activity.pool.find((row) => row.id === command.poolItemId);
    const limit = item && prizeQuantityLimit(item);
    if (!item || prizeQuantityMode(item) !== "LIMITED" || limit == null || !positive(command.count) || !Number.isSafeInteger(limit + command.count)) return reject("仅限量奖品可以增加可发放数量，且调整值须为安全正整数");
    const proposed = normalizedPrizeContract({ ...item, quota: limit + command.count, quantityLimit: limit + command.count }), errors = prizeErrors(proposed, activity, true);
    if (errors.length || ctx.now >= time(item.claimEnd)) return reject(errors.join("；") || "奖品已过有效期，不能增加可发放数量");
    if (item.method === "REDEMPTION_CODE" && codeInventory(item).remaining < quota(state, activity.id, item).available + command.count) return reject("兑换码不足，请先导入兑换码再增加可发放数量");
    item.quota = proposed.quota; item.quantityLimit = proposed.quantityLimit;
    return done(item.id, `增加可发放数量 ${command.count}；Before ${limit}；After ${proposed.quantityLimit}；已校验发放资料；兑奖预约设置容量独立维护`);
  }
  if (command.type === "ADD_PRIZE_SLOT") {
    const item = activity.pool.find(row => row.id === command.poolItemId), schedule = item && pickupScheduleForPrize(activity, item);
    if (!item || !needsReservation(item) || !schedule) return reject("请先为奖品选择兑奖预约设置");
    const result = executePickupCommand(state, activity, { type: "SAVE_PICKUP_SLOT", activityId: activity.id, scheduleId: schedule.id, slot: command.slot }, ctx.now);
    return result.error ? reject(result.error) : done(result.id, result.detail);
  }
  if (!(command.type === "REGISTER" && command.walkIn ? access.redeem : access.preview)) return reject("无权操作参与流程");
  if (command.type !== "REGISTER" && command.type !== "DRAW") return reject("不支持的参与操作");
  if (command.type === "REGISTER") { const issue = participantIdentityIssue(command.identity, command.participationChannel); if (issue) return reject(issue); }
  const identity = requestedParticipation(state, activity, ctx.members, command);
  if (identity.error) return reject(identity.error);
  let participation = identity.participation;
  if (participation && participationIssue(participation, ctx.members)) return reject("参与身份引用待核对，不能继续报名或抽奖");
  targetId = participation?.id ?? activity.id;
  const rememberIdentity = (row: MarketingParticipation) => {
    if (identity.user && !row.identities.some((ref) => ref.userId === identity.user!.id)) row.identities.push({ userId: identity.user.id, brand: identity.user.brand, openid: identity.user.openid, unionid: identity.user.unionid });
    if (command.type === "REGISTER" && command.identity) {
      const snapshot = Object.fromEntries(identityKeys.filter((key) => command.identity?.[key] !== undefined).map((key) => [key, command.identity![key]]));
      row.identity = { ...snapshot, ...row.identity, ...(identity.user ? { memberId: identity.user.id } : {}) };
    }
  };
  if (command.type === "DRAW") {
    if (!command.operationId.trim()) return reject("抽奖请求缺少操作标识");
    const saved = state.draws.find((row) => row.operationId === command.operationId);
    if (saved) return saved.activityId === activity.id && saved.participationId === participation?.id ? { state: input, ok: true, resultId: saved.id } : reject("操作标识已用于其他请求，不返回其结果");
    const reason = drawBlock(state, activity, participation, ctx); if (reason || !participation) return reject(reason);
    const configuration = drawRules(state, activity, participation, ctx.now);
    if ("error" in configuration) return reject(configuration.error || "缺少有效抽奖配置");
    let random: number;
    try { random = (ctx.random ?? Math.random)(); } catch { return reject("随机源失败，未生成结果或扣次数"); }
    if (!Number.isFinite(random) || random < 0 || random >= 1) return reject("随机源无效，未扣次数");
    rememberIdentity(participation);
    let cursor = 0; let winner: MarketingPoolItem | undefined;
    for (const rule of configuration.rules) { cursor += rule.effectiveProbability; if (random * 100 < cursor) { winner = rule.item; break; } }
    const drawId = id(); state.draws.push({ id: drawId, operationId: command.operationId, activityId: activity.id, participationId: participation.id, occurredAt: stamp, poolItemId: winner?.id ?? null, randomValue: random, ruleVersion: participation.ruleVersion, sessionId: configuration.sessionId, drawConfigVersion: configuration.version, probabilitySnapshot: configuration.snapshot });
    if (winner) {
      const awardId = id();
      let virtualContent: MarketingAward["virtualContent"];
      if (winner.prizeType === "VIRTUAL") {
        if (winner.method === "REDEMPTION_CODE") {
          const code = winner.codes.find((row) => !row.assignedAwardId && validMarketingCode(row.code))!;
          code.assignedAwardId = awardId; code.assignedAt = stamp; virtualContent = { code: code.code };
        } else if (winner.method === "LINK") virtualContent = { link: winner.link };
        else virtualContent = { name: winner.voucherName, description: winner.voucherDescription };
      }
      state.awards.push({ id: awardId, drawId, participationId: participation.id, activityId: activity.id, poolItemId: winner.id, credential: `WIN-${id()}`, prizeName: winner.name, awardLabel: winner.label, prizeType: winner.prizeType, image: winner.image, description: winner.description, method: winner.method, fulfillmentMode: fulfillmentMode(winner), location: winner.prizeType === "PHYSICAL" || needsReservation(winner) ? winner.location : "", instructions: winner.instructions, claimStart: winner.claimStart, claimEnd: winner.claimEnd, virtualContent, issuedAt: winner.prizeType === "VIRTUAL" && !needsReservation(winner) ? stamp : undefined, ruleVersion: participation.ruleVersion, wonAt: stamp });
    }
    return done(drawId, winner ? `中奖已计入${configuration.sessionId ? "本场分配" : "活动可发放数量"}` : "未中奖，有效消耗一次机会；已发完或不可用奖品概率计入未中奖且不重新分配");
  }
  if (command.type !== "REGISTER") return reject("不支持的操作");
  if (command.walkIn && (!access.redeem || !activity.allowWalkIn)) return reject("无现场报名权限或活动未允许现场报名");
  if (activity.status !== "PUBLISHED") return reject("未发布、暂停或取消，停止新报名 / 预约");
  if (activity.bookingEnabled) {
    if (!inWindow(ctx.now, activity.bookingStart, activity.bookingEnd) && !(command.walkIn && access.redeem && activity.allowWalkIn)) return reject("预约未开放 / 已截止");
    const slot = activity.slots.find((row) => row.id === command.slotId); if (!slot || slot.disabled || slot.deleted || slotErrors(slot, activity.startAt, activity.endAt).length) return reject("请选择真实且有效的活动场次");
    if (command.walkIn && (!access.redeem || !activity.allowWalkIn || !inWindow(ctx.now, slot.checkinStart, slot.checkinEnd))) return reject("未允许现场报名或不在场次窗口");
    if (!command.walkIn && ctx.now >= time(slot.bookingClosesAt)) return reject("场次预约已截止");
    const existing = participation && state.bookings.find((row) => row.participationId === participation!.id && row.kind === "ACTIVITY" && activeBooking(row));
    if (existing) { if (existing.slotId !== slot.id) return reject("同主体已有有效活动预约，请改约"); rememberIdentity(participation!); return done(participation!.id, "已有有效预约，保留原主体与额度"); }
    if (participation?.checkedInAt || participation?.completedAt) return reject("主体已签到 / 完成，不能重新预约刷新额度");
    if (slotOccupancy(state, activity.id, "ACTIVITY", slot.id) >= slot.capacity) return reject("场次满额，未占用新名额");
  } else if (!inWindow(ctx.now, activity.startAt, activity.endAt)) return reject("不在活动举行期内");
  if (!participation) {
    const participantId = command.participantId ?? id();
    participation = { id: id(), participantId, activityId: activity.id, subjectKey: identity.subjectKey ?? `participant:${participantId}`, identities: [], identity: identity.user ? { memberId: identity.user.id } : undefined,
      participationChannel: command.participationChannel ?? "OTHER", credential: `ACT-${id()}`, registeredAt: stamp, ruleVersion: activity.ruleVersion }; state.participations.push(participation);
  }
  rememberIdentity(participation);
  if (activity.bookingEnabled) state.bookings.push({ id: id(), activityId: activity.id, participationId: participation.id, kind: "ACTIVITY", slotId: command.slotId!, status: "BOOKED", createdAt: stamp, source: command.walkIn ? "WALK_IN" : "USER" });
  return done(participation.id, "报名 / 预约不发放抽奖机会");
}
