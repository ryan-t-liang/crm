import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Dropdown, Empty, Modal, SideSheet, Table, Tabs, TabPane, Tag } from "@douyinfe/semi-ui";
import { DataList, DetailWorkspace, PageHeader, SideSection } from "@/components/CrmUi";
import { useCrm } from "@/stores/crm-store";
import { brandLabels, useMemberOperations } from "@/stores/member-operations-store";
import { useMarketing } from "@/stores/marketing-store";
import { createActivityPrize, createMarketingActivity, createMarketingSlot } from "@/mock/marketing-demo-data";
import type { ActivityPrize, MarketingActivity, MarketingSlot } from "@/types/marketing";
import { parseCreatedAt } from "@/features/dashboard/dashboard-model";
import { navigate } from "@/utils/format";
import { activityMetrics, claimLabels, codeInventory, fulfillmentCapacity, marketingPermissions, marketingStatusLabels, needsReservation, prizeTypeLabels, quota, slotOccupancy, winnable } from "./marketing-model";
import { ActivityEditor, CodeImporter, PrizeFields } from "./MarketingEditor";
import { AuditData, AwardData, BookingData, DrawData, ParticipantTable, RedemptionData } from "./MarketingData";
import { ActivityPhases, DemoNote, displayDate, ImageField, NumberField, options, Panel, SelectField, SlotFields, TextField, useAction } from "./MarketingUi";

const dataTabs = [{ value: "participants", label: "参与数据" }, { value: "bookings", label: "预约数据" }, { value: "draws", label: "抽奖记录" }, { value: "awards", label: "中奖数据" }, { value: "redemptions", label: "核销数据" }];
function useClock() { const [now, setNow] = useState(Date.now); useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []); return now; }
function confirmCancel(activity: MarketingActivity, count: number, cancel: () => void) { Modal.confirm({ title: "取消活动？", content: `停止新参与，取消未到场活动预约，保留历史记录、${count}份中奖权益及奖品预约；不会自动作废或回收权益。`, onOk: cancel }); }

export function MarketingList({ migratedEntry }: { migratedEntry?: string }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), { state: members } = useMemberOperations(); const access = marketingPermissions(currentUser), { run, feedback } = useAction(); const now = useClock();
  const [filters, setFilters] = useState({ search: "", brand: "ALL", status: "ALL", date: "" }), [editing, setEditing] = useState<MarketingActivity | null>(null);
  const rows = state.activities.filter((row) => access.brands.includes(row.brand) && row.name.toLowerCase().includes(filters.search.toLowerCase()) && (filters.brand === "ALL" || row.brand === filters.brand) && (filters.status === "ALL" || row.status === filters.status) && (!filters.date || parseCreatedAt(row.startAt) < parseCreatedAt(`${filters.date}T00:00:00+08:00`) + 86_400_000 && parseCreatedAt(row.endAt) >= parseCreatedAt(`${filters.date}T00:00:00+08:00`)));
  const usable = members.brandUsers.some((user) => access.brands.includes(user.brand) && user.is_deleted === 0);
  const copy = (activity: MarketingActivity) => { const result = run({ type: "COPY_ACTIVITY", activityId: activity.id }); if (result.ok) navigate(`marketing/activity/${result.resultId}`); };
  return <>
    <PageHeader title="营销活动" description="以活动为中心管理配置与业务数据；现场签到、完成确认和实体领奖由独立核销端执行。" actions={<Button theme="solid" disabled={!access.manage || !usable} onClick={() => setEditing({ ...createMarketingActivity(access.brands[0], Date.now()), pool: [] })}>新建活动</Button>} />
    <DemoNote />{feedback}{migratedEntry && <Banner type="info" title="此入口已归入活动详情" description="选择活动后查看其奖品、预约或核销数据；不再维护顶层奖品库、预约记录或后台核销工作台。" closeIcon={null} />}
    {!usable && <Banner type="warning" title="缺少可用品牌身份" description="先建立或核对授权品牌档案；营销模块不创建营销会员或补写原有会员数据。" closeIcon={null} />}
    <div className="marketing-toolbar"><TextField label="搜索活动" value={filters.search} onChange={(search) => setFilters((old) => ({ ...old, search }))} /><SelectField label="活动品牌" value={filters.brand} list={[{ value: "ALL", label: "全部授权品牌" }, ...access.brands.map((brand) => ({ value: brand, label: brandLabels[brand] }))]} onChange={(brand) => setFilters((old) => ({ ...old, brand }))} /><SelectField label="发布状态" value={filters.status} list={[{ value: "ALL", label: "全部状态" }, ...options(marketingStatusLabels)]} onChange={(status) => setFilters((old) => ({ ...old, status }))} /><TextField label="活动举行日期" type="date" value={filters.date} onChange={(date) => setFilters((old) => ({ ...old, date }))} /></div>
    {rows.length ? <Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1580 }} columns={[
      { title: "活动名称", width: 210, render: (_: unknown, row: MarketingActivity) => <a href={`#marketing/activity/${row.id}`}>{row.name}</a> },
      { title: "所属品牌 / 活动类型", width: 170, render: (_: unknown, row: MarketingActivity) => `${brandLabels[row.brand]} · ${row.mode === "OFFLINE" ? "线下活动" : "线上活动"}` },
      { title: "活动时间（UTC+08）", width: 200, render: (_: unknown, row: MarketingActivity) => <span>{displayDate(row.startAt)}<br />至 {displayDate(row.endAt)}</span> },
      { title: "状态与独立阶段", width: 240, render: (_: unknown, row: MarketingActivity) => <><Tag size="small">{marketingStatusLabels[row.status]}</Tag><ActivityPhases activity={row} /></> },
      { title: "预约 / 抽奖", width: 120, render: (_: unknown, row: MarketingActivity) => `${row.bookingEnabled ? "开启" : "关闭"} / ${row.lotteryEnabled ? "开启" : "关闭"}` },
      { title: "有效预约人数", width: 130, render: (_: unknown, row: MarketingActivity) => <a href={`#marketing/activity/${row.id}/overview`}>{activityMetrics(state, row, now)[0].rows.length}</a> },
      { title: "参与人数", width: 110, render: (_: unknown, row: MarketingActivity) => <a href={`#marketing/activity/${row.id}/participants`}>{state.participations.filter((item) => item.activityId === row.id).length}</a> },
      { title: "中奖人数", width: 110, render: (_: unknown, row: MarketingActivity) => <a href={`#marketing/activity/${row.id}/awards`}>{activityMetrics(state, row, now)[5].rows.length}</a> },
      { title: "操作", width: 240, fixed: "right", render: (_: unknown, row: MarketingActivity) => <div className="button-row"><Button size="small" onClick={() => navigate(`marketing/activity/${row.id}`)}>查看</Button><Button size="small" disabled={!access.manage} onClick={() => setEditing(structuredClone(row))}>编辑</Button><Dropdown trigger="click" position="bottomRight" menu={[
        { node: "item", name: "复制活动", onClick: () => copy(row), disabled: !access.manage },
        ...dataTabs.filter((tab) => !["draws", "awards"].includes(tab.value) || row.lotteryEnabled).map((tab) => ({ node: "item" as const, name: tab.label, onClick: () => navigate(`marketing/activity/${row.id}/${tab.value}`) })),
        { node: "divider" }, { node: "item", name: row.status === "PUBLISHED" ? "暂停" : row.status === "PAUSED" ? "恢复" : "发布", disabled: !access.manage || row.status === "CANCELED", onClick: () => { run({ type: "STATUS", activityId: row.id, status: row.status === "PUBLISHED" ? "PAUSED" : "PUBLISHED" }); } },
        { node: "item", name: "取消活动", disabled: !access.manage || row.status === "CANCELED", onClick: () => confirmCancel(row, state.awards.filter((award) => award.activityId === row.id).length, () => { run({ type: "STATUS", activityId: row.id, status: "CANCELED" }); }) },
      ]}><Button size="small">更多</Button></Dropdown></div> },
    ]} /> : <Empty title="暂无匹配活动" description="调整筛选，或创建一个独立的草稿活动。" />}
    {editing && <ActivityEditor key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
  </>;
}

function BookingSettings({ activity }: { activity: MarketingActivity }) {
  const { state } = useMarketing(), { run, feedback } = useAction(); const [slot, setSlot] = useState<MarketingSlot | null>(null);
  if (!activity.bookingEnabled) return <Empty title="本活动未开启预约" />;
  return <><Panel title="预约规则" note="每人最多一个有效活动预约；预约不代表完成，不发放抽奖次数。"><DataList rows={[["预约期", `${displayDate(activity.bookingStart)} 至 ${displayDate(activity.bookingEnd)}`], ["允许取消", activity.allowCancel ? "是，截止前且未签到" : "否"], ["允许改约", activity.allowReschedule ? "是，先检查目标容量" : "否"], ["现场报名", activity.allowWalkIn ? "允许，仍须检查时间与容量" : "不允许"], ["完成条件", activity.completion === "CHECKIN" ? "签到即完成" : "工作人员确认完成"]]} /></Panel>
    {feedback}<Panel title="活动场次" note="有任何预约历史的场次不能删除；有预约的场次只能调整名称和安全容量，不覆盖地点、时间。"><Table rowKey="id" dataSource={activity.slots} pagination={false} scroll={{ x: 850 }} columns={[
      { title: "场次 / 时间", width: 240, render: (_: unknown, row: MarketingSlot) => `${row.label} · ${displayDate(row.startAt)} 至 ${displayDate(row.endAt)}` },
      { title: "地点", dataIndex: "location", width: 160 }, { title: "有效占用 / 容量", width: 140, render: (_: unknown, row: MarketingSlot) => `${slotOccupancy(state, activity.id, "ACTIVITY", row.id)} / ${row.capacity}` },
      { title: "预约截止 / 签到窗口", width: 300, render: (_: unknown, row: MarketingSlot) => `${displayDate(row.bookingClosesAt)} · ${displayDate(row.checkinStart)} 至 ${displayDate(row.checkinEnd)}` },
      { title: "操作", width: 170, fixed: "right", render: (_: unknown, row: MarketingSlot) => <div className="button-row"><Button size="small" disabled={activity.status === "CANCELED"} onClick={() => setSlot(structuredClone(row))}>编辑场次</Button><Button size="small" type="danger" disabled={activity.status === "CANCELED" || state.bookings.some((booking) => booking.activityId === activity.id && booking.kind === "ACTIVITY" && booking.slotId === row.id)} onClick={() => run({ type: "DELETE_ACTIVITY_SLOT", activityId: activity.id, slotId: row.id })}>删除场次</Button></div> },
    ]} /><Button size="small" disabled={activity.status === "CANCELED"} onClick={() => setSlot(createMarketingSlot(crypto.randomUUID(), Date.now()))}>添加活动场次</Button></Panel>
    {slot && <Modal visible title="调整当前活动场次" width={Math.min(720, window.innerWidth - 20)} onCancel={() => setSlot(null)} onOk={() => { if (run({ type: "SAVE_ACTIVITY_SLOT", activityId: activity.id, slot }).ok) setSlot(null); }}>{feedback}<SlotFields slot={slot} onChange={setSlot} /></Modal>}
  </>;
}

function PrizeSettings({ activity }: { activity: MarketingActivity }) {
  const { state } = useMarketing(), { run, feedback } = useAction(); const now = useClock();
  const [editing, setEditing] = useState<ActivityPrize | null>(null), [importId, setImportId] = useState(""), [extra, setExtra] = useState({ itemId: "", count: 1 }), [addingSlot, setAddingSlot] = useState<{ itemId: string; slot: MarketingSlot } | null>(null);
  return <>{feedback}<Panel title="抽奖规则"><DataList rows={[["抽奖期", `${displayDate(activity.lotteryStart)} 至 ${displayDate(activity.lotteryEnd)}`], ["完成发放", `${activity.grantCount}次（首次完成）`], ["累计抽奖上限", activity.drawLimit], ["每日上限", activity.dailyLimit === null ? "不限制" : activity.dailyLimit], ["累计中奖上限", `${activity.winLimit}次；达到后保留剩余机会但停止抽奖`], ["概率合计", `${activity.pool.reduce((sum, item) => sum + item.probability, activity.noWinProbability)}%（含未中奖${activity.noWinProbability}%）`]]} /></Panel>
    <Panel title="当前活动奖品" note="中奖即占用本活动库存，领取不二次扣减。预约型奖品须为尚未预约的赢家保留履约容量；普通列表不展示完整兑换码。">
      <Table rowKey="id" dataSource={activity.pool} pagination={{ pageSize: 10 }} scroll={{ x: 1460 }} columns={[
        { title: "奖品 / 奖项", width: 200, render: (_: unknown, item: ActivityPrize) => `${item.name} · ${item.label}` },
        { title: "类型 / 发放方式", width: 190, render: (_: unknown, item: ActivityPrize) => `${prizeTypeLabels[item.prizeType]} · ${claimLabels[item.method] || "待核对"}` },
        { title: "中奖概率", width: 100, render: (_: unknown, item: ActivityPrize) => `${item.probability}%` },
        { title: "配额 / 中奖占用 / 已领取或发放 / 剩余", width: 290, render: (_: unknown, item: ActivityPrize) => { const q = quota(state, activity.id, item); return `${q.total} / ${q.occupied} / ${q.issued} / ${q.available}`; } },
        { title: "可继续中奖 / 履约承诺", width: 190, render: (_: unknown, item: ActivityPrize) => `${winnable(state, activity.id, item, now)}${needsReservation(item) ? ` · 未预约${fulfillmentCapacity(state, activity.id, item, now).unreservedPromises} · 容量缺口${fulfillmentCapacity(state, activity.id, item, now).shortfall}` : ""}` },
        { title: "兑换码：导入 / 分配 / 剩余", width: 190, render: (_: unknown, item: ActivityPrize) => item.method === "REDEMPTION_CODE" ? `${codeInventory(item).imported} / ${codeInventory(item).assigned} / ${codeInventory(item).remaining}` : "不适用" },
        { title: "操作", width: 270, fixed: "right", render: (_: unknown, item: ActivityPrize) => <div className="button-row"><Button size="small" onClick={() => setEditing(structuredClone(item))}>编辑奖品</Button>{item.method === "REDEMPTION_CODE" && <Button size="small" onClick={() => setImportId(item.id)}>导入兑换码</Button>}{activity.publishedAt && <Button size="small" onClick={() => setExtra({ itemId: item.id, count: 1 })}>增加配额</Button>}{needsReservation(item) && activity.publishedAt && <Button size="small" onClick={() => setAddingSlot({ itemId: item.id, slot: createMarketingSlot(crypto.randomUUID(), Date.now()) })}>追加履约时段</Button>}{!activity.publishedAt && <Button size="small" type="danger" onClick={() => run({ type: "DELETE_ACTIVITY_PRIZE", activityId: activity.id, poolItemId: item.id })}>删除奖品</Button>}</div> },
      ]} />{!activity.publishedAt && <Button size="small" onClick={() => setEditing(createActivityPrize(activity.id, Date.now()))}>添加奖品</Button>}
    </Panel>
    {editing && <Modal visible className="marketing-prize-dialog" title="编辑当前活动奖品" width={Math.min(720, window.innerWidth - 20)} onCancel={() => setEditing(null)} onOk={() => { if (run({ type: "SAVE_ACTIVITY_PRIZE", activityId: activity.id, prize: editing }).ok) setEditing(null); }}>{feedback}{activity.publishedAt ? <><Banner title="已发布奖品规则锁定" description="可改名称、奖项、图片和说明，不覆盖历史中奖快照。兑换码、配额与履约时段使用专用操作追加。" closeIcon={null} /><TextField label="奖品名称" value={editing.name} onChange={(name) => setEditing({ ...editing, name })} /><TextField label="奖项名称" value={editing.label} onChange={(label) => setEditing({ ...editing, label })} /><TextField label="奖品说明" value={editing.description} onChange={(description) => setEditing({ ...editing, description })} /><TextField label="使用 / 领取说明" value={editing.instructions} onChange={(instructions) => setEditing({ ...editing, instructions })} /><ImageField label="奖品图片" value={editing.image} onChange={(image) => setEditing({ ...editing, image })} /></> : <PrizeFields prize={editing} onChange={setEditing} />}</Modal>}
    {importId && <Modal visible title="导入当前奖品兑换码" width={Math.min(650, window.innerWidth - 20)} footer={<Button onClick={() => setImportId("")}>完成</Button>} onCancel={() => setImportId("")}>
      {feedback}<CodeImporter onImport={(codes) => run({ type: "IMPORT_CODES", activityId: activity.id, poolItemId: importId, codes }).ok} />
    </Modal>}
    <Modal visible={Boolean(extra.itemId)} title="增加活动奖品配额" onCancel={() => setExtra({ itemId: "", count: 1 })} onOk={() => { if (run({ type: "ADD_QUOTA", activityId: activity.id, poolItemId: extra.itemId, count: extra.count }).ok) setExtra({ itemId: "", count: 1 }); }}>{feedback}<NumberField label="追加配额" value={extra.count} onChange={(count) => setExtra({ ...extra, count })} /></Modal>
    {addingSlot && <Modal visible title="追加奖品履约时段" width={Math.min(720, window.innerWidth - 20)} onCancel={() => setAddingSlot(null)} onOk={() => { if (run({ type: "ADD_PRIZE_SLOT", activityId: activity.id, poolItemId: addingSlot.itemId, slot: addingSlot.slot }).ok) setAddingSlot(null); }}>{feedback}<SlotFields slot={addingSlot.slot} onChange={(slot) => setAddingSlot({ ...addingSlot, slot })} /></Modal>}
  </>;
}

export function MarketingDetail({ activity, requestedTab }: { activity: MarketingActivity; requestedTab?: string }) {
  const { state, reset } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction(); const tick = useClock();
  const [editingStep, setEditingStep] = useState<number | null>(null), [detail, setDetail] = useState<{ title: string; rows: { id: string }[]; at: number } | null>(null);
  const now = useMemo(() => tick, [tick, state, activity.id]);
  useEffect(() => setDetail(null), [state, activity.id, currentUser.id, requestedTab]);
  const metrics = activityMetrics(state, activity, now), participants = state.participations.filter((row) => row.activityId === activity.id), awards = state.awards.filter((row) => row.activityId === activity.id);
  const tab = ["overview", "basic", "booking-settings", "lottery", ...dataTabs.map((row) => row.value)].includes(requestedTab || "") ? requestedTab! : "overview";
  return <><DetailWorkspace eyebrow="会员与品牌运营 / 营销活动 / 活动管理" title={activity.name} subtitle={`${brandLabels[activity.brand]} · ${activity.mode === "OFFLINE" ? "线下活动" : "线上活动"} · 免费活动`} backRoute="marketing" tags={<Tag>{marketingStatusLabels[activity.status]}</Tag>} actions={<>
    <Button disabled={!access.manage} onClick={() => setEditingStep(0)}>编辑活动</Button><Button onClick={() => navigate(`marketing/preview/${activity.id}`)}>用户流程预览</Button><Button disabled={!access.manage} onClick={() => { const result = run({ type: "COPY_ACTIVITY", activityId: activity.id }); if (result.ok) navigate(`marketing/activity/${result.resultId}`); }}>复制活动</Button>
    {activity.status !== "CANCELED" && <Button disabled={!access.manage} onClick={() => run({ type: "STATUS", activityId: activity.id, status: activity.status === "PUBLISHED" ? "PAUSED" : "PUBLISHED" })}>{activity.status === "PUBLISHED" ? "暂停" : activity.status === "PAUSED" ? "恢复" : "发布"}</Button>}
    <Button type="danger" disabled={!access.manage || activity.status === "CANCELED"} onClick={() => confirmCancel(activity, awards.length, () => { run({ type: "STATUS", activityId: activity.id, status: "CANCELED" }); })}>取消活动</Button>
    {!activity.publishedAt && !participants.length && <Button type="danger" disabled={!access.manage} onClick={() => { if (run({ type: "DELETE_ACTIVITY", activityId: activity.id }).ok) navigate("marketing"); }}>删除无记录草稿</Button>}
  </>} sidebar={<><SideSection title="独立时间阶段"><ActivityPhases activity={activity} /><DataList rows={[["活动期", `${displayDate(activity.startAt)} 至 ${displayDate(activity.endAt)}`], ["规则版本", activity.ruleVersion], ["业务归属", "预约、参与、抽奖、中奖及核销均属于本活动"]]} /></SideSection><SideSection title="后台职责"><p>CRM仅配置活动、查看核销结果，不提供现场核销操作。</p><DemoNote /><Button size="small" disabled={!access.manage} onClick={() => Modal.confirm({ title: "重置营销数据？", content: "只恢复营销演示，销售、会员数据及V1备份不变。", onOk: reset })}>重置营销演示数据</Button></SideSection></>} tabs={<div className="marketing-detail">{feedback}
    <Tabs activeKey={tab} onChange={(key) => navigate(`marketing/activity/${activity.id}/${key}`)}>
      <TabPane itemKey="overview" tab="概览"><Panel title="活动核心指标" note={`截至 ${displayDate(new Date(now).toISOString())}，人数按参与主体去重，次数按业务记录；点击查看同口径明细。`}><div className="marketing-metrics">{metrics.slice(0, 3).map((metric) => <button key={metric.label} onClick={() => setDetail({ title: `${metric.label} · ${metric.kind}`, rows: metric.rows, at: now })}><span>{metric.label}</span><strong>{metric.rows.length}</strong></button>)}</div></Panel><Panel title="抽奖与履约指标"><div className="marketing-metrics">{metrics.slice(3).map((metric) => <button key={metric.label} onClick={() => setDetail({ title: `${metric.label} · ${metric.kind}`, rows: metric.rows, at: now })}><span>{metric.label}</span><strong>{metric.rows.length}</strong><small>{metric.kind}</small></button>)}</div></Panel></TabPane>
      <TabPane itemKey="basic" tab="基本信息"><Panel title="基本信息"><DataList rows={[["活动说明", activity.description], ["所属品牌", brandLabels[activity.brand]], ["活动类型", activity.mode === "OFFLINE" ? "线下活动" : "线上活动"], ["地点", activity.mode === "OFFLINE" ? activity.location : "线上活动"], ["活动期", `${displayDate(activity.startAt)} 至 ${displayDate(activity.endAt)}`], ["预约 / 抽奖", `${activity.bookingEnabled ? "开启" : "关闭"} / ${activity.lotteryEnabled ? "开启" : "关闭"}`], ["完成条件", activity.completion === "CHECKIN" ? "签到即完成" : "工作人员确认完成"]]} />{activity.cover && <img className="marketing-cover" src={activity.cover} alt="本地活动封面" />}</Panel><AuditData activity={activity} /></TabPane>
      {activity.bookingEnabled && <TabPane itemKey="booking-settings" tab="预约设置"><Button size="small" disabled={Boolean(activity.publishedAt)} onClick={() => setEditingStep(1)}>编辑预约规则</Button><BookingSettings activity={activity} /></TabPane>}
      {activity.lotteryEnabled && <TabPane itemKey="lottery" tab="抽奖 & 奖品"><Button size="small" disabled={Boolean(activity.publishedAt)} onClick={() => setEditingStep(2)}>编辑抽奖规则</Button><PrizeSettings activity={activity} /></TabPane>}
      <TabPane itemKey="participants" tab="参与数据"><ParticipantTable activity={activity} /></TabPane>
      <TabPane itemKey="bookings" tab="预约数据"><BookingData activity={activity} /></TabPane>
      {activity.lotteryEnabled && <TabPane itemKey="draws" tab="抽奖记录"><DrawData activity={activity} /></TabPane>}
      {activity.lotteryEnabled && <TabPane itemKey="awards" tab="中奖数据"><AwardData activity={activity} /></TabPane>}
      <TabPane itemKey="redemptions" tab="核销数据"><RedemptionData activity={activity} /></TabPane>
    </Tabs>
  </div>} />
    {editingStep !== null && <ActivityEditor initial={structuredClone(activity)} initialStep={editingStep} onClose={() => setEditingStep(null)} />}
    <SideSheet visible={Boolean(detail)} closeOnEsc title={detail?.title} width={Math.min(600, window.innerWidth - 20)} onCancel={() => setDetail(null)}><p>本活动 · {brandLabels[activity.brand]} · 当前授权范围 · 截至 {displayDate(new Date(detail?.at ?? now).toISOString())} · 同口径只读明细</p>{detail?.rows.length ? <Table rowKey="id" dataSource={detail.rows} columns={[{ title: "记录ID", dataIndex: "id" }]} /> : <Empty title="当前口径暂无记录" />}</SideSheet>
  </>;
}
