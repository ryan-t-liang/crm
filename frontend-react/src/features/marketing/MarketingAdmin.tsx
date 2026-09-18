import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IconChevronDown, IconMore, IconPlus, IconSearch } from "@douyinfe/semi-icons";
import { Banner, Button, Dropdown, Input, Modal, Select, SideSheet, Table, Tabs, TabPane, Tag } from "@douyinfe/semi-ui";
import { FormSideSheet, DataList, DetailWorkspace, EmptyBlock, PageHeader, SideSection } from "@/components/CrmUi";
import { useCrm } from "@/stores/crm-store";
import { brandLabels } from "@/stores/member-operations-store";
import { useMarketing } from "@/stores/marketing-store";
import { createActivityPrize, createMarketingActivity, createMarketingSlot } from "@/mock/marketing-demo-data";
import { createMarketingRecordIllustrations, withMarketingRecordIllustrations } from "@/mock/marketing-record-illustrations";
import type { ActivityPrize, MarketingActivity, MarketingSlot } from "@/types/marketing";
import { parseCreatedAt } from "@/features/dashboard/dashboard-model";
import { navigate } from "@/utils/format";
import { activityCreationIssue, codeInventory, fulfillmentCapacity, hasActivityBusinessData, marketingPermissions, needsReservation, prizeTypeLabels, quota, slotOccupancy, winnable } from "./marketing-model";
import { activityCodes, activityLifecycle, lifecycleLabels } from "./marketing-activity-code";
import { ActivityEditor, ActivityConfigurationEditor, CodeImporter, PrizeFields } from "./MarketingEditor";
import { ActivityRuleContent } from "./MarketingRuleEditor";
import { CodeManager } from "./MarketingCodes";
import { ActivityBookingData, DrawData } from "./MarketingRecords";
import { activityDetailTab } from "./marketing-records";
import { DateRange, DefinitionGrid, displayDate, displayDateRange, ImageField, NumberField, options, Panel, prizeReceivingLabel, SlotFields, TextField, useAction } from "./MarketingUi";

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
    <PageHeader title="营销活动" description="管理品牌活动。" actions={<Button theme="solid" disabled={Boolean(creationIssue)} onClick={() => setEditing({ ...createMarketingActivity(access.brands[0], Date.now()), name: "" })} icon={<IconPlus />}>新建活动</Button>} />
    {feedback}{migratedEntry && <Banner type="info" title="请选择活动查看相关记录" closeIcon={null} />}{creationIssue && <Banner type="warning" title={creationIssue} closeIcon={null} />}
    <section className="data-surface">
    <div className="table-toolbar">
      <Input prefix={<IconSearch />} aria-label="搜索活动" placeholder="活动名称或编号" value={filters.search} onChange={value => update("search", value)} showClear />
      <Select aria-label="活动类型" value={filters.mode} optionList={options({ ALL: "全部类型", ONLINE: "线上活动", OFFLINE: "线下活动" })} onChange={value => update("mode", String(value))} />
      <Select aria-label="活动状态" value={filters.status} optionList={options({ ALL: "全部状态", ...lifecycleLabels })} onChange={value => update("status", String(value))} />
      <Select aria-label="参与方式" value={filters.participation} optionList={options({ ALL: "全部方式", RESERVATION: "预约参与", DIRECT: "直接参与" })} onChange={value => update("participation", String(value))} />
      {access.brands.length > 1 && <Select aria-label="所属品牌" value={filters.brand} optionList={[{ value: "ALL", label: "全部授权品牌" }, ...access.brands.map(brand => ({ value: brand, label: brandLabels[brand] }))]} onChange={value => update("brand", String(value))} />}
    </div>
    <Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1260 }} empty={<EmptyBlock title="暂无匹配活动" description="调整筛选，或创建活动。" />} columns={[
      { title: "活动编号", width: 190, render: (_: unknown, row: MarketingActivity) => <span className="marketing-activity-code">{codes.get(row.id)}</span> },
      { title: "活动名称", width: 230, render: (_: unknown, row: MarketingActivity) => <a className="marketing-activity-name" href={`#marketing/activity/${row.id}`}>{row.name}</a> },
      { title: "活动类型", width: 110, render: (_: unknown, row: MarketingActivity) => row.mode === "ONLINE" ? "线上活动" : "线下活动" },
      { title: "场地", width: 160, render: (_: unknown, row: MarketingActivity) => row.mode === "OFFLINE" ? row.location || "—" : "—" },
      { title: "活动时间", width: 210, render: (_: unknown, row: MarketingActivity) => <DateRange start={row.startAt} end={row.endAt} /> },
      { title: "状态", width: 100, render: (_: unknown, row: MarketingActivity) => <LifecycleTag activity={row} now={now} /> },
      { title: "参与方式", width: 120, render: (_: unknown, row: MarketingActivity) => row.bookingEnabled ? "预约参与" : "直接参与" },
      { title: "操作", width: 120, fixed: "right", render: (_: unknown, row: MarketingActivity) => <div className="row-actions"><Button theme="borderless" size="small" disabled={!access.manage} onClick={() => setEditing(structuredClone(row))}>编辑</Button><Dropdown trigger="click" position="bottomRight" menu={activityMenu(row, access.manage, now, run)}><Button theme="borderless" size="small" icon={<IconMore />} aria-label="更多" /></Dropdown></div> },
    ]} />
    </section>
    {editing && <ActivityEditor key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
  </>;
}

function ActivitySessions({ activity }: { activity: MarketingActivity }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction();
  const [slot, setSlot] = useState<MarketingSlot | null>(null);
  return <>{feedback}<Panel actions={<Button size="small" icon={<IconPlus />} disabled={!access.manage} onClick={() => setSlot({ ...createMarketingSlot(crypto.randomUUID(), activity.startAt, 10, Date.parse(activity.startAt) - 30 * 60_000), location: activity.location })}>添加场次</Button>}>
      <Table rowKey="id" dataSource={activity.slots} pagination={false} scroll={{ x: 1070 }} empty={<EmptyBlock title="暂无活动场次" description="添加场次后，用户可选择时间预约。" />} columns={[
        { title: "日期 / 场次", width: 150, render: (_: unknown, row: MarketingSlot) => <div className="marketing-summary-cell"><span>{displayDate(row.startAt).slice(0, 10)}</span><span>{row.label}</span></div> },
        { title: "时间", width: 170, render: (_: unknown, row: MarketingSlot) => displayDateRange(row.startAt, row.endAt).time },
        { title: "场地", dataIndex: "location", width: 150 },
        { title: "预约人数 / 容量", width: 140, render: (_: unknown, row: MarketingSlot) => `${slotOccupancy(state, activity.id, "ACTIVITY", row.id)} / ${row.capacity}` },
        { title: "预约截止", width: 140, render: (_: unknown, row: MarketingSlot) => displayDate(row.bookingClosesAt) },
        { title: "签到时间", width: 200, render: (_: unknown, row: MarketingSlot) => displayDateRange(row.checkinStart, row.checkinEnd).compact },
        { title: "操作", width: 120, fixed: "right", render: (_: unknown, row: MarketingSlot) => <div className="row-actions"><Button theme="borderless" size="small" disabled={!access.manage} onClick={() => setSlot(structuredClone(row))}>编辑</Button><Dropdown trigger="click" menu={[{ node: "item", name: "删除场次", type: "danger", disabled: !access.manage || state.bookings.some(booking => booking.activityId === activity.id && booking.kind === "ACTIVITY" && booking.slotId === row.id), onClick: () => run({ type: "DELETE_ACTIVITY_SLOT", activityId: activity.id, slotId: row.id }) }]}><Button theme="borderless" size="small" icon={<IconMore />} aria-label={`更多操作 · ${row.label}`} /></Dropdown></div> },
      ]} />
    </Panel>
    {slot && <FormSideSheet visible className="marketing-prize-editor" title="活动场次" width={640} okText="保存" cancelText="取消" onCancel={() => setSlot(null)} onOk={() => { if (run({ type: "SAVE_ACTIVITY_SLOT", activityId: activity.id, slot }).ok) setSlot(null); }}>{feedback}<SlotFields slot={slot} onChange={setSlot} /></FormSideSheet>}
  </>;
}

function PrizeSettings({ activity }: { activity: MarketingActivity }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction(); const now = useClock();
  const [editing, setEditing] = useState<ActivityPrize | null>(null), [importId, setImportId] = useState(""), [codesId, setCodesId] = useState(""), [extra, setExtra] = useState({ itemId: "", count: 1 }), [addingSlot, setAddingSlot] = useState<{ itemId: string; slot: MarketingSlot } | null>(null);
  const rulesLocked = Boolean(activity.publishedAt || hasActivityBusinessData(state, activity.id));
  const codePrize = activity.pool.find((item) => item.id === codesId);
  return <>{feedback}
    <Panel>
      <Table rowKey="id" dataSource={activity.pool} pagination={{ pageSize: 10 }} scroll={{ x: 1260 }} empty={<EmptyBlock title="暂无奖品" description="添加奖品后，可分别配置领取方式、配额和中奖概率。" />} columns={[
        { title: "奖品", width: 210, render: (_: unknown, item: ActivityPrize) => <div className="marketing-summary-cell"><strong>{item.name}</strong><span>{item.label}</span></div> },
        { title: "类型", width: 120, render: (_: unknown, item: ActivityPrize) => prizeTypeLabels[item.prizeType] },
        { title: "领取方式", width: 130, render: (_: unknown, item: ActivityPrize) => prizeReceivingLabel(item) },
        { title: "领取有效期", width: 210, render: (_: unknown, item: ActivityPrize) => <DateRange start={item.claimStart} end={item.claimEnd} /> },
        { title: "中奖概率", width: 100, render: (_: unknown, item: ActivityPrize) => `${item.probability}%` },
        { title: "配额", width: 100, render: (_: unknown, item: ActivityPrize) => quota(state, activity.id, item).total },
        { title: "已中奖", width: 110, render: (_: unknown, item: ActivityPrize) => quota(state, activity.id, item).occupied },
        { title: "剩余", width: 110, render: (_: unknown, item: ActivityPrize) => quota(state, activity.id, item).available },
        { title: "操作", width: 170, fixed: "right", render: (_: unknown, item: ActivityPrize) => <div className="row-actions"><Button theme="borderless" size="small" disabled={!access.manage} onClick={() => setEditing(structuredClone(item))}>编辑奖品</Button><Dropdown trigger="click" menu={[
          ...(item.method === "REDEMPTION_CODE" ? [{ node: "item" as const, name: "导入兑换码", disabled: !access.manage, onClick: () => setImportId(item.id) }, { node: "item" as const, name: "查看兑换码", disabled: !access.manage, onClick: () => setCodesId(item.id) }] : []),
          ...(rulesLocked ? [{ node: "item" as const, name: "增加配额", disabled: !access.manage, onClick: () => setExtra({ itemId: item.id, count: 1 }) }] : []),
          ...(needsReservation(item) && rulesLocked ? [{ node: "item" as const, name: "追加领奖时段", disabled: !access.manage, onClick: () => setAddingSlot({ itemId: item.id, slot: createMarketingSlot(crypto.randomUUID(), item.claimStart) }) }] : []),
          ...(!rulesLocked ? [{ node: "item" as const, name: "删除奖品", type: "danger" as const, disabled: !access.manage, onClick: () => run({ type: "DELETE_ACTIVITY_PRIZE", activityId: activity.id, poolItemId: item.id }) }] : []),
        ]}><Button theme="borderless" size="small" icon={<IconMore />} aria-label={`更多奖品操作 · ${item.name}`} /></Dropdown></div> },
      ]} />
    </Panel>
    {editing && <FormSideSheet visible className="marketing-prize-editor" title="编辑奖品" width={720} okText="保存" cancelText="取消" okButtonProps={{ disabled: !access.manage }} onCancel={() => setEditing(null)} onOk={() => { if (!access.manage) return; if (run({ type: "SAVE_ACTIVITY_PRIZE", activityId: activity.id, prize: editing }).ok) setEditing(null); }}>{feedback}
      <DefinitionGrid rows={[
      ["可继续中奖", winnable(state, activity.id, editing, now)], ["已领取 / 发放", quota(state, activity.id, editing).issued],
      ...(needsReservation(editing) ? [["待预约权益", fulfillmentCapacity(state, activity.id, editing, now).unreservedPromises], ["预约名额缺口", fulfillmentCapacity(state, activity.id, editing, now).shortfall]] as Array<[string, ReactNode]> : []),
      ...(editing.method === "REDEMPTION_CODE" ? [["兑换码：导入 / 分配 / 剩余", `${codeInventory(editing).imported} / ${codeInventory(editing).assigned} / ${codeInventory(editing).remaining}`]] as Array<[string, ReactNode]> : []),
    ]} />{rulesLocked ? <><Banner title="既有奖品规则保留" description="文案修改不影响历史中奖记录；配额、兑换码和领奖时段可通过专用操作追加，新的领取规则请创建新奖品。" closeIcon={null} /><TextField label="奖品名称" value={editing.name} onChange={(name) => setEditing({ ...editing, name })} /><TextField label="奖项名称" value={editing.label} onChange={(label) => setEditing({ ...editing, label })} /><TextField label="奖品说明" value={editing.description} onChange={(description) => setEditing({ ...editing, description })} /><TextField label="使用 / 领取说明" value={editing.instructions} onChange={(instructions) => setEditing({ ...editing, instructions })} /><ImageField label="奖品图片" value={editing.image} onChange={(image) => setEditing({ ...editing, image })} /></> : <PrizeFields prize={editing} onChange={setEditing} />}</FormSideSheet>}
    {importId && <FormSideSheet visible title="导入当前奖品兑换码" width={650} footer={<Button onClick={() => setImportId("")}>完成</Button>} onCancel={() => setImportId("")}>
      {feedback}<CodeImporter onImport={(codes) => run({ type: "IMPORT_CODES", activityId: activity.id, poolItemId: importId, codes }).codeImport} />
    </FormSideSheet>}
    {codePrize && access.manage && <CodeManager prize={codePrize} published={Boolean(rulesLocked)} remainingQuota={quota(state, activity.id, codePrize).available} canManage={access.manage} onClose={() => setCodesId("")} onDelete={(codes) => run({ type: "DELETE_CODES", activityId: activity.id, poolItemId: codePrize.id, codes })} />}
    <FormSideSheet visible={Boolean(extra.itemId)} title="增加活动奖品配额" onCancel={() => setExtra({ itemId: "", count: 1 })} onOk={() => { if (run({ type: "ADD_QUOTA", activityId: activity.id, poolItemId: extra.itemId, count: extra.count }).ok) setExtra({ itemId: "", count: 1 }); }}>{feedback}<NumberField label="追加配额" value={extra.count} onChange={(count) => setExtra({ ...extra, count })} /></FormSideSheet>
    {addingSlot && <FormSideSheet visible title="追加领奖时段" width={720} onCancel={() => setAddingSlot(null)} onOk={() => { if (run({ type: "ADD_PRIZE_SLOT", activityId: activity.id, poolItemId: addingSlot.itemId, slot: addingSlot.slot }).ok) setAddingSlot(null); }}>{feedback}<SlotFields slot={addingSlot.slot} onChange={(slot) => setAddingSlot({ ...addingSlot, slot })} /></FormSideSheet>}
  </>;
}

export function MarketingDetail({ activity, requestedTab }: { activity: MarketingActivity; requestedTab?: string }) {
  const { state } = useMarketing(), { state: sales, currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction(), now = useClock();
  const [editing, setEditing] = useState(false), [configuration, setConfiguration] = useState<"booking" | "lottery" | null>(null);
  const [newPrize, setNewPrize] = useState<ActivityPrize | null>(null);
  const [sessions, setSessions] = useState(false);
  useEffect(() => { setSessions(false); setEditing(false); setConfiguration(null); setNewPrize(null); }, [activity.id, currentUser.id]);
  const illustrationAt = useMemo(() => Date.now(), [activity.id]);
  const illustrations = useMemo(() => createMarketingRecordIllustrations(activity, illustrationAt), [activity, illustrationAt]);
  const recordState = useMemo(() => withMarketingRecordIllustrations(state, illustrations), [state, illustrations]);
  const code = activityCodes(state).get(activity.id), tab = activityDetailTab(requestedTab);
  const creator = activity.createdBy ? sales.users.find(user => user.id === activity.createdBy)?.name || "历史人员待核对" : "未记录";
  const go = (key: string) => navigate(`marketing/activity/${activity.id}/${key}`);
  const coreInfo: Array<[string, ReactNode]> = [
    ["活动名称", activity.name], ["活动编号", code], ["所属品牌", brandLabels[activity.brand]],
    ["创建人", creator], ["创建时间", displayDate(activity.createdAt)],
    ["活动类型", activity.mode === "OFFLINE" ? "线下活动" : "线上活动"],
    ["场地", activity.mode === "OFFLINE" ? activity.location || "—" : "—"],
    ["活动时间", displayDateRange(activity.startAt, activity.endAt).compact],
    ["参与方式", activity.bookingEnabled ? "预约参与" : "直接参与"],
    ["启用抽奖", activity.lotteryEnabled ? "是" : "否"],
  ];
  return <><div className="marketing-detail"><DetailWorkspace eyebrow="营销活动" title={activity.name} backRoute="marketing"
    tags={<>
      <LifecycleTag activity={activity} now={now} />
      <Tag size="small">{brandLabels[activity.brand]}</Tag>
      <Tag size="small">{activity.mode === "OFFLINE" ? "线下活动" : "线上活动"}</Tag>
      <Tag size="small">{activity.bookingEnabled ? "预约参与" : "直接参与"}</Tag>
      <Tag size="small">创建人：{creator}</Tag>
      {activity.mode === "OFFLINE" && <Tag size="small">地点：{activity.location || "未设置"}</Tag>}
      <span className="marketing-record-metadata"><span>{code}</span><span>{displayDateRange(activity.startAt, activity.endAt).compact}</span></span>
    </>}
    actions={<Dropdown trigger="click" position="bottomRight" menu={[
      { node: "item", name: "创建奖品", disabled: !access.manage, onClick: () => setNewPrize({ ...createActivityPrize(activity.id, Date.now()), fulfillmentMode: "DIRECT" }) },
      { node: "item", name: "编辑活动信息", disabled: !access.manage, onClick: () => setEditing(true) },
      { node: "item", name: "编辑预约设置", disabled: !access.manage, onClick: () => setConfiguration("booking") },
      { node: "item", name: "管理场次", disabled: !access.manage, onClick: () => setSessions(true) },
      { node: "item", name: "抽奖设置", disabled: !access.manage, onClick: () => setConfiguration("lottery") },
      { node: "divider" }, ...activityMenu(activity, access.manage, now, run),
    ]}><Button size="small" theme="solid" icon={<IconChevronDown />} iconPosition="right" aria-label="活动管理">活动管理</Button></Dropdown>}
    sidebar={<>
      <SideSection title="活动信息">
        <DataList rows={coreInfo} />
        <div className="marketing-rail-rule"><h3>活动规则</h3><ActivityRuleContent activity={activity} /></div>
      </SideSection>
      {activity.bookingEnabled && <SideSection title="预约设置">
        <DataList rows={[
          ["预约开放", displayDate(activity.bookingStart)], ["预约截止", displayDate(activity.bookingEnd)],
          ["完成条件", activity.completion === "CHECKIN" ? "签到即完成" : "工作人员确认完成"],
          ["允许取消", activity.allowCancel ? "截止前且未签到" : "不允许"], ["允许改约", activity.allowReschedule ? "允许" : "不允许"],
          ["现场报名", activity.allowWalkIn ? "允许" : "不允许"], ["活动场次", String(activity.slots.length)],
        ]} />
      </SideSection>}
      {activity.lotteryEnabled && <SideSection title="抽奖设置">
        <DataList rows={[
          ["抽奖时间", displayDateRange(activity.lotteryStart, activity.lotteryEnd).compact],
          ["完成后发放次数", String(activity.grantCount)], ["累计抽奖上限", String(activity.drawLimit)],
          ["每日上限", activity.dailyLimit === null ? "不限制" : String(activity.dailyLimit)],
          ["累计中奖上限", String(activity.winLimit)], ["未中奖概率", `${activity.noWinProbability}%`],
        ]} />
      </SideSection>}
    </>}
    tabs={<>{feedback}<Tabs type="line" className="record-tabs" activeKey={tab} onChange={go}>
      <TabPane itemKey="bookings" tab="活动预约记录">
        <section className="marketing-record-content"><ActivityBookingData key={`${activity.id}:${currentUser.id}`} activity={activity} now={now} dataState={recordState} /></section>
      </TabPane>
      <TabPane itemKey="prizes" tab="奖品设置">
        {!activity.lotteryEnabled && <Banner type="info" title="此活动未启用抽奖" closeIcon={null} />}
        <PrizeSettings key={`${activity.id}:${currentUser.id}`} activity={activity} />
      </TabPane>
      <TabPane itemKey="draws" tab="抽奖记录">
        <section className="marketing-record-content">
          {!activity.lotteryEnabled && <Banner type="info" title="此活动未启用抽奖" closeIcon={null} />}
          <DrawData key={`${activity.id}:${currentUser.id}`} activity={activity} now={now} dataState={recordState} />
        </section>
      </TabPane>
    </Tabs></>}
  /></div>
    {editing && <ActivityEditor initial={structuredClone(activity)} onClose={() => setEditing(false)} />}
    {configuration && <ActivityConfigurationEditor key={configuration} initial={structuredClone(activity)} section={configuration} onClose={() => setConfiguration(null)} />}
    {newPrize && <FormSideSheet visible className="marketing-prize-editor" title="创建奖品" width={720} okText="创建奖品" cancelText="取消" okButtonProps={{ disabled: !access.manage }} onCancel={() => setNewPrize(null)} onOk={() => { if (!access.manage) return; if (run({ type: "SAVE_ACTIVITY_PRIZE", activityId: activity.id, prize: newPrize }).ok) { setNewPrize(null); go("prizes"); } }}>{feedback}<PrizeFields prize={newPrize} onChange={setNewPrize} /></FormSideSheet>}
    <SideSheet visible={sessions} closeOnEsc title="活动场次" width={Math.min(720, window.innerWidth)} onCancel={() => setSessions(false)}>
      {sessions && <ActivitySessions activity={activity} />}
    </SideSheet>
  </>;
}
