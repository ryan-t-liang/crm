import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Dropdown, Empty, Modal, Popover, SideSheet, Table, Tabs, TabPane, Tag } from "@douyinfe/semi-ui";
import { DataList, PageHeader } from "@/components/CrmUi";
import { useCrm } from "@/stores/crm-store";
import { brandLabels } from "@/stores/member-operations-store";
import { useMarketing } from "@/stores/marketing-store";
import { createActivityPrize, createMarketingActivity, createMarketingSlot } from "@/mock/marketing-demo-data";
import type { ActivityPrize, MarketingActivity, MarketingSlot } from "@/types/marketing";
import { parseCreatedAt } from "@/features/dashboard/dashboard-model";
import { navigate } from "@/utils/format";
import { activityCreationIssue, activityMetrics, canDeleteDraft, claimLabels, codeInventory, fulfillmentCapacity, hasActivityBusinessData, marketingPermissions, marketingStatusLabels, needsReservation, prizeTypeLabels, quota, slotOccupancy, winnable } from "./marketing-model";
import { ActivityEditor, CodeImporter, PrizeFields, PublishReview } from "./MarketingEditor";
import { CodeManager } from "./MarketingCodes";
import { AuditData, AwardData, BookingData, DrawData, ParticipantTable, RedemptionData } from "./MarketingData";
import { ActivityPhases, DefinitionGrid, displayDate, ImageField, NumberField, options, Panel, SelectField, SlotFields, TextField, useAction } from "./MarketingUi";

const dataTabs = [{ value: "participants", label: "参与用户" }, { value: "bookings", label: "预约记录" }, { value: "draws", label: "抽奖记录" }, { value: "awards", label: "中奖记录" }, { value: "redemptions", label: "核销记录" }];
function useClock() { const [now, setNow] = useState(Date.now); useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []); return now; }
function confirmCancel(activity: MarketingActivity, count: number, cancel: () => void) { Modal.confirm({ title: "取消活动？", content: `停止新参与，取消未到场活动预约，保留历史记录、${count}份中奖权益及奖品预约；不会自动作废或回收权益。`, onOk: cancel }); }

export function MarketingList({ migratedEntry }: { migratedEntry?: string }) {
  const { state } = useMarketing(), { currentUser } = useCrm(); const access = marketingPermissions(currentUser), { run, feedback } = useAction(); const now = useClock();
  const [filters, setFilters] = useState({ search: "", brand: "ALL", status: "ALL", date: "" }), [editing, setEditing] = useState<MarketingActivity | null>(null), [editingStep, setEditingStep] = useState(0), [publishing, setPublishing] = useState<MarketingActivity | null>(null);
  const rows = state.activities.filter((row) => access.brands.includes(row.brand) && row.name.toLowerCase().includes(filters.search.toLowerCase()) && (filters.brand === "ALL" || row.brand === filters.brand) && (filters.status === "ALL" || row.status === filters.status) && (!filters.date || parseCreatedAt(row.startAt) < parseCreatedAt(`${filters.date}T00:00:00+08:00`) + 86_400_000 && parseCreatedAt(row.endAt) >= parseCreatedAt(`${filters.date}T00:00:00+08:00`)));
  const creationIssue = activityCreationIssue(access);
  const copy = (activity: MarketingActivity) => { const result = run({ type: "COPY_ACTIVITY", activityId: activity.id }); if (result.ok) navigate(`marketing/activity/${result.resultId}`); };
  return <>
    <PageHeader title="营销活动" description="管理品牌活动、参与记录与奖品履约。" actions={<Button theme="solid" disabled={Boolean(creationIssue)} onClick={() => { setEditingStep(0); setEditing(createMarketingActivity(access.brands[0], Date.now())); }}>新建活动</Button>} />
    {feedback}{migratedEntry && <Banner type="info" title="请选择活动查看相关记录" closeIcon={null} />}
    {creationIssue && <Banner type="warning" title={creationIssue} closeIcon={null} />}
    <div className="marketing-toolbar"><TextField label="搜索活动" value={filters.search} onChange={(search) => setFilters((old) => ({ ...old, search }))} /><SelectField label="活动品牌" value={filters.brand} list={[{ value: "ALL", label: "全部授权品牌" }, ...access.brands.map((brand) => ({ value: brand, label: brandLabels[brand] }))]} onChange={(brand) => setFilters((old) => ({ ...old, brand }))} /><SelectField label="发布状态" value={filters.status} list={[{ value: "ALL", label: "全部状态" }, ...options(marketingStatusLabels)]} onChange={(status) => setFilters((old) => ({ ...old, status }))} /><TextField label="活动举行日期" type="date" value={filters.date} onChange={(date) => setFilters((old) => ({ ...old, date }))} /></div>
    {rows.length ? <Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1580 }} columns={[
      { title: "活动名称", width: 210, render: (_: unknown, row: MarketingActivity) => <a href={`#marketing/activity/${row.id}`}>{row.name}</a> },
      { title: "所属品牌 / 活动类型", width: 170, render: (_: unknown, row: MarketingActivity) => `${brandLabels[row.brand]} · ${row.mode === "OFFLINE" ? "线下活动" : "线上活动"}` },
      { title: "活动时间", width: 200, render: (_: unknown, row: MarketingActivity) => <span>{displayDate(row.startAt)}<br />至 {displayDate(row.endAt)}</span> },
      { title: "状态", width: 200, render: (_: unknown, row: MarketingActivity) => <><Tag size="small">{marketingStatusLabels[row.status]}</Tag><ActivityPhases activity={row} /></> },
      { title: "参与方式", width: 120, render: (_: unknown, row: MarketingActivity) => row.bookingEnabled ? "预约参与" : "直接参与" },
      { title: "有效预约人数", width: 130, render: (_: unknown, row: MarketingActivity) => row.bookingEnabled ? <a href={`#marketing/activity/${row.id}/overview`}>{activityMetrics(state, row, now)[0].rows.length}</a> : "—" },
      { title: "已签到", width: 100, render: (_: unknown, row: MarketingActivity) => <a href={`#marketing/activity/${row.id}/overview`}>{activityMetrics(state, row, now)[1].rows.length}</a> },
      { title: "已完成", width: 100, render: (_: unknown, row: MarketingActivity) => <a href={`#marketing/activity/${row.id}/overview`}>{activityMetrics(state, row, now)[2].rows.length}</a> },
      { title: "中奖人数", width: 110, render: (_: unknown, row: MarketingActivity) => row.lotteryEnabled ? <a href={`#marketing/activity/${row.id}/awards`}>{activityMetrics(state, row, now)[5].rows.length}</a> : "—" },
      { title: "操作", width: 240, fixed: "right", render: (_: unknown, row: MarketingActivity) => <div className="button-row"><Button size="small" onClick={() => navigate(`marketing/activity/${row.id}`)}>查看</Button><Button size="small" disabled={!access.manage} onClick={() => { setEditingStep(0); setEditing(structuredClone(row)); }}>编辑</Button><Dropdown trigger="click" position="bottomRight" menu={[
        { node: "item", name: "复制活动", onClick: () => copy(row), disabled: !access.manage },
        ...dataTabs.filter((tab) => !["draws", "awards"].includes(tab.value) || row.lotteryEnabled).map((tab) => ({ node: "item" as const, name: tab.label, onClick: () => navigate(`marketing/activity/${row.id}/${tab.value}`) })),
        { node: "divider" }, { node: "item", name: row.status === "PUBLISHED" ? "暂停" : row.status === "PAUSED" ? "恢复" : "发布", disabled: !access.manage || row.status === "CANCELED", onClick: () => { if (row.publishedAt) run({ type: "STATUS", activityId: row.id, status: row.status === "PUBLISHED" ? "PAUSED" : "PUBLISHED" }); else setPublishing(row); } },
        { node: "item", name: "取消活动", disabled: !access.manage || row.status === "CANCELED", onClick: () => confirmCancel(row, state.awards.filter((award) => award.activityId === row.id).length, () => { run({ type: "STATUS", activityId: row.id, status: "CANCELED" }); }) },
      ]}><Button size="small">更多</Button></Dropdown></div> },
    ]} /> : <Empty title="暂无匹配活动" description="调整筛选，或创建一个独立的草稿活动。" />}
    {editing && <ActivityEditor key={editing.id} initial={editing} initialStep={editingStep} onClose={() => setEditing(null)} />}
    {publishing && <PublishReview activity={publishing} onClose={() => setPublishing(null)} onFix={(step) => { setEditingStep(step); setEditing(structuredClone(publishing)); }} />}
  </>;
}

function BookingSettings({ activity }: { activity: MarketingActivity }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction(); const [slot, setSlot] = useState<MarketingSlot | null>(null);
  if (!activity.bookingEnabled) return <Panel title="参与设置"><DefinitionGrid rows={[["参与方式", "直接参与"], ["完成条件", activity.completion === "CHECKIN" ? "签到即完成" : "工作人员确认完成"]]} /></Panel>;
  return <><Panel title="参与设置"><DefinitionGrid rows={[["参与方式", "预约参与"], ["预约期", `${displayDate(activity.bookingStart)} 至 ${displayDate(activity.bookingEnd)}`], ["允许取消", activity.allowCancel ? "截止前且未签到" : "不允许"], ["允许改约", activity.allowReschedule ? "允许" : "不允许"], ["现场报名", activity.allowWalkIn ? "允许" : "不允许"], ["完成条件", activity.completion === "CHECKIN" ? "签到即完成" : "工作人员确认完成"]]} /></Panel>
    {feedback}<Panel title="活动场次"><Table rowKey="id" dataSource={activity.slots} pagination={false} scroll={{ x: 850 }} columns={[
      { title: "场次 / 时间", width: 240, render: (_: unknown, row: MarketingSlot) => `${row.label} · ${displayDate(row.startAt)} 至 ${displayDate(row.endAt)}` },
      { title: "地点", dataIndex: "location", width: 160 }, { title: "有效占用 / 容量", width: 140, render: (_: unknown, row: MarketingSlot) => `${slotOccupancy(state, activity.id, "ACTIVITY", row.id)} / ${row.capacity}` },
      { title: "预约截止 / 签到窗口", width: 300, render: (_: unknown, row: MarketingSlot) => `${displayDate(row.bookingClosesAt)} · ${displayDate(row.checkinStart)} 至 ${displayDate(row.checkinEnd)}` },
      { title: "操作", width: 170, fixed: "right", render: (_: unknown, row: MarketingSlot) => <div className="marketing-row-actions"><Button theme="borderless" size="small" disabled={!access.manage || activity.status === "CANCELED"} onClick={() => setSlot(structuredClone(row))}>编辑场次</Button><Dropdown trigger="click" menu={[{ node: "item", name: "删除场次", type: "danger", disabled: !access.manage || activity.status === "CANCELED" || state.bookings.some((booking) => booking.activityId === activity.id && booking.kind === "ACTIVITY" && booking.slotId === row.id), onClick: () => run({ type: "DELETE_ACTIVITY_SLOT", activityId: activity.id, slotId: row.id }) }]}><Button theme="borderless" size="small">更多</Button></Dropdown></div> },
    ]} /><Button size="small" disabled={!access.manage || activity.status === "CANCELED"} onClick={() => setSlot(createMarketingSlot(crypto.randomUUID(), activity.startAt))}>添加活动场次</Button></Panel>
    {slot && <Modal visible title="调整当前活动场次" width={Math.min(720, window.innerWidth - 20)} onCancel={() => setSlot(null)} onOk={() => { if (run({ type: "SAVE_ACTIVITY_SLOT", activityId: activity.id, slot }).ok) setSlot(null); }}>{feedback}<SlotFields slot={slot} onChange={setSlot} /></Modal>}
  </>;
}

function PrizeSettings({ activity }: { activity: MarketingActivity }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction(); const now = useClock();
  const [editing, setEditing] = useState<ActivityPrize | null>(null), [importId, setImportId] = useState(""), [codesId, setCodesId] = useState(""), [extra, setExtra] = useState({ itemId: "", count: 1 }), [addingSlot, setAddingSlot] = useState<{ itemId: string; slot: MarketingSlot } | null>(null);
  const rulesLocked = Boolean(activity.publishedAt || hasActivityBusinessData(state, activity.id));
  const codePrize = activity.pool.find((item) => item.id === codesId);
  return <>{feedback}<Panel title="抽奖规则"><DefinitionGrid rows={[["抽奖期", `${displayDate(activity.lotteryStart)} 至 ${displayDate(activity.lotteryEnd)}`], ["完成发放", `${activity.grantCount}次`], ["累计抽奖上限", activity.drawLimit], ["每日上限", activity.dailyLimit === null ? "不限制" : activity.dailyLimit], ["累计中奖上限", `${activity.winLimit}次`], ["未中奖概率", `${activity.noWinProbability}%`]]} /></Panel>
    <Panel title="活动奖品">
      <Table rowKey="id" dataSource={activity.pool} pagination={{ pageSize: 10 }} scroll={{ x: 1460 }} columns={[
        { title: "奖品 / 奖项", width: 200, render: (_: unknown, item: ActivityPrize) => `${item.name} · ${item.label}` },
        { title: "类型", width: 120, render: (_: unknown, item: ActivityPrize) => prizeTypeLabels[item.prizeType] },
        { title: "领取方式", width: 140, render: (_: unknown, item: ActivityPrize) => needsReservation(item) ? "预约领取" : item.prizeType === "VIRTUAL" ? "直接发放" : "直接领取" },
        { title: "中奖概率", width: 100, render: (_: unknown, item: ActivityPrize) => `${item.probability}%` },
        { title: "配额 / 中奖占用 / 已履约 / 剩余", width: 290, render: (_: unknown, item: ActivityPrize) => { const q = quota(state, activity.id, item); return `${q.total} / ${q.occupied} / ${q.issued} / ${q.available}`; } },
        { title: "可继续中奖 / 履约承诺", width: 190, render: (_: unknown, item: ActivityPrize) => `${winnable(state, activity.id, item, now)}${needsReservation(item) ? ` · 未预约${fulfillmentCapacity(state, activity.id, item, now).unreservedPromises} · 容量缺口${fulfillmentCapacity(state, activity.id, item, now).shortfall}` : ""}` },
        { title: "兑换码：导入 / 分配 / 剩余", width: 190, render: (_: unknown, item: ActivityPrize) => item.method === "REDEMPTION_CODE" ? `${codeInventory(item).imported} / ${codeInventory(item).assigned} / ${codeInventory(item).remaining}` : "不适用" },
        { title: "操作", width: 170, fixed: "right", render: (_: unknown, item: ActivityPrize) => <div className="marketing-row-actions"><Button theme="borderless" size="small" disabled={!access.manage} onClick={() => setEditing(structuredClone(item))}>编辑奖品</Button><Dropdown trigger="click" menu={[
          ...(item.method === "REDEMPTION_CODE" ? [{ node: "item" as const, name: "导入兑换码", disabled: !access.manage, onClick: () => setImportId(item.id) }, { node: "item" as const, name: "查看兑换码", disabled: !access.manage, onClick: () => setCodesId(item.id) }] : []),
          ...(rulesLocked ? [{ node: "item" as const, name: "增加配额", disabled: !access.manage, onClick: () => setExtra({ itemId: item.id, count: 1 }) }] : []),
          ...(needsReservation(item) && rulesLocked ? [{ node: "item" as const, name: "追加履约时段", disabled: !access.manage, onClick: () => setAddingSlot({ itemId: item.id, slot: createMarketingSlot(crypto.randomUUID(), item.claimStart) }) }] : []),
          ...(!rulesLocked ? [{ node: "item" as const, name: "删除奖品", type: "danger" as const, disabled: !access.manage, onClick: () => run({ type: "DELETE_ACTIVITY_PRIZE", activityId: activity.id, poolItemId: item.id }) }] : []),
        ]}><Button theme="borderless" size="small">更多</Button></Dropdown></div> },
      ]} />{!rulesLocked && <Button size="small" disabled={!access.manage} onClick={() => setEditing({ ...createActivityPrize(activity.id, Date.now()), fulfillmentMode: "DIRECT" })}>添加奖品</Button>}
    </Panel>
    {editing && <Modal visible className="marketing-prize-dialog" title="编辑当前活动奖品" width={Math.min(720, window.innerWidth - 20)} onCancel={() => setEditing(null)} onOk={() => { if (run({ type: "SAVE_ACTIVITY_PRIZE", activityId: activity.id, prize: editing }).ok) setEditing(null); }}>{feedback}{rulesLocked ? <><Banner title="已发布奖品规则锁定" description="名称、奖项、图片和说明的更新仅影响未来中奖；已中奖用户仍看到原承诺快照。兑换码、配额与履约时段使用专用操作追加。" closeIcon={null} /><TextField label="奖品名称" value={editing.name} onChange={(name) => setEditing({ ...editing, name })} /><TextField label="奖项名称" value={editing.label} onChange={(label) => setEditing({ ...editing, label })} /><TextField label="奖品说明" value={editing.description} onChange={(description) => setEditing({ ...editing, description })} /><TextField label="使用 / 领取说明" value={editing.instructions} onChange={(instructions) => setEditing({ ...editing, instructions })} /><ImageField label="奖品图片" value={editing.image} onChange={(image) => setEditing({ ...editing, image })} /></> : <PrizeFields prize={editing} onChange={setEditing} />}</Modal>}
    {importId && <Modal visible title="导入当前奖品兑换码" width={Math.min(650, window.innerWidth - 20)} footer={<Button onClick={() => setImportId("")}>完成</Button>} onCancel={() => setImportId("")}>
      {feedback}<CodeImporter onImport={(codes) => run({ type: "IMPORT_CODES", activityId: activity.id, poolItemId: importId, codes }).codeImport} />
    </Modal>}
    {codePrize && access.manage && <CodeManager prize={codePrize} published={Boolean(rulesLocked)} remainingQuota={quota(state, activity.id, codePrize).available} canManage={access.manage} onClose={() => setCodesId("")} onDelete={(codes) => run({ type: "DELETE_CODES", activityId: activity.id, poolItemId: codePrize.id, codes })} />}
    <Modal visible={Boolean(extra.itemId)} title="增加活动奖品配额" onCancel={() => setExtra({ itemId: "", count: 1 })} onOk={() => { if (run({ type: "ADD_QUOTA", activityId: activity.id, poolItemId: extra.itemId, count: extra.count }).ok) setExtra({ itemId: "", count: 1 }); }}>{feedback}<NumberField label="追加配额" value={extra.count} onChange={(count) => setExtra({ ...extra, count })} /></Modal>
    {addingSlot && <Modal visible title="追加奖品履约时段" width={Math.min(720, window.innerWidth - 20)} onCancel={() => setAddingSlot(null)} onOk={() => { if (run({ type: "ADD_PRIZE_SLOT", activityId: activity.id, poolItemId: addingSlot.itemId, slot: addingSlot.slot }).ok) setAddingSlot(null); }}>{feedback}<SlotFields slot={addingSlot.slot} onChange={(slot) => setAddingSlot({ ...addingSlot, slot })} /></Modal>}
  </>;
}

export function MarketingDetail({ activity, requestedTab }: { activity: MarketingActivity; requestedTab?: string }) {
  const { state, reset } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction(); const tick = useClock();
  const [editingStep, setEditingStep] = useState<number | null>(null), [publishing, setPublishing] = useState(false), [audit, setAudit] = useState(false), [detail, setDetail] = useState<{ title: string; rows: { id: string }[]; at: number } | null>(null);
  const now = useMemo(() => tick, [tick, state, activity.id]);
  useEffect(() => setDetail(null), [state, activity.id, currentUser.id, requestedTab]);
  const metrics = activityMetrics(state, activity, now), awards = state.awards.filter((row) => row.activityId === activity.id);
  const tab = ["overview", "basic", "booking-settings", "lottery", ...dataTabs.map((row) => row.value)].includes(requestedTab || "") ? requestedTab! : "overview";
  const group = ["basic", "booking-settings", "lottery"].includes(tab) ? "configuration" : ["participants", "bookings", "draws"].includes(tab) ? "records" : ["awards", "redemptions"].includes(tab) ? "fulfillment" : "overview";
  const go = (key: string) => navigate(`marketing/activity/${activity.id}/${key}`);
  const menu = [
    { node: "item" as const, name: "复制活动", disabled: !access.manage, onClick: () => { const result = run({ type: "COPY_ACTIVITY", activityId: activity.id }); if (result.ok) navigate(`marketing/activity/${result.resultId}`); } },
    ...(activity.publishedAt ? [{ node: "item" as const, name: activity.status === "PUBLISHED" ? "暂停活动" : "恢复活动", disabled: !access.manage || activity.status === "CANCELED", onClick: () => run({ type: "STATUS", activityId: activity.id, status: activity.status === "PUBLISHED" ? "PAUSED" as const : "PUBLISHED" as const }) }] : []),
    { node: "item" as const, name: "操作记录", onClick: () => setAudit(true) },
    { node: "divider" as const },
    { node: "item" as const, name: "取消活动", type: "danger" as const, disabled: !access.manage || activity.status === "CANCELED", onClick: () => confirmCancel(activity, awards.length, () => { run({ type: "STATUS", activityId: activity.id, status: "CANCELED" }); }) },
    ...(canDeleteDraft(state, activity) ? [{ node: "item" as const, name: "删除无记录草稿", type: "danger" as const, disabled: !access.manage, onClick: () => Modal.confirm({ title: "删除草稿活动？", content: "删除此无业务记录草稿及其奖品与场次配置。已有参与或中奖记录的活动不可删除。", onOk: () => { if (run({ type: "DELETE_ACTIVITY", activityId: activity.id }).ok) navigate("marketing"); } }) }] : []),
    ...(access.manage ? [{ node: "item" as const, name: "重置营销数据", type: "danger" as const, onClick: () => Modal.confirm({ title: "重置营销数据？", content: "只恢复营销数据，销售、会员数据及历史备份不变。", onOk: reset }) }] : []),
  ];
  const metricButtons = (indices: number[]) => <div className="marketing-metrics">{indices.map((i) => metrics[i]).map((metric) => <button key={metric.label} onClick={() => setDetail({ title: `${metric.label} · ${metric.kind}`, rows: metric.rows, at: now })}><span>{metric.label}</span><strong>{metric.rows.length}</strong><small>{metric.kind}</small></button>)}</div>;
  return <><div className="page marketing-detail">
    <Button theme="borderless" size="small" onClick={() => navigate("marketing")}>返回活动列表</Button>
    <PageHeader title={activity.name} description={`${brandLabels[activity.brand]} · ${activity.mode === "OFFLINE" ? "线下活动" : "线上活动"} · ${displayDate(activity.startAt)} — ${displayDate(activity.endAt)}`} actions={<>
      <Button theme="solid" disabled={!access.manage} onClick={() => setEditingStep(0)}>编辑活动</Button><Button disabled={!access.preview} onClick={() => navigate(`marketing/preview/${activity.id}`)}>用户流程预览</Button>
      {!activity.publishedAt && activity.status !== "CANCELED" && <Button disabled={!access.manage} onClick={() => setPublishing(true)}>发布</Button>}
      <Dropdown trigger="click" position="bottomRight" menu={menu}><Button aria-label="更多操作">更多操作</Button></Dropdown>
    </>} />
    <div className="marketing-detail-status"><Tag size="small" color={activity.status === "PUBLISHED" ? "green" : "grey"}>{marketingStatusLabels[activity.status]}</Tag><ActivityPhases activity={activity} /><Popover trigger="click" position="bottomLeft" content={<div className="marketing-time-plan"><h3>时间安排</h3><DefinitionGrid rows={[
      ...(activity.bookingEnabled ? [["预约期", `${displayDate(activity.bookingStart)} — ${displayDate(activity.bookingEnd)}`] as [string, string]] : []),
      ["活动期", `${displayDate(activity.startAt)} — ${displayDate(activity.endAt)}`],
      ...(activity.lotteryEnabled ? [["抽奖期", `${displayDate(activity.lotteryStart)} — ${displayDate(activity.lotteryEnd)}`] as [string, string], ["领奖期", activity.pool.length ? activity.pool.map((item) => `${item.name}：${displayDate(item.claimStart)} — ${displayDate(item.claimEnd)}`).join("\n") : "—"] as [string, string]] : []),
    ]} /></div>}><Button theme="borderless" size="small">查看时间安排</Button></Popover></div>
    {feedback}<Tabs className="marketing-primary-tabs" activeKey={group} onChange={(key) => go(({ overview: "overview", configuration: "basic", records: "participants", fulfillment: "awards" } as Record<string, string>)[key])}>
      <TabPane itemKey="overview" tab="概览"><div className="marketing-overview"><header className="marketing-section-heading"><h2>参与进展</h2><span>截至 {displayDate(new Date(now).toISOString())}</span></header>{metricButtons([...(activity.bookingEnabled ? [0] : []), 1, 2, ...(activity.lotteryEnabled ? [5] : [])])}
        {activity.lotteryEnabled && <><header className="marketing-section-heading"><h2>抽奖与履约</h2></header>{metricButtons([3, 4, 6, 7])}</>}
        <Panel title="活动信息"><DefinitionGrid rows={[["活动说明", activity.description], ["参与方式", activity.bookingEnabled ? "预约参与" : "直接参与"], ["地点", activity.mode === "OFFLINE" ? activity.location : "线上活动"], ["完成条件", activity.completion === "CHECKIN" ? "签到即完成" : "工作人员确认完成"], ["活动规则", activity.ruleContent || "—"]]} /></Panel></div></TabPane>
      <TabPane itemKey="configuration" tab="活动配置"><Tabs type="button" className="marketing-secondary-tabs" activeKey={tab} onChange={go}>
        <TabPane itemKey="basic" tab="基本信息"><Panel title="基本信息"><DefinitionGrid rows={[["活动说明", activity.description], ["所属品牌", brandLabels[activity.brand]], ["活动类型", activity.mode === "OFFLINE" ? "线下活动" : "线上活动"], ["参与方式", activity.bookingEnabled ? "预约参与" : "直接参与"], ["地点", activity.mode === "OFFLINE" ? activity.location : "线上活动"], ["活动时间", `${displayDate(activity.startAt)} — ${displayDate(activity.endAt)}`], ["活动规则", activity.ruleContent || "—"]]} />{activity.cover && <img className="marketing-cover" src={activity.cover} alt="活动封面" />}</Panel></TabPane>
        <TabPane itemKey="booking-settings" tab="参与设置"><Button theme="borderless" size="small" disabled={!access.manage || Boolean(activity.publishedAt || hasActivityBusinessData(state, activity.id))} onClick={() => setEditingStep(1)}>编辑参与设置</Button><BookingSettings activity={activity} /></TabPane>
        <TabPane itemKey="lottery" tab="抽奖与奖品">{activity.lotteryEnabled ? <><Button theme="borderless" size="small" disabled={!access.manage || Boolean(activity.publishedAt || hasActivityBusinessData(state, activity.id))} onClick={() => setEditingStep(2)}>编辑抽奖规则</Button><PrizeSettings activity={activity} /></> : <Empty title="本活动不启用抽奖" />}</TabPane>
      </Tabs></TabPane>
      <TabPane itemKey="records" tab="参与记录"><Tabs type="button" className="marketing-secondary-tabs" activeKey={tab} onChange={go}>
        <TabPane itemKey="participants" tab="参与用户"><ParticipantTable activity={activity} /></TabPane><TabPane itemKey="bookings" tab="预约记录"><BookingData activity={activity} /></TabPane>
        {activity.lotteryEnabled && <TabPane itemKey="draws" tab="抽奖记录"><DrawData activity={activity} /></TabPane>}
      </Tabs></TabPane>
      <TabPane itemKey="fulfillment" tab="奖品履约"><Tabs type="button" className="marketing-secondary-tabs" activeKey={tab} onChange={go}>
        <TabPane itemKey="awards" tab="中奖记录">{activity.lotteryEnabled ? <AwardData activity={activity} /> : <Empty title="暂无中奖记录" description="本活动不启用抽奖。" />}</TabPane><TabPane itemKey="redemptions" tab="核销记录"><RedemptionData activity={activity} /></TabPane>
      </Tabs></TabPane>
    </Tabs>
  </div>
    {editingStep !== null && <ActivityEditor initial={structuredClone(activity)} initialStep={editingStep} onClose={() => setEditingStep(null)} />}
    {publishing && <PublishReview activity={activity} onClose={() => setPublishing(false)} onFix={setEditingStep} />}
    <SideSheet visible={Boolean(detail)} closeOnEsc title={detail?.title} width={Math.min(600, window.innerWidth - 20)} onCancel={() => setDetail(null)}><p>本活动 · {brandLabels[activity.brand]} · 当前授权范围 · 截至 {displayDate(new Date(detail?.at ?? now).toISOString())}</p>{detail?.rows.length ? <Table rowKey="id" dataSource={detail.rows} columns={[{ title: "记录ID", dataIndex: "id" }]} /> : <Empty title="当前口径暂无记录" />}</SideSheet>
    <SideSheet visible={audit} closeOnEsc title="操作记录" width={Math.min(900, window.innerWidth - 20)} onCancel={() => setAudit(false)}><AuditData activity={activity} /></SideSheet>
  </>;
}
