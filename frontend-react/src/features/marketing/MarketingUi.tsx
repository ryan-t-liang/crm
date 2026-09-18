import { useId, useState, type ReactNode } from "react";
import { Banner, Input, InputNumber, Select, Tag } from "@douyinfe/semi-ui";
import { useMarketing } from "@/stores/marketing-store";
import { parseCreatedAt } from "@/features/dashboard/dashboard-model";
import type { ActivityPrize, MarketingActivity, MarketingAward, MarketingSlot, MarketingState } from "@/types/marketing";
import type { MemberOperationsState } from "@/types/member-operations";
import { awardFulfillmentLabel, bookingLabels, needsReservation, phase, type MarketingCommand } from "./marketing-model";

const dateTime = (value: string) => Number.isFinite(parseCreatedAt(value)) ? new Date(parseCreatedAt(value) + 8 * 3_600_000).toISOString().slice(0, 16) : "";
export const displayDate = (value?: string) => value && Number.isFinite(parseCreatedAt(value)) ? dateTime(value).replace("T", " ") : "—";
export function displayDateRange(start: string, end: string) {
  const from = displayDate(start), to = displayDate(end);
  if (from === "—" || to === "—") return { date: "", time: `${from} 至 ${to}`, compact: `${from} 至 ${to}` };
  if (from.slice(0, 10) === to.slice(0, 10)) return { date: from.slice(0, 10), time: `${from.slice(11)}–${to.slice(11)}`, compact: `${from}–${to.slice(11)}` };
  return { date: "", time: `${from} 至 ${to}`, compact: `${from} 至 ${to}` };
}
export function DateRange({ start, end }: { start: string; end: string }) {
  const range = displayDateRange(start, end);
  return <span className="marketing-date-range">{range.date ? <>{range.date}<br />{range.time}</> : <>{displayDate(start)}<br />至 {displayDate(end)}</>}</span>;
}
export function prizeReceivingLabel(prize: Pick<ActivityPrize | MarketingAward, "prizeType" | "method" | "fulfillmentMode">) {
  return needsReservation(prize) ? prize.prizeType === "VIRTUAL" || prize.method === "EXPERIENCE" ? "预约使用" : "预约领取" : prize.prizeType === "VIRTUAL" ? "直接发放" : "直接领取";
}
/** Presentation only: retain stored business/audit messages and internal contracts. */
export function marketingBusinessCopy(value: string) {
  return value.replaceAll("奖品履约预约", "领奖预约").replaceAll("已履约（体验完成）", "已使用（体验完成）")
    .replaceAll("预约履约", "预约使用").replaceAll("履约容量", "领奖预约名额").replaceAll("履约时段", "领奖时段")
    .replaceAll("履约场次", "领奖场次").replaceAll("履约", "领取");
}
export const displayBookingLabels = Object.fromEntries(Object.entries(bookingLabels).map(([value, label]) => [value, marketingBusinessCopy(label)]));
export const displayChannelLabels = { WECHAT_MINIPROGRAM: "微信小程序", WECHAT_H5: "微信 H5", WEB_H5: "网页 H5", QR_H5: "二维码 H5", STAFF: "现场登记", OTHER: "其他" };
export const displayAwardStatus = (state: MarketingState, award: MarketingAward, now: number) => marketingBusinessCopy(awardFulfillmentLabel(state, award, now));
export const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));
export function SelectField({ label, value, list, onChange, disabled }: { label: string; value: string; list: { value: string; label: string }[]; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId();
  return <label className="marketing-field"><span id={id}>{label}</span><Select aria-labelledby={id} value={value} optionList={list} onChange={(next) => onChange(String(next))} disabled={disabled} /></label>;
}
export function TextField({ label, value, onChange, type = "text", disabled, placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean; placeholder?: string }) {
  return <label className="marketing-field"><span>{label}</span><Input aria-label={label} type={type} value={value} onChange={onChange} disabled={disabled} placeholder={placeholder} /></label>;
}
export function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="marketing-field"><span>{label}</span><InputNumber aria-label={label} value={Number.isFinite(value) ? value : undefined} onChange={(next) => onChange(typeof next === "number" ? next : NaN)} /></label>;
}
export function TimeField({ label, value, onChange, placeholder, disabled }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; disabled?: boolean }) {
  return <div><TextField label={label} value={dateTime(value)} placeholder={placeholder} disabled={disabled} type="datetime-local" onChange={(value) => onChange(value ? `${value}:00+08:00` : "")} />{placeholder && !value && <small>{placeholder}</small>}</div>;
}
export function Panel({ title, children, note, actions }: { title: string; children: ReactNode; note?: string; actions?: ReactNode }) {
  return <section className="marketing-panel"><header className="tab-panel-header"><div><h2>{title}</h2>{note && <p>{note}</p>}</div>{actions}</header><div>{children}</div></section>;
}
export function DefinitionGrid({ rows }: { rows: Array<[string, ReactNode]> }) {
  return <dl className="form-grid marketing-definition">{rows.map(([label, value], index) => <div key={`${label}-${index}`} className={label === "活动规则" ? "marketing-definition-wide" : undefined}><dt>{label}</dt><dd>{value === "" ? "—" : value ?? "—"}</dd></div>)}</dl>;
}
export function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [error, setError] = useState("");
  return <label className="marketing-field"><span>{label}</span><input aria-label={label} type="file" accept="image/*" onChange={(event) => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2_000_000) { setError("请选择不超过2MB的图片"); return; }
    const reader = new FileReader(); reader.onload = () => { onChange(String(reader.result)); setError(""); }; reader.readAsDataURL(file);
  }} />{value && <img className="marketing-cover" src={value} alt="活动图片" />}{error && <small>{error}</small>}</label>;
}
export function SlotFields({ slot, onChange }: { slot: MarketingSlot; onChange: (slot: MarketingSlot) => void }) {
  const update = <K extends keyof MarketingSlot>(key: K, value: MarketingSlot[K]) => onChange({ ...slot, [key]: value });
  return <div className="form-grid marketing-form-grid"><TextField label="场次名称" value={slot.label} onChange={(value) => update("label", value)} /><TextField label="场地" value={slot.location} onChange={(value) => update("location", value)} /><NumberField label="场次容量" value={slot.capacity} onChange={(value) => update("capacity", value)} />{(["startAt", "endAt", "bookingClosesAt", "checkinStart", "checkinEnd"] as const).map((key, index) => <TimeField key={key} label={["场次开始", "场次结束", "预约截止", "签到开始", "签到截止"][index]} value={slot[key]} onChange={(value) => update(key, value)} />)}</div>;
}
export function useAction() {
  const { act } = useMarketing(); const [message, setMessage] = useState("");
  const run = (command: MarketingCommand) => { const result = act(command); setMessage(result.ok ? "操作已保存" : marketingBusinessCopy(result.error || "操作失败")); return result; };
  return { run, message, feedback: message && <Banner type={message === "操作已保存" ? "success" : "warning"} title={message} closeIcon={null} /> };
}
export function ActivityPhases({ activity }: { activity: MarketingActivity }) {
  const now = Date.now();
  const active = (start: string, end: string) => phase(now, start, end) === "有效期内";
  const labels = [activity.bookingEnabled && active(activity.bookingStart, activity.bookingEnd) && "预约中", active(activity.startAt, activity.endAt) && "活动进行中", activity.lotteryEnabled && active(activity.lotteryStart, activity.lotteryEnd) && "抽奖中", activity.lotteryEnabled && activity.pool.some((item) => active(item.claimStart, item.claimEnd)) && "领奖有效"].filter(Boolean);
  return <div className="marketing-phases">{labels.map((label) => <Tag key={String(label)} size="small">{label}</Tag>)}</div>;
}
export function memberName(members: MemberOperationsState, userId?: string) {
  const profile = members.userProfiles.find((row) => row.user_id === userId);
  return [profile?.last_name, profile?.first_name].filter(Boolean).join(" ") || userId || "身份待核对";
}
