import { useId, useState, type ReactNode } from "react";
import { Banner, Input, InputNumber, Select } from "@douyinfe/semi-ui";
import { useMarketing } from "@/stores/marketing-store";
import { parseCreatedAt } from "@/features/dashboard/dashboard-model";
import type { MarketingActivity, MarketingSlot } from "@/types/marketing";
import type { MemberOperationsState } from "@/types/member-operations";
import { phase, type MarketingCommand } from "./marketing-model";

const dateTime = (value: string) => Number.isFinite(parseCreatedAt(value)) ? new Date(parseCreatedAt(value) + 8 * 3_600_000).toISOString().slice(0, 16) : "";
export const displayDate = (value?: string) => value && Number.isFinite(parseCreatedAt(value)) ? dateTime(value).replace("T", " ") : "未提供";
export const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));
export function SelectField({ label, value, list, onChange, disabled }: { label: string; value: string; list: { value: string; label: string }[]; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId();
  return <label className="marketing-field"><span id={id}>{label}</span><Select aria-labelledby={id} value={value} optionList={list} onChange={(next) => onChange(String(next))} disabled={disabled} /></label>;
}
export function TextField({ label, value, onChange, type = "text", disabled }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return <label className="marketing-field"><span>{label}</span><Input aria-label={label} type={type} value={value} onChange={onChange} disabled={disabled} /></label>;
}
export function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="marketing-field"><span>{label}</span><InputNumber aria-label={label} value={Number.isFinite(value) ? value : undefined} onChange={(next) => onChange(typeof next === "number" ? next : NaN)} /></label>;
}
export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <TextField label={label} value={dateTime(value)} type="datetime-local" onChange={(value) => onChange(value ? `${value}:00+08:00` : "")} />;
}
export function Panel({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return <section className="marketing-panel"><header><h2>{title}</h2>{note && <p>{note}</p>}</header><div>{children}</div></section>;
}
export function DemoNote() {
  return <p className="marketing-demo-note">纯前端演示 · 免费单人活动 · Asia/Shanghai（UTC+08）· 本地抽奖、容量和权限不具备生产并发安全或防作弊能力，不发送消息、不连接微信 / HQ。</p>;
}
export function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [error, setError] = useState("");
  return <label className="marketing-field"><span>{label}（仅本地预览，不上传）</span><input aria-label={label} type="file" accept="image/*" onChange={(event) => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2_000_000) { setError("请选择不超过2MB的图片"); return; }
    const reader = new FileReader(); reader.onload = () => { onChange(String(reader.result)); setError(""); }; reader.readAsDataURL(file);
  }} />{value && <img className="marketing-cover" src={value} alt="本地演示封面" />}{error && <small>{error}</small>}</label>;
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
  return <div className="marketing-phases">{activity.bookingEnabled && <span>预约：{phase(now, activity.bookingStart, activity.bookingEnd)}</span>}<span>活动：{phase(now, activity.startAt, activity.endAt)}</span>{activity.lotteryEnabled && <><span>抽奖：{phase(now, activity.lotteryStart, activity.lotteryEnd)}</span><span>领奖：{activity.pool.some((item) => phase(now, item.claimStart, item.claimEnd) === "有效期内") ? "仍有有效权益期" : "无当前有效期"}</span></>}</div>;
}
export function memberName(members: MemberOperationsState, userId?: string) {
  const profile = members.userProfiles.find((row) => row.user_id === userId);
  return [profile?.last_name, profile?.first_name].filter(Boolean).join(" ") || userId || "身份待核对";
}
