import { useId, useState, type ReactNode } from "react";
import { Banner, Input, InputNumber, Select, Tag } from "@douyinfe/semi-ui";
import { useMarketing } from "@/stores/marketing-store";
import { parseCreatedAt } from "@/features/dashboard/dashboard-model";
import type { MarketingActivity, MarketingSlot } from "@/types/marketing";
import type { MemberOperationsState } from "@/types/member-operations";
import { phase, type MarketingCommand } from "./marketing-model";

const dateTime = (value: string) => Number.isFinite(parseCreatedAt(value)) ? new Date(parseCreatedAt(value) + 8 * 3_600_000).toISOString().slice(0, 16) : "";
export const displayDate = (value?: string) => value && Number.isFinite(parseCreatedAt(value)) ? dateTime(value).replace("T", " ") : "—";
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
export function TimeField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div><TextField label={label} value={dateTime(value)} placeholder={placeholder} type="datetime-local" onChange={(value) => onChange(value ? `${value}:00+08:00` : "")} />{placeholder && !value && <small>{placeholder}</small>}</div>;
}
export function Panel({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return <section className="marketing-panel"><header><h2>{title}</h2>{note && <p>{note}</p>}</header><div>{children}</div></section>;
}
export function DefinitionGrid({ rows }: { rows: Array<[string, ReactNode]> }) {
  return <dl className="marketing-definition">{rows.map(([label, value]) => <div key={label} className={label === "活动规则" || label === "活动说明" ? "marketing-definition-wide" : undefined}><dt>{label}</dt><dd>{value === "" ? "—" : value ?? "—"}</dd></div>)}</dl>;
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
  return <div className="marketing-form-grid"><TextField label="场次名称" value={slot.label} onChange={(value) => update("label", value)} /><TextField label="场次地点" value={slot.location} onChange={(value) => update("location", value)} /><NumberField label="场次容量" value={slot.capacity} onChange={(value) => update("capacity", value)} />{(["startAt", "endAt", "bookingClosesAt", "checkinStart", "checkinEnd"] as const).map((key, index) => <TimeField key={key} label={["场次开始", "场次结束", "场次预约截止", "允许签到开始", "允许签到结束（含配置宽限）"][index]} value={slot[key]} onChange={(value) => update(key, value)} />)}</div>;
}
export function useAction() {
  const { act } = useMarketing(); const [message, setMessage] = useState("");
  const run = (command: MarketingCommand) => { const result = act(command); setMessage(result.ok ? "操作已保存" : result.error || "操作失败"); return result; };
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
