import type { ActivityPrize, MarketingActivity, MarketingBooking, MarketingPickupSchedule, MarketingSlot, MarketingState } from "@/types/marketing";
import { parseCreatedAt as time, shanghaiDate } from "@/features/dashboard/dashboard-model";

export type PickupCommand =
  | { type: "SAVE_PICKUP_SCHEDULE"; activityId: string; schedule: MarketingPickupSchedule }
  | { type: "SAVE_PICKUP_SLOT"; activityId: string; scheduleId: string; slot: MarketingSlot }
  | { type: "ADJUST_PICKUP_CAPACITY"; activityId: string; scheduleId: string; slotId: string; capacity: number }
  | { type: "SET_PICKUP_SLOT_OPEN"; activityId: string; scheduleId: string; slotId: string; open: boolean }
  | { type: "DELETE_PICKUP_SLOT"; activityId: string; scheduleId: string; slotId: string }
  | { type: "GENERATE_PICKUP_SLOTS"; activityId: string; scheduleId: string; input: PickupGenerationInput };
export interface PickupGenerationInput { startDate: string; endDate: string; dailyStart: string; dailyEnd: string; duration: number; capacity: number }
const reservation = (prize: ActivityPrize) => prize.fulfillmentMode ? prize.fulfillmentMode === "RESERVATION" : ["PICKUP", "EXPERIENCE"].includes(prize.method);
const validWindow = (start: string, end: string) => Number.isFinite(time(start)) && Number.isFinite(time(end)) && time(start) < time(end);
const capacityValid = (value: number) => Number.isSafeInteger(value) && value >= 0;
const legacyScheduleId = (prize: ActivityPrize) => `pickup-legacy:${prize.id}`;

/** Deterministic, read-only adapter for old private slots. Never merge unrelated
 * prizes merely because their location/time text matches. Never create records. */
export function pickupSchedules(activity: MarketingActivity): MarketingPickupSchedule[] {
  const saved = activity.pickupSchedules ?? [];
  return [...saved, ...activity.pool.filter(prize => reservation(prize) && !prize.pickupScheduleId && prize.slots.length && !saved.some(schedule => schedule.id === legacyScheduleId(prize))).map(prize => ({
    id: legacyScheduleId(prize), activityId: activity.id, name: `${prize.name}兑奖预约设置`, location: prize.location,
    startAt: prize.claimStart, endAt: prize.claimEnd, slots: prize.slots,
  }))];
}
export function pickupScheduleForPrize(activity: MarketingActivity, prize: ActivityPrize) {
  return pickupSchedules(activity).find(schedule => schedule.id === (prize.pickupScheduleId ?? legacyScheduleId(prize)));
}
export function bookingScheduleId(activity: MarketingActivity, booking: MarketingBooking) {
  if (booking.kind !== "PRIZE") return undefined;
  if (booking.scheduleId) return booking.scheduleId;
  const prize = activity.pool.find(item => item.id === booking.poolItemId);
  return prize && pickupScheduleForPrize(activity, prize)?.id;
}
export function pickupBookings(state: MarketingState, activity: MarketingActivity, scheduleId: string, slotId?: string) {
  return state.bookings.filter(booking => booking.activityId === activity.id && booking.kind === "PRIZE" && bookingScheduleId(activity, booking) === scheduleId && (!slotId || booking.slotId === slotId));
}
export function pickupBookedCount(state: MarketingState, activity: MarketingActivity, scheduleId: string, slotId: string) {
  return pickupBookings(state, activity, scheduleId, slotId).filter(booking => booking.status !== "CANCELED").length;
}
export function pickupSlotErrors(slot: MarketingSlot, schedule: MarketingPickupSchedule) {
  const errors: string[] = [];
  if (!slot.id || !slot.label.trim() || !slot.location.trim() || !capacityValid(slot.capacity)) errors.push("兑奖时段须有时间、地点和非负整数预约容量。");
  if (!validWindow(slot.startAt, slot.endAt) || !validWindow(schedule.startAt, schedule.endAt) || time(slot.startAt) < time(schedule.startAt) || time(slot.endAt) > time(schedule.endAt)) errors.push("兑奖时段须在兑奖预约设置有效日期内，结束晚于开始。");
  if (!Number.isFinite(time(slot.bookingClosesAt)) || time(slot.bookingClosesAt) > time(slot.endAt) || !validWindow(slot.checkinStart, slot.checkinEnd) || time(slot.checkinStart) > time(slot.startAt) || time(slot.checkinEnd) < time(slot.endAt)) errors.push("兑奖时段的预约截止和核销窗口无效。");
  return errors;
}
export function pickupSlotOpen(schedule: MarketingPickupSchedule, slot: MarketingSlot, now: number) {
  return !slot.disabled && !slot.deleted && !pickupSlotErrors(slot, schedule).length && now < time(slot.endAt) && now < time(slot.bookingClosesAt);
}
export function pickupSlotStatus(state: MarketingState, activity: MarketingActivity, schedule: MarketingPickupSchedule, slot: MarketingSlot, now: number) {
  if (now >= time(slot.endAt)) return "已结束";
  if (!pickupSlotOpen(schedule, slot, now)) return "已停止";
  return pickupBookedCount(state, activity, schedule.id, slot.id) >= slot.capacity ? "已满" : "可预约";
}
export function pickupScheduleSummary(state: MarketingState, activity: MarketingActivity, schedule: MarketingPickupSchedule, now: number) {
  const slots = schedule.slots.filter(slot => !slot.deleted);
  const total = slots.reduce((sum, slot) => sum + slot.capacity, 0);
  const booked = pickupBookings(state, activity, schedule.id).filter(row => row.status !== "CANCELED").length;
  const available = slots.filter(slot => pickupSlotOpen(schedule, slot, now)).reduce((sum, slot) => sum + Math.max(0, slot.capacity - pickupBookedCount(state, activity, schedule.id, slot.id)), 0);
  const prizes = activity.pool.filter(prize => reservation(prize) && pickupScheduleForPrize(activity, prize)?.id === schedule.id);
  const demand = prizes.reduce((sum, prize) => sum + (prize.quantityLimit ?? prize.quota), 0);
  const status = now >= time(schedule.endAt) ? "已结束" : available > 0 ? "可预约" : slots.some(slot => pickupSlotOpen(schedule, slot, now)) ? "已满" : "已停止";
  return { total, booked, remaining: Math.max(0, total - booked), available, prizes, status, warning: demand > total ? `当前兑奖预约设置总容量为${total}，关联奖品最多可能产生${demand}个领奖预约，建议增加兑奖时段或容量。` : "" };
}
export function pickupSlotForBooking(activity: MarketingActivity, booking: MarketingBooking) {
  return pickupSchedules(activity).find(schedule => schedule.id === bookingScheduleId(activity, booking))?.slots.find(slot => slot.id === booking.slotId);
}
export function availablePickupSlots(activity: MarketingActivity, prize: ActivityPrize, now: number) {
  const schedule = pickupScheduleForPrize(activity, prize);
  return schedule?.slots.filter(slot => pickupSlotOpen(schedule, slot, now) && time(slot.startAt) >= time(prize.claimStart) && time(slot.endAt) <= time(prize.claimEnd)) ?? [];
}
/** Operates on the caller's cloned candidate; rejected commands never persist. */
function materializeSchedule(activity: MarketingActivity, scheduleId: string) {
  const schedule = pickupSchedules(activity).find(row => row.id === scheduleId);
  if (!schedule) return undefined;
  activity.pickupSchedules ??= [];
  let saved = activity.pickupSchedules.find(row => row.id === scheduleId);
  if (!saved) { saved = structuredClone(schedule); activity.pickupSchedules.push(saved); }
  activity.pool.forEach(prize => {
    if (!prize.pickupScheduleId && legacyScheduleId(prize) === scheduleId) { prize.pickupScheduleId = scheduleId; prize.slots = []; }
  });
  return saved;
}
export function generatePickupSlots(schedule: MarketingPickupSchedule, input: PickupGenerationInput): { slots: MarketingSlot[]; skipped: number; days: number; error?: string } {
  const fail = (error: string) => ({ slots: [], skipped: 0, days: 0, error });
  const dateValid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(time(`${date}T00:00:00+08:00`)) && shanghaiDate(time(`${date}T00:00:00+08:00`)) === date;
  if (!dateValid(input.startDate) || !dateValid(input.endDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dailyStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dailyEnd)) return fail("请填写有效日期和每日时间。");
  const from = time(`${input.startDate}T00:00:00+08:00`), to = time(`${input.endDate}T00:00:00+08:00`);
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const start = minutes(input.dailyStart), end = minutes(input.dailyEnd), days = (to - from) / 86_400_000 + 1;
  if (days < 1 || days > 366 || end <= start || !Number.isSafeInteger(input.duration) || input.duration < 1 || input.duration > end - start || !capacityValid(input.capacity) || input.capacity < 1) return fail("日期范围最多366天，结束须晚于开始，时段长度和容量须为正整数。");
  if ((end - start) % input.duration) return fail("每日时间范围须能按时段长度完整划分。");
  if (days * (end - start) / input.duration > 10000) return fail("单次最多生成10000个时段，请缩小日期范围。");
  const slots: MarketingSlot[] = []; let skipped = 0;
  for (let day = from; day <= to; day += 86_400_000) for (let minute = start; minute + input.duration <= end; minute += input.duration) {
    const startAt = new Date(day + minute * 60_000).toISOString(), endAt = new Date(day + (minute + input.duration) * 60_000).toISOString();
    if (schedule.slots.some(slot => !slot.deleted && time(slot.startAt) === time(startAt) && time(slot.endAt) === time(endAt))) { skipped++; continue; }
    const slot = { id: `pickup:${schedule.id}:${startAt}`, label: "兑奖时段", startAt, endAt, location: schedule.location, capacity: input.capacity, bookingClosesAt: endAt, checkinStart: startAt, checkinEnd: endAt };
    const errors = pickupSlotErrors(slot, schedule);
    if (errors.length) return fail(errors.join("；"));
    if (schedule.slots.some(old => !old.deleted && time(startAt) < time(old.endAt) && time(endAt) > time(old.startAt))) return fail("当前兑奖预约设置中已存在重叠时段，请调整时间。");
    slots.push(slot);
  }
  return { slots, skipped, days };
}
export function executePickupCommand(state: MarketingState, activity: MarketingActivity, command: PickupCommand, now: number): { error?: string; id?: string; detail?: string } {
  if (command.type === "SAVE_PICKUP_SCHEDULE") {
    const { schedule } = command;
    if (!schedule.id || schedule.activityId !== activity.id || !schedule.name.trim() || !schedule.location.trim() || !validWindow(schedule.startAt, schedule.endAt)) return { error: "填写兑奖预约设置名称、地点和有效日期。" };
    const old = pickupSchedules(activity).find(row => row.id === schedule.id);
    if (old && pickupBookings(state, activity, old.id).length && schedule.location !== old.location) return { error: "已有领奖预约的领取地点不能直接更改。" };
    const candidate = { id: schedule.id, activityId: activity.id, name: schedule.name.trim(), location: schedule.location.trim(), startAt: schedule.startAt, endAt: schedule.endAt, slots: old?.slots ?? [] };
    if (candidate.slots.some(slot => !slot.deleted && (slot.startAt || slot.endAt) && pickupSlotErrors(slot, candidate).length)) return { error: "有效日期必须覆盖已有兑奖时段。" };
    const saved = old && materializeSchedule(activity, old.id);
    activity.pickupSchedules ??= [];
    if (saved) Object.assign(saved, candidate); else activity.pickupSchedules.push(structuredClone(candidate));
    return { id: candidate.id, detail: "保存兑奖预约设置基本信息，时段及历史预约保留" };
  }
  const schedule = materializeSchedule(activity, command.scheduleId);
  if (!schedule) return { error: "兑奖预约设置不存在或不属于当前活动。" };
  if (command.type === "GENERATE_PICKUP_SLOTS") {
    const preview = generatePickupSlots(schedule, command.input);
    if (preview.error) return { error: preview.error };
    if (preview.slots.some(slot => time(slot.endAt) <= now)) return { error: "不能生成已经结束的兑奖时段。" };
    if (preview.slots.some(slot => pickupSchedules(activity).some(other => other.slots.some(old => old.id === slot.id)))) return { error: "时段标识已经存在，请核对。" };
    schedule.slots.push(...preview.slots);
    return { id: schedule.id, detail: `生成${preview.slots.length}个兑奖时段；已跳过${preview.skipped}个重复时段。` };
  }
  const slotId = command.type === "SAVE_PICKUP_SLOT" ? command.slot.id : command.slotId;
  const old = schedule.slots.find(row => row.id === slotId);
  const bookings = pickupBookings(state, activity, schedule.id, slotId), booked = bookings.filter(row => row.status !== "CANCELED").length;
  if (command.type === "SAVE_PICKUP_SLOT") {
    const candidate = { ...command.slot, disabled: old?.disabled ?? false, deleted: old?.deleted ?? false };
    if (old?.deleted) return { error: "已删除时段不能通过编辑恢复。" };
    if (!old && pickupSchedules(activity).some(other => other.slots.some(slot => slot.id === candidate.id))) return { error: "兑奖时段标识重复。" };
    const errors = pickupSlotErrors(candidate, schedule);
    if (errors.length) return { error: errors.join("；") };
    if (!old && time(candidate.endAt) <= now) return { error: "不能新增已经结束的兑奖时段。" };
    if (bookings.length && ["startAt", "endAt", "checkinStart", "checkinEnd", "bookingClosesAt", "location"].some(key => candidate[key as keyof MarketingSlot] !== old?.[key as keyof MarketingSlot])) return { error: "已有预约记录的时段不能直接更改日期、时间或地点。" };
    if (old && booked && candidate.capacity !== old.capacity) return { error: "已有预约，请使用“调整容量”。" };
    if (candidate.capacity < booked) return { error: `当前时段已有${booked}条有效预约，预约容量不能低于${booked}人。` };
    if (schedule.slots.some(slot => slot.id !== slotId && !slot.deleted && time(candidate.startAt) < time(slot.endAt) && time(candidate.endAt) > time(slot.startAt))) return { error: "当前兑奖预约设置中已存在重叠时段，请调整时间。" };
    if (old) Object.assign(old, candidate); else schedule.slots.push(structuredClone(candidate));
    return { id: slotId, detail: "保存兑奖时段" };
  }
  if (!old || old.deleted) return { error: "兑奖时段不存在。" };
  if (command.type === "DELETE_PICKUP_SLOT") {
    if (bookings.length) return { error: "已有预约记录的时段不能删除，可以停止预约。" };
    schedule.slots = schedule.slots.filter(slot => slot.id !== old.id);
    return { id: old.id, detail: "删除未使用兑奖时段" };
  }
  if (command.type === "ADJUST_PICKUP_CAPACITY") {
    if (!capacityValid(command.capacity) || command.capacity < booked) return { error: `当前时段已有${booked}条有效预约，预约容量不能低于${booked}人，且须为非负整数。` };
    const before = old.capacity; old.capacity = command.capacity;
    return { id: old.id, detail: `调整预约容量：${before} → ${old.capacity}；已预约${booked}，剩余${old.capacity - booked}` };
  }
  if (command.open && now >= time(old.endAt)) return { error: "已结束时段不能恢复预约。" };
  old.disabled = !command.open;
  return { id: old.id, detail: command.open ? "恢复兑奖时段预约" : "停止新预约，已有预约和中奖权益继续有效" };
}
