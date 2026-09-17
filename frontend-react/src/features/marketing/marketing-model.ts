import type { DemoUser } from "@/types/crm";
import type { MemberOperationsState, SowindBrandCode, SowindBrandUser } from "@/types/member-operations";
import type { MarketingActivity, MarketingAward, MarketingBooking, MarketingParticipation, MarketingPoolItem, MarketingPrize, MarketingSlot, MarketingState, MarketingStatus } from "@/types/marketing";
import { memberAccess, parseCreatedAt, shanghaiDate } from "@/features/dashboard/dashboard-model";

export interface MarketingPermissions { brands: SowindBrandCode[]; manage: boolean; redeem: boolean; preview: boolean }
export function marketingPermissions(actor: DemoUser): MarketingPermissions { const brands = memberAccess(actor).brands; return { brands, manage: actor.role === "HQ_ADMIN", redeem: actor.role === "HQ_ADMIN", preview: actor.role === "HQ_ADMIN" }; }
export interface MarketingContext { actor: DemoUser; members: MemberOperationsState; now: number; random?: () => number; id?: () => string; access?: MarketingPermissions }
export type MarketingCommand =
  | { type: "SAVE_ACTIVITY"; activity: MarketingActivity }
  | { type: "STATUS"; activityId: string; status: MarketingStatus }
  | { type: "COPY_ACTIVITY"; activityId: string }
  | { type: "DELETE_ACTIVITY"; activityId: string }
  | { type: "SAVE_PRIZE"; prize: MarketingPrize }
  | { type: "DELETE_PRIZE"; prizeId: string }
  | { type: "ADD_QUOTA"; activityId: string; poolItemId: string; count: number }
  | { type: "ADD_PRIZE_SLOT"; activityId: string; poolItemId: string; slot: MarketingSlot }
  | { type: "REGISTER"; activityId: string; userId: string; slotId?: string; walkIn?: boolean }
  | { type: "CANCEL_BOOKING"; bookingId: string }
  | { type: "RESCHEDULE"; bookingId: string; slotId: string }
  | { type: "DRAW"; activityId: string; userId: string; operationId: string }
  | { type: "BOOK_PRIZE"; awardId: string; slotId: string }
  | { type: "VERIFY"; credential: string; action: "CHECKIN" | "COMPLETE" | "CLAIM"; location: string; slotId?: string };
export interface MarketingResult { state: MarketingState; ok: boolean; error?: string; resultId?: string }
const time = parseCreatedAt;
const positive = (value: number) => Number.isInteger(value) && value > 0;
const nonnegative = (value: number) => Number.isInteger(value) && value >= 0;
const windowValid = (start: string, end: string) => Number.isFinite(time(start)) && Number.isFinite(time(end)) && time(start) < time(end);
const inWindow = (now: number, start: string, end: string) => now >= time(start) && now < time(end);
const activeBooking = (row: MarketingBooking) => ["BOOKED", "CHECKED_IN", "FULFILLED"].includes(row.status);
export const claimLabels = { DIRECT: "直接现场领取", PICKUP: "预约后领取", EXPERIENCE: "预约后体验" };
export const marketingStatusLabels = { DRAFT: "草稿", PUBLISHED: "已发布", PAUSED: "暂停", CANCELED: "已取消" };
export function phase(now: number, start: string, end: string) { return now < time(start) ? "未开始" : now >= time(end) ? "已截止" : "有效期内"; }
export function bookingStatus(row: MarketingBooking, slot: MarketingSlot | undefined, now: number) { return row.status === "BOOKED" && slot && now >= time(slot.checkinEnd) ? "NO_SHOW" : row.status; }
export const bookingLabels: Record<string, string> = { BOOKED: "待到场", CHECKED_IN: "已签到", CANCELED: "已取消", NO_SHOW: "已爽约", FULFILLED: "已履约" };
export function quota(state: MarketingState, activityId: string, item: MarketingPoolItem) {
  const awards = state.awards.filter((row) => row.activityId === activityId && row.poolItemId === item.id);
  const issued = awards.filter((row) => row.fulfilledAt).length;
  return { total: item.quota, held: awards.length - issued, issued, available: Math.max(0, item.quota - awards.length) };
}
function slotErrors(slot: MarketingSlot, start: string, end: string) {
  const errors: string[] = [];
  if (!slot.label.trim() || !slot.location.trim() || !positive(slot.capacity)) errors.push("场次须有名称、地点和正整数容量");
  if (!windowValid(slot.startAt, slot.endAt) || time(slot.startAt) < time(start) || time(slot.endAt) > time(end)) errors.push("场次须落在对应活动 / 奖品有效期内");
  if (!Number.isFinite(time(slot.bookingClosesAt)) || time(slot.bookingClosesAt) > time(slot.startAt)) errors.push("预约截止不得晚于场次开始");
  if (!windowValid(slot.checkinStart, slot.checkinEnd) || time(slot.checkinStart) > time(slot.startAt) || time(slot.checkinEnd) < time(slot.endAt)) errors.push("签到窗口须覆盖场次，宽限通过窗口明确配置");
  return errors;
}
export function validateActivity(activity: MarketingActivity, state: MarketingState, brands: SowindBrandCode[]): string[] {
  const errors: string[] = [];
  if (!activity.name.trim() || !activity.description.trim() || !brands.includes(activity.brand)) errors.push("填写活动名称、说明及有效授权品牌");
  if (!windowValid(activity.startAt, activity.endAt)) errors.push("活动起止时间无效");
  if (activity.mode === "OFFLINE" && !activity.location.trim()) errors.push("线下活动须填写地点");
  if (activity.completion === "CHECKIN" && activity.mode !== "OFFLINE") errors.push("到场即完成仅适用于线下活动");
  if (activity.bookingEnabled) {
    if (!windowValid(activity.bookingStart, activity.bookingEnd) || time(activity.bookingEnd) > time(activity.endAt)) errors.push("预约开放期无效或超过活动结束");
    if (!activity.slots.length) errors.push("开启预约须配置活动场次");
    activity.slots.forEach((slot) => errors.push(...slotErrors(slot, activity.startAt, activity.endAt)));
  }
  if (activity.lotteryEnabled) {
    if (!windowValid(activity.lotteryStart, activity.lotteryEnd) || time(activity.lotteryEnd) < time(activity.endAt)) errors.push("抽奖截止不得早于活动结束");
    if (!positive(activity.grantCount) || !positive(activity.drawLimit) || !positive(activity.winLimit) || activity.grantCount > activity.drawLimit || (activity.dailyLimit !== null && !positive(activity.dailyLimit))) errors.push("次数 / 中奖上限须为正整数，发放次数不得超过累计上限");
    if (!activity.pool.length) errors.push("开启抽奖须配置奖池");
    const probabilities = [activity.noWinProbability, ...activity.pool.map((item) => item.probability)];
    if (probabilities.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) || Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 100) > 0.000001) errors.push("各奖品概率 + 未中奖须合计100%，不接受空值或非数字");
    if (!activity.pool.some((item) => nonnegative(item.quota) && item.quota > 0 && item.probability > 0 && quota(state, activity.id, item).available > 0)) errors.push("发布时须有可中奖概率和可用配额");
    activity.pool.forEach((item) => {
      if (!state.prizes.some((prize) => prize.id === item.prizeId) || !item.label.trim() || !item.location.trim() || !item.instructions.trim() || !nonnegative(item.quota) || !positive(item.perPersonLimit)) errors.push("奖池须引用奖品并填写名称、地点、领取说明、非负配额及正整数个人上限");
      if (!windowValid(item.claimStart, item.claimEnd) || time(item.claimEnd) < time(activity.lotteryEnd)) errors.push("奖品有效期无效或领取截止早于抽奖截止");
      if (item.method !== "DIRECT") {
        if (!item.slots.length || item.slots.reduce((sum, slot) => sum + slot.capacity, 0) < item.quota) errors.push("预约型奖品总履约容量不得小于配额");
        item.slots.forEach((slot) => errors.push(...slotErrors(slot, item.claimStart, item.claimEnd)));
      }
    });
  }
  if (new Set(activity.slots.map((slot) => slot.id)).size !== activity.slots.length || new Set(activity.pool.map((item) => item.id)).size !== activity.pool.length || new Set(activity.pool.map((item) => item.prizeId)).size !== activity.pool.length || activity.pool.some((item) => new Set(item.slots.map((slot) => slot.id)).size !== item.slots.length)) errors.push("场次 / 奖池标识不能重复，同一奖品在活动奖池只配置一次");
  return [...new Set(errors)];
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
  if (!activity.pool.some((item) => item.probability > 0 && quota(state, activity.id, item).available > 0 && wins.filter((award) => award.poolItemId === item.id).length < item.perPersonLimit)) return "无有效可中奖库存 / 概率，不扣次数";
  return "";
}
export function resolveCredential(state: MarketingState, credential: string, ctx: MarketingContext) {
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
    { label: "中奖人数", kind: "参与主体", rows: participants.filter((row) => awards.some((award) => award.participationId === row.id)) }, { label: "中奖份数", kind: "获奖权益", rows: awards }, { label: "已履约份数", kind: "获奖权益", rows: awards.filter((row) => row.fulfilledAt) },
  ]; return metrics;
}

/** One action owns validation, result generation, chances and stock. Provider persists once. */
export function executeMarketing(input: MarketingState, command: MarketingCommand, ctx: MarketingContext): MarketingResult {
  const access = ctx.access ?? marketingPermissions(ctx.actor), stamp = new Date(ctx.now).toISOString();
  const id = ctx.id ?? (() => crypto.randomUUID());
  let activityId: string | undefined;
  let targetId = "";
  let state = structuredClone(input);
  const audit = (result: "SUCCESS" | "REJECTED", detail: string, targetId = "") => { state.revision++; state.audits.push({ id: id(), activityId, action: command.type === "VERIFY" ? command.action : command.type, targetId, actorId: ctx.actor.id, occurredAt: stamp, result, detail }); };
  const reject = (error: string): MarketingResult => { if (activityId) { state = structuredClone(input); audit("REJECTED", error, targetId || activityId); } else state = input; return { state, ok: false, error }; };
  const done = (resultId?: string, detail = "操作完成"): MarketingResult => { audit("SUCCESS", detail, resultId); return { state, ok: true, resultId }; };
  const allowedActivity = (target: string) => state.activities.find((row) => row.id === target && access.brands.includes(row.brand));
  if (command.type === "SAVE_PRIZE" || command.type === "DELETE_PRIZE") {
    if (!access.manage || !access.brands.length) return reject("无权管理奖品库");
    if (command.type === "DELETE_PRIZE") { if (state.activities.some((row) => row.pool.some((item) => item.prizeId === command.prizeId))) return reject("已被活动引用的奖品不能删除"); state.prizes = state.prizes.filter((row) => row.id !== command.prizeId); return done(command.prizeId); }
    if (!command.prize.name.trim() || !command.prize.description.trim()) return reject("填写奖品名称和说明");
    const index = state.prizes.findIndex((row) => row.id === command.prize.id); if (index < 0) state.prizes.push(command.prize); else state.prizes[index] = command.prize; return done(command.prize.id);
  }
  if (command.type === "SAVE_ACTIVITY") {
    if (!access.manage || !access.brands.includes(command.activity.brand)) return reject("无权编辑此品牌活动");
    const existing = state.activities.find((row) => row.id === command.activity.id);
    if (existing && !access.brands.includes(existing.brand)) return reject("无权编辑活动");
    activityId = command.activity.id;
    if (existing?.publishedAt) {
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
    const oldSlot = slotFor(state, booking); if (!oldSlot || ctx.now >= time(oldSlot.bookingClosesAt)) return reject("预约截止已到，不能取消 / 改约");
    if (command.type === "CANCEL_BOOKING") { booking.status = "CANCELED"; booking.canceledAt = stamp; return done(booking.id, "取消预约，释放时段；获奖资格保留"); }
    const slots = booking.kind === "ACTIVITY" ? activity.slots : activity.pool.find((item) => item.id === booking.poolItemId)?.slots;
    const target = slots?.find((slot) => slot.id === command.slotId);
    if (!target || ctx.now >= time(target.bookingClosesAt) || (target.id !== booking.slotId && slotOccupancy(state, activity.id, booking.kind, target.id, booking.poolItemId) >= target.capacity)) return reject("目标场次已截止或满额，原预约保留");
    if (booking.kind === "ACTIVITY" && (activity.status !== "PUBLISHED" || !inWindow(ctx.now, activity.bookingStart, activity.bookingEnd))) return reject("活动暂停 / 取消或预约未开放，不能改约");
    if (booking.kind === "PRIZE") { const award = state.awards.find((row) => row.id === booking.awardId); if (!award || !inWindow(ctx.now, award.claimStart, award.claimEnd)) return reject("获奖权益不在领取有效期内"); }
    booking.status = "CANCELED"; booking.canceledAt = stamp;
    state.bookings.push({ ...booking, id: id(), status: "BOOKED", slotId: target.id, createdAt: stamp, canceledAt: undefined }); return done(booking.participationId, "改约成功，保留原取消记录");
  }
  if (command.type === "BOOK_PRIZE") {
    const award = state.awards.find((row) => row.id === command.awardId), activity = award && allowedActivity(award.activityId);
    if (!award || !activity || !access.preview) return reject("无权预约此权益"); activityId = activity.id; targetId = award.id;
    const participation = state.participations.find((row) => row.id === award.participationId);
    if (!participation || participationIssue(participation, ctx.members)) return reject("参与身份引用待核对");
    if (award.fulfilledAt || award.method === "DIRECT" || !inWindow(ctx.now, award.claimStart, award.claimEnd)) return reject("权益已履约、不需预约或不在有效期内");
    const existing = state.bookings.find((row) => row.awardId === award.id && activeBooking(row));
    if (existing) return existing.slotId === command.slotId ? { state: input, ok: true, resultId: existing.id } : reject("已有有效奖品预约，请改约或取消");
    const item = activity.pool.find((row) => row.id === award.poolItemId), slot = item?.slots.find((row) => row.id === command.slotId);
    if (!slot || ctx.now >= time(slot.bookingClosesAt) || slotOccupancy(state, activity.id, "PRIZE", slot.id, item?.id) >= slot.capacity) return reject("奖品时段已满或已截止");
    const bookingId = id(); state.bookings.push({ id: bookingId, activityId: activity.id, participationId: award.participationId, kind: "PRIZE", poolItemId: award.poolItemId, awardId: award.id, slotId: slot.id, status: "BOOKED", createdAt: stamp }); return done(bookingId);
  }
  if (command.type === "VERIFY") {
    if (!access.redeem) return reject("无权执行核销");
    const token = resolveCredential(state, command.credential, ctx); if (token.error || !token.activity || !token.participation) return reject(token.error ?? "凭证无效");
    const { activity, participation, award } = token; activityId = activity.id; targetId = award?.id ?? participation.id;
    if (command.action === "CLAIM") {
      if (!award) return reject("这是活动凭证，不是奖品领取凭证");
      if (award.fulfilledAt) return { state: input, ok: true, resultId: award.id };
      if (!inWindow(ctx.now, award.claimStart, award.claimEnd)) return reject("奖品尚未到有效期或已过期，占用配额不退回");
      let location = award.location;
      let booking: MarketingBooking | undefined;
      if (award.method !== "DIRECT") {
        booking = state.bookings.find((row) => row.awardId === award.id && row.status === "BOOKED"); const slot = booking && slotFor(state, booking);
        if (!booking || !slot || command.slotId !== slot.id || !inWindow(ctx.now, slot.checkinStart, slot.checkinEnd)) return reject("需要有效奖品预约且在对应履约场次窗口，不能直接发放"); location = slot.location;
      }
      if (command.location !== location) return reject("核销地点不符");
      award.fulfilledAt = stamp; if (booking) booking.status = "FULFILLED"; return done(award.id, "奖品履约，占用转已发放，不二次扣配额");
    }
    if (award) return reject("这是奖品凭证，不能签到 / 确认活动完成");
    const booking = state.bookings.find((row) => row.participationId === participation.id && row.kind === "ACTIVITY" && ["BOOKED", "CHECKED_IN"].includes(row.status));
    const slot = booking && slotFor(state, booking);
    if (command.action === "CHECKIN") {
      if (participation.checkedInAt) return { state: input, ok: true, resultId: participation.id };
      if (activity.mode !== "OFFLINE") return reject("线上活动无入场签到，使用工作人员确认完成");
      if (activity.status === "DRAFT" || activity.status === "CANCELED") return reject("活动未发布 / 已取消，不能新签到");
      if (activity.bookingEnabled && (!booking || !slot || command.slotId !== slot.id || !inWindow(ctx.now, slot.checkinStart, slot.checkinEnd))) return reject("预约不存在、取消、场次不符或签到窗口已关闭，不能签到");
      if (!activity.bookingEnabled && !inWindow(ctx.now, activity.startAt, activity.endAt)) return reject("不在活动签到时间内");
      if (command.location !== (slot?.location ?? activity.location)) return reject("签到地点不符");
      participation.checkedInAt = stamp; if (booking) booking.status = "CHECKED_IN";
      if (activity.completion !== "CHECKIN") return done(participation.id, "签到完成，尚未确认参与完成，不发次数");
    } else {
      if (participation.completedAt) return { state: input, ok: true, resultId: participation.id };
      if (activity.status === "DRAFT" || (activity.status === "CANCELED" && !participation.checkedInAt)) return reject("活动未发布 / 取消且尚未到场，不能确认完成");
      if (activity.mode === "OFFLINE" && !participation.checkedInAt) return reject("线下须先签到，再确认完成");
      if (activity.mode === "ONLINE" && !inWindow(ctx.now, activity.startAt, activity.endAt)) return reject("不在活动举行期内");
      if (activity.mode === "OFFLINE" && command.location !== (slot?.location ?? activity.location)) return reject("完成确认地点不符");
    }
    participation.completedAt = stamp; participation.completionActorId = ctx.actor.id;
    if (activity.lotteryEnabled && !state.chances.some((row) => row.participationId === participation.id)) state.chances.push({ id: id(), activityId: activity.id, participationId: participation.id, count: activity.grantCount, grantedAt: stamp, ruleVersion: participation.ruleVersion });
    return done(participation.id, "首次完成，按锁定规则一次发放机会");
  }
  const activity = allowedActivity(command.activityId);
  if (!activity) return reject("活动不存在或不在品牌授权范围"); activityId = activity.id;
  if (["STATUS", "COPY_ACTIVITY", "DELETE_ACTIVITY", "ADD_QUOTA", "ADD_PRIZE_SLOT"].includes(command.type) && !access.manage) return reject("无权管理活动规则");
  if (command.type === "STATUS") {
    if (command.status === "PUBLISHED") { if (activity.status === "CANCELED") return reject("取消后不能恢复，请复制为新活动"); const errors = activity.publishedAt ? [] : validateActivity(activity, state, access.brands); if (errors.length) return reject(errors.join("；")); activity.publishedAt ??= stamp; }
    if (command.status === "PAUSED" && activity.status !== "PUBLISHED") return reject("只有已发布活动可暂停");
    if (command.status === "DRAFT") return reject("发布状态不能退回草稿");
    activity.status = command.status;
    if (command.status === "CANCELED") state.bookings.forEach((row) => { if (row.activityId === activity.id && row.kind === "ACTIVITY" && row.status === "BOOKED") { row.status = "CANCELED"; row.canceledAt = stamp; } });
    return done(activity.id, "发布状态变更；既有获奖权益及奖品预约保留");
  }
  if (command.type === "COPY_ACTIVITY") { const copy = { ...activity, id: id(), name: `${activity.name} · 副本`, status: "DRAFT" as const, createdAt: stamp, publishedAt: undefined, ruleVersion: 1, slots: activity.slots.map((slot) => ({ ...slot, id: id() })), pool: activity.pool.map((item) => ({ ...item, id: id(), slots: item.slots.map((slot) => ({ ...slot, id: id() })) })) }; state.activities.push(copy); return done(copy.id); }
  if (command.type === "DELETE_ACTIVITY") { if (activity.publishedAt || state.participations.some((row) => row.activityId === activity.id) || state.audits.some((row) => row.activityId === activity.id && row.action !== "SAVE_ACTIVITY")) return reject("已发布或有业务记录，不允许硬删除"); state.activities = state.activities.filter((row) => row.id !== activity.id); return done(activity.id); }
  if (command.type === "ADD_QUOTA") { const item = activity.pool.find((row) => row.id === command.poolItemId); if (!item || !positive(command.count)) return reject("追加配额须为正整数"); if (item.method !== "DIRECT" && item.slots.reduce((sum, slot) => sum + slot.capacity, 0) < item.quota + command.count) return reject("履约容量不足，先增加合法时段"); item.quota += command.count; return done(item.id, `有记录追加配额 ${command.count}`); }
  if (command.type === "ADD_PRIZE_SLOT") { const item = activity.pool.find((row) => row.id === command.poolItemId); if (!item || item.method === "DIRECT" || item.slots.some((slot) => slot.id === command.slot.id)) return reject("奖品无需预约或时段重复"); const errors = slotErrors(command.slot, item.claimStart, item.claimEnd); if (errors.length) return reject(errors.join("；")); item.slots.push(command.slot); return done(item.id, "追加履约时段；已有时段不削减或删除"); }
  if (!access.preview) return reject("无权操作用户预览");
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
    for (const item of activity.pool) { cursor += item.probability; if (random * 100 < cursor) { if (quota(state, activity.id, item).available > 0 && wins.filter((row) => row.poolItemId === item.id).length < item.perPersonLimit) winner = item; break; } }
    const drawId = id(); state.draws.push({ id: drawId, operationId: command.operationId, activityId: activity.id, participationId: participation.id, occurredAt: stamp, poolItemId: winner?.id ?? null, randomValue: random, ruleVersion: participation.ruleVersion });
    if (winner) state.awards.push({ id: id(), drawId, participationId: participation.id, activityId: activity.id, poolItemId: winner.id, credential: `WIN-${id()}`, prizeName: winner.label, method: winner.method, location: winner.location, instructions: winner.instructions, claimStart: winner.claimStart, claimEnd: winner.claimEnd, ruleVersion: participation.ruleVersion, wonAt: stamp });
    return done(drawId, winner ? "中奖已占用本活动配额" : "未中奖，有效消耗一次机会；不可用奖品概率转入未中奖");
  }
  if (command.type !== "REGISTER") return reject("不支持的操作");
  if (activity.status !== "PUBLISHED") return reject("未发布、暂停或取消，停止新报名 / 预约");
  if (activity.bookingEnabled) {
    if (!inWindow(ctx.now, activity.bookingStart, activity.bookingEnd) && !(command.walkIn && access.redeem && activity.allowWalkIn)) return reject("预约未开放 / 已截止");
    const slot = activity.slots.find((row) => row.id === command.slotId); if (!slot) return reject("请选择真实活动场次");
    if (command.walkIn && (!access.redeem || !activity.allowWalkIn || !inWindow(ctx.now, slot.checkinStart, slot.checkinEnd))) return reject("未允许现场报名或不在场次窗口");
    if (!command.walkIn && ctx.now >= time(slot.bookingClosesAt)) return reject("场次预约已截止");
    const existing = participation && state.bookings.find((row) => row.participationId === participation!.id && row.kind === "ACTIVITY" && activeBooking(row));
    if (existing) { if (existing.slotId !== slot.id) return reject("同主体已有有效活动预约，请改约"); rememberIdentity(participation!); return done(participation!.id, "已有有效预约，保留原主体与额度"); }
    if (participation?.checkedInAt || participation?.completedAt) return reject("主体已签到 / 完成，不能重新预约刷新额度");
    if (slotOccupancy(state, activity.id, "ACTIVITY", slot.id) >= slot.capacity) return reject("场次满额，未占用新名额");
  } else if (!inWindow(ctx.now, activity.startAt, activity.endAt)) return reject("不在活动举行期内");
  if (!participation) { participation = { id: id(), activityId: activity.id, subjectKey: identity.subjectKey, identities: [], credential: `ACT-${id()}`, registeredAt: stamp, ruleVersion: activity.ruleVersion }; state.participations.push(participation); }
  if (!participation.identities.some((ref) => ref.userId === identity.user!.id)) participation.identities.push({ userId: identity.user.id, brand: identity.user.brand, openid: identity.user.openid, unionid: identity.user.unionid });
  if (activity.bookingEnabled) state.bookings.push({ id: id(), activityId: activity.id, participationId: participation.id, kind: "ACTIVITY", slotId: command.slotId!, status: "BOOKED", createdAt: stamp });
  return done(participation.id, "报名 / 预约不发放抽奖机会");
}
