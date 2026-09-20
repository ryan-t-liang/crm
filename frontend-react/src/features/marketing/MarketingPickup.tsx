import { useState } from "react";
import { Banner, Button, Modal, SideSheet, Table, TabPane, Tabs, Tag } from "@douyinfe/semi-ui";
import { IconEdit, IconMore, IconPlus } from "@douyinfe/semi-icons";
import { DataList, EmptyBlock, FormSideSheet } from "@/components/CrmUi";
import { useMarketing } from "@/stores/marketing-store";
import { useCrm } from "@/stores/crm-store";
import { useMemberOperations } from "@/stores/member-operations-store";
import type { MarketingActivity, MarketingBooking, MarketingPickupSchedule, MarketingSlot } from "@/types/marketing";
import { marketingPermissions, participantDisplayName, participantIdentity } from "./marketing-model";
import { generatePickupSlots, pickupBookedCount, pickupBookings, pickupScheduleSummary, pickupSchedules, pickupSlotForBooking, pickupSlotStatus, type PickupGenerationInput } from "./marketing-pickup";
import { DateRange, displayDate, displayDateRange, MarketingMenu, NumberField, Panel, TextField, TimeField, useAction } from "./MarketingUi";
import { COACH_EVENT_LOCATION, isCoachPrototype, prototypeLocationLabel } from "@/utils/prototype-variant";

function coachOrderDetails(booking: MarketingBooking) {
  const serial = Number(booking.id.match(/:(\d+):/)?.[1] ?? 0);
  const sizes = ["大号 Large", "中号 Medium"];
  const colors = ["Bold Red", "Black", "Chalk"];
  const patterns = ["字母 A · 龙", "字母 B · 马", "字母 C · 龙"];
  return { size: sizes[serial % sizes.length], color: colors[serial % colors.length], pattern: patterns[serial % patterns.length] };
}

export function PickupRoster({ activity, rows }: { activity: MarketingActivity; rows: MarketingBooking[] }) {
  const { state } = useMarketing(), { state: members } = useMemberOperations();
  const coachMode = isCoachPrototype();
  return <Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: coachMode ? 980 : 710 }} empty={<EmptyBlock title="暂无预约记录" description="用户提交领奖预约后在此展示。" />} columns={[
    { title: `${coachMode ? "OpenID" : "用户"} / 奖品`, width: coachMode ? 260 : 190, render: (_: unknown, row: MarketingBooking) => {
      const participant = state.participations.find(p => p.activityId === activity.id && p.id === row.participationId);
      const identity = participant && participantIdentity(participant, members);
      return <div className="marketing-summary-cell"><span>{coachMode ? identity?.openId || participant?.identities[0]?.openid || "—" : participant ? participantDisplayName(participant, members) : "用户待核对"}</span><small>{state.awards.find(award => award.id === row.awardId)?.prizeName ?? "奖品待核对"}</small></div>;
    } },
    ...(coachMode ? [{ title: "订单预约信息", width: 220, render: (_: unknown, row: MarketingBooking) => { const order = coachOrderDetails(row); return <div className="marketing-summary-cell"><span>COACH 定制皮牌</span><small>尺寸：{order.size}</small><small>颜色：{order.color}</small><small>压印：{order.pattern}</small></div>; } }] : []),
    { title: "中奖时间", width: 140, render: (_: unknown, row: MarketingBooking) => displayDate(state.awards.find(award => award.id === row.awardId)?.wonAt) },
    { title: coachMode ? "预约日期 / 时间" : "兑奖时段", width: 155, render: (_: unknown, row: MarketingBooking) => { const slot = pickupSlotForBooking(activity, row); return slot ? <DateRange start={slot.startAt} end={slot.endAt} /> : "时段待核对"; } },
    { title: coachMode ? "提交预约时间" : "预约时间", width: 140, render: (_: unknown, row: MarketingBooking) => displayDate(row.createdAt) },
    { title: "状态", width: 85, render: (_: unknown, row: MarketingBooking) => <Tag size="small">{({ BOOKED: "待领取", CHECKED_IN: "已到场", CANCELED: "已取消", NO_SHOW: "未到场", FULFILLED: "已领取" })[row.status]}</Tag> },
  ]} />;
}

function ScheduleEditor({ activity, initial, onClose }: { activity: MarketingActivity; initial?: MarketingPickupSchedule; onClose: () => void }) {
  const { state } = useMarketing(), { run, feedback } = useAction();
  const coachMode = isCoachPrototype();
  const [form, setForm] = useState<MarketingPickupSchedule>(() => initial ? structuredClone(initial) : { id: crypto.randomUUID(), activityId: activity.id, name: "", location: coachMode ? COACH_EVENT_LOCATION : activity.location, startAt: activity.endAt, endAt: "", slots: [] });
  const locked = Boolean(initial && pickupBookings(state, activity, initial.id).length);
  return <FormSideSheet visible className={coachMode ? "coach-marketing-sheet" : undefined} title={initial ? "编辑兑奖预约" : "新建兑奖预约"} width={640} onCancel={onClose} onOk={() => { if (run({ type: "SAVE_PICKUP_SCHEDULE", activityId: activity.id, schedule: form }).ok) onClose(); }}>
    {feedback}<div className="form-grid">
      <TextField label="兑奖预约名称" value={form.name} onChange={name => setForm({ ...form, name })} />
      <TextField label="领取地点" value={coachMode ? COACH_EVENT_LOCATION : form.location} disabled={locked || coachMode} onChange={location => setForm({ ...form, location })} />
      <TimeField label="有效开始" value={form.startAt} onChange={startAt => setForm({ ...form, startAt })} />
      <TimeField label="有效截止" value={form.endAt} onChange={endAt => setForm({ ...form, endAt })} />
    </div><p className="marketing-field-help">保存后可批量生成兑奖时段。多个奖品绑定此安排时共享可预约数量；已有预约的地点和时段不会被覆盖。</p>
  </FormSideSheet>;
}

function BatchSlots({ activity, schedule, onClose }: { activity: MarketingActivity; schedule: MarketingPickupSchedule; onClose: () => void }) {
  const { run, feedback } = useAction();
  const [input, setInput] = useState<PickupGenerationInput>({ startDate: displayDate(schedule.startAt).slice(0, 10), endDate: displayDate(schedule.endAt).slice(0, 10), dailyStart: "10:00", dailyEnd: "18:00", duration: 30, capacity: 10 });
  const [previewed, setPreviewed] = useState(false), [result, setResult] = useState("");
  const preview = generatePickupSlots(schedule, input);
  const update = (patch: Partial<PickupGenerationInput>) => { setInput({ ...input, ...patch }); setPreviewed(false); setResult(""); };
  return <Modal visible maskClosable={false} width={720} title="批量生成兑奖时段" onCancel={onClose} bodyStyle={{ maxHeight: "calc(100vh - 210px)", overflowY: "auto" }} footer={<div className="sheet-footer"><Button onClick={onClose}>{result ? "完成" : "取消"}</Button>{!result && <Button theme="solid" onClick={() => {
    if (!previewed) { setPreviewed(true); return; }
    if (preview.error) return;
    const saved = run({ type: "GENERATE_PICKUP_SLOTS", activityId: activity.id, scheduleId: schedule.id, input });
    if (saved.ok) setResult(`已生成${preview.slots.length}个时段，跳过${preview.skipped}个重复时段。`);
  }}>{previewed ? "确认生成" : "预览时段"}</Button>}</div>}>
    {feedback}{result ? <Banner type="success" title={result} closeIcon={null} /> : <><div className="form-grid">
      <TextField label="开始日期" type="date" value={input.startDate} onChange={startDate => update({ startDate })} />
      <TextField label="结束日期" type="date" value={input.endDate} onChange={endDate => update({ endDate })} />
      <TextField label="每日开始" type="time" value={input.dailyStart} onChange={dailyStart => update({ dailyStart })} />
      <TextField label="每日结束" type="time" value={input.dailyEnd} onChange={dailyEnd => update({ dailyEnd })} />
      <NumberField label="每个时段长度（分钟）" value={input.duration} onChange={duration => update({ duration })} />
      <NumberField label="每个时段可预约数量" value={input.capacity} onChange={capacity => update({ capacity })} />
    </div>{previewed && <Panel title="生成预览" note={`${preview.days}天 · 新增${preview.slots.length}个时段 · 跳过${preview.skipped}个重复时段`}>
      {preview.error ? <Banner type="warning" title={preview.error} closeIcon={null} /> : <Table rowKey="id" dataSource={preview.slots} pagination={{ pageSize: 5 }} columns={[
        { title: "时间", render: (_: unknown, slot: MarketingSlot) => displayDateRange(slot.startAt, slot.endAt).compact },
        { title: "地点", render: (_: unknown, slot: MarketingSlot) => prototypeLocationLabel(slot.location) }, { title: "可预约数量", dataIndex: "capacity" },
      ]} />}
    </Panel>}</>}
  </Modal>;
}

function SlotEditor({ activity, schedule, slot, onClose, readOnly = false }: { activity: MarketingActivity; schedule: MarketingPickupSchedule; slot: MarketingSlot; onClose: () => void; readOnly?: boolean }) {
  const { state } = useMarketing(), { run, feedback } = useAction(), [form, setForm] = useState(slot);
  const coachMode = isCoachPrototype();
  const history = pickupBookings(state, activity, schedule.id, slot.id).length > 0;
  return <FormSideSheet visible className={coachMode ? "coach-marketing-sheet" : undefined} title={readOnly ? "查看兑奖时段" : schedule.slots.some(row => row.id === slot.id) ? "编辑兑奖时段" : "新增兑奖时段"} width={640} onCancel={onClose} onOk={readOnly ? undefined : () => { if (run({ type: "SAVE_PICKUP_SLOT", activityId: activity.id, scheduleId: schedule.id, slot: form }).ok) onClose(); }} footer={readOnly ? <Button onClick={onClose}>关闭</Button> : undefined}>
    {!readOnly && feedback}{!readOnly && history && <Banner type="info" title="已有预约，日期、时间和地点保留；容量请使用调整容量。" closeIcon={null} />}
    <div className="form-grid">
      <TextField label="领取地点" disabled={readOnly || history || coachMode} value={coachMode ? COACH_EVENT_LOCATION : form.location} onChange={location => setForm({ ...form, location })} />
      <NumberField label="可预约数量" disabled={readOnly || history} value={form.capacity} onChange={capacity => setForm({ ...form, capacity })} />
      {(["startAt", "endAt", "bookingClosesAt", "checkinStart", "checkinEnd"] as const).map((key, i) => <TimeField key={key} label={["领取开始", "领取结束", "预约截止", "核销开放", "核销截止"][i]} disabled={readOnly || history} value={form[key]} onChange={value => setForm({ ...form, [key]: value })} />)}
    </div>
  </FormSideSheet>;
}

export function PickupScheduleDrawer({ activity, scheduleId, onClose }: { activity: MarketingActivity; scheduleId: string; onClose: () => void }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), { run, feedback } = useAction();
  const manage = marketingPermissions(currentUser).manage;
  const schedule = pickupSchedules(activity).find(row => row.id === scheduleId);
  const [edit, setEdit] = useState(false), [batch, setBatch] = useState(false), [slot, setSlot] = useState<MarketingSlot | null>(null);
  const [adjust, setAdjust] = useState<{ id: string; capacity: number } | null>(null), [roster, setRoster] = useState("ALL"), [activeTab, setActiveTab] = useState("schedule");
  if (!schedule) return <SideSheet visible title="兑奖预约设置待核对" onCancel={onClose}><EmptyBlock title="兑奖预约设置不存在" /></SideSheet>;
  const summary = pickupScheduleSummary(state, activity, schedule, Date.now());
  const adjustingSlot = schedule.slots.find(row => row.id === adjust?.id), booked = adjustingSlot ? pickupBookedCount(state, activity, schedule.id, adjustingSlot.id) : 0;
  return <>
    <SideSheet visible={!edit && !batch && !slot && !adjust} closeOnEsc className={isCoachPrototype() ? "coach-marketing-sheet" : undefined} title={schedule.name} width={Math.min(820, window.innerWidth - 24)} onCancel={onClose} footer={<Button onClick={onClose}>关闭</Button>}>
      {feedback}<Tabs type="line" activeKey={activeTab} onChange={setActiveTab}>
        <TabPane itemKey="schedule" tab="兑奖预约"><Panel actions={<Button size="small" theme="borderless" icon={<IconEdit />} aria-label="编辑兑奖预约" disabled={!manage} onClick={() => setEdit(true)} />}>
          <DataList rows={[["地点", prototypeLocationLabel(schedule.location)], ["有效日期", displayDateRange(schedule.startAt, schedule.endAt).compact], ["关联奖品", summary.prizes.map(prize => prize.name).join("、") || "未关联"], ["可预约数量 / 已预约 / 剩余", `${summary.total} / ${summary.booked} / ${summary.remaining}`]]} />
          {summary.warning && <Banner type="warning" title={summary.warning} closeIcon={null} />}
        </Panel></TabPane>
        <TabPane itemKey="slots" tab="兑奖时段"><Panel actions={<div className="row-actions"><Button size="small" disabled={!manage} onClick={() => setBatch(true)}>批量生成时段</Button><Button size="small" icon={<IconPlus />} disabled={!manage} onClick={() => setSlot({ id: crypto.randomUUID(), label: "兑奖时段", location: isCoachPrototype() ? COACH_EVENT_LOCATION : schedule.location, startAt: "", endAt: "", bookingClosesAt: "", checkinStart: "", checkinEnd: "", capacity: 10, createdAt: new Date().toISOString() })}>新增时段</Button></div>}><Table rowKey="id" dataSource={schedule.slots.filter(row => !row.deleted)} pagination={{ pageSize: 8 }} scroll={{ x: isCoachPrototype() ? 820 : 730 }} empty={<EmptyBlock title="暂无兑奖时段" description="新增单个时段，或批量生成可预约时间。" />} columns={[
          { title: "日期 / 时间", width: 160, render: (_: unknown, row: MarketingSlot) => <DateRange start={row.startAt} end={row.endAt} /> },
          { title: "地点", width: 190, render: (_: unknown, row: MarketingSlot) => prototypeLocationLabel(row.location) },
          { title: "可预约数量", width: 160, render: (_: unknown, row: MarketingSlot) => { const used = pickupBookedCount(state, activity, schedule.id, row.id); return <div className="marketing-summary-cell"><span>总容量 {row.capacity}</span><small>已预约 {used} · 剩余 {Math.max(0, row.capacity - used)}</small></div>; } },
          { title: "状态", width: 90, render: (_: unknown, row: MarketingSlot) => <Tag size="small">{pickupSlotStatus(state, activity, schedule, row, Date.now())}</Tag> },
          { title: "操作", width: isCoachPrototype() ? 210 : 140, fixed: "right", render: (_: unknown, row: MarketingSlot) => <div className="row-actions">
            <Button theme="borderless" size="small" onClick={() => { setRoster(row.id); setActiveTab("records"); }}>预约记录</Button>
            {isCoachPrototype() ? <>
              <Button theme="borderless" size="small" disabled={!manage} onClick={() => setSlot(structuredClone(row))}>编辑</Button>
              <Button theme="borderless" type="danger" size="small" disabled={!manage || pickupBookings(state, activity, schedule.id, row.id).length > 0} onClick={() => run({ type: "DELETE_PICKUP_SLOT", activityId: activity.id, scheduleId: schedule.id, slotId: row.id })}>删除</Button>
            </> : <MarketingMenu menu={[
            { node: "item", name: "编辑时段", disabled: !manage, onClick: () => setSlot(structuredClone(row)) },
            { node: "item", name: "调整容量", disabled: !manage, onClick: () => setAdjust({ id: row.id, capacity: row.capacity }) },
            { node: "item", name: row.disabled ? "恢复预约" : "停止预约", disabled: !manage, onClick: () => run({ type: "SET_PICKUP_SLOT_OPEN", activityId: activity.id, scheduleId: schedule.id, slotId: row.id, open: Boolean(row.disabled) }) },
            { node: "item", name: "删除未使用时段", type: "danger", disabled: !manage || pickupBookings(state, activity, schedule.id, row.id).length > 0, onClick: () => run({ type: "DELETE_PICKUP_SLOT", activityId: activity.id, scheduleId: schedule.id, slotId: row.id }) },
          ]}><Button theme="borderless" size="small" icon={<IconMore />} aria-label="更多兑奖时段操作" /></MarketingMenu>}
          </div> },
        ]} /></Panel></TabPane>
        <TabPane itemKey="records" tab="预约记录"><Panel actions={roster !== "ALL" && <div className="row-actions"><span>{displayDateRange(schedule.slots.find(row => row.id === roster)?.startAt ?? "", schedule.slots.find(row => row.id === roster)?.endAt ?? "").compact}</span><Button size="small" theme="borderless" onClick={() => setRoster("ALL")}>全部时段</Button></div>}>
          <PickupRoster activity={activity} rows={pickupBookings(state, activity, schedule.id, roster === "ALL" ? undefined : roster)} />
        </Panel></TabPane>
      </Tabs>
    </SideSheet>
    {edit && <ScheduleEditor activity={activity} initial={schedule} onClose={() => setEdit(false)} />}
    {batch && <BatchSlots activity={activity} schedule={schedule} onClose={() => setBatch(false)} />}
    {slot && <SlotEditor activity={activity} schedule={schedule} slot={slot} onClose={() => setSlot(null)} />}
    {adjust && adjustingSlot && <Modal visible title="调整可预约数量" maskClosable={false} width={520} onCancel={() => setAdjust(null)} onOk={() => { if (run({ type: "ADJUST_PICKUP_CAPACITY", activityId: activity.id, scheduleId: schedule.id, slotId: adjust.id, capacity: adjust.capacity }).ok) setAdjust(null); }}>
      {feedback}<DataList rows={[["兑奖预约设置", schedule.name], ["时段", displayDateRange(adjustingSlot.startAt, adjustingSlot.endAt).compact], ["当前容量", String(adjustingSlot.capacity)], ["已预约", String(booked)], ["当前剩余", String(Math.max(0, adjustingSlot.capacity - booked))]]} />
      <NumberField label="调整后容量" value={adjust.capacity} onChange={capacity => setAdjust({ ...adjust, capacity })} />
      <p>调整后剩余：{adjust.capacity - booked}；不能低于已预约的 {booked} 人。</p>
    </Modal>}
  </>;
}

export function PickupScheduleSection({ activity, openId, onOpen, onClose }: { activity: MarketingActivity; openId: string; onOpen: (id: string) => void; onClose: () => void }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), [creating, setCreating] = useState(false);
  return <><Panel title="兑奖预约设置" actions={<Button size="small" icon={<IconPlus />} disabled={!marketingPermissions(currentUser).manage} onClick={() => setCreating(true)}>新建兑奖预约</Button>}>
    <Table rowKey="id" dataSource={pickupSchedules(activity)} pagination={{ pageSize: 5 }} scroll={{ x: 850 }} empty={<EmptyBlock title="暂无兑奖预约设置" description="为预约领取的奖品创建可共享的兑奖时段与容量。" />} columns={[
      { title: "兑奖预约", width: 280, render: (_: unknown, row: MarketingPickupSchedule) => <div className="marketing-summary-cell"><Button theme="borderless" size="small" onClick={() => onOpen(row.id)}>{row.name}</Button><small>{prototypeLocationLabel(row.location)}</small></div> },
      { title: "有效日期", width: 180, render: (_: unknown, row: MarketingPickupSchedule) => <DateRange start={row.startAt} end={row.endAt} /> },
      { title: "可预约数量", width: 170, render: (_: unknown, row: MarketingPickupSchedule) => { const value = pickupScheduleSummary(state, activity, row, Date.now()); return <div className="marketing-summary-cell"><span>总容量 {value.total}</span><small>已预约 {value.booked} · 剩余 {value.remaining}</small></div>; } },
      { title: "关联奖品", width: 120, render: (_: unknown, row: MarketingPickupSchedule) => `${pickupScheduleSummary(state, activity, row, Date.now()).prizes.length} 个奖品` },
      { title: "状态", width: 90, render: (_: unknown, row: MarketingPickupSchedule) => <Tag size="small">{pickupScheduleSummary(state, activity, row, Date.now()).status}</Tag> },
      { title: "操作", width: 60, fixed: "right", render: (_: unknown, row: MarketingPickupSchedule) => <Button theme="borderless" size="small" onClick={() => onOpen(row.id)}>查看</Button> },
    ]} />
  </Panel>{creating && <ScheduleEditor activity={activity} onClose={() => setCreating(false)} />}{openId && <PickupScheduleDrawer activity={activity} scheduleId={openId} onClose={onClose} />}</>;
}
