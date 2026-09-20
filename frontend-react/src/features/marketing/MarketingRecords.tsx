import { useState } from "react";
import { Button, Input, Modal, Select, SideSheet, Table, Tag } from "@douyinfe/semi-ui";
import { IconSearch } from "@douyinfe/semi-icons";
import { DataList, EmptyBlock } from "@/components/CrmUi";
import { useMarketing } from "@/stores/marketing-store";
import { useMemberOperations } from "@/stores/member-operations-store";
import { useCrm } from "@/stores/crm-store";
import type { MarketingActivity, MarketingBooking, MarketingParticipation, MarketingState } from "@/types/marketing";
import type { MemberOperationsState } from "@/types/member-operations";
import { parseCreatedAt, shanghaiDate } from "@/features/dashboard/dashboard-model";
import { bookingStatus, marketingPermissions, needsReservation, participantDisplayName, participantIdentity, slotFor } from "./marketing-model";
import { activityBookingLabels, activityBookingPhase, activityDrawRecords, drawPhaseOptions, drawRecordLabels, participantGender, type ActivityDrawRecord } from "./marketing-records";
import { participantTaskClues, participantTaskCompleted } from "./marketing-participant-tasks";
import { maskedPhone, VirtualAwardContent } from "./MarketingData";
import { PickupRoster } from "./MarketingPickup";
import { displayAwardStatus, displayBookingLabels, displayDate, displayDateRange, prizeReceivingLabel, Panel } from "./MarketingUi";
import { isCoachPrototype, prototypeLocationLabel } from "@/utils/prototype-variant";

const maskedOpenId = (value?: string | null) => !value ? "—" : value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : "****";
const participantOpenId = (participant: MarketingParticipation | undefined, members: MemberOperationsState) => participant ? participantIdentity(participant, members).openId || participant.identities[0]?.openid || "" : "";
const dateMatches = (value: string | undefined, date: string) => !date || Boolean(value && Number.isFinite(parseCreatedAt(value)) && shanghaiDate(parseCreatedAt(value)) === date);
function participantSearch(participant: MarketingParticipation | undefined, members: MemberOperationsState) {
  const identity = participant && participantIdentity(participant, members);
  return participant ? `${participantDisplayName(participant, members)} ${identity?.phone ?? ""} ${identity?.openId ?? ""} ${participant.id}`.toLowerCase() : "身份待核对";
}
function IdentityData({ participant, members, full, openIdOnly = false }: { participant?: MarketingParticipation; members: MemberOperationsState; full: boolean; openIdOnly?: boolean }) {
  const identity = participant && participantIdentity(participant, members);
  if (openIdOnly) return <DataList rows={[["OpenID", full ? participantOpenId(participant, members) || "—" : maskedOpenId(participantOpenId(participant, members))]]} />;
  return <DataList rows={[
    ["姓名", participant ? participantDisplayName(participant, members) : "身份待核对"],

    ["手机号", full ? identity?.phone || "—" : maskedPhone(identity?.phone)], ["国家码", identity?.phoneCountryCode || "—"],
    ["性别", participantGender(participant)],
  ]} />;
}
export function ActivityBookingData({ activity, now, dataState }: { activity: MarketingActivity; now: number; dataState?: MarketingState }) {
  const { state: stored } = useMarketing(), { state: members } = useMemberOperations(), { currentUser } = useCrm();
  const state = dataState ?? stored;
  const [search, setSearch] = useState(""), [status, setStatus] = useState("ALL"), [date, setDate] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const participantFor = (row: MarketingBooking) => state.participations.find(item => item.activityId === activity.id && item.id === row.participationId);
  const rows = state.bookings.filter(row => row.activityId === activity.id && row.kind === "ACTIVITY" &&
    participantSearch(participantFor(row), members).includes(search.trim().toLowerCase()) && (status === "ALL" || activityBookingPhase(row) === status) && dateMatches(row.createdAt, date));
  const selected = rows.find(row => row.id === selectedId);
  const selectedSlot = selected && slotFor(state, selected), full = marketingPermissions(currentUser).manage;
  return <><div className="table-toolbar">
    <Input prefix={<IconSearch />} aria-label="搜索活动预约" placeholder="姓名、手机号或 OpenID" value={search} onChange={setSearch} showClear />
    <Select aria-label="活动预约状态" value={status} onChange={value => setStatus(String(value))} optionList={[{ value: "ALL", label: "全部状态" }, ...Object.entries(activityBookingLabels).map(([value, label]) => ({ value, label }))]} />
    <Input aria-label="活动预约创建日期" type="date" value={date} onChange={setDate} />
  </div><Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 960 }} empty={<EmptyBlock title="暂无活动预约记录" description={activity.bookingEnabled ? "用户提交活动预约后，将在这里展示。" : "此活动直接参与，无需预约。"} />} columns={[
    { title: "用户", width: 135, render: (_: unknown, row: MarketingBooking) => { const participant = participantFor(row); return participant ? participantDisplayName(participant, members) : "身份待核对"; } },
    { title: "手机号", width: 130, render: (_: unknown, row: MarketingBooking) => { const participant = participantFor(row); return maskedPhone(participant && participantIdentity(participant, members).phone); } },
    { title: "参与时段", width: 180, render: (_: unknown, row: MarketingBooking) => { const slot = slotFor(state, row); return slot ? displayDateRange(slot.startAt, slot.endAt).compact : "场次待核对"; } },
    { title: "预约时间", width: 145, render: (_: unknown, row: MarketingBooking) => displayDate(row.createdAt) },
    { title: "状态", width: 120, render: (_: unknown, row: MarketingBooking) => <div className="marketing-summary-cell"><Tag size="small" color={activityBookingPhase(row) === "REDEEMED" ? "green" : "grey"}>{activityBookingLabels[activityBookingPhase(row)]}</Tag>{["INVALID", "NO_SHOW"].includes(bookingStatus(row, slotFor(state, row), now)) && <small>{displayBookingLabels[bookingStatus(row, slotFor(state, row), now)]}</small>}</div> },
    { title: "签到 / 完成", width: 140, render: (_: unknown, row: MarketingBooking) => <div className="marketing-summary-cell"><span>{participantFor(row)?.checkedInAt ? "已签到" : "未签到"}</span><small>{participantFor(row)?.completedAt ? "已完成" : "未完成"}</small></div> },
    { title: "操作", width: 70, fixed: "right", render: (_: unknown, row: MarketingBooking) => <Button theme="borderless" size="small" onClick={() => setSelectedId(row.id)}>查看</Button> },
  ]} />
    <SideSheet visible={Boolean(selected)} closeOnEsc title="活动预约详情" width={Math.min(640, window.innerWidth)} onCancel={() => setSelectedId("")}>
      {selected && <><Panel title="用户信息"><IdentityData participant={participantFor(selected)} members={members} full={full} /></Panel><Panel title="预约信息"><DataList rows={[
        ["活动名称", activity.name], ["状态", activityBookingLabels[activityBookingPhase(selected)]], ["预约校验", displayBookingLabels[bookingStatus(selected, selectedSlot, now)]],
        ["参与时段", selectedSlot ? displayDateRange(selectedSlot.startAt, selectedSlot.endAt).compact : "场次待核对"],
        ["场地", selectedSlot?.location || "—"], ["创建时间", displayDate(selected.createdAt)], ["取消时间", displayDate(selected.canceledAt)],

      ]} /></Panel><Panel title="参与状态"><DataList rows={[["签到时间", displayDate(participantFor(selected)?.checkedInAt)], ["完成时间", displayDate(participantFor(selected)?.completedAt)]]} /></Panel>
        <Panel title="系统信息"><DataList rows={[["预约编号", selected.id], ["参与编号", selected.participationId], ["OpenID", full ? (participantFor(selected) ? participantIdentity(participantFor(selected)!, members).openId : undefined) || "—" : maskedOpenId((participantFor(selected) ? participantIdentity(participantFor(selected)!, members).openId : undefined))], ["微信应用", participantFor(selected)?.identity?.wechatAppId || "未记录"], ["来源", selected.source === "WALK_IN" ? "现场登记" : selected.source === "USER" ? "用户预约" : "未记录"]]} /></Panel></>}
    </SideSheet>
  </>;
}

export function ParticipantTaskData({ activity, dataState }: { activity: MarketingActivity; dataState?: MarketingState }) {
  const { state: stored } = useMarketing(), { state: members } = useMemberOperations(), { currentUser } = useCrm();
  const state = dataState ?? stored, full = marketingPermissions(currentUser).manage;
  const coachMode = isCoachPrototype();
  const [search, setSearch] = useState(""), [status, setStatus] = useState("ALL"), [selectedId, setSelectedId] = useState("");
  const rows = state.participations.filter((participant) => participant.activityId === activity.id)
    .filter((participant) => (coachMode ? participantOpenId(participant, members) : participantSearch(participant, members)).toLowerCase().includes(search.trim().toLowerCase()))
    .filter((participant) => status === "ALL" || (participantTaskCompleted(participant) ? "COMPLETED" : "INCOMPLETE") === status);
  const selected = rows.find((participant) => participant.id === selectedId);
  const identityFor = (participant: MarketingParticipation) => participantIdentity(participant, members);
  const openIdFor = (participant: MarketingParticipation) => participantOpenId(participant, members);
  const displayName = (participant: MarketingParticipation) => participantDisplayName(participant, members);
  const progress = (participant: MarketingParticipation) => <div className={`marketing-clue-progress ${coachMode ? "coach-clue-progress" : ""}`}>{participantTaskClues(participant).map((clue) => coachMode
    ? <Tag key={clue.id} size="small" color={clue.completed ? "green" : "grey"}>{clue.label}：{clue.completed ? "已完成" : "未完成"}</Tag>
    : <span key={clue.id} data-complete={clue.completed}>{clue.label}：{clue.completed ? "已完成" : "未完成"}</span>)}</div>;
  const columns = coachMode ? [
    { title: "OpenID", width: 240, render: (_: unknown, participant: MarketingParticipation) => openIdFor(participant) || "—" },
    { title: "完成情况", width: 480, render: (_: unknown, participant: MarketingParticipation) => progress(participant) },
    { title: "状态", width: 120, render: (_: unknown, participant: MarketingParticipation) => <Tag size="small" color={participantTaskCompleted(participant) ? "green" : "grey"}>{participantTaskCompleted(participant) ? "已完成" : "未完成"}</Tag> },
    { title: "操作", width: 80, fixed: "right" as const, render: (_: unknown, participant: MarketingParticipation) => <Button theme="borderless" size="small" onClick={() => setSelectedId(participant.id)}>查看</Button> },
  ] : [
    { title: "用户", width: 140, render: (_: unknown, participant: MarketingParticipation) => displayName(participant) },
    { title: "OpenID", width: 185, render: (_: unknown, participant: MarketingParticipation) => full ? openIdFor(participant) || "—" : maskedOpenId(openIdFor(participant)) },
    { title: "手机号", width: 145, render: (_: unknown, participant: MarketingParticipation) => full ? identityFor(participant).phone || "—" : maskedPhone(identityFor(participant).phone) },
    { title: "线索完成情况", width: 420, render: (_: unknown, participant: MarketingParticipation) => progress(participant) },
    { title: "状态", width: 105, render: (_: unknown, participant: MarketingParticipation) => <Tag size="small" color={participantTaskCompleted(participant) ? "green" : "grey"}>{participantTaskCompleted(participant) ? "已完成" : "未完成"}</Tag> },
    { title: "操作", width: 70, fixed: "right" as const, render: (_: unknown, participant: MarketingParticipation) => <Button theme="borderless" size="small" onClick={() => setSelectedId(participant.id)}>查看</Button> },
  ];
  return <><div className="table-toolbar">
    <Input prefix={<IconSearch />} aria-label="搜索参与用户" placeholder={coachMode ? "搜索 OpenID" : "用户、手机号或 OpenID"} value={search} onChange={setSearch} showClear />
    <Select aria-label="参与用户任务状态" value={status} onChange={value => setStatus(String(value))} optionList={[{ value: "ALL", label: "全部状态" }, { value: "COMPLETED", label: "已完成" }, { value: "INCOMPLETE", label: "未完成" }]} />
  </div><Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: coachMode ? 820 : 1120 }} empty={<EmptyBlock title="暂无参与用户" description="用户参与活动后，任务进度将在这里展示。" />} columns={columns} />
    <SideSheet visible={Boolean(selected)} closeOnEsc title="参与用户详情" width={Math.min(640, window.innerWidth)} onCancel={() => setSelectedId("")}>
      {selected && <><Panel title="用户信息"><DataList rows={coachMode ? [["OpenID", openIdFor(selected) || "—"], ["参与时间", displayDate(selected.registeredAt)]] : [["用户", displayName(selected)], ["OpenID", full ? openIdFor(selected) || "—" : maskedOpenId(openIdFor(selected))], ["手机号", full ? identityFor(selected).phone || "—" : maskedPhone(identityFor(selected).phone)], ["参与时间", displayDate(selected.registeredAt)]]} /></Panel>
        <Panel title="活动任务"><div className="marketing-clue-detail">{participantTaskClues(selected).map((clue) => <div key={clue.id}><span>{clue.label}</span><strong data-complete={clue.completed}>{clue.completed ? "已完成" : "未完成"}</strong></div>)}</div><DataList rows={[["整体状态", participantTaskCompleted(selected) ? "已完成" : "未完成"]]} /></Panel></>}
    </SideSheet>
  </>;
}

export function DrawData({ activity, now, dataState }: { activity: MarketingActivity; now: number; dataState?: MarketingState }) {
  const { state: stored } = useMarketing(), { state: members } = useMemberOperations(), { currentUser } = useCrm();
  const state = dataState ?? stored;
  const coachMode = isCoachPrototype();
  const [search, setSearch] = useState(""), [status, setStatus] = useState("ALL"), [date, setDate] = useState("");
  const [selectedId, setSelectedId] = useState(""), [historyId, setHistoryId] = useState("");
  const prizeBookingFor = (row: ActivityDrawRecord) => row.award ? state.bookings.filter(booking => booking.activityId === activity.id && booking.kind === "PRIZE" && booking.awardId === row.award!.id && booking.status !== "CANCELED").at(-1) : undefined;
  const redemptionFor = (row: ActivityDrawRecord) => row.award ? state.redemptions.find(redemption => redemption.awardId === row.award!.id && redemption.result === "SUCCESS" && ["PRIZE_CLAIM", "EXPERIENCE_CLAIM"].includes(redemption.type)) : undefined;
  const redemptionStatus = (row: ActivityDrawRecord) => !row.award ? "NONE" : row.award.fulfilledAt ? "REDEEMED" : needsReservation(row.award) && !prizeBookingFor(row) ? "PENDING_PRODUCTION" : "PENDING_REDEMPTION";
  const rows = activityDrawRecords(state, activity, now).filter(row =>
    Boolean(row.draw) && (coachMode ? participantOpenId(row.participant, members) : participantSearch(row.participant, members)).toLowerCase().includes(search.trim().toLowerCase()) &&
    (status === "ALL" || (coachMode ? redemptionStatus(row) : String(row.phase)) === status) && dateMatches(row.draw?.occurredAt ?? row.award?.wonAt ?? row.participant?.registeredAt, date));
  const selected = rows.find(row => row.id === selectedId), history = rows.find(row => row.id === historyId);
  const result = (row: ActivityDrawRecord) => row.award?.prizeName || (row.phase === 1 ? "—" : row.draw?.poolItemId ? "中奖权益待核对" : "未中奖");
  const identityFor = (row: ActivityDrawRecord) => row.participant && participantIdentity(row.participant, members);
  const coachColumns = [
    { title: "OpenID", width: 240, render: (_: unknown, row: ActivityDrawRecord) => participantOpenId(row.participant, members) || "—" },
    { title: "活动场次", width: 210, render: (_: unknown, row: ActivityDrawRecord) => { const slot = activity.slots.find(item => item.id === row.draw?.sessionId); return slot ? <div className="marketing-summary-cell"><span>{slot.label}</span><small>{displayDateRange(slot.startAt, slot.endAt).compact}</small></div> : activity.bookingEnabled ? "历史场次未记录" : "直接参与"; } },
    { title: "奖品", width: 150, render: (_: unknown, row: ActivityDrawRecord) => result(row) },
    { title: "抽奖状态", width: 100, render: (_: unknown, row: ActivityDrawRecord) => <Tag size="small" color={row.draw?.poolItemId ? "green" : "grey"}>{row.draw?.poolItemId ? "中奖" : "未中奖"}</Tag> },
    { title: "兑奖状态", width: 110, render: (_: unknown, row: ActivityDrawRecord) => { const value = redemptionStatus(row); return value === "NONE" ? "—" : <Tag size="small" color={value === "REDEEMED" ? "green" : value === "PENDING_REDEMPTION" ? "blue" : "grey"}>{({ PENDING_PRODUCTION: "待制作", PENDING_REDEMPTION: "待核销", REDEEMED: "已核销" })[value]}</Tag>; } },
    { title: "抽奖时间", width: 160, render: (_: unknown, row: ActivityDrawRecord) => displayDate(row.draw?.occurredAt) },
    { title: "兑奖时间", width: 200, render: (_: unknown, row: ActivityDrawRecord) => { const booking = prizeBookingFor(row), slot = booking && slotFor(state, booking); return slot ? displayDateRange(slot.startAt, slot.endAt).compact : displayDate(row.award?.fulfilledAt); } },
    { title: "制作时间", width: 160, render: (_: unknown, row: ActivityDrawRecord) => displayDate(row.award?.issuedAt) },
    { title: "核销账号", width: 130, render: (_: unknown, row: ActivityDrawRecord) => redemptionFor(row)?.actorId || "—" },
    { title: "核销时间", width: 160, render: (_: unknown, row: ActivityDrawRecord) => displayDate(redemptionFor(row)?.occurredAt ?? row.award?.fulfilledAt) },
    { title: "创建时间", width: 160, render: (_: unknown, row: ActivityDrawRecord) => displayDate(row.draw?.occurredAt) },
    { title: "操作", width: 150, fixed: "right" as const, render: (_: unknown, row: ActivityDrawRecord) => <div className="row-actions"><Button theme="borderless" size="small" onClick={() => setSelectedId(row.id)}>查看</Button>{row.reservation && row.award && <Button theme="borderless" size="small" onClick={() => setHistoryId(row.id)}>预约记录</Button>}</div> },
  ];
  const standardColumns = [
    { title: "用户", width: 130, render: (_: unknown, row: ActivityDrawRecord) => <div className="marketing-summary-cell"><span>{row.participant ? participantDisplayName(row.participant, members) : "身份待核对"}</span><small>{maskedPhone(identityFor(row)?.phone)}</small></div> },
    { title: "活动场次", width: 175, render: (_: unknown, row: ActivityDrawRecord) => { const slot = activity.slots.find(item => item.id === row.draw?.sessionId); return slot ? displayDateRange(slot.startAt, slot.endAt).compact : activity.bookingEnabled ? "历史场次未记录" : "直接参与"; } },
    { title: "结果", width: 80, render: (_: unknown, row: ActivityDrawRecord) => row.draw?.poolItemId ? "中奖" : "未中奖" },
    { title: "奖品", width: 165, render: (_: unknown, row: ActivityDrawRecord) => result(row) },
    { title: "领取状态", width: 135, render: (_: unknown, row: ActivityDrawRecord) => <div className="marketing-summary-cell"><Tag size="small" color={[3, 5].includes(row.phase) ? "green" : row.phase === 4 ? "blue" : "grey"}>{drawRecordLabels[row.phase]}</Tag>{row.note && <small>{row.note}</small>}</div> },
    { title: "抽奖时间", width: 140, render: (_: unknown, row: ActivityDrawRecord) => displayDate(row.draw?.occurredAt) },
    { title: "操作", width: 165, fixed: "right" as const, render: (_: unknown, row: ActivityDrawRecord) => <div className="row-actions"><Button theme="borderless" size="small" onClick={() => setSelectedId(row.id)}>查看</Button>{row.reservation && row.award && <Button theme="borderless" size="small" onClick={() => setHistoryId(row.id)}>预约记录</Button>}</div> },
  ];
  return <><div className="table-toolbar">
    <Input prefix={<IconSearch />} aria-label="搜索抽奖记录" placeholder={coachMode ? "搜索 OpenID" : "姓名、手机号或 OpenID"} value={search} onChange={setSearch} showClear />
    <Select aria-label="抽奖记录状态" value={status} onChange={value => setStatus(String(value))} optionList={coachMode ? [{ value: "ALL", label: "全部兑奖状态" }, { value: "PENDING_PRODUCTION", label: "待制作" }, { value: "PENDING_REDEMPTION", label: "待核销" }, { value: "REDEEMED", label: "已核销" }] : [{ value: "ALL", label: "全部状态" }, ...drawPhaseOptions]} />
    <Input aria-label="抽奖记录日期" type="date" value={date} onChange={setDate} />
  </div><Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: coachMode ? 1940 : 990 }} empty={<EmptyBlock title="暂无抽奖记录" description="每次实际发生的抽奖结果将在这里展示。" />} columns={coachMode ? coachColumns : standardColumns} />
    <SideSheet visible={Boolean(selected)} closeOnEsc className={coachMode ? "coach-marketing-sheet" : undefined} title="抽奖记录详情" width={Math.min(640, window.innerWidth)} onCancel={() => setSelectedId("")}>
      {selected && (coachMode ? <Panel title="抽奖记录"><DataList rows={[
        ["OpenID", participantOpenId(selected.participant, members) || "—"],
        ["活动场次", (() => { const slot = activity.slots.find(item => item.id === selected.draw?.sessionId); return slot ? `${slot.label} · ${displayDateRange(slot.startAt, slot.endAt).compact}` : activity.bookingEnabled ? "历史场次未记录" : "直接参与"; })()],
        ["奖品", result(selected)],
        ["抽奖状态", selected.draw?.poolItemId ? "中奖" : "未中奖"],
        ["兑奖状态", ({ NONE: "—", PENDING_PRODUCTION: "待制作", PENDING_REDEMPTION: "待核销", REDEEMED: "已核销" })[redemptionStatus(selected)]],
        ["抽奖时间", displayDate(selected.draw?.occurredAt)],
        ["兑奖时间", (() => { const booking = prizeBookingFor(selected), slot = booking && slotFor(state, booking); return slot ? displayDateRange(slot.startAt, slot.endAt).compact : displayDate(selected.award?.fulfilledAt); })()],
        ["制作时间", displayDate(selected.award?.issuedAt)],
        ["核销账号", redemptionFor(selected)?.actorId || "—"],
        ["核销时间", displayDate(redemptionFor(selected)?.occurredAt ?? selected.award?.fulfilledAt)],
        ["创建时间", displayDate(selected.draw?.occurredAt)],
      ]} /></Panel> : <><Panel title="抽奖信息"><IdentityData participant={selected.participant} members={members} full={marketingPermissions(currentUser).manage} /><DataList rows={[
        ["活动", activity.name], ["场次", selected.draw?.sessionId ? (() => { const slot = activity.slots.find(slot => slot.id === selected.draw?.sessionId); return slot ? displayDateRange(slot.startAt, slot.endAt).compact : "历史场次待核对"; })() : activity.bookingEnabled ? "历史场次未记录" : "直接参与"],
        ["抽奖时间", displayDate(selected.draw?.occurredAt)],
      ]} /></Panel><Panel title="抽奖结果"><DataList rows={[["结果", selected.draw?.poolItemId ? "中奖" : "未中奖"], ["奖品", result(selected)], ["处理说明", selected.note || "—"]]} /></Panel>
      <Panel title="规则快照">{selected.draw?.probabilitySnapshot ? <><Table rowKey="prizeId" size="small" pagination={false} dataSource={selected.draw.probabilitySnapshot} columns={[
        { title: "奖品", render: (_: unknown, row: NonNullable<NonNullable<ActivityDrawRecord["draw"]>["probabilitySnapshot"]>[number]) => row.prizeName || activity.pool.find(prize => prize.id === row.prizeId)?.name || "历史奖品待核对" },
        { title: "配置概率", render: (_: unknown, row: { configuredProbability: number }) => `${row.configuredProbability}%` },
        { title: "实际概率", render: (_: unknown, row: { effectiveProbability: number }) => `${row.effectiveProbability}%` },
        { title: "当时剩余", render: (_: unknown, row: { quantityMode: string; sessionRemaining?: number }) => row.quantityMode === "UNLIMITED" ? "不限量" : row.sessionRemaining ?? "未记录" },
      ]} /><p className="marketing-field-help">未中奖概率 {Math.max(0, 100 - selected.draw.probabilitySnapshot.reduce((sum, row) => sum + row.effectiveProbability, 0))}% · 保存抽奖发生时的规则，不按当前配置重算。</p></> : <EmptyBlock title="历史概率未记录" description="不会用当前规则补写历史快照。" />}</Panel>
      <Panel title="领奖信息">{selected.award ? <><DataList rows={[
        ["领取方式", prizeReceivingLabel(selected.award)], ["领取情况", displayAwardStatus(state, selected.award, now)],
        ["领取有效期", displayDateRange(selected.award.claimStart, selected.award.claimEnd).compact],
        ["领取地点", prototypeLocationLabel(selected.award.location)], ["核销时间", displayDate(selected.award.fulfilledAt)], ["领取说明", selected.award.instructions || "—"],
      ]} />{selected.award.prizeType === "VIRTUAL" && <VirtualAwardContent award={selected.award} dataState={state} />}</> : <p>未产生中奖权益。</p>}</Panel>
      <Panel title="系统信息"><DataList rows={[
        ["抽奖编号", selected.draw?.id], ["参与编号", selected.participant?.id], ["中奖编号", selected.award?.id], ["领奖凭证", selected.award?.credential],
        ["OpenID", marketingPermissions(currentUser).manage ? identityFor(selected)?.openId || "—" : maskedOpenId(identityFor(selected)?.openId)], ["微信应用", identityFor(selected)?.wechatAppId || "未记录"],
        ["规则版本", String(selected.draw?.drawConfigVersion ?? selected.draw?.ruleVersion ?? "未记录")],
      ]} /></Panel></>)}

    </SideSheet>
    <Modal visible={Boolean(history?.award)} className="marketing-prize-booking-modal" title="奖品预约记录" width={Math.min(800, window.innerWidth - 40)} bodyStyle={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }} onCancel={() => setHistoryId("")} footer={<Button onClick={() => setHistoryId("")}>关闭</Button>}>
      {history?.award && <><DataList rows={[[coachMode ? "OpenID" : "用户", coachMode ? participantOpenId(history.participant, members) || "—" : history.participant ? participantDisplayName(history.participant, members) : "身份待核对"], ["奖品", history.award.prizeName]]} /><div className="marketing-prize-booking-history"><PickupRoster activity={activity} rows={state.bookings.filter(row => row.activityId === activity.id && row.kind === "PRIZE" && row.awardId === history.award!.id)} /></div></>}
    </Modal>
  </>;
}
