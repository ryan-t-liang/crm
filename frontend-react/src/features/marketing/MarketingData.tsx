import { useState } from "react";
import { Empty, Button, SideSheet, Table, Banner } from "@douyinfe/semi-ui";
import { DataList } from "@/components/CrmUi";
import { useMarketing } from "@/stores/marketing-store";
import { useMemberOperations, brandLabels } from "@/stores/member-operations-store";
import { useCrm } from "@/stores/crm-store";
import type { MarketingActivity, MarketingAward, MarketingBooking, MarketingParticipation, MarketingRedemption } from "@/types/marketing";
import { parseCreatedAt, shanghaiDate } from "@/features/dashboard/dashboard-model";
import { awardFulfillmentLabel, bookingLabels, bookingStatus, chances, claimLabels, needsReservation, participationIssue, prizeTypeLabels, redemptionLabels, slotFor } from "./marketing-model";
import { displayDate, memberName, Panel, SelectField, TextField } from "./MarketingUi";

const participantLabels = { REGISTERED: "已报名 / 未开始", BOOKED: "已预约", CHECKED_IN: "已签到 / 参与中", COMPLETED: "已完成", CANCELED: "已取消", NO_SHOW: "已爽约", INVALID: "预约失效 / 场次待核对" };
export function participationStatus(state: ReturnType<typeof useMarketing>["state"], row: MarketingParticipation, now: number) {
  if (row.completedAt) return "COMPLETED";
  if (row.checkedInAt) return "CHECKED_IN";
  const last = state.bookings.filter((booking) => booking.participationId === row.id && booking.kind === "ACTIVITY").at(-1);
  const status = last && bookingStatus(last, slotFor(state, last), now);
  return status === "INVALID" ? "INVALID" : last ? status === "BOOKED" ? "BOOKED" : last.status === "CANCELED" ? "CANCELED" : "NO_SHOW" : "REGISTERED";
}
function useDataFilters() {
  const [search, setSearch] = useState(""), [status, setStatus] = useState("ALL"), [date, setDate] = useState("");
  return { search, status, date, setSearch, setStatus, setDate };
}
const dateMatches = (value: string, date: string) => !date || Number.isFinite(parseCreatedAt(value)) && shanghaiDate(parseCreatedAt(value)) === date;

export function ParticipantTable({ activity }: { activity: MarketingActivity }) {
  const { state } = useMarketing(), { state: members } = useMemberOperations(), filters = useDataFilters();
  const rows = state.participations.filter((row) => row.activityId === activity.id && row.identities.some((ref) => `${memberName(members, ref.userId)} ${ref.userId}`.toLowerCase().includes(filters.search.toLowerCase())) && (filters.status === "ALL" || participationStatus(state, row, Date.now()) === filters.status) && dateMatches(row.registeredAt, filters.date));
  return <><div className="marketing-toolbar"><TextField label="搜索参与用户" value={filters.search} onChange={filters.setSearch} /><SelectField label="参与状态" value={filters.status} onChange={filters.setStatus} list={[{ value: "ALL", label: "全部状态" }, ...Object.entries(participantLabels).map(([value, label]) => ({ value, label }))]} /><TextField label="参与创建日期" type="date" value={filters.date} onChange={filters.setDate} /></div>
    <Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1480 }} columns={[
      { title: "用户 / 品牌", width: 230, render: (_: unknown, row: MarketingParticipation) => <span>{row.identities.map((ref) => memberName(members, ref.userId)).join(" / ")}<small> · {brandLabels[activity.brand]}</small>{participationIssue(row, members) && <small> · 身份引用待核对</small>}</span> },
      { title: "活动", width: 180, render: () => activity.name },
      { title: "参与状态", width: 150, render: (_: unknown, row: MarketingParticipation) => participantLabels[participationStatus(state, row, Date.now())] },
      { title: "预约状态", width: 120, render: (_: unknown, row: MarketingParticipation) => { const last = state.bookings.filter((booking) => booking.participationId === row.id && booking.kind === "ACTIVITY").at(-1); return last ? bookingLabels[bookingStatus(last, slotFor(state, last), Date.now())] : "无需预约 / 未预约"; } },
      { title: "签到 / 完成", width: 140, render: (_: unknown, row: MarketingParticipation) => `${row.checkedInAt ? "已签到" : "未签到"} / ${row.completedAt ? "已完成" : "未完成"}` },
      { title: "获得 / 已用次数", width: 130, render: (_: unknown, row: MarketingParticipation) => { const balance = chances(state, row); return `${balance.earned} / ${balance.used}`; } },
      { title: "是否中奖", width: 100, render: (_: unknown, row: MarketingParticipation) => state.awards.some((award) => award.participationId === row.id) ? "是" : "否" },
      { title: "完成时间（UTC+08）", width: 180, render: (_: unknown, row: MarketingParticipation) => displayDate(row.completedAt) },
      { title: "凭证编号（只读）", width: 250, render: (_: unknown, row: MarketingParticipation) => <code>{row.credential}</code> },
    ]} />
  </>;
}
export function BookingData({ activity }: { activity: MarketingActivity }) {
  const { state } = useMarketing(), { state: members } = useMemberOperations(), filters = useDataFilters(); const [kind, setKind] = useState("ALL");
  const rows = state.bookings.filter((row) => row.activityId === activity.id && (kind === "ALL" || row.kind === kind) && (filters.status === "ALL" || bookingStatus(row, slotFor(state, row), Date.now()) === filters.status) && dateMatches(row.createdAt, filters.date) && state.participations.find((participant) => participant.id === row.participationId)?.identities.some((ref) => `${memberName(members, ref.userId)} ${ref.userId}`.toLowerCase().includes(filters.search.toLowerCase())));
  return <><div className="marketing-toolbar"><TextField label="搜索预约用户" value={filters.search} onChange={filters.setSearch} /><SelectField label="预约类型" value={kind} onChange={setKind} list={[{ value: "ALL", label: "全部预约类型" }, { value: "ACTIVITY", label: "活动预约" }, { value: "PRIZE", label: "奖品履约预约" }]} /><SelectField label="预约状态" value={filters.status} onChange={filters.setStatus} list={[{ value: "ALL", label: "全部状态" }, ...Object.entries(bookingLabels).map(([value, label]) => ({ value, label }))]} /><TextField label="预约创建日期" type="date" value={filters.date} onChange={filters.setDate} /></div>
    <Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1430 }} columns={[
      { title: "用户", width: 180, render: (_: unknown, row: MarketingBooking) => state.participations.find((participant) => participant.id === row.participationId)?.identities.map((ref) => memberName(members, ref.userId)).join(" / ") || "身份待核对" },
      { title: "预约类型", width: 140, render: (_: unknown, row: MarketingBooking) => row.kind === "ACTIVITY" ? "活动预约" : state.awards.find((award) => award.id === row.awardId)?.method === "EXPERIENCE" ? "奖品体验预约" : "奖品领取预约" },
      { title: "场次 / 地点", width: 230, render: (_: unknown, row: MarketingBooking) => { const slot = slotFor(state, row); return slot ? `${slot.label} · ${displayDate(slot.startAt)} · ${slot.location}` : "场次待核对"; } },
      { title: "预约状态", width: 120, render: (_: unknown, row: MarketingBooking) => bookingLabels[bookingStatus(row, slotFor(state, row), Date.now())] },
      { title: "预约时间", width: 180, render: (_: unknown, row: MarketingBooking) => displayDate(row.createdAt) },
      { title: "签到 / 核销时间", width: 180, render: (_: unknown, row: MarketingBooking) => displayDate(row.kind === "ACTIVITY" ? row.status === "CHECKED_IN" ? state.participations.find((participant) => participant.id === row.participationId)?.checkedInAt : undefined : row.status === "FULFILLED" ? state.awards.find((award) => award.id === row.awardId)?.fulfilledAt : undefined) },
      { title: "取消时间", width: 180, render: (_: unknown, row: MarketingBooking) => displayDate(row.canceledAt) },
      { title: "来源", width: 120, render: (_: unknown, row: MarketingBooking) => ({ USER: "用户预约", WALK_IN: "现场报名", UNKNOWN: "旧记录未记录来源" })[row.source] },
    ]} />
  </>;
}
export function DrawData({ activity }: { activity: MarketingActivity }) {
  const { state } = useMarketing(), { state: members } = useMemberOperations();
  return <Table rowKey="id" dataSource={state.draws.filter((row) => row.activityId === activity.id).slice().reverse()} pagination={{ pageSize: 10 }} scroll={{ x: 880 }} columns={[
    { title: "用户", width: 180, render: (_: unknown, row: typeof state.draws[number]) => state.participations.find((participant) => participant.id === row.participationId)?.identities.map((ref) => memberName(members, ref.userId)).join(" / ") || "身份待核对" },
    { title: "结果", width: 230, render: (_: unknown, row: typeof state.draws[number]) => row.poolItemId ? state.awards.find((award) => award.drawId === row.id)?.prizeName || "历史奖项待核对" : "未中奖" },
    { title: "抽奖时间（UTC+08）", width: 200, render: (_: unknown, row: typeof state.draws[number]) => displayDate(row.occurredAt) },
    { title: "请求编号", dataIndex: "operationId", width: 270 },
  ]} />;
}
export function VirtualAwardContent({ award }: { award: MarketingAward }) {
  const { state } = useMarketing();
  return <><Banner type="info" description="原型发放方式：仅展示保存的虚拟权益快照，未调用外部兑换或发券服务，也未记录未经发生的已查看事件。" closeIcon={null} />
    <DataList rows={[["内容状态", awardFulfillmentLabel(state, award, Date.now())], ["分配时间", displayDate(award.issuedAt)], ["有效期", `${displayDate(award.claimStart)} 至 ${displayDate(award.claimEnd)}`], ["使用说明", award.instructions]]} />
    {award.method === "REDEMPTION_CODE" && <p>兑换码：<code className="marketing-virtual-code">{award.virtualContent?.code || "未分配，待核对"}</code></p>}
    {award.method === "VIRTUAL_VOUCHER" && <DataList rows={[["凭证名称", award.virtualContent?.name || "未提供"], ["凭证描述", award.virtualContent?.description || "未提供"]]} />}
    {award.method === "LINK" && (award.virtualContent?.link && /^https?:\/\//i.test(award.virtualContent.link) ? <a target="_blank" rel="noopener noreferrer" href={award.virtualContent.link}>查看领取链接（外部服务未集成）</a> : <p>领取链接未提供或无效，待核对</p>)}
  </>;
}
export function AwardData({ activity }: { activity: MarketingActivity }) {
  const { state } = useMarketing(), { state: members } = useMemberOperations(); const [selectedId, setSelectedId] = useState("");
  const rows = state.awards.filter((row) => row.activityId === activity.id), selected = rows.find((row) => row.id === selectedId);
  const currentBooking = (award: MarketingAward) => state.bookings.find((row) => row.awardId === award.id && ["BOOKED", "FULFILLED"].includes(row.status));
  return <><Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1480 }} columns={[
    { title: "用户", width: 170, render: (_: unknown, row: MarketingAward) => state.participations.find((participant) => participant.id === row.participationId)?.identities.map((ref) => memberName(members, ref.userId)).join(" / ") || "身份待核对" },
    { title: "奖品 / 类型", width: 240, render: (_: unknown, row: MarketingAward) => `${row.prizeName} · ${prizeTypeLabels[row.prizeType]}` },
    { title: "中奖时间", width: 180, render: (_: unknown, row: MarketingAward) => displayDate(row.wonAt) },
    { title: "当前权益状态", width: 140, render: (_: unknown, row: MarketingAward) => awardFulfillmentLabel(state, row, Date.now()) },
    { title: "需要预约 / 状态", width: 180, render: (_: unknown, row: MarketingAward) => needsReservation(row) ? `是 · ${currentBooking(row) ? bookingLabels[bookingStatus(currentBooking(row)!, slotFor(state, currentBooking(row)!), Date.now())] : "未预约"}` : "否" },
    { title: "领取 / 发放时间", width: 180, render: (_: unknown, row: MarketingAward) => displayDate(row.fulfilledAt ?? row.issuedAt) },
    { title: "虚拟内容状态", width: 170, render: (_: unknown, row: MarketingAward) => row.prizeType !== "VIRTUAL" ? "不适用" : row.virtualContent?.code ? "已分配（详情可见）" : row.issuedAt ? "已保存（详情可见）" : "待核对" },
    { title: "操作", width: 120, fixed: "right", render: (_: unknown, row: MarketingAward) => <Button size="small" onClick={() => setSelectedId(row.id)}>查看权益</Button> },
  ]} /><SideSheet visible={Boolean(selected)} closeOnEsc title="中奖权益详情（只读）" width={Math.min(600, window.innerWidth - 20)} onCancel={() => setSelectedId("")}>
    {selected && <><DataList rows={[["奖品", selected.prizeName], ["奖项", selected.awardLabel], ["奖品类型", prizeTypeLabels[selected.prizeType]], ["履约方式", claimLabels[selected.method] || "待核对"], ["领奖凭证", <code>{selected.credential}</code>], ["中奖时间", displayDate(selected.wonAt)], ["核销时间", displayDate(selected.fulfilledAt)]]} />{selected.prizeType === "VIRTUAL" ? <VirtualAwardContent award={selected} /> : <DataList rows={[["领取地点（快照）", selected.location], ["领取说明（快照）", selected.instructions], ["有效期", `${displayDate(selected.claimStart)} 至 ${displayDate(selected.claimEnd)}`]]} />}</>}
  </SideSheet></>;
}
export function RedemptionData({ activity }: { activity: MarketingActivity }) {
  const { state } = useMarketing(), { state: members } = useMemberOperations(), { state: sales } = useCrm(); const [type, setType] = useState("ALL");
  const rows = state.redemptions.filter((row) => row.activityId === activity.id && (type === "ALL" || row.type === type)).slice().reverse();
  return <Panel title="核销业务记录（只读）" note="仅含签到、完成及实体权益核销结果；配置审计单独保留。旧记录缺少可信核销事实时不自动伪造，演示种子明确标注。"><SelectField label="核销业务类型" value={type} onChange={setType} list={[{ value: "ALL", label: "全部核销类型" }, ...Object.entries(redemptionLabels).map(([value, label]) => ({ value, label }))]} />
    <Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1700 }} columns={[
      { title: "用户", width: 170, render: (_: unknown, row: MarketingRedemption) => state.participations.find((participant) => participant.id === row.participationId)?.identities.map((ref) => memberName(members, ref.userId)).join(" / ") || "身份待核对" },
      { title: "活动", width: 190, render: () => activity.name }, { title: "核销类型", width: 140, render: (_: unknown, row: MarketingRedemption) => redemptionLabels[row.type] },
      { title: "核销对象", width: 190, render: (_: unknown, row: MarketingRedemption) => row.awardId ? state.awards.find((award) => award.id === row.awardId)?.prizeName || "历史权益待核对" : "活动参与" },
      { title: "核销时间（UTC+08）", width: 180, render: (_: unknown, row: MarketingRedemption) => displayDate(row.occurredAt) },
      { title: "核销人员", width: 150, render: (_: unknown, row: MarketingRedemption) => sales.users.find((user) => user.id === row.actorId)?.name || row.actorId },
      { title: "结果", width: 90, render: (_: unknown, row: MarketingRedemption) => row.result === "SUCCESS" ? "成功" : "拒绝" },
      { title: "凭证编号", dataIndex: "credential", width: 280 }, { title: "来源 / 说明", width: 310, render: (_: unknown, row: MarketingRedemption) => `${({ REDEMPTION_SURFACE: "核销端", LEGACY_AUDIT: "旧核销业务事实", DEMO_SEED: "虚构演示种子" })[row.source]} · ${row.detail}` },
    ]} />
  </Panel>;
}
export function AuditData({ activity }: { activity: MarketingActivity }) {
  const { state } = useMarketing();
  return <details className="marketing-audit"><summary>配置与操作审计（不是核销数据）</summary><Panel title="活动审计日志" note="当前原型没有全局Audit模块；保留既有营销审计，未扩展角色或伪装成系统审计集成。"><Table rowKey="id" dataSource={state.audits.filter((row) => row.activityId === activity.id).slice().reverse()} pagination={{ pageSize: 10 }} scroll={{ x: 920 }} columns={[{ title: "动作", dataIndex: "action", width: 200 }, { title: "对象", dataIndex: "targetId", width: 230 }, { title: "操作人", dataIndex: "actorId", width: 140 }, { title: "时间（UTC+08）", width: 180, render: (_: unknown, row: typeof state.audits[number]) => displayDate(row.occurredAt) }, { title: "结果 / 说明", width: 280, render: (_: unknown, row: typeof state.audits[number]) => `${row.result} · ${row.detail}` }]} /></Panel></details>;
}
