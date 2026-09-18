import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IconMore } from "@douyinfe/semi-icons";
import { Banner, Button, Dropdown, Empty, Modal, Popover, SideSheet, Table, Tabs, TabPane, Tag } from "@douyinfe/semi-ui";
import { PageHeader } from "@/components/CrmUi";
import { useCrm } from "@/stores/crm-store";
import { brandLabels } from "@/stores/member-operations-store";
import { useMarketing } from "@/stores/marketing-store";
import { createActivityPrize, createMarketingActivity, createMarketingSlot } from "@/mock/marketing-demo-data";
import type { ActivityPrize, MarketingActivity, MarketingSlot } from "@/types/marketing";
import { parseCreatedAt } from "@/features/dashboard/dashboard-model";
import { navigate } from "@/utils/format";
import { activityCreationIssue, activityMetrics, codeInventory, fulfillmentCapacity, hasActivityBusinessData, marketingPermissions, needsReservation, prizeTypeLabels, quota, slotOccupancy, winnable } from "./marketing-model";
import { activityCodes, activityLifecycle, lifecycleLabels } from "./marketing-activity-code";
import { ActivityEditor, ActivityConfigurationEditor, CodeImporter, PrizeFields } from "./MarketingEditor";
import { ActivityRuleContent } from "./MarketingRuleEditor";
import { CodeManager } from "./MarketingCodes";
import { AwardData, BookingData, DrawData, ParticipantTable, RedemptionData } from "./MarketingData";
import { DefinitionGrid, displayDate, ImageField, NumberField, options, Panel, SelectField, SlotFields, TextField, useAction } from "./MarketingUi";

const dataTabs = [{ value: "participants", label: "参与用户" }, { value: "bookings", label: "预约记录" }, { value: "draws", label: "抽奖记录" }, { value: "awards", label: "中奖记录" }, { value: "redemptions", label: "核销记录" }];
function useClock() { const [now, setNow] = useState(Date.now); useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []); return now; }
function activityMenu(activity: MarketingActivity, manage: boolean, now: number, run: ReturnType<typeof useAction>["run"]) {
  const lifecycle = activityLifecycle(activity, now), start = parseCreatedAt(activity.startAt);
  return [
    { node: "item" as const, name: "开始", disabled: !manage || lifecycle === "ENDED" || !Number.isFinite(start) || now < start || activity.status === "PUBLISHED" && lifecycle === "ONGOING", onClick: () => run({ type: "STATUS", activityId: activity.id, status: "PUBLISHED" }) },
    { node: "item" as const, name: "暂停", disabled: !manage || lifecycle !== "ONGOING" || activity.status !== "PUBLISHED", onClick: () => run({ type: "STATUS", activityId: activity.id, status: "PAUSED" }) },
    { node: "item" as const, name: "结束", type: "danger" as const, disabled: !manage || lifecycle === "ENDED", onClick: () => Modal.confirm({ title: "结束活动？", content: "停止新参与并取消未到场的活动预约；已有记录、中奖权益和奖品预约保留。", onOk: () => { run({ type: "STATUS", activityId: activity.id, status: "CANCELED" }); } }) },
  ];
}
function LifecycleTag({ activity, now }: { activity: MarketingActivity; now: number }) {
  const lifecycle = activityLifecycle(activity, now);
  return <Tag size="small" color={lifecycle === "ONGOING" ? "green" : "grey"}>{lifecycleLabels[lifecycle]}</Tag>;
}

export function MarketingList({ migratedEntry }: { migratedEntry?: string }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction(), now = useClock();
  const codes = useMemo(() => activityCodes(state), [state]);
  const [filters, setFilters] = useState({ search: "", brand: "ALL", mode: "ALL", status: "ALL", participation: "ALL" }), [editing, setEditing] = useState<MarketingActivity | null>(null);
  const keyword = filters.search.trim().toLowerCase();
  const rows = state.activities.filter(row => access.brands.includes(row.brand))
    .filter(row => (row.name.toLowerCase().includes(keyword) || codes.get(row.id)!.toLowerCase().includes(keyword)) &&
      (filters.brand === "ALL" || row.brand === filters.brand) && (filters.mode === "ALL" || row.mode === filters.mode) &&
      (filters.status === "ALL" || activityLifecycle(row, now) === filters.status) &&
      (filters.participation === "ALL" || (row.bookingEnabled ? "RESERVATION" : "DIRECT") === filters.participation));
  const update = (key: keyof typeof filters, value: string) => setFilters(old => ({ ...old, [key]: value }));
  const creationIssue = activityCreationIssue(access);
  return <>
    <PageHeader title="营销活动" description="管理品牌活动及参与配置。" />
    {feedback}{migratedEntry && <Banner type="info" title="请选择活动查看相关记录" closeIcon={null} />}{creationIssue && <Banner type="warning" title={creationIssue} closeIcon={null} />}
    <div className="marketing-list-toolbar">
      <div className="marketing-list-filters">
        <TextField label="搜索活动" placeholder="活动名称或编号" value={filters.search} onChange={value => update("search", value)} />
        <SelectField label="活动类型" value={filters.mode} list={options({ ALL: "全部类型", ONLINE: "线上活动", OFFLINE: "线下活动" })} onChange={value => update("mode", value)} />
        <SelectField label="活动状态" value={filters.status} list={options({ ALL: "全部状态", ...lifecycleLabels })} onChange={value => update("status", value)} />
        <SelectField label="参与方式" value={filters.participation} list={options({ ALL: "全部方式", RESERVATION: "预约参与", DIRECT: "直接参与" })} onChange={value => update("participation", value)} />
        {access.brands.length > 1 && <SelectField label="所属品牌" value={filters.brand} list={[{ value: "ALL", label: "全部授权品牌" }, ...access.brands.map(brand => ({ value: brand, label: brandLabels[brand] }))]} onChange={value => update("brand", value)} />}
      </div>
      <Button theme="solid" disabled={Boolean(creationIssue)} onClick={() => setEditing({ ...createMarketingActivity(access.brands[0], Date.now()), name: "" })}>新建活动</Button>
    </div>
    <Table className="marketing-activity-table" rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1260 }} empty={<Empty title="暂无匹配活动" description="调整筛选，或创建活动。" />} columns={[
      { title: "活动编号", width: 190, render: (_: unknown, row: MarketingActivity) => <span className="marketing-activity-code">{codes.get(row.id)}</span> },
      { title: "活动名称", width: 230, render: (_: unknown, row: MarketingActivity) => <a className="marketing-activity-name" href={`#marketing/activity/${row.id}`}>{row.name}</a> },
      { title: "活动类型", width: 110, render: (_: unknown, row: MarketingActivity) => row.mode === "ONLINE" ? "线上活动" : "线下活动" },
      { title: "场地", width: 160, render: (_: unknown, row: MarketingActivity) => row.mode === "OFFLINE" ? row.location || "—" : "—" },
      { title: "活动时间", width: 210, render: (_: unknown, row: MarketingActivity) => <span className="marketing-date-range">{displayDate(row.startAt)}<br />至 {displayDate(row.endAt)}</span> },
      { title: "状态", width: 100, render: (_: unknown, row: MarketingActivity) => <LifecycleTag activity={row} now={now} /> },
      { title: "参与方式", width: 120, render: (_: unknown, row: MarketingActivity) => row.bookingEnabled ? "预约参与" : "直接参与" },
      { title: "操作", width: 120, fixed: "right", render: (_: unknown, row: MarketingActivity) => <div className="marketing-row-actions"><Button theme="borderless" size="small" disabled={!access.manage} onClick={() => setEditing(structuredClone(row))}>编辑</Button><Dropdown trigger="click" position="bottomRight" menu={activityMenu(row, access.manage, now, run)}><Button theme="borderless" size="small" icon={<IconMore />} aria-label="更多" /></Dropdown></div> },
    ]} />
    {editing && <ActivityEditor key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
  </>;
}

function BookingSettings({ activity }: { activity: MarketingActivity }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction(); const [slot, setSlot] = useState<MarketingSlot | null>(null);
  if (!activity.bookingEnabled) return <Panel title="预约设置"><DefinitionGrid rows={[["参与方式", "直接参与"], ["完成条件", activity.completion === "CHECKIN" ? "签到即完成" : "工作人员确认完成"]]} /></Panel>;
  return <><Panel title="预约设置"><DefinitionGrid rows={[["参与方式", "预约参与"], ["预约期", `${displayDate(activity.bookingStart)} 至 ${displayDate(activity.bookingEnd)}`], ["允许取消", activity.allowCancel ? "截止前且未签到" : "不允许"], ["允许改约", activity.allowReschedule ? "允许" : "不允许"], ["现场报名", activity.allowWalkIn ? "允许" : "不允许"], ["完成条件", activity.completion === "CHECKIN" ? "签到即完成" : "工作人员确认完成"]]} /></Panel>
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
  return <>{feedback}
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

function LotterySettings({ activity }: { activity: MarketingActivity }) {
  return <Panel title="抽奖设置"><DefinitionGrid rows={[["抽奖时间", `${displayDate(activity.lotteryStart)} 至 ${displayDate(activity.lotteryEnd)}`], ["完成后发放次数", activity.grantCount], ["累计抽奖上限", activity.drawLimit], ["每日上限", activity.dailyLimit === null ? "不限制" : activity.dailyLimit], ["累计中奖上限", activity.winLimit], ["未中奖概率", `${activity.noWinProbability}%`]]} /></Panel>;
}

export function MarketingDetail({ activity, requestedTab }: { activity: MarketingActivity; requestedTab?: string }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction(), now = useClock();
  const [editing, setEditing] = useState(false), [configuration, setConfiguration] = useState<"booking" | "lottery" | null>(null);
  const [detail, setDetail] = useState<{ title: string; rows: { id: string }[]; at: number } | null>(null);
  useEffect(() => setDetail(null), [state, activity.id, currentUser.id, requestedTab]);
  const locked = Boolean(activity.publishedAt || hasActivityBusinessData(state, activity.id));
  const code = activityCodes(state).get(activity.id), metrics = activityMetrics(state, activity, now);
  const configurationTabs = ["basic", ...(activity.bookingEnabled ? ["booking-settings"] : []), ...(activity.lotteryEnabled ? ["lottery", "prizes"] : [])];
  const validTabs = ["overview", ...configurationTabs, ...dataTabs.filter(row => row.value !== "draws" || activity.lotteryEnabled).map(row => row.value)];
  const tab = validTabs.includes(requestedTab || "") ? requestedTab! : requestedTab && ["booking-settings", "lottery", "prizes"].includes(requestedTab) ? "basic" : "overview";
  const group = configurationTabs.includes(tab) ? "configuration" : ["participants", "bookings", "draws"].includes(tab) ? "records" : ["awards", "redemptions"].includes(tab) ? "fulfillment" : "overview";
  const go = (key: string) => navigate(`marketing/activity/${activity.id}/${key}`);
  const info: Array<[string, ReactNode]> = [
    ["活动编号", code], ["所属品牌", brandLabels[activity.brand]], ["活动类型", activity.mode === "OFFLINE" ? "线下活动" : "线上活动"],
    ["场地", activity.mode === "OFFLINE" ? activity.location || "—" : "—"], ["活动时间", `${displayDate(activity.startAt)} — ${displayDate(activity.endAt)}`],
    ["参与方式", activity.bookingEnabled ? "预约参与" : "直接参与"], ["启用抽奖", activity.lotteryEnabled ? "是" : "否"], ["活动规则", <ActivityRuleContent activity={activity} />],
  ];
  const metricButtons = (indices: number[]) => <div className="marketing-metrics">{indices.map(i => metrics[i]).map(metric => <button key={metric.label} onClick={() => setDetail({ title: `${metric.label} · ${metric.kind}`, rows: metric.rows, at: now })}><span>{metric.label}</span><strong>{metric.rows.length}</strong><small>{metric.kind}</small></button>)}</div>;
  return <><div className="page marketing-detail">
    <Button theme="borderless" size="small" onClick={() => navigate("marketing")}>返回活动列表</Button>
    <PageHeader title={activity.name} description={`${code} · ${brandLabels[activity.brand]} · ${activity.mode === "OFFLINE" ? "线下活动" : "线上活动"}`} actions={<>
      <Button theme="solid" disabled={!access.manage} onClick={() => setEditing(true)}>编辑活动</Button><Button disabled={!access.preview} onClick={() => navigate(`marketing/preview/${activity.id}`)}>用户流程预览</Button>
      <Dropdown trigger="click" position="bottomRight" menu={activityMenu(activity, access.manage, now, run)}><Button icon={<IconMore />} aria-label="更多操作">更多</Button></Dropdown>
    </>} />
    <div className="marketing-detail-status"><LifecycleTag activity={activity} now={now} /><Popover trigger="click" position="bottomLeft" content={<div className="marketing-time-plan"><h3>时间安排</h3><DefinitionGrid rows={[
      ["活动时间", `${displayDate(activity.startAt)} — ${displayDate(activity.endAt)}`],
      ...(activity.bookingEnabled ? [["预约时间", `${displayDate(activity.bookingStart)} — ${displayDate(activity.bookingEnd)}`] as [string, string]] : []),
      ...(activity.lotteryEnabled ? [["抽奖时间", `${displayDate(activity.lotteryStart)} — ${displayDate(activity.lotteryEnd)}`] as [string, string]] : []),
    ]} /></div>}><Button theme="borderless" size="small">查看时间安排</Button></Popover></div>
    {feedback}<Tabs className="marketing-primary-tabs" activeKey={group} onChange={key => go(({ overview: "overview", configuration: "basic", records: "participants", fulfillment: "awards" } as Record<string, string>)[key])}>
      <TabPane itemKey="overview" tab="概览"><div className="marketing-overview"><header className="marketing-section-heading"><h2>参与进展</h2><span>截至 {displayDate(new Date(now).toISOString())}</span></header>{metricButtons([...(activity.bookingEnabled ? [0] : []), 1, 2, ...(activity.lotteryEnabled ? [5] : [])])}
        {activity.lotteryEnabled && <><header className="marketing-section-heading"><h2>抽奖与履约</h2></header>{metricButtons([3, 4, 6, 7])}</>}
        <Panel title="活动信息"><DefinitionGrid rows={info} /></Panel></div></TabPane>
      <TabPane itemKey="configuration" tab="活动配置"><Tabs type="button" className="marketing-secondary-tabs" activeKey={tab} onChange={go}>
        <TabPane itemKey="basic" tab="基本信息"><DefinitionGrid rows={info} /></TabPane>
        {activity.bookingEnabled && <TabPane itemKey="booking-settings" tab="预约设置"><div className="marketing-config-actions"><Button size="small" disabled={!access.manage || locked} onClick={() => setConfiguration("booking")}>编辑预约设置</Button></div><BookingSettings activity={activity} /></TabPane>}
        {activity.lotteryEnabled && <TabPane itemKey="lottery" tab="抽奖设置"><div className="marketing-config-actions"><Button size="small" disabled={!access.manage || locked} onClick={() => setConfiguration("lottery")}>编辑抽奖设置</Button></div><LotterySettings activity={activity} /></TabPane>}
        {activity.lotteryEnabled && <TabPane itemKey="prizes" tab="奖品设置"><PrizeSettings activity={activity} /></TabPane>}
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
    {editing && <ActivityEditor initial={structuredClone(activity)} onClose={() => setEditing(false)} />}
    {configuration && <ActivityConfigurationEditor key={configuration} initial={structuredClone(activity)} section={configuration} onClose={() => setConfiguration(null)} />}
    <SideSheet visible={Boolean(detail)} closeOnEsc title={detail?.title} width={Math.min(600, window.innerWidth - 24)} onCancel={() => setDetail(null)}><p>本活动 · {brandLabels[activity.brand]} · 当前授权范围 · 截至 {displayDate(new Date(detail?.at ?? now).toISOString())}</p>{detail?.rows.length ? <Table rowKey="id" dataSource={detail.rows} columns={[{ title: "记录ID", dataIndex: "id" }]} /> : <Empty title="当前口径暂无记录" />}</SideSheet>
  </>;
}
