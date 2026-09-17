import type { DemoUser } from "@/types/crm";
import type { MemberOperationsState, SowindBrandCode, SowindBrandUser } from "@/types/member-operations";
import type { ActivityPrize, MarketingActivity, MarketingAward, MarketingBooking, MarketingParticipation, MarketingPoolItem, MarketingSlot, MarketingState, MarketingStatus } from "@/types/marketing";
import { memberAccess, parseCreatedAt, shanghaiDate } from "@/features/dashboard/dashboard-model";
import { inspectMarketingCodes, validMarketingCode, type MarketingCodeImportReport } from "./marketing-code-import";

// Existing access fixtures without view remain compatible; concrete role mappings always expose it.
export interface MarketingPermissions { brands: SowindBrandCode[]; view?: boolean; manage: boolean; redeem: boolean; preview: boolean }
export const canViewMarketing = (access: MarketingPermissions) => access.view ?? access.brands.length > 0;
export function marketingPermissions(actor: DemoUser): MarketingPermissions { const brands = memberAccess(actor).brands, hq = actor.role === "HQ_ADMIN"; return { brands, view: hq, manage: hq, redeem: hq, preview: hq }; }
export function activityCreationIssue(access: MarketingPermissions) { return !access.brands.length ? "当前账号没有可管理的品牌。" : !access.manage ? "当前账号没有活动管理权限。" : ""; }
export interface MarketingContext { actor: DemoUser; members: MemberOperationsState; now: number; random?: () => number; id?: () => string; access?: MarketingPermissions }
export type MarketingCommand =
  | { type: "SAVE_ACTIVITY"; activity: MarketingActivity }
  | { type: "STATUS"; activityId: string; status: MarketingStatus }
  | { type: "COPY_ACTIVITY"; activityId: string }
  | { type: "DELETE_ACTIVITY"; activityId: string }
  | { type: "SAVE_ACTIVITY_PRIZE"; activityId: string; prize: ActivityPrize }
  | { type: "DELETE_ACTIVITY_PRIZE"; activityId: string; poolItemId: string }
  | { type: "IMPORT_CODES"; activityId: string; poolItemId: string; codes: string[] }
  | { type: "DELETE_CODES"; activityId: string; poolItemId: string; codes: string[] }
  | { type: "SAVE_ACTIVITY_SLOT"; activityId: string; slot: MarketingSlot }
  | { type: "DELETE_ACTIVITY_SLOT"; activityId: string; slotId: string }
  | { type: "ADD_QUOTA"; activityId: string; poolItemId: string; count: number }
  | { type: "ADD_PRIZE_SLOT"; activityId: string; poolItemId: string; slot: MarketingSlot }
  | { type: "REGISTER"; activityId: string; userId: string; slotId?: string; walkIn?: boolean }
  | { type: "CANCEL_BOOKING"; bookingId: string }
  | { type: "RESCHEDULE"; bookingId: string; slotId: string }
  | { type: "DRAW"; activityId: string; userId: string; operationId: string }
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
export const needsReservation = (item: Pick<ActivityPrize, "prizeType" | "method">) => item.prizeType === "PHYSICAL" && ["PICKUP", "EXPERIENCE"].includes(item.method);
export const marketingStatusLabels = { DRAFT: "草稿", PUBLISHED: "已发布", PAUSED: "暂停", CANCELED: "已取消" };
export function hasActivityBusinessData(state: MarketingState, activityId: string) {
  return [state.participations, state.bookings, state.chances, state.draws, state.awards, state.redemptions].some((rows) => rows.some((row) => row.activityId === activityId));
}
export function canDeleteDraft(state: MarketingState, activity: MarketingActivity) {
  return activity.status === "DRAFT" && !activity.publishedAt && !hasActivityBusinessData(state, activity.id) && !activity.pool.some((item) => item.codes.some((code) => code.assignedAwardId));
}
/** Virtual fulfillment means platform-side content issuance, never external redemption. */
export function isAwardFulfilled(award: MarketingAward) {
  if (award.prizeType === "PHYSICAL") return Boolean(award.fulfilledAt);
  if (award.prizeType !== "VIRTUAL" || !award.issuedAt) return false;
  return award.method === "REDEMPTION_CODE" ? Boolean(award.virtualContent?.code) : award.method === "VIRTUAL_VOUCHER" ? Boolean(award.virtualContent?.name && award.virtualContent.description) : award.method === "LINK" && Boolean(award.virtualContent?.link && validMarketingLink(award.virtualContent.link));
}
export function awardFulfillmentLabel(state: MarketingState, award: MarketingAward, now: number) {
  if (award.prizeType === "VIRTUAL") {
    if (!isAwardFulfilled(award)) return "发放资料待核对";
    const label = award.method === "REDEMPTION_CODE" ? "兑换码已分配" : award.method === "VIRTUAL_VOUCHER" ? "权益已生成" : "领取链接已生成";
    return `${label}${now >= time(award.claimEnd) ? "（已过有效期）" : ""}`;
  }
  if (award.prizeType !== "PHYSICAL") return "奖品类型待核对";
  if (award.fulfilledAt) return award.method === "EXPERIENCE" ? "已履约（体验完成）" : "已领取";
  if (now >= time(award.claimEnd)) return "已过期（占用不返池）";
  if (needsReservation(award)) {
    const booking = state.bookings.find((row) => row.awardId === award.id && row.status === "BOOKED");
    return booking && bookingStatus(booking, slotFor(state, booking), now) === "BOOKED" ? "已预约 / 待领取" : "待预约";
  }
  return "待领取";
}
export function phase(now: number, start: string, end: string) { return !windowValid(start, end) ? "待配置" : now < time(start) ? "未开始" : now >= time(end) ? "已截止" : "有效期内"; }
export function bookingStatus(row: MarketingBooking, slot: MarketingSlot | undefined, now: number) {
  if (["BOOKED", "CHECKED_IN"].includes(row.status) && (!slot || slot.disabled || slot.deleted || !windowValid(slot.startAt, slot.endAt) || !windowValid(slot.checkinStart, slot.checkinEnd))) return "INVALID";
  return row.status === "BOOKED" && slot && now >= time(slot.checkinEnd) ? "NO_SHOW" : row.status;
}
export const bookingLabels: Record<string, string> = { BOOKED: "待到场", CHECKED_IN: "已签到", CANCELED: "已取消", NO_SHOW: "已爽约", FULFILLED: "已履约", INVALID: "已失效 / 场次待核对" };
export function quota(state: MarketingState, activityId: string, item: MarketingPoolItem) {
  const awards = state.awards.filter((row) => row.activityId === activityId && row.poolItemId === item.id);
  const issued = awards.filter(isAwardFulfilled).length;
  return { total: item.quota, occupied: awards.length, held: awards.length - issued, issued, available: Math.max(0, item.quota - awards.length) };
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
  const slots = effectiveFulfillmentSlots(item, now);
  const remainingSlots = slots.reduce((sum, slot) => sum + Math.max(0, slot.capacity - slotOccupancy(state, activityId, "PRIZE", slot.id, item.id)), 0);
  const outstanding = state.awards.filter((row) => row.activityId === activityId && row.poolItemId === item.id && !row.fulfilledAt && now < time(row.claimEnd));
  const unreservedPromises = outstanding.filter((award) => !state.bookings.some((booking) => {
    const slot = item.slots.find((row) => row.id === booking.slotId);
    return booking.awardId === award.id && booking.status === "BOOKED" && slot && !slot.disabled && !slot.deleted && !slotErrors(slot, item.claimStart, item.claimEnd, true).length && now < time(slot.checkinEnd);
  })).length;
  return { remainingSlots, unreservedPromises, availableForNewWins: Math.max(0, remainingSlots - unreservedPromises), shortfall: Math.max(0, unreservedPromises - remainingSlots) };
}
export function winnable(state: MarketingState, activityId: string, item: ActivityPrize, now: number) {
  if (item.prizeType === "UNKNOWN" || !windowValid(item.claimStart, item.claimEnd) || now >= time(item.claimEnd) || item.prizeType === "PHYSICAL" && !["DIRECT", "PICKUP", "EXPERIENCE"].includes(item.method) || item.prizeType === "VIRTUAL" && !["REDEMPTION_CODE", "VIRTUAL_VOUCHER", "LINK"].includes(item.method)) return 0;
  if (item.method === "VIRTUAL_VOUCHER" && (!item.voucherName.trim() || !item.voucherDescription.trim()) || item.method === "LINK" && !validMarketingLink(item.link)) return 0;
  const inventory = quota(state, activityId, item).available;
  if (needsReservation(item)) return Math.min(inventory, fulfillmentCapacity(state, activityId, item, now).availableForNewWins);
  if (item.prizeType === "VIRTUAL" && item.method === "REDEMPTION_CODE") return Math.min(inventory, codeInventory(item).remaining);
  return inventory;
}
function slotErrors(slot: MarketingSlot, start: string, end: string, fulfillment = false) {
  const errors: string[] = [];
  if (typeof slot.label !== "string" || !slot.label.trim() || typeof slot.location !== "string" || !slot.location.trim() || !(fulfillment ? nonnegative(slot.capacity) : positive(slot.capacity))) errors.push(fulfillment ? "履约时段须有名称、地点和合法非负整数容量" : "场次须有名称、地点和正整数容量");
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
  if (item.activityId !== activity.id || !item.id || !nonnegative(item.quota) || !positive(item.perPersonLimit) || !Number.isFinite(item.probability) || item.probability < 0 || item.probability > 100) errors.push("奖品归属须正确，数量须为非负整数，个人上限须为正整数，概率须为0–100的数字");
  if (new Set(item.codes.map((row) => row.code)).size !== item.codes.length || item.codes.some((row) => !row.code.trim() || row.code !== row.code.trim())) errors.push("兑换码不能为空或重复");
  errors.push(...partialWindowError("奖品有效期", item.claimStart, item.claimEnd));
  item.slots.forEach((slot) => {
    if (!nonnegative(slot.capacity)) errors.push("履约时段容量须为合法非负整数");
    errors.push(...partialWindowError("履约时段", slot.startAt, slot.endAt), ...partialWindowError("履约签到窗口", slot.checkinStart, slot.checkinEnd));
  });
  if (!complete) return errors;
  if (!item.name.trim() || !item.label.trim() || !item.description.trim() || !item.instructions.trim()) errors.push("填写奖品名称、奖项、说明及使用说明");
  if (!windowValid(item.claimStart, item.claimEnd) || time(item.claimEnd) < time(activity.lotteryEnd)) errors.push("奖品有效期无效或领取截止早于抽奖截止");
  if (item.prizeType === "PHYSICAL") {
    if (!["DIRECT", "PICKUP", "EXPERIENCE"].includes(item.method) || !item.location.trim()) errors.push("实体奖品须配置实体领取方式和地点");
    if (needsReservation(item)) {
      if (!item.slots.length) errors.push("预约型奖品须配置履约时段");
      item.slots.filter((slot) => !slot.disabled && !slot.deleted).forEach((slot) => errors.push(...slotErrors(slot, item.claimStart, item.claimEnd, true).map((error) => `履约时段「${slot.label || slot.id}」配置错误：${error}`)));
    }
  } else if (item.prizeType === "VIRTUAL") {
    if (!["REDEMPTION_CODE", "VIRTUAL_VOUCHER", "LINK"].includes(item.method)) errors.push("虚拟奖品须配置虚拟发放方式");
    if (item.method === "REDEMPTION_CODE" && item.codes.filter((row) => validMarketingCode(row.code)).length < item.quota) errors.push("兑换码不足：已导入数量不得少于奖品配置数量");
    if (item.method === "VIRTUAL_VOUCHER" && (!item.voucherName.trim() || !item.voucherDescription.trim())) errors.push("填写虚拟凭证名称和说明");
    if (item.method === "LINK" && !validMarketingLink(item.link)) errors.push("领取链接须使用有效的 HTTP / HTTPS 地址");
  } else errors.push("待补充奖品类型，不能发布");
  if (new Set(item.slots.map((slot) => slot.id)).size !== item.slots.length) errors.push("履约场次标识不能重复");
  return errors;
}
export interface MarketingPublishCheck { key: string; label: string; step: number; errors: string[] }
export function publishChecks(activity: MarketingActivity, state: MarketingState, brands: SowindBrandCode[], now = Date.now()): MarketingPublishCheck[] {
  const checks: MarketingPublishCheck[] = [
    { key: "basic", label: "基本信息", step: 0, errors: [] }, { key: "booking", label: "预约配置", step: 1, errors: [] },
    { key: "lottery", label: "抽奖概率与次数", step: 2, errors: [] }, { key: "inventory", label: "实体奖品库存与有效期", step: 3, errors: [] },
    { key: "fulfillment", label: "预约型奖品履约容量", step: 3, errors: [] }, { key: "virtual", label: "虚拟奖品发放内容", step: 3, errors: [] },
    { key: "codes", label: "兑换码数量", step: 3, errors: [] },
  ];
  const errors = checks[0].errors;
  if (!activity.name.trim() || !activity.description.trim() || !brands.includes(activity.brand)) errors.push("填写活动名称、说明及有效授权品牌");
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
    if (!activity.pool.length) errors.push("开启抽奖须配置奖池");
    const probabilities = [activity.noWinProbability, ...activity.pool.map((item) => item.probability)];
    if (probabilities.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) || Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 100) > 0.000001) errors.push("各奖品概率 + 未中奖须合计100%，不接受空值或非数字");
    if (!activity.pool.some((item) => nonnegative(item.quota) && item.quota > 0 && item.probability > 0 && quota(state, activity.id, item).available > 0)) errors.push("发布时须有可中奖概率和可用配额");
    activity.pool.forEach((item) => {
      const completeErrors = prizeErrors(item, activity), target = item.prizeType === "VIRTUAL" ? checks[5] : checks[3];
      completeErrors.forEach((error) => (error.includes("履约时段") || error.includes("预约型奖品") ? checks[4] : error.includes("兑换码不足") ? checks[6] : target).errors.push(error));
      if (needsReservation(item) && !completeErrors.some((error) => error.includes("时段") || error.includes("场次") || error.includes("有效期"))) {
        const capacity = effectiveFulfillmentCapacity(item, now);
        if (capacity < item.quota) checks[4].errors.push(`${item.name}：当前奖品配置数量为 ${item.quota} 份，但可预约履约容量仅为 ${capacity}，请增加至少 ${item.quota - capacity} 个履约名额或降低奖品数量。`);
      }
      if (item.probability > 0 && winnable(state, activity.id, item, now) < 1 && !completeErrors.length) target.errors.push(`${item.name}：中奖概率大于0，发布时必须至少有1个真实可发放单位（库存、有效期、履约容量或未分配兑换码不足）。`);
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
  for (const [label, start, end] of [["活动", activity.startAt, activity.endAt], ["预约", activity.bookingStart, activity.bookingEnd], ["抽奖", activity.lotteryStart, activity.lotteryEnd]]) errors.push(...partialWindowError(label, start, end));
  if (!Number.isFinite(activity.noWinProbability) || activity.noWinProbability < 0 || activity.noWinProbability > 100) errors.push("未中奖概率须为0–100的数字");
  if ([activity.grantCount, activity.drawLimit, activity.winLimit].some((count) => !nonnegative(count)) || activity.dailyLimit !== null && !positive(activity.dailyLimit)) errors.push("次数须为合法非负整数，每日上限须为正整数");
  activity.slots.forEach((slot) => {
    if (!nonnegative(slot.capacity)) errors.push("场次容量须为合法非负整数");
    errors.push(...partialWindowError("活动场次", slot.startAt, slot.endAt), ...partialWindowError("签到窗口", slot.checkinStart, slot.checkinEnd));
  });
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
export function chances(state: MarketingState, row: MarketingParticipation) {
  const earned = state.chances.filter((item) => item.participationId === row.id).reduce((sum, item) => sum + item.count, 0);
  const used = state.draws.filter((item) => item.participationId === row.id).length;
  return { earned, used, remaining: Math.max(0, earned - used) };
}
export function drawBlock(state: MarketingState, activity: MarketingActivity, row: MarketingParticipation | undefined, ctx: MarketingContext) {
  if (activity.status !== "PUBLISHED") return "活动未发布、暂停或取消，不能新抽奖";
  if (!activity.lotteryEnabled) return "本活动未开启抽奖";
  if (!row?.completedAt) return "尚未完成参与，不发放抽奖机会";
  if (participationIssue(row, ctx.members)) return "参与身份引用待核对";
  if (!inWindow(ctx.now, activity.lotteryStart, activity.lotteryEnd)) return "未到抽奖时间或抽奖已截止";
  const balance = chances(state, row), attempts = state.draws.filter((item) => item.participationId === row.id), wins = state.awards.filter((item) => item.participationId === row.id);
  if (!balance.remaining) return "剩余机会为0";
  if (attempts.length >= activity.drawLimit) return "已达到活动累计抽奖上限";
  if (activity.dailyLimit !== null && attempts.filter((item) => shanghaiDate(time(item.occurredAt)) === shanghaiDate(ctx.now)).length >= activity.dailyLimit) return "已达到今日抽奖上限（Asia/Shanghai）";
  if (wins.length >= activity.winLimit) return "已达到累计中奖上限；剩余次数保留但不可再用";
  if (!activity.pool.some((item) => item.probability > 0 && winnable(state, activity.id, item, ctx.now) > 0 && wins.filter((award) => award.poolItemId === item.id).length < item.perPersonLimit)) return "无有效可中奖库存 / 履约容量 / 兑换码 / 概率，不扣次数";
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
  return booking.kind === "ACTIVITY" ? activity?.slots.find((slot) => slot.id === booking.slotId) : activity?.pool.find((item) => item.id === booking.poolItemId)?.slots.find((slot) => slot.id === booking.slotId);
}
export function slotOccupancy(state: MarketingState, activityId: string, kind: "ACTIVITY" | "PRIZE", slotId: string, poolItemId?: string) { return state.bookings.filter((row) => row.activityId === activityId && row.kind === kind && row.slotId === slotId && row.poolItemId === poolItemId && activeBooking(row)).length; }
export function activityMetrics(state: MarketingState, activity: MarketingActivity, now: number) {
  const participants = state.participations.filter((row) => row.activityId === activity.id), draws = state.draws.filter((row) => row.activityId === activity.id), awards = state.awards.filter((row) => row.activityId === activity.id);
  const metrics = [
    { label: "当前有效预约人数", kind: "参与主体", rows: participants.filter((row) => state.bookings.some((booking) => booking.participationId === row.id && booking.kind === "ACTIVITY" && ["BOOKED", "CHECKED_IN"].includes(bookingStatus(booking, slotFor(state, booking), now)))) },
    { label: "到场人数", kind: "参与主体", rows: participants.filter((row) => row.checkedInAt) }, { label: "完成人数", kind: "参与主体", rows: participants.filter((row) => row.completedAt) },
    { label: "抽奖人数", kind: "参与主体", rows: participants.filter((row) => draws.some((draw) => draw.participationId === row.id)) }, { label: "抽奖次数", kind: "抽奖结果（含未中奖）", rows: draws },
    { label: "中奖人数", kind: "参与主体", rows: participants.filter((row) => awards.some((award) => award.participationId === row.id)) }, { label: "中奖份数", kind: "获奖权益", rows: awards }, { label: "已履约份数", kind: "实体领取 / 虚拟平台侧发放（非外部兑换）", rows: awards.filter(isAwardFulfilled) },
  ]; return metrics;
}

/** One action owns validation, result generation, chances and stock. Provider persists once. */
export function executeMarketing(input: MarketingState, command: MarketingCommand, ctx: MarketingContext): MarketingResult {
  const access = ctx.access ?? marketingPermissions(ctx.actor), stamp = new Date(ctx.now).toISOString();
  const management = ["SAVE_ACTIVITY", "STATUS", "COPY_ACTIVITY", "DELETE_ACTIVITY", "ADD_QUOTA", "ADD_PRIZE_SLOT", "SAVE_ACTIVITY_PRIZE", "DELETE_ACTIVITY_PRIZE", "IMPORT_CODES", "DELETE_CODES", "SAVE_ACTIVITY_SLOT", "DELETE_ACTIVITY_SLOT"].includes(command.type);
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
    const basicPrizeErrors = draftActivityErrors(command.activity);
    if (basicPrizeErrors.length) return reject([...new Set(basicPrizeErrors)].join("；"));
    if (new Set(command.activity.pool.map((row) => row.id)).size !== command.activity.pool.length || new Set(command.activity.slots.map((row) => row.id)).size !== command.activity.slots.length) return reject("活动奖品 / 场次标识不能重复");
    const allCodes = state.activities.filter((row) => row.id !== activityId).flatMap((row) => row.pool.flatMap((item) => item.codes.map((code) => code.code))).concat(command.activity.pool.flatMap((item) => item.codes.map((code) => code.code)));
    if (new Set(allCodes).size !== allCodes.length) return reject("兑换码已存在，不允许跨奖品或活动重复导入");
    if (command.activity.pool.some((item) => item.codes.some((code) => code.assignedAwardId && !existing?.pool.find((row) => row.id === item.id)?.codes.some((old) => JSON.stringify(old) === JSON.stringify(code))))) return reject("兑换码分配状态仅由抽奖动作修改");
    if (existing && !assignedCodesPreserved(existing.pool, command.activity.pool)) return reject("已分配兑换码永久保留，不允许删除或修改分配状态");
    if (existing && (existing.publishedAt || hasActivityBusinessData(state, existing.id))) {
      const descriptive = { ...existing, name: command.activity.name, description: command.activity.description, cover: command.activity.cover };
      if (JSON.stringify({ ...command.activity, name: existing.name, description: existing.description, cover: existing.cover }) !== JSON.stringify(existing)) return reject("发布后业务规则锁定；只可改名称、说明、封面。实质变化请复制活动");
      state.activities[state.activities.indexOf(existing)] = descriptive;
    } else { const draft = { ...command.activity, status: "DRAFT" as const, publishedAt: undefined, ruleVersion: 1 }; if (!draft.name.trim()) return reject("填写活动名称"); const index = state.activities.findIndex((row) => row.id === draft.id); if (index < 0) state.activities.push(draft); else state.activities[index] = draft; }
    return done(activityId);
  }
  if (command.type === "CANCEL_BOOKING" || command.type === "RESCHEDULE") {
    const booking = state.bookings.find((row) => row.id === command.bookingId);
    const activity = booking && allowedActivity(booking.activityId);
    if (!booking || !activity || !access.preview) return reject("无权操作预约"); activityId = activity.id; targetId = booking.id;
    const participation = state.participations.find((row) => row.id === booking.participationId);
    if (!participation || participationIssue(participation, ctx.members)) return reject("参与身份引用待核对");
    if (booking.status !== "BOOKED" || bookingStatus(booking, slotFor(state, booking), ctx.now) !== "BOOKED") return reject("已签到、取消、爽约或已履约，不能自行取消 / 改约");
    if (booking.kind === "ACTIVITY" && (participation.checkedInAt || participation.completedAt)) return reject("参与主体已签到 / 完成，不能自行取消或改约");
    if (booking.kind === "ACTIVITY" && !(command.type === "CANCEL_BOOKING" ? activity.allowCancel : activity.allowReschedule)) return reject("本活动不允许用户取消 / 改约");
    const oldSlot = slotFor(state, booking); if (!oldSlot || ctx.now >= time(oldSlot.bookingClosesAt)) return reject("预约截止已到，不能取消 / 改约");
    if (command.type === "CANCEL_BOOKING") { booking.status = "CANCELED"; booking.canceledAt = stamp; return done(booking.id, "取消预约，释放时段；获奖资格保留"); }
    const slots = booking.kind === "ACTIVITY" ? activity.slots : activity.pool.find((item) => item.id === booking.poolItemId)?.slots;
    const target = slots?.find((slot) => slot.id === command.slotId);
    const item = activity.pool.find((item) => item.id === booking.poolItemId);
    if (!target || target.disabled || target.deleted || slotErrors(target, booking.kind === "ACTIVITY" ? activity.startAt : item?.claimStart || "", booking.kind === "ACTIVITY" ? activity.endAt : item?.claimEnd || "", booking.kind === "PRIZE").length || ctx.now >= time(target.bookingClosesAt) || (target.id !== booking.slotId && slotOccupancy(state, activity.id, booking.kind, target.id, booking.poolItemId) >= target.capacity)) return reject("目标场次无效、已截止或满额，原预约保留");
    if (booking.kind === "ACTIVITY" && (activity.status !== "PUBLISHED" || !inWindow(ctx.now, activity.bookingStart, activity.bookingEnd))) return reject("活动暂停 / 取消或预约未开放，不能改约");
    if (booking.kind === "PRIZE") { const award = state.awards.find((row) => row.id === booking.awardId); if (!award || !inWindow(ctx.now, award.claimStart, award.claimEnd)) return reject("获奖权益不在领取有效期内"); if (activity.status === "PAUSED") return reject("活动暂停，停止新的领奖预约 / 改约；既有权益与预约保留"); }
    booking.status = "CANCELED"; booking.canceledAt = stamp;
    state.bookings.push({ ...booking, id: id(), status: "BOOKED", slotId: target.id, createdAt: stamp, canceledAt: undefined }); return done(booking.participationId, "改约成功，保留原取消记录");
  }
  if (command.type === "BOOK_PRIZE") {
    const award = state.awards.find((row) => row.id === command.awardId), activity = award && allowedActivity(award.activityId);
    if (!award || !activity || !access.preview) return reject("无权预约此权益"); activityId = activity.id; targetId = award.id;
    const participation = state.participations.find((row) => row.id === award.participationId);
    if (!participation || participationIssue(participation, ctx.members)) return reject("参与身份引用待核对");
    if (award.fulfilledAt || !needsReservation(award) || !inWindow(ctx.now, award.claimStart, award.claimEnd)) return reject("权益已履约、不需预约或不在有效期内");
    const existing = state.bookings.find((row) => row.awardId === award.id && activeBooking(row));
    if (existing) return existing.slotId === command.slotId ? { state: input, ok: true, resultId: existing.id } : reject("已有有效奖品预约，请改约或取消");
    if (activity.status === "PAUSED") return reject("活动暂停，停止新的领奖预约；已有领奖预约仍可履约，中奖权益保留");
    const item = activity.pool.find((row) => row.id === award.poolItemId), slot = item?.slots.find((row) => row.id === command.slotId);
    if (!slot || !item || !effectiveFulfillmentSlots(item, ctx.now).some((row) => row.id === slot.id) || slotOccupancy(state, activity.id, "PRIZE", slot.id, item.id) >= slot.capacity) return reject("奖品时段无效、已满或已截止");
    const bookingId = id(); state.bookings.push({ id: bookingId, activityId: activity.id, participationId: award.participationId, kind: "PRIZE", poolItemId: award.poolItemId, awardId: award.id, slotId: slot.id, status: "BOOKED", createdAt: stamp, source: "USER" }); return done(bookingId);
  }
  if (command.type === "VERIFY") {
    if (!access.redeem) return reject("无权执行核销");
    const token = resolveCredential(state, command.credential, ctx); if (token.error || !token.activity || !token.participation) return reject(token.error ?? "凭证无效");
    const { activity, participation, award } = token; activityId = activity.id; targetId = award?.id ?? participation.id;
    redemptionTarget = { participationId: participation.id, awardId: award?.id, credential: command.credential, type: command.action === "CLAIM" ? award?.method === "EXPERIENCE" ? "EXPERIENCE_CLAIM" : "PRIZE_CLAIM" : command.action };
    if (command.action === "CLAIM") {
      if (!award) return reject("这是活动凭证，不是奖品领取凭证");
      if (award.prizeType !== "PHYSICAL") return reject("虚拟奖品或待确认类型不由现场核销端发放");
      if (award.fulfilledAt) return { state: input, ok: true, resultId: award.id };
      if (!inWindow(ctx.now, award.claimStart, award.claimEnd)) return reject("奖品尚未到有效期或已过期，占用配额不退回");
      let location = award.location;
      let booking: MarketingBooking | undefined;
      if (needsReservation(award)) {
        booking = state.bookings.find((row) => row.awardId === award.id && row.status === "BOOKED"); const slot = booking && slotFor(state, booking);
        if (!booking || !slot || slot.disabled || slot.deleted || command.slotId !== slot.id || !inWindow(ctx.now, slot.checkinStart, slot.checkinEnd)) return reject("需要有效奖品预约且在对应履约场次窗口，不能直接发放"); location = slot.location;
      }
      if (command.location !== location) return reject("核销地点不符");
      award.fulfilledAt = stamp; if (booking) booking.status = "FULFILLED"; recordRedemption(redemptionTarget.type, "SUCCESS", "实体权益已履约"); return done(award.id, "奖品履约，占用转已发放，不二次扣配额");
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
  if (command.type === "STATUS") {
    if (command.status === "PUBLISHED") { if (activity.status === "CANCELED") return reject("取消后不能恢复，请复制为新活动"); const errors = activity.publishedAt ? [] : validateActivity(activity, state, access.brands, ctx.now); if (errors.length) return reject(errors.join("；")); activity.publishedAt ??= stamp; }
    if (command.status === "PAUSED" && activity.status !== "PUBLISHED") return reject("只有已发布活动可暂停");
    if (command.status === "DRAFT") return reject("发布状态不能退回草稿");
    activity.status = command.status;
    if (command.status === "CANCELED") state.bookings.forEach((row) => { if (row.activityId === activity.id && row.kind === "ACTIVITY" && row.status === "BOOKED") { row.status = "CANCELED"; row.canceledAt = stamp; } });
    return done(activity.id, "发布状态变更；既有获奖权益及奖品预约保留");
  }
  if (command.type === "SAVE_ACTIVITY_PRIZE") {
    const item = command.prize, old = activity.pool.find((row) => row.id === item.id);
    const errors = prizeErrors(item, activity, Boolean(activity.publishedAt));
    if (errors.length) return reject([...new Set(errors)].join("；"));
    if (old && !assignedCodesPreserved([old], [item])) return reject("已分配兑换码永久保留，不允许删除或修改分配状态");
    if (activity.publishedAt || hasActivityBusinessData(state, activity.id)) {
      if (!old || JSON.stringify({ ...item, name: old.name, label: old.label, description: old.description, image: old.image, instructions: old.instructions }) !== JSON.stringify(old)) return reject("发布后奖品规则锁定；名称、图片、说明可更新，其他变化请复制活动");
    }
    if (item.codes.some((code) => code.assignedAwardId && !old?.codes.some((row) => JSON.stringify(row) === JSON.stringify(code)))) return reject("不允许修改兑换码分配状态");
    const codes = state.activities.flatMap((row) => row.pool.filter((prize) => row.id !== activity.id || prize.id !== item.id).flatMap((prize) => prize.codes.map((code) => code.code))).concat(item.codes.map((code) => code.code));
    if (new Set(codes).size !== codes.length) return reject("兑换码已存在，不允许重复导入");
    if (old) activity.pool[activity.pool.indexOf(old)] = structuredClone(item); else activity.pool.push(structuredClone(item));
    return done(item.id, "保存当前活动的独立奖品，不覆盖历史中奖快照");
  }
  if (command.type === "DELETE_ACTIVITY_PRIZE") {
    if (activity.publishedAt || state.draws.some((row) => row.activityId === activity.id && row.poolItemId === command.poolItemId) || state.awards.some((row) => row.activityId === activity.id && row.poolItemId === command.poolItemId)) return reject("已发布或已产生业务数据的活动奖品不能删除");
    activity.pool = activity.pool.filter((row) => row.id !== command.poolItemId); return done(command.poolItemId);
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
    if ((activity.publishedAt || activity.status !== "DRAFT") && codeInventory({ ...item, codes: retained }).remaining < quota(state, activity.id, item).available) return reject("删除后剩余兑换码不足以覆盖当前剩余奖品配额。");
    item.codes = retained; return done(item.id, `删除 ${selected.size} 个未分配兑换码，已分配代码及历史权益保持不变`);
  }
  if (command.type === "SAVE_ACTIVITY_SLOT" || command.type === "DELETE_ACTIVITY_SLOT") {
    const slotId = command.type === "SAVE_ACTIVITY_SLOT" ? command.slot.id : command.slotId;
    const old = activity.slots.find((row) => row.id === slotId);
    const used = state.bookings.some((row) => row.activityId === activity.id && row.kind === "ACTIVITY" && row.slotId === slotId);
    if (!activity.bookingEnabled || activity.status === "CANCELED") return reject("未开启预约或活动已取消，不能调整场次");
    if (command.type === "DELETE_ACTIVITY_SLOT") {
      if (used) return reject("已有预约历史的场次不能删除");
      activity.slots = activity.slots.filter((row) => row.id !== slotId); return done(slotId, "删除未使用的活动场次");
    }
    const errors = slotErrors(command.slot, activity.startAt, activity.endAt);
    if (errors.length) return reject(errors.join("；"));
    if (command.slot.capacity < slotOccupancy(state, activity.id, "ACTIVITY", slotId)) return reject("场次容量不能低于已有有效预约人数");
    if (used && old && JSON.stringify({ ...command.slot, capacity: old.capacity, label: old.label }) !== JSON.stringify(old)) return reject("已有预约的场次仅可改名称与安全容量；地点和时间不覆盖既有预约");
    if (old) activity.slots[activity.slots.indexOf(old)] = structuredClone(command.slot); else activity.slots.push(structuredClone(command.slot));
    return done(slotId, "调整活动场次，保留预约历史");
  }
  if (command.type === "COPY_ACTIVITY") {
    const copyId = id();
    const copySlot = (slot: MarketingSlot) => ({ ...slot, id: id(), startAt: "", endAt: "", bookingClosesAt: "", checkinStart: "", checkinEnd: "" });
    const copy = { ...activity, id: copyId, name: `${activity.name} · 副本`, status: "DRAFT" as const, createdAt: stamp, publishedAt: undefined, ruleVersion: 1, startAt: "", endAt: "", bookingStart: "", bookingEnd: "", lotteryStart: "", lotteryEnd: "", slots: activity.slots.map(copySlot), pool: activity.pool.map((item) => ({ ...item, id: id(), activityId: copyId, claimStart: "", claimEnd: "", codes: [], slots: item.slots.map(copySlot) })) };
    state.activities.push(copy); return done(copy.id, "仅复制配置结构；所有日期须重新填写，兑换码须重新导入，无业务记录或库存占用");
  }
  if (command.type === "DELETE_ACTIVITY") { if (!canDeleteDraft(state, activity)) return reject("仅无任何业务记录、无已分配兑换码的未发布草稿可删除；其他活动请取消并保留历史权益"); state.activities = state.activities.filter((row) => row.id !== activity.id); return done(activity.id, "删除未使用草稿及其配置；操作审计保留"); }
  if (command.type === "ADD_QUOTA") {
    const item = activity.pool.find((row) => row.id === command.poolItemId);
    if (!item || !positive(command.count) || !Number.isSafeInteger(item.quota + command.count)) return reject("追加配额须为安全正整数");
    const proposed = { ...item, quota: item.quota + command.count }, errors = prizeErrors(proposed, activity, true);
    if (errors.length || ctx.now >= time(item.claimEnd)) return reject(errors.join("；") || "奖品已过有效期，不能追加配额");
    if (needsReservation(item) && (effectiveFulfillmentCapacity(item, ctx.now) < proposed.quota || fulfillmentCapacity(state, activity.id, item, ctx.now).availableForNewWins < quota(state, activity.id, item).available + command.count)) return reject("追加后履约容量不足，请先追加合法履约时段再增加配额");
    if (item.method === "REDEMPTION_CODE" && codeInventory(item).remaining < quota(state, activity.id, item).available + command.count) return reject("兑换码不足，先导入兑换码再增加配额");
    item.quota = proposed.quota; return done(item.id, `有记录追加配额 ${command.count}；已校验发放资料及有效履约容量`);
  }
  if (command.type === "ADD_PRIZE_SLOT") { const item = activity.pool.find((row) => row.id === command.poolItemId); if (!item || !needsReservation(item) || item.slots.some((slot) => slot.id === command.slot.id)) return reject("奖品无需预约或时段重复"); const errors = slotErrors(command.slot, item.claimStart, item.claimEnd, true); if (errors.length) return reject(errors.join("；")); if (ctx.now >= time(command.slot.startAt) || command.slot.disabled || command.slot.deleted) return reject("仅可追加合法未来履约时段"); item.slots.push(command.slot); return done(item.id, "追加履约时段；已有时段不削减或删除"); }
  if (!(command.type === "REGISTER" && command.walkIn ? access.redeem : access.preview)) return reject("无权操作参与流程");
  const identity = participationFor(state, activity, ctx.members, command.userId);
  if (identity.error || !identity.user || !identity.subjectKey) return reject(identity.error ?? "会员引用无效");
  let participation = identity.participation;
  if (participation && participationIssue(participation, ctx.members)) return reject("参与身份引用待核对，不能继续报名或抽奖");
  targetId = participation?.id ?? activity.id;
  const rememberIdentity = (row: MarketingParticipation) => { if (!row.identities.some((ref) => ref.userId === identity.user!.id)) row.identities.push({ userId: identity.user!.id, brand: identity.user!.brand, openid: identity.user!.openid, unionid: identity.user!.unionid }); };
  if (command.type === "DRAW") {
    if (!command.operationId.trim()) return reject("抽奖请求缺少操作标识");
    const saved = state.draws.find((row) => row.operationId === command.operationId);
    if (saved) return saved.activityId === activity.id && saved.participationId === participation?.id ? { state: input, ok: true, resultId: saved.id } : reject("操作标识已用于其他请求，不返回其结果");
    const reason = drawBlock(state, activity, participation, ctx); if (reason || !participation) return reject(reason);
    let random: number;
    try { random = (ctx.random ?? Math.random)(); } catch { return reject("随机源失败，未生成结果或扣次数"); }
    if (!Number.isFinite(random) || random < 0 || random >= 1) return reject("随机源无效，未扣次数");
    rememberIdentity(participation);
    const wins = state.awards.filter((row) => row.participationId === participation!.id);
    let cursor = 0; let winner: MarketingPoolItem | undefined;
    for (const item of activity.pool) { cursor += item.probability; if (random * 100 < cursor) { if (winnable(state, activity.id, item, ctx.now) > 0 && wins.filter((row) => row.poolItemId === item.id).length < item.perPersonLimit) winner = item; break; } }
    const drawId = id(); state.draws.push({ id: drawId, operationId: command.operationId, activityId: activity.id, participationId: participation.id, occurredAt: stamp, poolItemId: winner?.id ?? null, randomValue: random, ruleVersion: participation.ruleVersion });
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
      state.awards.push({ id: awardId, drawId, participationId: participation.id, activityId: activity.id, poolItemId: winner.id, credential: `WIN-${id()}`, prizeName: winner.name, awardLabel: winner.label, prizeType: winner.prizeType, image: winner.image, description: winner.description, method: winner.method, location: winner.prizeType === "PHYSICAL" ? winner.location : "", instructions: winner.instructions, claimStart: winner.claimStart, claimEnd: winner.claimEnd, virtualContent, issuedAt: winner.prizeType === "VIRTUAL" ? stamp : undefined, ruleVersion: participation.ruleVersion, wonAt: stamp });
    }
    return done(drawId, winner ? "中奖已占用本活动配额" : "未中奖，有效消耗一次机会；不可用奖品概率转入未中奖");
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
  if (!participation) { participation = { id: id(), activityId: activity.id, subjectKey: identity.subjectKey, identities: [], credential: `ACT-${id()}`, registeredAt: stamp, ruleVersion: activity.ruleVersion }; state.participations.push(participation); }
  if (!participation.identities.some((ref) => ref.userId === identity.user!.id)) participation.identities.push({ userId: identity.user.id, brand: identity.user.brand, openid: identity.user.openid, unionid: identity.user.unionid });
  if (activity.bookingEnabled) state.bookings.push({ id: id(), activityId: activity.id, participationId: participation.id, kind: "ACTIVITY", slotId: command.slotId!, status: "BOOKED", createdAt: stamp, source: command.walkIn ? "WALK_IN" : "USER" });
  return done(participation.id, "报名 / 预约不发放抽奖机会");
}
