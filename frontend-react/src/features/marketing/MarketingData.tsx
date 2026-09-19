import { useState } from "react";
import { Button, Input, Select, SideSheet, Table } from "@douyinfe/semi-ui";
import { IconSearch } from "@douyinfe/semi-icons";
import { DataList, EmptyBlock } from "@/components/CrmUi";
import { useMarketing } from "@/stores/marketing-store";
import { useMemberOperations, brandLabels } from "@/stores/member-operations-store";
import { useCrm } from "@/stores/crm-store";
import type { MarketingActivity, MarketingAward, MarketingBooking, MarketingParticipation, MarketingRedemption, MarketingState } from "@/types/marketing";
import { parseCreatedAt, shanghaiDate } from "@/features/dashboard/dashboard-model";
import { bookingStatus, chances, marketingPermissions, needsReservation, participantChannel, participantDisplayName, participantIdentity, participantIdentityReview, participationIssue, prizeTypeLabels, redemptionLabels, slotFor } from "./marketing-model";
import { DefinitionGrid, displayDate, displayAwardStatus as awardFulfillmentLabel, displayBookingLabels as bookingLabels, displayChannelLabels, marketingBusinessCopy, Panel, prizeReceivingLabel } from "./MarketingUi";

export const channelLabels = displayChannelLabels;
export function maskedPhone(value?: string | null) { if (!value) return "—"; const digits = value.replace(/\s/g, ""); return digits.length > 7 ? `${digits.slice(0, 3)}****${digits.slice(-4)}` : "****"; }

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

export function ParticipantTable({ activity, dataState }: { activity: MarketingActivity; dataState?: MarketingState }) {
  const { state: stored } = useMarketing(), { state: members } = useMemberOperations(), { currentUser } = useCrm(), filters = useDataFilters();
  const state = dataState ?? stored;
  const [selectedId, setSelectedId] = useState("");
  const rows = state.participations.filter((row) => row.activityId === activity.id && `${participantDisplayName(row, members)} ${row.id} ${row.identities.map((ref) => ref.userId).join(" ")}`.toLowerCase().includes(filters.search.toLowerCase()) && (filters.status === "ALL" || participationStatus(state, row, Date.now()) === filters.status) && dateMatches(row.registeredAt, filters.date));
  const selected = rows.find((row) => row.id === selectedId), identity = selected && participantIdentity(selected, members), fullIdentity = marketingPermissions(currentUser).manage;
  return <><div className="table-toolbar">
    <Input prefix={<IconSearch />} aria-label="搜索参与用户" placeholder="搜索参与用户" value={filters.search} onChange={filters.setSearch} showClear />
    <Select aria-label="参与状态" value={filters.status} onChange={value => filters.setStatus(String(value))} optionList={[{ value: "ALL", label: "全部状态" }, ...Object.entries(participantLabels).map(([value, label]) => ({ value, label }))]} />
    <Input aria-label="参与创建日期" type="date" value={filters.date} onChange={filters.setDate} />
  </div>
    <Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1120 }} empty={<EmptyBlock title="暂无参与记录" description="用户参与活动后，相关记录将在这里展示。" />} columns={[
      { title: "参与用户", width: 180, render: (_: unknown, row: MarketingParticipation) => <Button theme="borderless" size="small" onClick={() => setSelectedId(row.id)}>{participantDisplayName(row, members)}</Button> },
      { title: "渠道", width: 140, render: (_: unknown, row: MarketingParticipation) => channelLabels[participantChannel(row)] },
      { title: "手机号", width: 140, render: (_: unknown, row: MarketingParticipation) => maskedPhone(participantIdentity(row, members).phone) },
      { title: "会员关联", width: 140, render: (_: unknown, row: MarketingParticipation) => participationIssue(row, members) || participantIdentityReview(row, members, activity.brand) === "UNVERIFIED" ? "身份待核验" : participantIdentity(row, members).memberId ? "已关联会员" : "未关联会员" },
      { title: "参与状态", width: 140, render: (_: unknown, row: MarketingParticipation) => participantLabels[participationStatus(state, row, Date.now())] },
      { title: "签到 / 完成", width: 200, render: (_: unknown, row: MarketingParticipation) => <div className="marketing-summary-cell"><span>签到：{displayDate(row.checkedInAt)}</span><span>完成：{displayDate(row.completedAt)}</span></div> },
      { title: "创建时间", width: 180, render: (_: unknown, row: MarketingParticipation) => displayDate(row.registeredAt) },
    ]} />
    <SideSheet visible={Boolean(selected)} closeOnEsc title="参与用户详情" width={Math.min(620, window.innerWidth - 20)} onCancel={() => setSelectedId("")}>
      {selected && identity && <DefinitionGrid rows={[["参与用户", participantDisplayName(selected, members)], ["参与渠道", channelLabels[participantChannel(selected)]], ["CRM 会员", identity.memberId || "—"], ["会员状态", participationIssue(selected, members) || participantIdentityReview(selected, members, activity.brand) === "UNVERIFIED" ? "身份待核验" : identity.memberId ? "已关联会员" : "未关联会员"], ["手机号", fullIdentity ? identity.phone || "—" : maskedPhone(identity.phone)], ["国家码", identity.phoneCountryCode || "—"], ["UnionID", fullIdentity ? identity.unionId || "—" : identity.unionId ? "权限受限" : "—"], ["OpenID", fullIdentity ? identity.openId || selected.identities[0]?.openid || "—" : identity.openId || selected.identities[0]?.openid ? "权限受限" : "—"], ["微信应用", identity.wechatAppId || "—"], ["品牌", brandLabels[activity.brand]], ["参与状态", participantLabels[participationStatus(state, selected, Date.now())]], ["参与时间", displayDate(selected.registeredAt)], ["参与编号", selected.id], ["匿名标识", fullIdentity ? identity.anonymousId || "—" : identity.anonymousId ? "权限受限" : "—"], ["Session ID", fullIdentity ? identity.sessionId || "—" : identity.sessionId ? "权限受限" : "—"], ["外部用户标识", fullIdentity ? identity.externalUserId || "—" : identity.externalUserId ? "权限受限" : "—"], ["签到时间", displayDate(selected.checkedInAt)], ["完成时间", displayDate(selected.completedAt)], ["获得 / 已用次数", `${chances(state, selected).earned} / ${chances(state, selected).used}`], ["是否中奖", state.awards.some(award => award.participationId === selected.id) ? "是" : "否"], ["参与凭证", selected.credential]]} />}
    </SideSheet>
  </>;
}
export function BookingData({ activity, scope, participationId, awardId, dataState }: { activity: MarketingActivity; scope?: MarketingBooking["kind"]; participationId?: string; awardId?: string; dataState?: MarketingState }) {
  const { state: stored } = useMarketing(), { state: members } = useMemberOperations(), filters = useDataFilters(); const [kind, setKind] = useState("ALL");
  const state = dataState ?? stored;
  const selectedKind = scope ?? kind;
  const rows = state.bookings.filter((row) => row.activityId === activity.id && (!participationId || row.participationId === participationId) && (!awardId || row.awardId === awardId) && (selectedKind === "ALL" || row.kind === selectedKind) && (filters.status === "ALL" || bookingStatus(row, slotFor(state, row), Date.now()) === filters.status) && dateMatches(row.createdAt, filters.date) && (() => { const participant = state.participations.find((item) => item.id === row.participationId); return !filters.search || Boolean(participant && `${participantDisplayName(participant, members)} ${participant.id} ${participant.identities.map((ref) => ref.userId).join(" ")}`.toLowerCase().includes(filters.search.toLowerCase())); })());
  return <><div className="table-toolbar">
    <Input prefix={<IconSearch />} aria-label="搜索预约用户" placeholder="搜索预约用户" value={filters.search} onChange={filters.setSearch} showClear />
    {!scope && <Select aria-label="预约类型" value={kind} onChange={value => setKind(String(value))} optionList={[{ value: "ALL", label: "全部预约类型" }, { value: "ACTIVITY", label: "活动预约" }, { value: "PRIZE", label: "领奖预约" }]} />}
    <Select aria-label="预约状态" value={filters.status} onChange={value => filters.setStatus(String(value))} optionList={[{ value: "ALL", label: "全部状态" }, ...Object.entries(bookingLabels).map(([value, label]) => ({ value, label }))]} />
    <Input aria-label="预约创建日期" type="date" value={filters.date} onChange={filters.setDate} />
  </div>
    <Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1430 }} empty={<EmptyBlock title={scope === "PRIZE" ? "暂无领奖预约" : "暂无预约记录"} description="预约后，相关时间和状态将在这里展示。" />} columns={[
      { title: "用户", width: 180, render: (_: unknown, row: MarketingBooking) => (() => { const participant = state.participations.find((item) => item.id === row.participationId); return participant ? participantDisplayName(participant, members) : "身份待核对"; })() },
      { title: "预约类型", width: 140, render: (_: unknown, row: MarketingBooking) => row.kind === "ACTIVITY" ? "活动预约" : "领奖预约" },
      { title: "场次 / 场地", width: 230, render: (_: unknown, row: MarketingBooking) => { const slot = slotFor(state, row); return slot ? `${slot.label} · ${displayDate(slot.startAt)} · ${slot.location}` : "场次待核对"; } },
      { title: "预约状态", width: 120, render: (_: unknown, row: MarketingBooking) => bookingLabels[bookingStatus(row, slotFor(state, row), Date.now())] },
      { title: "预约时间", width: 180, render: (_: unknown, row: MarketingBooking) => displayDate(row.createdAt) },
      { title: "签到 / 核销时间", width: 180, render: (_: unknown, row: MarketingBooking) => displayDate(row.kind === "ACTIVITY" ? row.status === "CHECKED_IN" ? state.participations.find((participant) => participant.id === row.participationId)?.checkedInAt : undefined : row.status === "FULFILLED" ? state.awards.find((award) => award.id === row.awardId)?.fulfilledAt : undefined) },
      { title: "取消时间", width: 180, render: (_: unknown, row: MarketingBooking) => displayDate(row.canceledAt) },
      { title: "来源", width: 120, render: (_: unknown, row: MarketingBooking) => ({ USER: "用户预约", WALK_IN: "现场报名", UNKNOWN: "旧记录未记录来源" })[row.source] },
    ]} />
  </>;
}
export function VirtualAwardContent({ award, dataState }: { award: MarketingAward; dataState?: MarketingState }) {
  const { state: stored } = useMarketing(), state = dataState ?? stored;
  if (needsReservation(award) && !award.issuedAt) return <DefinitionGrid rows={[["内容状态", awardFulfillmentLabel(state, award, Date.now())], ["领取方式", prizeReceivingLabel(award)], ["奖品内容", "领取 / 使用完成后显示"], ["有效期", `${displayDate(award.claimStart)} 至 ${displayDate(award.claimEnd)}`]]} />;
  return <>
    <DataList rows={[["内容状态", awardFulfillmentLabel(state, award, Date.now())], ["分配时间", displayDate(award.issuedAt)], ["有效期", `${displayDate(award.claimStart)} 至 ${displayDate(award.claimEnd)}`], ["使用说明", award.instructions]]} />
    {award.method === "REDEMPTION_CODE" && <p>兑换码：<code className="marketing-virtual-code">{award.virtualContent?.code || "未分配，待核对"}</code></p>}
    {award.method === "VIRTUAL_VOUCHER" && <DataList rows={[["凭证名称", award.virtualContent?.name || "未提供"], ["凭证描述", award.virtualContent?.description || "未提供"]]} />}
    {award.method === "LINK" && (award.virtualContent?.link && /^https?:\/\//i.test(award.virtualContent.link) ? <a target="_blank" rel="noopener noreferrer" href={award.virtualContent.link}>查看领取链接</a> : <p>领取链接未提供或无效，待核对</p>)}
  </>;
}
export function AwardData({ activity, dataState }: { activity: MarketingActivity; dataState?: MarketingState }) {
  const { state: stored } = useMarketing(), { state: members } = useMemberOperations(); const [selectedId, setSelectedId] = useState("");
  const state = dataState ?? stored;
  const rows = state.awards.filter((row) => row.activityId === activity.id), selected = rows.find((row) => row.id === selectedId);
  const currentBooking = (award: MarketingAward) => state.bookings.find((row) => row.awardId === award.id && ["BOOKED", "FULFILLED"].includes(row.status));
  return <><Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1120 }} empty={<EmptyBlock title="暂无中奖记录" description="用户中奖后，奖品和领取状态将在这里展示。" />} columns={[
    { title: "用户", width: 180, render: (_: unknown, row: MarketingAward) => { const participant = state.participations.find(item => item.id === row.participationId); return participant ? participantDisplayName(participant, members) : "身份待核对"; } },
    { title: "奖品", width: 200, dataIndex: "prizeName" },
    { title: "奖品类型", width: 120, render: (_: unknown, row: MarketingAward) => prizeTypeLabels[row.prizeType] },
    { title: "中奖时间", width: 180, render: (_: unknown, row: MarketingAward) => displayDate(row.wonAt) },
    { title: "领取方式", width: 120, render: (_: unknown, row: MarketingAward) => prizeReceivingLabel(row) },
    { title: "当前状态", width: 140, render: (_: unknown, row: MarketingAward) => awardFulfillmentLabel(state, row, Date.now()) },
    { title: "操作", width: 100, fixed: "right", render: (_: unknown, row: MarketingAward) => <Button theme="borderless" size="small" onClick={() => setSelectedId(row.id)}>查看权益</Button> },
  ]} /><SideSheet visible={Boolean(selected)} closeOnEsc title="中奖权益详情" width={Math.min(600, window.innerWidth - 24)} onCancel={() => setSelectedId("")}>
    {selected && <><DataList rows={[["奖品", selected.prizeName], ["奖项", selected.awardLabel], ["奖品类型", prizeTypeLabels[selected.prizeType]], ["领取方式", prizeReceivingLabel(selected)], ["领奖凭证", <code>{selected.credential}</code>], ["中奖时间", displayDate(selected.wonAt)], ["核销时间", displayDate(selected.fulfilledAt)], ["发放时间", displayDate(selected.issuedAt)], ["预约状态", currentBooking(selected) ? bookingLabels[bookingStatus(currentBooking(selected)!, slotFor(state, currentBooking(selected)!), Date.now())] : needsReservation(selected) ? "未预约" : "无需预约"]]} />{selected.prizeType === "VIRTUAL" ? <VirtualAwardContent award={selected} dataState={state} /> : <DataList rows={[["领取地点（快照）", selected.location], ["领取说明（快照）", selected.instructions], ["有效期", `${displayDate(selected.claimStart)} 至 ${displayDate(selected.claimEnd)}`]]} />}</>}
  </SideSheet></>;
}
export function RedemptionData({ activity, dataState }: { activity: MarketingActivity; dataState?: MarketingState }) {
  const { state: stored } = useMarketing(), { state: members } = useMemberOperations(), { state: sales } = useCrm(); const [type, setType] = useState("ALL");
  const state = dataState ?? stored;
  const rows = state.redemptions.filter((row) => row.activityId === activity.id && (type === "ALL" || row.type === type)).slice().reverse();
  return <><div className="table-toolbar"><Select aria-label="核销业务类型" value={type} onChange={value => setType(String(value))} optionList={[{ value: "ALL", label: "全部核销类型" }, ...Object.entries(redemptionLabels).map(([value, label]) => ({ value, label }))]} /></div>
    <Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1040 }} empty={<EmptyBlock title="暂无核销记录" description="完成签到、参与确认或领奖核销后，相关记录将在这里展示。" />} columns={[
      { title: "用户", width: 180, render: (_: unknown, row: MarketingRedemption) => { const participant = state.participations.find(item => item.id === row.participationId); return participant ? participantDisplayName(participant, members) : "身份待核对"; } },
      { title: "核销类型", width: 140, render: (_: unknown, row: MarketingRedemption) => redemptionLabels[row.type] },
      { title: "对象", width: 200, render: (_: unknown, row: MarketingRedemption) => row.awardId ? state.awards.find(award => award.id === row.awardId)?.prizeName || "历史权益待核对" : "活动参与" },
      { title: "核销时间", width: 180, render: (_: unknown, row: MarketingRedemption) => displayDate(row.occurredAt) },
      { title: "核销人员", width: 180, render: (_: unknown, row: MarketingRedemption) => sales.users.find(user => user.id === row.actorId)?.name || "历史人员待核对" },
      { title: "结果", width: 120, render: (_: unknown, row: MarketingRedemption) => <span title={marketingBusinessCopy(row.detail)}>{row.result === "SUCCESS" ? "成功" : "拒绝"}</span> },
    ]} />
  </>;
}
export function AuditData({ activity }: { activity: MarketingActivity }) {
  const { state } = useMarketing();
  return <Panel title="操作记录"><Table rowKey="id" dataSource={state.audits.filter((row) => row.activityId === activity.id).slice().reverse()} pagination={{ pageSize: 10 }} scroll={{ x: 920 }} columns={[{ title: "动作", dataIndex: "action", width: 200 }, { title: "对象", dataIndex: "targetId", width: 230 }, { title: "操作人", dataIndex: "actorId", width: 140 }, { title: "时间", width: 180, render: (_: unknown, row: typeof state.audits[number]) => displayDate(row.occurredAt) }, { title: "结果 / 说明", width: 280, render: (_: unknown, row: typeof state.audits[number]) => `${row.result} · ${marketingBusinessCopy(row.detail)}` }]} /></Panel>;
}
