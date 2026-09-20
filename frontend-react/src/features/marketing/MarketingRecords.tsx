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
import { bookingStatus, marketingPermissions, participantDisplayName, participantIdentity, slotFor } from "./marketing-model";
import { activityBookingLabels, activityBookingPhase, activityDrawRecords, drawPhaseOptions, drawRecordLabels, participantGender, type ActivityDrawRecord } from "./marketing-records";
import { BookingData, maskedPhone, VirtualAwardContent } from "./MarketingData";
import { displayAwardStatus, displayBookingLabels, displayDate, displayDateRange, prizeReceivingLabel, DefinitionGrid } from "./MarketingUi";

const maskedOpenId = (value?: string | null) => !value ? "—" : value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : "****";
const dateMatches = (value: string | undefined, date: string) => !date || Boolean(value && Number.isFinite(parseCreatedAt(value)) && shanghaiDate(parseCreatedAt(value)) === date);
function participantSearch(participant: MarketingParticipation | undefined, members: MemberOperationsState) {
  const identity = participant && participantIdentity(participant, members);
  return participant ? `${participantDisplayName(participant, members)} ${identity?.phone ?? ""} ${identity?.openId ?? ""} ${participant.id}`.toLowerCase() : "身份待核对";
}
function IdentityData({ participant, members, full }: { participant?: MarketingParticipation; members: MemberOperationsState; full: boolean }) {
  const identity = participant && participantIdentity(participant, members);
  return <DataList rows={[
    ["姓名", participant ? participantDisplayName(participant, members) : "身份待核对"],
    ["OpenID", full ? identity?.openId || "—" : maskedOpenId(identity?.openId)], ["微信应用", identity?.wechatAppId || "未记录"],
    ["手机号", full ? identity?.phone || "—" : maskedPhone(identity?.phone)], ["国家码", identity?.phoneCountryCode || "—"],
    ["性别", participantGender(participant)], ["参与编号", participant?.id || "—"],
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
  </div><Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1525 }} empty={<EmptyBlock title="暂无活动预约记录" description={activity.bookingEnabled ? "用户提交活动预约后，将在这里展示。" : "此活动直接参与，无需预约。"} />} columns={[
    { title: "OpenID", width: 155, render: (_: unknown, row: MarketingBooking) => { const participant = participantFor(row); return maskedOpenId(participant && participantIdentity(participant, members).openId); } },
    { title: "姓名", width: 150, render: (_: unknown, row: MarketingBooking) => { const participant = participantFor(row); return participant ? participantDisplayName(participant, members) : "身份待核对"; } },
    { title: "手机号", width: 150, render: (_: unknown, row: MarketingBooking) => { const participant = participantFor(row); return maskedPhone(participant && participantIdentity(participant, members).phone); } },
    { title: "性别", width: 90, render: (_: unknown, row: MarketingBooking) => participantGender(participantFor(row)) },
    { title: "活动名称", width: 190, render: () => activity.name },
    { title: "参与时段", width: 240, render: (_: unknown, row: MarketingBooking) => { const slot = slotFor(state, row); return slot ? displayDateRange(slot.startAt, slot.endAt).compact : "场次待核对"; } },
    { title: "创建时间", width: 180, render: (_: unknown, row: MarketingBooking) => displayDate(row.createdAt) },
    { title: "状态", width: 160, render: (_: unknown, row: MarketingBooking) => <div className="marketing-summary-cell"><Tag size="small" color={activityBookingPhase(row) === "REDEEMED" ? "green" : "grey"}>{activityBookingLabels[activityBookingPhase(row)]}</Tag>{["INVALID", "NO_SHOW"].includes(bookingStatus(row, slotFor(state, row), now)) && <small>{displayBookingLabels[bookingStatus(row, slotFor(state, row), now)]}</small>}</div> },
    { title: "操作", width: 110, fixed: "right", render: (_: unknown, row: MarketingBooking) => <Button theme="borderless" size="small" onClick={() => setSelectedId(row.id)}>查看</Button> },
  ]} />
    <SideSheet visible={Boolean(selected)} closeOnEsc title="活动预约详情" width={Math.min(640, window.innerWidth)} onCancel={() => setSelectedId("")}>
      {selected && <><IdentityData participant={participantFor(selected)} members={members} full={full} /><DataList rows={[
        ["活动名称", activity.name], ["状态", activityBookingLabels[activityBookingPhase(selected)]], ["预约校验", displayBookingLabels[bookingStatus(selected, selectedSlot, now)]],
        ["参与时段", selectedSlot ? displayDateRange(selectedSlot.startAt, selectedSlot.endAt).compact : "场次待核对"],
        ["场地", selectedSlot?.location || "—"], ["创建时间", displayDate(selected.createdAt)], ["取消时间", displayDate(selected.canceledAt)],
        ["签到核销时间", selected.status === "CHECKED_IN" ? displayDate(participantFor(selected)?.checkedInAt) : "—"], ["预约编号", selected.id],
      ]} /></>}
    </SideSheet>
  </>;
}
export function DrawData({ activity, now, dataState }: { activity: MarketingActivity; now: number; dataState?: MarketingState }) {
  const { state: stored } = useMarketing(), { state: members } = useMemberOperations(), { currentUser } = useCrm();
  const state = dataState ?? stored;
  const [search, setSearch] = useState(""), [status, setStatus] = useState("ALL"), [date, setDate] = useState("");
  const [selectedId, setSelectedId] = useState(""), [historyId, setHistoryId] = useState("");
  const rows = activityDrawRecords(state, activity, now).filter(row =>
    Boolean(row.draw) && participantSearch(row.participant, members).includes(search.trim().toLowerCase()) &&
    (status === "ALL" || String(row.phase) === status) && dateMatches(row.draw?.occurredAt ?? row.award?.wonAt ?? row.participant?.registeredAt, date));
  const selected = rows.find(row => row.id === selectedId), history = rows.find(row => row.id === historyId);
  const result = (row: ActivityDrawRecord) => row.award?.prizeName || (row.phase === 1 ? "—" : row.draw?.poolItemId ? "中奖权益待核对" : "未中奖");
  const identityFor = (row: ActivityDrawRecord) => row.participant && participantIdentity(row.participant, members);
  return <><div className="table-toolbar">
    <Input prefix={<IconSearch />} aria-label="搜索抽奖记录" placeholder="姓名、手机号或 OpenID" value={search} onChange={setSearch} showClear />
    <Select aria-label="抽奖记录状态" value={status} onChange={value => setStatus(String(value))} optionList={[{ value: "ALL", label: "全部状态" }, ...drawPhaseOptions]} />
    <Input aria-label="抽奖记录日期" type="date" value={date} onChange={setDate} />
  </div><Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1760 }} empty={<EmptyBlock title="暂无抽奖记录" description="每次实际发生的抽奖结果将在这里展示。" />} columns={[
    { title: "OpenID", width: 155, render: (_: unknown, row: ActivityDrawRecord) => maskedOpenId(identityFor(row)?.openId) },
    { title: "姓名", width: 150, render: (_: unknown, row: ActivityDrawRecord) => row.participant ? participantDisplayName(row.participant, members) : "身份待核对" },
    { title: "手机号", width: 140, render: (_: unknown, row: ActivityDrawRecord) => maskedPhone(identityFor(row)?.phone) },
    { title: "性别", width: 90, render: (_: unknown, row: ActivityDrawRecord) => participantGender(row.participant) },
    { title: "奖品 / 结果", width: 210, render: (_: unknown, row: ActivityDrawRecord) => result(row) },
    { title: "领取方式", width: 120, render: (_: unknown, row: ActivityDrawRecord) => row.award ? prizeReceivingLabel(row.award) : "—" },
    { title: "状态", width: 190, render: (_: unknown, row: ActivityDrawRecord) => <div className="marketing-summary-cell"><Tag size="small" color={[3, 5].includes(row.phase) ? "green" : row.phase === 4 ? "blue" : "grey"}>{drawRecordLabels[row.phase]}</Tag>{row.note && <small>{row.note}</small>}</div> },
    { title: "参与时间", width: 170, render: (_: unknown, row: ActivityDrawRecord) => displayDate(row.participant?.registeredAt) },
    { title: "抽奖时间", width: 170, render: (_: unknown, row: ActivityDrawRecord) => displayDate(row.draw?.occurredAt) },
    { title: "核销时间", width: 170, render: (_: unknown, row: ActivityDrawRecord) => displayDate(row.award?.fulfilledAt) },
    { title: "操作", width: 190, fixed: "right", render: (_: unknown, row: ActivityDrawRecord) => <div className="row-actions"><Button theme="borderless" size="small" onClick={() => setSelectedId(row.id)}>查看</Button>{row.reservation && row.award && <Button theme="borderless" size="small" onClick={() => setHistoryId(row.id)}>预约记录</Button>}</div> },
  ]} />
    <SideSheet visible={Boolean(selected)} closeOnEsc title="抽奖记录详情" width={Math.min(640, window.innerWidth)} onCancel={() => setSelectedId("")}>
      {selected && <><IdentityData participant={selected.participant} members={members} full={marketingPermissions(currentUser).manage} /><DefinitionGrid rows={[
        ["活动名称", activity.name], ["状态", drawRecordLabels[selected.phase]],
        ["结果", result(selected)], ["处理说明", selected.note || "—"],
        ["业务流程", selected.award ? selected.reservation ? "未抽奖 → 已抽奖 → 已预约 → 已核销" : "未抽奖 → 已抽奖 → 已核销" : "未抽奖 → 已抽奖"],
        ["参与时间", displayDate(selected.participant?.registeredAt)], ["抽奖时间", displayDate(selected.draw?.occurredAt)],
        ["核销时间", displayDate(selected.award?.fulfilledAt)], ["记录编号", selected.draw?.id || selected.award?.id || selected.participant?.id],
      ]} />{selected.award && <><DataList rows={[
        ["奖品", selected.award.prizeName], ["领取方式", prizeReceivingLabel(selected.award)],
        ["奖品处理情况", displayAwardStatus(state, selected.award, now)], ["领奖凭证", selected.award.credential],
        ["领取有效期", displayDateRange(selected.award.claimStart, selected.award.claimEnd).compact],
        ["领取地点", selected.award.location || "—"], ["领取说明", selected.award.instructions || "—"],
      ]} />{selected.award.prizeType === "VIRTUAL" && <VirtualAwardContent award={selected.award} dataState={state} />}</>}</>}
    </SideSheet>
    <Modal visible={Boolean(history?.award)} className="marketing-prize-booking-modal" title="奖品预约记录" width={Math.min(960, window.innerWidth - 40)} bodyStyle={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }} onCancel={() => setHistoryId("")} footer={<Button onClick={() => setHistoryId("")}>关闭</Button>}>
      {history?.award && <><DataList rows={[["用户", history.participant ? participantDisplayName(history.participant, members) : "身份待核对"], ["奖品", history.award.prizeName]]} /><div className="marketing-prize-booking-history"><BookingData key={history.award.id} activity={activity} scope="PRIZE" participationId={history.award.participationId} awardId={history.award.id} dataState={state} /></div></>}
    </Modal>
  </>;
}
