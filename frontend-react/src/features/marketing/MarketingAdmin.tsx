import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IconChevronDown, IconMore, IconPlus, IconSearch } from "@douyinfe/semi-icons";
import { Banner, Button, Input, Modal, Select, SideSheet, Table, Tabs, TabPane, Tag, Typography } from "@douyinfe/semi-ui";
import { FormSideSheet, DataList, DetailWorkspace, EmptyBlock, PageHeader, SideSection } from "@/components/CrmUi";
import { useCrm } from "@/stores/crm-store";
import { brandLabels } from "@/stores/member-operations-store";
import { useMarketing } from "@/stores/marketing-store";
import { createActivityPrize, createMarketingActivity, createMarketingSlot } from "@/mock/marketing-demo-data";
import { PickupScheduleSection } from "./MarketingPickup";
import { pickupScheduleForPrize } from "./marketing-pickup";
import type { ActivityPrize, MarketingActivity, MarketingSlot, MarketingState } from "@/types/marketing";
import { parseCreatedAt } from "@/features/dashboard/dashboard-model";
import { navigate } from "@/utils/format";
import { activityCreationIssue, activityPrizeAllocation, codeInventory, fulfillmentCapacity, hasActivityBusinessData, marketingPermissions, needsReservation, prizeDefaultProbability, prizeQuantityMode, prizeTypeLabels, quota, sessionPrizeReadiness, slotOccupancy, winnable } from "./marketing-model";
import { activityCodes, activityLifecycle, lifecycleLabels } from "./marketing-activity-code";
import { ActivityEditor, ActivityConfigurationEditor, CodeImporter, PrizeFields } from "./MarketingEditor";
import { ActivityRuleContent } from "./MarketingRuleEditor";
import { CodeManager } from "./MarketingCodes";
import { ActivityBookingData, DrawData } from "./MarketingRecords";
import { activityDetailTab } from "./marketing-records";
import { DateRange, DefinitionGrid, displayDate, displayDateRange, MarketingMenu, NumberField, options, Panel, prizeReceivingLabel, SlotFields, useAction } from "./MarketingUi";
import { marketingSessionLifecycle, marketingSessionLifecycleLabels, SessionPrizeDrawer, sessionPrizeSummary } from "./MarketingSessionPrizes";

function useClock() { const [now, setNow] = useState(Date.now); useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []); return now; }
function activityMenu(state: MarketingState, activity: MarketingActivity, manage: boolean, now: number, run: ReturnType<typeof useAction>["run"], onConfigureSessions?: () => void) {
  const lifecycle = activityLifecycle(activity, now), start = parseCreatedAt(activity.startAt);
  const startActivity = () => {
    const sessionIssues = sessionPrizeReadiness(state, activity, now);
    if (sessionIssues.length && onConfigureSessions) {
      Modal.confirm({ title: `还有${sessionIssues.length}个活动场次尚未完成奖品配置`, content: <div>{sessionIssues.map((issue) => <p key={issue.sessionId}>{issue.label}：{issue.errors.join("；")}</p>)}</div>, okText: "去配置", cancelText: "取消", onOk: onConfigureSessions });
      return;
    }
    run({ type: "STATUS", activityId: activity.id, status: "PUBLISHED" });
  };
  return [
    { node: "item" as const, name: "开始", disabled: !manage || lifecycle === "ENDED" || !Number.isFinite(start) || now < start || activity.status === "PUBLISHED" && lifecycle === "ONGOING", onClick: startActivity },
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
      { title: "操作", width: 120, fixed: "right", render: (_: unknown, row: MarketingActivity) => <div className="row-actions"><Button theme="borderless" size="small" disabled={!access.manage} onClick={() => setEditing(structuredClone(row))}>编辑</Button><MarketingMenu menu={activityMenu(state, row, access.manage, now, run, () => navigate(`marketing/activity/${row.id}/prizes`))}><Button theme="borderless" size="small" icon={<IconMore />} aria-label="更多" /></MarketingMenu></div> },
    ]} />
    </section>
    {editing && <ActivityEditor key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
  </>;
}

function ActivitySessions({ activity, onClose }: { activity: MarketingActivity; onClose: () => void }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction();
  const [slot, setSlot] = useState<MarketingSlot | null>(null), [prizeSession, setPrizeSession] = useState<MarketingSlot | null>(null); const now = useClock();
  return <><SideSheet visible={!slot && !prizeSession} closeOnEsc title="活动场次" width={Math.min(820, window.innerWidth - 24)} onCancel={onClose}>{feedback}<Panel actions={<Button size="small" icon={<IconPlus />} disabled={!access.manage} onClick={() => setSlot({ ...createMarketingSlot(crypto.randomUUID(), activity.startAt, 10, Date.parse(activity.startAt) - 30 * 60_000), location: activity.location })}>添加场次</Button>}>
      <Table rowKey="id" dataSource={activity.slots} pagination={false} scroll={{ x: 760 }} empty={<EmptyBlock title="暂无活动场次" description="添加场次后，用户可选择时间预约。" />} columns={[
        { title: "日期 / 时间", width: 160, render: (_: unknown, row: MarketingSlot) => <DateRange start={row.startAt} end={row.endAt} /> },
        { title: "场地", dataIndex: "location", width: 110 },
        { title: "预约 / 容量", width: 100, render: (_: unknown, row: MarketingSlot) => `${slotOccupancy(state, activity.id, "ACTIVITY", row.id)} / ${row.capacity}` },
        ...(activity.lotteryEnabled ? [{ title: "奖品配置", width: 160, render: (_: unknown, row: MarketingSlot) => <Button theme="borderless" size="small" onClick={() => setPrizeSession(row)}>{sessionPrizeSummary(state, activity, row.id)}</Button> }] : []),
        { title: "状态", width: 100, render: (_: unknown, row: MarketingSlot) => { const lifecycle = marketingSessionLifecycle(activity, row, now); return <Tag size="small" color={lifecycle === "ONGOING" ? "green" : "grey"}>{marketingSessionLifecycleLabels[lifecycle]}</Tag>; } },
        { title: "操作", width: 130, fixed: "right", render: (_: unknown, row: MarketingSlot) => <div className="row-actions"><Button theme="borderless" size="small" disabled={!access.manage} onClick={() => setSlot(structuredClone(row))}>编辑</Button><MarketingMenu menu={[
          ...(activity.lotteryEnabled ? [{ node: "item" as const, name: "管理奖品", onClick: () => setPrizeSession(row) }] : []),
          { node: "item" as const, name: "删除场次", type: "danger" as const, disabled: !access.manage || state.bookings.some(booking => booking.activityId === activity.id && booking.kind === "ACTIVITY" && booking.slotId === row.id), onClick: () => run({ type: "DELETE_ACTIVITY_SLOT", activityId: activity.id, slotId: row.id }) },
        ]}><Button theme="borderless" size="small" icon={<IconMore />} aria-label={`更多操作 · ${row.label}`} /></MarketingMenu></div> },
      ]} />
    </Panel></SideSheet>
    {slot && <FormSideSheet visible className="marketing-prize-editor" title="活动场次" width={640} okText="保存" cancelText="取消" onCancel={() => setSlot(null)} onOk={() => { if (run({ type: "SAVE_ACTIVITY_SLOT", activityId: activity.id, slot }).ok) setSlot(null); }}>{feedback}<SlotFields slot={slot} onChange={setSlot} /></FormSideSheet>}
    {prizeSession && <SessionPrizeDrawer activity={activity} session={prizeSession} onClose={() => setPrizeSession(null)} />}
  </>;
}

function PrizeSettings({ activity, onManageSessions, onCreate }: { activity: MarketingActivity; onManageSessions: () => void; onCreate: () => void }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction(); const now = useClock();
  const [editing, setEditing] = useState<ActivityPrize | null>(null), [importId, setImportId] = useState(""), [codesId, setCodesId] = useState(""), [extra, setExtra] = useState({ itemId: "", count: 1 }), [scheduleId, setScheduleId] = useState("");
  const rulesLocked = Boolean(activity.publishedAt || hasActivityBusinessData(state, activity.id));
  const codePrize = activity.pool.find((item) => item.id === codesId);
  return <>{feedback}
    <Panel title="奖品" note="未单独配置的场次使用活动默认概率及未分配库存；已单独配置的场次只使用本场奖池。" actions={<Button size="small" icon={<IconPlus />} disabled={!access.manage} onClick={onCreate}>创建奖品</Button>}>
      <Table rowKey="id" dataSource={activity.pool} pagination={{ pageSize: 10 }} scroll={{ x: 990 }} empty={<EmptyBlock title="暂无奖品" description="添加奖品后，可分别配置领取方式、可发放数量和中奖概率。" />} columns={[
        { title: "奖品", width: 160, render: (_: unknown, item: ActivityPrize) => <div className="marketing-summary-cell"><strong>{item.name}</strong><span>{item.label}</span></div> },
        { title: "类型 / 领取方式", width: 130, render: (_: unknown, item: ActivityPrize) => <div className="marketing-summary-cell"><span>{prizeTypeLabels[item.prizeType]}</span><small>{prizeReceivingLabel(item)}</small></div> },
        { title: "数量", width: 155, render: (_: unknown, item: ActivityPrize) => {
          if (prizeQuantityMode(item) === "UNLIMITED") return <div className="marketing-summary-cell"><span>不限量</span>{item.method === "REDEMPTION_CODE" && <small>可用码 {codeInventory(item).remaining}</small>}</div>;
          const allocation = activityPrizeAllocation(state, activity, item, now);
          return <div className="marketing-summary-cell"><span>限量 {allocation.quantityLimit}</span><small>已中奖 {allocation.won}</small><small>{activity.bookingEnabled ? `可分配 ${allocation.unallocated}` : `剩余 ${allocation.remaining}`}</small></div>;
        } },
        { title: "概率 / 场次配置", width: 165, render: (_: unknown, item: ActivityPrize) => {
          if (!activity.bookingEnabled) return <div className="marketing-summary-cell"><span>中奖概率 {prizeDefaultProbability(item)}%</span></div>;
          const slots = activity.slots.filter((slot) => !slot.disabled && !slot.deleted);
          const configured = slots.filter((slot) => (activity.sessionPrizes ?? []).some((row) => row.sessionId === slot.id && row.prizeId === item.id && row.enabled)).length;
          const inherited = slots.filter(slot => !(activity.sessionPrizes ?? []).some(row => row.sessionId === slot.id)).length;
          return <div className="marketing-summary-cell"><span>活动默认 {prizeDefaultProbability(item)}%</span><Button theme="borderless" size="small" onClick={onManageSessions}>{inherited} 场继承 · {configured} 场单独启用</Button></div>;
        } },
        { title: "兑奖预约设置 / 有效期", width: 210, render: (_: unknown, item: ActivityPrize) => {
          const schedule = pickupScheduleForPrize(activity, item);
          return <div className="marketing-summary-cell">{needsReservation(item) && (schedule ? <Button theme="borderless" size="small" onClick={() => setScheduleId(schedule.id)}>{schedule.name}</Button> : <span>兑奖预约设置待配置</span>)}<DateRange start={item.claimStart} end={item.claimEnd} /></div>;
        } },
        { title: "操作", width: 130, fixed: "right", render: (_: unknown, item: ActivityPrize) => <div className="row-actions"><Button theme="borderless" size="small" disabled={!access.manage} onClick={() => setEditing(structuredClone(item))}>编辑</Button><MarketingMenu menu={[
          ...(item.method === "REDEMPTION_CODE" ? [{ node: "item" as const, name: "导入兑换码", disabled: !access.manage, onClick: () => setImportId(item.id) }, { node: "item" as const, name: "查看兑换码", disabled: !access.manage, onClick: () => setCodesId(item.id) }] : []),
          ...(rulesLocked && prizeQuantityMode(item) === "LIMITED" ? [{ node: "item" as const, name: "增加可发放数量", disabled: !access.manage, onClick: () => setExtra({ itemId: item.id, count: 1 }) }] : []),
          ...(needsReservation(item) && pickupScheduleForPrize(activity, item) ? [{ node: "item" as const, name: "管理兑奖预约设置", onClick: () => setScheduleId(pickupScheduleForPrize(activity, item)!.id) }] : []),
          ...(!rulesLocked ? [{ node: "item" as const, name: "删除奖品", type: "danger" as const, disabled: !access.manage, onClick: () => run({ type: "DELETE_ACTIVITY_PRIZE", activityId: activity.id, poolItemId: item.id }) }] : []),
        ]}><Button theme="borderless" size="small" icon={<IconMore />} aria-label={`更多奖品操作 · ${item.name}`} /></MarketingMenu></div> },
      ]} />
    </Panel>
    {editing && <FormSideSheet visible className="marketing-prize-editor" title="编辑奖品" width={720} okText="保存" cancelText="取消" okButtonProps={{ disabled: !access.manage }} onCancel={() => setEditing(null)} onOk={() => { if (!access.manage) return; if (run({ type: "SAVE_ACTIVITY_PRIZE", activityId: activity.id, prize: editing }).ok) setEditing(null); }}>{feedback}
      <DefinitionGrid rows={[
      ["可继续中奖", winnable(state, activity.id, editing, now)], ["已领取 / 发放", quota(state, activity.id, editing).issued],
      ...(needsReservation(editing) ? [["待预约权益", fulfillmentCapacity(state, activity.id, editing, now).unreservedPromises], ["预约名额缺口", fulfillmentCapacity(state, activity.id, editing, now).shortfall]] as Array<[string, ReactNode]> : []),
      ...(editing.method === "REDEMPTION_CODE" ? [["兑换码：导入 / 分配 / 剩余", `${codeInventory(editing).imported} / ${codeInventory(editing).assigned} / ${codeInventory(editing).remaining}`]] as Array<[string, ReactNode]> : []),
      ]} /><PrizeFields prize={editing} onChange={setEditing} quantityLocked={rulesLocked} locked={state.awards.some(row => row.activityId === activity.id && row.poolItemId === editing.id)} /></FormSideSheet>}
    {importId && <FormSideSheet visible title="导入当前奖品兑换码" width={650} footer={<Button onClick={() => setImportId("")}>完成</Button>} onCancel={() => setImportId("")}>
      {feedback}<CodeImporter onImport={(codes) => run({ type: "IMPORT_CODES", activityId: activity.id, poolItemId: importId, codes }).codeImport} />
    </FormSideSheet>}
    {codePrize && access.manage && <CodeManager prize={codePrize} published={Boolean(rulesLocked)} remainingQuota={quota(state, activity.id, codePrize).available} canManage={access.manage} onClose={() => setCodesId("")} onDelete={(codes) => run({ type: "DELETE_CODES", activityId: activity.id, poolItemId: codePrize.id, codes })} />}
    <Modal visible={Boolean(extra.itemId)} maskClosable={false} width={520} title="增加活动奖品可发放数量" onCancel={() => setExtra({ itemId: "", count: 1 })} onOk={() => { if (run({ type: "ADD_QUOTA", activityId: activity.id, poolItemId: extra.itemId, count: extra.count }).ok) setExtra({ itemId: "", count: 1 }); }}>{feedback}<NumberField label="增加数量" value={extra.count} onChange={(count) => setExtra({ ...extra, count })} /></Modal>
    <PickupScheduleSection activity={activity} openId={scheduleId} onOpen={setScheduleId} onClose={() => setScheduleId("")} />
  </>;
}

export function MarketingDetail({ activity, requestedTab, requestedSecondaryTab }: { activity: MarketingActivity; requestedTab?: string; requestedSecondaryTab?: string }) {
  const { state } = useMarketing(), { state: sales, currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction(), now = useClock();
  const [editing, setEditing] = useState(false), [configuration, setConfiguration] = useState<"booking" | "lottery" | null>(null), [newPrize, setNewPrize] = useState<ActivityPrize | null>(null), [sessions, setSessions] = useState(false);
  useEffect(() => { setEditing(false); setConfiguration(null); setNewPrize(null); setSessions(false); }, [activity.id, currentUser.id]);
  const code = activityCodes(state).get(activity.id), tab = activityDetailTab(requestedTab, requestedSecondaryTab);
  const creator = activity.createdBy ? sales.users.find(user => user.id === activity.createdBy)?.name || "历史人员待核对" : "未记录";
  const go = (key: string) => navigate(`marketing/activity/${activity.id}/${key}`);
  const coreInfo: Array<[string, ReactNode]> = [
    ["活动名称", activity.name], ["活动编号", <Typography.Text ellipsis={{ showTooltip: true }} copyable>{code}</Typography.Text>], ["所属品牌", brandLabels[activity.brand]],
    ["创建人", creator], ["创建时间", displayDate(activity.createdAt)],
    ["活动类型", activity.mode === "OFFLINE" ? "线下活动" : "线上活动"],
    ["场地", activity.mode === "OFFLINE" ? activity.location || "—" : "—"],
    ["活动时间", displayDateRange(activity.startAt, activity.endAt).compact],
    ["参与方式", activity.bookingEnabled ? "预约参与" : "直接参与"],
    ["启用抽奖", activity.lotteryEnabled ? "是" : "否"],
  ];
  return <><div className="marketing-detail"><DetailWorkspace eyebrow="营销活动" title={activity.name} backRoute="marketing"
    tags={<>
      <LifecycleTag activity={activity} now={now} /><Tag size="small">{brandLabels[activity.brand]}</Tag><Tag size="small">{activity.mode === "OFFLINE" ? "线下活动" : "线上活动"}</Tag>
      <Tag size="small">{activity.bookingEnabled ? "预约参与" : "直接参与"}</Tag><Tag size="small">创建人：{creator}</Tag>{activity.mode === "OFFLINE" && <Tag size="small">地点：{activity.location || "未设置"}</Tag>}
      <span className="marketing-record-metadata"><span>{code}</span><span>{displayDateRange(activity.startAt, activity.endAt).compact}</span></span>
    </>}
    actions={<MarketingMenu menu={[
      ...activityMenu(state, activity, access.manage, now, run, () => setSessions(true)),
    ]}><Button size="small" icon={<IconChevronDown />} iconPosition="right" aria-label="活动状态操作">活动状态操作</Button></MarketingMenu>}
    sidebar={<>
      <SideSection title="活动信息" onEdit={() => setEditing(true)} editDisabled={!access.manage}><DataList rows={coreInfo} /><div className="marketing-rail-rule"><h3>活动规则</h3><ActivityRuleContent activity={activity} /></div></SideSection>
      {activity.bookingEnabled && <SideSection title="活动预约设置" onEdit={() => setConfiguration("booking")} editDisabled={!access.manage}><DataList rows={[
        ["预约开放", displayDate(activity.bookingStart)], ["预约截止", displayDate(activity.bookingEnd)],
        ["完成条件", activity.completion === "CHECKIN" ? "签到即完成" : "工作人员确认完成"],
        ["允许取消", activity.allowCancel ? "截止前且未签到" : "不允许"], ["允许改约", activity.allowReschedule ? "允许" : "不允许"],
        ["现场报名", activity.allowWalkIn ? "允许" : "不允许"], ["活动场次", String(activity.slots.length)],
      ]} /><div className="marketing-rail-rule"><Button size="small" theme="borderless" onClick={() => setSessions(true)}>管理活动场次</Button></div></SideSection>}
      {activity.lotteryEnabled && <SideSection title="抽奖设置" onEdit={() => setConfiguration("lottery")} editDisabled={!access.manage}><DataList rows={[
        ["抽奖时间", displayDateRange(activity.lotteryStart, activity.lotteryEnd).compact],
        ["完成后发放次数", String(activity.grantCount)], ["累计抽奖上限", String(activity.drawLimit)],
        ["每日上限", activity.dailyLimit === null ? "不限制" : String(activity.dailyLimit)], ["累计中奖上限", String(activity.winLimit)],
        [activity.bookingEnabled ? "活动默认概率合计" : "中奖概率合计", `${activity.pool.reduce((sum, item) => sum + prizeDefaultProbability(item), 0)}%`],
        [activity.bookingEnabled ? "活动默认未中奖概率" : "未中奖概率", `${Math.max(0, 100 - activity.pool.reduce((sum, item) => sum + prizeDefaultProbability(item), 0))}%（系统计算）`],
      ]} /></SideSection>}
    </>}
    tabs={<>{feedback}<Tabs type="line" className="record-tabs" activeKey={tab} onChange={go}>
      <TabPane itemKey="bookings" tab="活动预约记录"><section className="marketing-record-content"><ActivityBookingData key={`${activity.id}:${currentUser.id}`} activity={activity} now={now} dataState={state} /></section></TabPane>
      <TabPane itemKey="prizes" tab="奖品设置">{!activity.lotteryEnabled && <Banner type="info" title="此活动未启用抽奖" closeIcon={null} />}<PrizeSettings key={`${activity.id}:${currentUser.id}`} activity={activity} onManageSessions={() => setSessions(true)} onCreate={() => setNewPrize({ ...createActivityPrize(activity.id, Date.now()), fulfillmentMode: "DIRECT" })} /></TabPane>
      <TabPane itemKey="draws" tab="抽奖记录"><section className="marketing-record-content">{!activity.lotteryEnabled && <Banner type="info" title="此活动未启用抽奖" closeIcon={null} />}<DrawData key={`${activity.id}:${currentUser.id}`} activity={activity} now={now} dataState={state} /></section></TabPane>
    </Tabs></>}
  /></div>
    {editing && <ActivityEditor initial={structuredClone(activity)} onClose={() => setEditing(false)} />}
    {configuration && <ActivityConfigurationEditor key={configuration} initial={structuredClone(activity)} section={configuration} onClose={() => setConfiguration(null)} />}
    {newPrize && <FormSideSheet visible className="marketing-prize-editor" title="创建奖品" width={720} okText="创建奖品" cancelText="取消" okButtonProps={{ disabled: !access.manage }} onCancel={() => setNewPrize(null)} onOk={() => { if (!access.manage) return; if (run({ type: "SAVE_ACTIVITY_PRIZE", activityId: activity.id, prize: newPrize }).ok) { setNewPrize(null); go("prizes"); } }}>{feedback}<PrizeFields prize={newPrize} onChange={setNewPrize} /></FormSideSheet>}
    {sessions && <ActivitySessions activity={activity} onClose={() => setSessions(false)} />}
  </>;
}
