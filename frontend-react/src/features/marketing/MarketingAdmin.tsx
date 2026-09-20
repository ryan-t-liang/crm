import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IconCalendar, IconChevronDown, IconMapPin, IconMore, IconPlus, IconSearch, IconUser } from "@douyinfe/semi-icons";
import { Banner, Button, Input, Modal, Select, SideSheet, Table, Tabs, TabPane, Tag, Typography } from "@douyinfe/semi-ui";
import { FormSideSheet, DataList, DetailWorkspace, EmptyBlock, PageHeader, SideSection } from "@/components/CrmUi";
import { useCrm } from "@/stores/crm-store";
import { brandLabels } from "@/stores/member-operations-store";
import { useMarketing } from "@/stores/marketing-store";
import { createActivityPrize, createMarketingActivity, createMarketingSlot } from "@/mock/marketing-demo-data";
import { PickupScheduleSection } from "./MarketingPickup";
import { pickupScheduleForPrize, pickupSchedules } from "./marketing-pickup";
import type { ActivityPrize, MarketingActivity, MarketingPickupSchedule, MarketingSlot, MarketingState } from "@/types/marketing";
import { parseCreatedAt } from "@/features/dashboard/dashboard-model";
import { navigate } from "@/utils/format";
import { activityCreationIssue, activityPrizeAllocation, codeInventory, fulfillmentCapacity, hasActivityBusinessData, lotteryScope, marketingPermissions, needsReservation, prizeDefaultProbability, prizeQuantityMode, prizeTypeLabels, quota, sessionPrizeReadiness, winnable } from "./marketing-model";
import { activityCodes, activityLifecycle, lifecycleLabels } from "./marketing-activity-code";
import { ActivityEditor, ActivityConfigurationEditor, CodeImporter, PrizeFields } from "./MarketingEditor";
import { ActivityRuleContent } from "./MarketingRuleEditor";
import { CodeManager } from "./MarketingCodes";
import { ActivityBookingData, DrawData, ParticipantTaskData } from "./MarketingRecords";
import { activityDetailTab } from "./marketing-records";
import { DateRange, DefinitionGrid, displayDate, displayDateRange, MarketingMenu, NumberField, options, Panel, prizeReceivingLabel, TextField, useAction } from "./MarketingUi";
import { marketingSessionLifecycle, marketingSessionLifecycleLabels, SessionPrizeDrawer, sessionPrizeSummary } from "./MarketingSessionPrizes";
import { COACH_EVENT_LOCATION, isCoachPrototype, prototypeBrandLabel, prototypeLocationLabel, prototypeMarketingCopy } from "@/utils/prototype-variant";

function useClock() { const [now, setNow] = useState(Date.now); useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []); return now; }
function displayActivityLifecycle(activity: MarketingActivity, now: number) {
  return isCoachPrototype() ? activity.status === "CANCELED" ? "ENDED" as const : "ONGOING" as const : activityLifecycle(activity, now);
}
function activityMenu(state: MarketingState, activity: MarketingActivity, manage: boolean, now: number, run: ReturnType<typeof useAction>["run"], onConfigureSessions?: () => void) {
  const lifecycle = displayActivityLifecycle(activity, now), start = parseCreatedAt(activity.startAt);
  if (isCoachPrototype()) {
    if (lifecycle === "ENDED") return [{ node: "item" as const, name: "开始", disabled: !manage, onClick: () => run({ type: "STATUS", activityId: activity.id, status: "PUBLISHED", allowRestart: true }) }];
    return [{ node: "item" as const, name: "结束", type: "danger" as const, disabled: !manage, onClick: () => Modal.confirm({ title: "结束活动？", content: "结束后将停止新的活动参与；如需继续，可再次开始活动。", onOk: () => { run({ type: "STATUS", activityId: activity.id, status: "CANCELED" }); } }) }];
  }
  const startActivity = () => {
    const sessionIssues = sessionPrizeReadiness(state, activity, now);
    if (sessionIssues.length && onConfigureSessions) {
      Modal.confirm({ title: `还有${sessionIssues.length}个活动场次尚未完成奖品配置`, content: <div>{sessionIssues.map((issue) => <p key={issue.sessionId}>{issue.label}：{issue.errors.join("；")}</p>)}</div>, okText: "去配置", cancelText: "取消", onOk: onConfigureSessions });
      return;
    }
    run({ type: "STATUS", activityId: activity.id, status: "PUBLISHED" });
  };
  return [
    { node: "item" as const, name: activity.status === "DRAFT" ? "发布活动" : "恢复活动", disabled: !manage || lifecycle === "ENDED" || !Number.isFinite(start) || activity.status === "PUBLISHED", onClick: startActivity },
    { node: "item" as const, name: "暂停", disabled: !manage || lifecycle !== "ONGOING" || activity.status !== "PUBLISHED", onClick: () => run({ type: "STATUS", activityId: activity.id, status: "PAUSED" }) },
    { node: "item" as const, name: "结束", type: "danger" as const, disabled: !manage || lifecycle === "ENDED", onClick: () => Modal.confirm({ title: "结束活动？", content: "停止新参与并取消未到场的活动预约；已有记录、中奖权益和奖品预约保留。", onOk: () => { run({ type: "STATUS", activityId: activity.id, status: "CANCELED" }); } }) },
  ];
}
function LifecycleTag({ activity, now }: { activity: MarketingActivity; now: number }) {
  const lifecycle = displayActivityLifecycle(activity, now);
  return <Tag size="small" color={lifecycle === "ONGOING" ? "green" : "grey"}>{lifecycleLabels[lifecycle]}</Tag>;
}

export function MarketingList({ migratedEntry }: { migratedEntry?: string }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction(), now = useClock();
  const codes = useMemo(() => activityCodes(state), [state]);
  const coachMode = isCoachPrototype();
  const activityIds = useMemo(() => new Map(state.activities.map((row, index) => [row.id, index + 1])), [state.activities]);
  const [filters, setFilters] = useState({ search: "", brand: "ALL", mode: "ALL", status: "ALL", participation: "ALL" }), [editing, setEditing] = useState<MarketingActivity | null>(null);
  const keyword = filters.search.trim().toLowerCase();
  const rows = state.activities.filter(row => access.brands.includes(row.brand))
    .filter(row => (row.name.toLowerCase().includes(keyword) || String(coachMode ? activityIds.get(row.id) : codes.get(row.id)).toLowerCase().includes(keyword)) &&
      (filters.brand === "ALL" || row.brand === filters.brand) && (filters.mode === "ALL" || row.mode === filters.mode) &&
      (filters.status === "ALL" || displayActivityLifecycle(row, now) === filters.status) &&
      (filters.participation === "ALL" || (row.bookingEnabled ? "RESERVATION" : "DIRECT") === filters.participation));
  const update = (key: keyof typeof filters, value: string) => setFilters(old => ({ ...old, [key]: value }));
  const creationIssue = activityCreationIssue(access);
  return <>
    <PageHeader title="营销活动" description="管理品牌活动。" actions={<Button theme="solid" disabled={Boolean(creationIssue)} onClick={() => setEditing({ ...createMarketingActivity(access.brands[0], Date.now()), name: "", ...(coachMode ? { location: COACH_EVENT_LOCATION } : {}) })} icon={<IconPlus />}>新建活动</Button>} />
    {feedback}{migratedEntry && <Banner type="info" title="请选择活动查看相关记录" closeIcon={null} />}{creationIssue && <Banner type="warning" title={creationIssue} closeIcon={null} />}
    <section className="data-surface">
    <div className="table-toolbar">
      <Input prefix={<IconSearch />} aria-label="搜索活动" placeholder={coachMode ? "活动名称或ID" : "活动名称或编号"} value={filters.search} onChange={value => update("search", value)} showClear />
      <Select aria-label="活动类型" value={filters.mode} optionList={options({ ALL: "全部类型", ONLINE: "线上活动", OFFLINE: "线下活动" })} onChange={value => update("mode", String(value))} />
      <Select aria-label="活动状态" value={filters.status} optionList={options(coachMode ? { ALL: "全部状态", ONGOING: lifecycleLabels.ONGOING, ENDED: lifecycleLabels.ENDED } : { ALL: "全部状态", ...lifecycleLabels })} onChange={value => update("status", String(value))} />
      <Select aria-label="参与方式" value={filters.participation} optionList={options({ ALL: "全部方式", RESERVATION: "预约参与", DIRECT: "直接参与" })} onChange={value => update("participation", String(value))} />
      {!coachMode && access.brands.length > 1 && <Select aria-label="所属品牌" value={filters.brand} optionList={[{ value: "ALL", label: "全部授权品牌" }, ...access.brands.map(brand => ({ value: brand, label: prototypeBrandLabel(brandLabels[brand]) }))]} onChange={value => update("brand", String(value))} />}
    </div>
    <Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: coachMode ? 1580 : 1260 }} empty={<EmptyBlock title="暂无匹配活动" description="调整筛选，或创建活动。" />} columns={[
      { title: coachMode ? "活动ID" : "活动编号", width: coachMode ? 90 : 190, render: (_: unknown, row: MarketingActivity) => <span className="marketing-activity-code">{coachMode ? activityIds.get(row.id) : codes.get(row.id)}</span> },
      { title: "活动名称", width: 230, render: (_: unknown, row: MarketingActivity) => <a className="marketing-activity-name" href={`#marketing/activity/${row.id}`}>{prototypeMarketingCopy(row.name)}</a> },
      { title: "活动类型", width: 110, render: (_: unknown, row: MarketingActivity) => row.mode === "ONLINE" ? "线上活动" : "线下活动" },
      { title: "场地", width: 220, render: (_: unknown, row: MarketingActivity) => row.mode === "OFFLINE" ? prototypeLocationLabel(row.location) : "—" },
      { title: "活动时间", width: 210, render: (_: unknown, row: MarketingActivity) => <DateRange start={row.startAt} end={row.endAt} /> },
      { title: "状态", width: 100, render: (_: unknown, row: MarketingActivity) => <LifecycleTag activity={row} now={now} /> },
      { title: "参与方式", width: 120, render: (_: unknown, row: MarketingActivity) => row.bookingEnabled ? "预约参与" : "直接参与" },
      { title: "操作", width: coachMode ? 360 : 120, fixed: "right", render: (_: unknown, row: MarketingActivity) => <div className="row-actions">
        {coachMode && <Button theme="borderless" size="small" onClick={() => navigate(`marketing/activity/${row.id}`)}>查看</Button>}
        <Button theme="borderless" size="small" disabled={!access.manage} onClick={() => setEditing(structuredClone(row))}>编辑</Button>
        {coachMode ? activityMenu(state, row, access.manage, now, run, () => navigate(`marketing/activity/${row.id}/prizes`)).map((action) => <Button key={action.name} theme="borderless" type={action.type === "danger" ? "danger" : "primary"} size="small" disabled={action.disabled} onClick={action.onClick}>{action.name}</Button>) : <MarketingMenu menu={activityMenu(state, row, access.manage, now, run, () => navigate(`marketing/activity/${row.id}/prizes`))}><Button theme="borderless" size="small" icon={<IconMore />} aria-label="更多" /></MarketingMenu>}
      </div> },
    ]} />
    </section>
    {editing && <ActivityEditor key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
  </>;
}

function SessionPools({ activity }: { activity: MarketingActivity }) {
  const { state } = useMarketing(), [session, setSession] = useState<MarketingSlot | null>(null);
  return <Panel title="场次奖池"><Table rowKey="id" dataSource={activity.slots.filter(row => !row.deleted && !row.disabled)} pagination={false} empty="请在活动信息设置中添加活动场次" columns={[
    { title: "场次", dataIndex: "label" },
    { title: "时间", render: (_: unknown, row: MarketingSlot) => <DateRange start={row.startAt} end={row.endAt} /> },
    { title: "奖池", render: (_: unknown, row: MarketingSlot) => sessionPrizeSummary(state, activity, row.id) },
    { title: "操作", width: 110, render: (_: unknown, row: MarketingSlot) => <Button theme="borderless" size="small" onClick={() => setSession(row)}>配置奖池</Button> },
  ]} />{session && <SessionPrizeDrawer activity={activity} session={session} onClose={() => setSession(null)} />}</Panel>;
}

function PrizeSettings({ activity, onCreate, coachMode = false }: { activity: MarketingActivity; onCreate: () => void; coachMode?: boolean }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction(); const now = useClock();
  const [editing, setEditing] = useState<ActivityPrize | null>(null), [viewing, setViewing] = useState<ActivityPrize | null>(null), [importId, setImportId] = useState(""), [codesId, setCodesId] = useState(""), [extra, setExtra] = useState({ itemId: "", count: 1 }), [scheduleId, setScheduleId] = useState("");
  const [newSchedule, setNewSchedule] = useState<MarketingPickupSchedule>();
  const rulesLocked = Boolean(activity.publishedAt || hasActivityBusinessData(state, activity.id));
  const codePrize = activity.pool.find((item) => item.id === codesId);
  const prizeIds = new Map(activity.pool.map((item, index) => [item.id, index + 1]));
  return <>{feedback}
    <Panel title="奖品" actions={<Button size="small" icon={<IconPlus />} disabled={!access.manage} onClick={onCreate}>创建奖品</Button>}>
      <Table rowKey="id" dataSource={activity.pool} pagination={{ pageSize: 10 }} scroll={{ x: coachMode ? 1240 : 990 }} empty={<EmptyBlock title="暂无奖品" description={coachMode ? "创建奖品并设置领取方式与中奖概率。" : lotteryScope(activity) === "SESSION" ? "创建奖品后，在下方配置各场次的中奖概率和数量。" : "创建奖品并设置中奖概率。"} />} columns={[
        ...(coachMode ? [
          { title: "奖品ID", width: 90, render: (_: unknown, item: ActivityPrize) => prizeIds.get(item.id) },
          { title: "奖品名称", width: 180, dataIndex: "name" },
          { title: "奖品类型", width: 120, render: (_: unknown, item: ActivityPrize) => prizeTypeLabels[item.prizeType] },
          { title: "领取方式", width: 120, render: (_: unknown, item: ActivityPrize) => prizeReceivingLabel(item) },
          { title: "总库存", width: 120, render: (_: unknown, item: ActivityPrize) => prizeQuantityMode(item) === "UNLIMITED" ? "不限量" : String(item.quantityLimit ?? item.quota) },
          { title: "有效期", width: 210, render: (_: unknown, item: ActivityPrize) => <DateRange start={item.claimStart} end={item.claimEnd} /> },
        ] : [
          { title: "奖品", width: 160, render: (_: unknown, item: ActivityPrize) => <div className="marketing-summary-cell"><strong>{item.name}</strong><span>{item.label}</span></div> },
          { title: "类型 / 领取方式", width: 130, render: (_: unknown, item: ActivityPrize) => <div className="marketing-summary-cell"><span>{prizeTypeLabels[item.prizeType]}</span><small>{prizeReceivingLabel(item)}</small></div> },
          { title: "数量", width: 155, render: (_: unknown, item: ActivityPrize) => {
          if (prizeQuantityMode(item) === "UNLIMITED") return <div className="marketing-summary-cell"><span>不限量</span>{item.method === "REDEMPTION_CODE" && <small>可用码 {codeInventory(item).remaining}</small>}</div>;
          const allocation = activityPrizeAllocation(state, activity, item, now);
          return <div className="marketing-summary-cell"><span>限量 {allocation.quantityLimit}</span><small>已中奖 {allocation.won}</small><small>{lotteryScope(activity) === "SESSION" ? `可分配 ${allocation.unallocated}` : `剩余 ${allocation.remaining}`}</small></div>;
          } },
          ...(lotteryScope(activity) === "ACTIVITY" ? [{ title: "中奖概率", width: 110, render: (_: unknown, item: ActivityPrize) => prizeDefaultProbability(item) + "%" }] : []),
          { title: "兑奖预约设置 / 有效期", width: 210, render: (_: unknown, item: ActivityPrize) => {
          const schedule = pickupScheduleForPrize(activity, item);
          return <div className="marketing-summary-cell">{needsReservation(item) && (schedule ? <Button theme="borderless" size="small" onClick={() => setScheduleId(schedule.id)}>{schedule.name}</Button> : <span>兑奖预约设置待配置</span>)}<DateRange start={item.claimStart} end={item.claimEnd} /></div>;
          } },
        ]),
        { title: "操作", width: coachMode ? 330 : 130, fixed: "right", render: (_: unknown, item: ActivityPrize) => <div className="row-actions">
          {coachMode && <Button theme="borderless" size="small" onClick={() => setViewing(item)}>查看</Button>}
          <Button theme="borderless" size="small" disabled={!access.manage} onClick={() => { setNewSchedule(undefined); setEditing(structuredClone(item)); }}>编辑</Button>
          {coachMode ? <>
            {item.method === "REDEMPTION_CODE" && <><Button theme="borderless" size="small" disabled={!access.manage} onClick={() => setImportId(item.id)}>导入兑换码</Button><Button theme="borderless" size="small" disabled={!access.manage} onClick={() => setCodesId(item.id)}>查看兑换码</Button></>}
            {rulesLocked && prizeQuantityMode(item) === "LIMITED" && <Button theme="borderless" size="small" disabled={!access.manage} onClick={() => setExtra({ itemId: item.id, count: 1 })}>增加库存</Button>}
            {!rulesLocked && <Button theme="borderless" type="danger" size="small" disabled={!access.manage} onClick={() => run({ type: "DELETE_ACTIVITY_PRIZE", activityId: activity.id, poolItemId: item.id })}>删除</Button>}
          </> : <MarketingMenu menu={[
          ...(item.method === "REDEMPTION_CODE" ? [{ node: "item" as const, name: "导入兑换码", disabled: !access.manage, onClick: () => setImportId(item.id) }, { node: "item" as const, name: "查看兑换码", disabled: !access.manage, onClick: () => setCodesId(item.id) }] : []),
          ...(rulesLocked && prizeQuantityMode(item) === "LIMITED" ? [{ node: "item" as const, name: "增加可发放数量", disabled: !access.manage, onClick: () => setExtra({ itemId: item.id, count: 1 }) }] : []),
          ...(!coachMode && needsReservation(item) && pickupScheduleForPrize(activity, item) ? [{ node: "item" as const, name: "管理兑奖预约设置", onClick: () => setScheduleId(pickupScheduleForPrize(activity, item)!.id) }] : []),
          ...(!rulesLocked ? [{ node: "item" as const, name: "删除奖品", type: "danger" as const, disabled: !access.manage, onClick: () => run({ type: "DELETE_ACTIVITY_PRIZE", activityId: activity.id, poolItemId: item.id }) }] : []),
        ]}><Button theme="borderless" size="small" icon={<IconMore />} aria-label={`更多奖品操作 · ${item.name}`} /></MarketingMenu>}
        </div> },
      ]} />
    </Panel>
    {!coachMode && activity.lotteryEnabled && lotteryScope(activity) === "SESSION" && <SessionPools activity={activity} />}
    {editing && <FormSideSheet visible className={`marketing-prize-editor ${coachMode ? "coach-marketing-sheet" : ""}`} title="编辑奖品" width={720} okText="保存" cancelText="取消" okButtonProps={{ disabled: !access.manage }} onCancel={() => setEditing(null)} onOk={() => { if (!access.manage) return; if (run({ type: "SAVE_ACTIVITY_PRIZE", activityId: activity.id, prize: editing, newPickupSchedule: newSchedule }).ok) setEditing(null); }}>{feedback}
      {coachMode ? <TextField label="奖品ID" value={String(prizeIds.get(editing.id))} onChange={() => undefined} disabled /> : <DefinitionGrid rows={[
      ["可继续中奖", winnable(state, activity.id, editing, now)], ["已领取 / 发放", quota(state, activity.id, editing).issued],
      ...(needsReservation(editing) ? [["待预约权益", fulfillmentCapacity(state, activity.id, editing, now).unreservedPromises], ["预约名额缺口", fulfillmentCapacity(state, activity.id, editing, now).shortfall]] as Array<[string, ReactNode]> : []),
      ...(editing.method === "REDEMPTION_CODE" ? [["兑换码：导入 / 分配 / 剩余", `${codeInventory(editing).imported} / ${codeInventory(editing).assigned} / ${codeInventory(editing).remaining}`]] as Array<[string, ReactNode]> : []),
      ]} />}<PrizeFields prize={editing} onChange={setEditing} newSchedule={newSchedule} onNewSchedule={setNewSchedule} quantityLocked={rulesLocked} locked={state.awards.some(row => row.activityId === activity.id && row.poolItemId === editing.id)} /></FormSideSheet>}
    <SideSheet visible={Boolean(viewing)} closeOnEsc className={coachMode ? "coach-marketing-sheet" : undefined} title="奖品详情" width={Math.min(620, window.innerWidth - 24)} onCancel={() => setViewing(null)} footer={<Button onClick={() => setViewing(null)}>关闭</Button>}>
      {viewing && <DataList rows={[["奖品ID", String(prizeIds.get(viewing.id))], ["奖品名称", viewing.name], ["奖品类型", prizeTypeLabels[viewing.prizeType]], ["领取方式", prizeReceivingLabel(viewing)], ["总库存", prizeQuantityMode(viewing) === "UNLIMITED" ? "不限量" : String(viewing.quantityLimit ?? viewing.quota)], ["有效期", displayDateRange(viewing.claimStart, viewing.claimEnd).compact]]} />}
    </SideSheet>
    {importId && <FormSideSheet visible title="导入当前奖品兑换码" width={650} footer={<Button onClick={() => setImportId("")}>完成</Button>} onCancel={() => setImportId("")}>
      {feedback}<CodeImporter onImport={(codes) => run({ type: "IMPORT_CODES", activityId: activity.id, poolItemId: importId, codes }).codeImport} />
    </FormSideSheet>}
    {codePrize && access.manage && <CodeManager prize={codePrize} published={Boolean(rulesLocked)} remainingQuota={quota(state, activity.id, codePrize).available} canManage={access.manage} onClose={() => setCodesId("")} onDelete={(codes) => run({ type: "DELETE_CODES", activityId: activity.id, poolItemId: codePrize.id, codes })} />}
    <Modal visible={Boolean(extra.itemId)} maskClosable={false} width={520} title="增加活动奖品可发放数量" onCancel={() => setExtra({ itemId: "", count: 1 })} onOk={() => { if (run({ type: "ADD_QUOTA", activityId: activity.id, poolItemId: extra.itemId, count: extra.count }).ok) setExtra({ itemId: "", count: 1 }); }}>{feedback}<NumberField label="增加数量" value={extra.count} onChange={(count) => setExtra({ ...extra, count })} /></Modal>
    {!coachMode && (activity.pool.some(needsReservation) || pickupSchedules(activity).length > 0) && <PickupScheduleSection activity={activity} openId={scheduleId} onOpen={setScheduleId} onClose={() => setScheduleId("")} />}
  </>;
}

function ActivitySessions({ activity }: { activity: MarketingActivity }) {
  const { state } = useMarketing();
  const [session, setSession] = useState<MarketingSlot | null>(null);
  const [viewing, setViewing] = useState<MarketingSlot | null>(null);
  const rows = activity.slots.filter((row) => !row.deleted);
  const sessionIds = new Map(activity.slots.map((row, index) => [row.id, index + 1]));
  const create = () => {
    const next = createMarketingSlot(crypto.randomUUID(), activity.startAt, 10);
    setSession({ ...next, label: `场次 ${rows.length + 1}`, location: prototypeLocationLabel(activity.location) });
  };
  return <Panel actions={<Button size="small" icon={<IconPlus />} onClick={create}>新增场次</Button>}>
    <Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1320 }} empty={<EmptyBlock title="暂无活动场次" description="新增场次后，可设置场次信息及本场奖品。" />} columns={[
      { title: "场次ID", width: 100, render: (_: unknown, row: MarketingSlot) => sessionIds.get(row.id) },
      { title: "场次开始时间", width: 175, render: (_: unknown, row: MarketingSlot) => displayDate(row.startAt) },
      { title: "场次结束时间", width: 175, render: (_: unknown, row: MarketingSlot) => displayDate(row.endAt) },
      { title: "场次库存", dataIndex: "capacity", width: 110 },
      { title: "关联奖品", width: 190, render: (_: unknown, row: MarketingSlot) => sessionPrizeSummary(state, activity, row.id) },
      { title: "场次状态", width: 105, render: (_: unknown, row: MarketingSlot) => { const lifecycle = marketingSessionLifecycle(activity, row, Date.now()); return <Tag size="small" color={lifecycle === "ONGOING" ? "green" : "grey"}>{marketingSessionLifecycleLabels[lifecycle]}</Tag>; } },
      { title: "创建时间", width: 175, render: (_: unknown, row: MarketingSlot) => displayDate(row.createdAt ?? activity.createdAt) },
      { title: "操作", width: 150, fixed: "right", render: (_: unknown, row: MarketingSlot) => <div className="row-actions"><Button theme="borderless" size="small" onClick={() => setViewing(row)}>查看</Button><Button theme="borderless" size="small" onClick={() => setSession(row)}>编辑</Button></div> },
    ]} />
    <SideSheet visible={Boolean(viewing)} closeOnEsc className="coach-marketing-sheet" title="场次详情" width={Math.min(620, window.innerWidth - 24)} onCancel={() => setViewing(null)} footer={<Button onClick={() => setViewing(null)}>关闭</Button>}>
      {viewing && <DataList rows={[["场次ID", String(sessionIds.get(viewing.id))], ["场次开始时间", displayDate(viewing.startAt)], ["场次结束时间", displayDate(viewing.endAt)], ["场次库存", String(viewing.capacity)], ["关联奖品", sessionPrizeSummary(state, activity, viewing.id)], ["场次状态", marketingSessionLifecycleLabels[marketingSessionLifecycle(activity, viewing, Date.now())]], ["创建时间", displayDate(viewing.createdAt ?? activity.createdAt)]]} />}
    </SideSheet>
    {session && <SessionPrizeDrawer key={session.id} activity={activity} session={session} editSessionDetails onClose={() => setSession(null)} />}
  </Panel>;
}

export function MarketingDetail({ activity, requestedTab, requestedSecondaryTab }: { activity: MarketingActivity; requestedTab?: string; requestedSecondaryTab?: string }) {
  const { state } = useMarketing(), { state: sales, currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction(), now = useClock();
  const coachMode = isCoachPrototype();
  const [editing, setEditing] = useState(false), [configuration, setConfiguration] = useState<"lottery" | null>(null), [newPrize, setNewPrize] = useState<ActivityPrize | null>(null), [scheduleId, setScheduleId] = useState("");
  const [newSchedule, setNewSchedule] = useState<MarketingPickupSchedule>();
  useEffect(() => { setNewSchedule(undefined); setEditing(false); setConfiguration(null); setNewPrize(null); }, [activity.id, currentUser.id]);
  const coachTab = ["sessions", "participants", "prizes", "pickups", "draws"].includes(requestedTab ?? "") ? requestedTab! : "sessions";
  const code = coachMode ? String(state.activities.findIndex((row) => row.id === activity.id) + 1) : activityCodes(state).get(activity.id), tab = coachMode ? coachTab : activityDetailTab(requestedTab, requestedSecondaryTab);
  const creator = coachMode ? "Ryan" : activity.createdBy ? sales.users.find(user => user.id === activity.createdBy)?.name || "历史人员待核对" : "未记录";
  const go = (key: string) => navigate(`marketing/activity/${activity.id}/${key}`);
  const coreInfo: Array<[string, ReactNode]> = [
    ["活动名称", prototypeMarketingCopy(activity.name)], [coachMode ? "活动ID" : "活动编号", <Typography.Text ellipsis={{ showTooltip: true }} copyable>{code}</Typography.Text>], ["所属品牌", prototypeBrandLabel(brandLabels[activity.brand])],
    ["创建人", creator], ["创建时间", displayDate(activity.createdAt)],
    ["活动类型", activity.mode === "OFFLINE" ? "线下活动" : "线上活动"],
    ["场地", activity.mode === "OFFLINE" ? prototypeLocationLabel(activity.location) : "—"],
    ["活动时间", displayDateRange(activity.startAt, activity.endAt).compact],
    ["参与方式", activity.bookingEnabled ? "预约参与" : "直接参与"],
    ["启用抽奖", activity.lotteryEnabled ? "是" : "否"],
  ];
  return <><div className={`marketing-detail ${coachMode ? "coach-marketing-detail" : ""}`}><DetailWorkspace eyebrow="营销活动" title={prototypeMarketingCopy(activity.name)} backRoute="marketing"
    tags={<>
      <LifecycleTag activity={activity} now={now} /><span>{prototypeBrandLabel(brandLabels[activity.brand])} · {activity.mode === "OFFLINE" ? "线下活动" : "线上活动"} · {activity.bookingEnabled ? "预约参与" : "直接参与"}</span>
      <span className="marketing-record-metadata"><span><IconUser aria-hidden /> 创建人：{creator}</span>{activity.mode === "OFFLINE" && <span><IconMapPin aria-hidden /> {prototypeLocationLabel(activity.location)}</span>}<span><IconCalendar aria-hidden /> {displayDateRange(activity.startAt, activity.endAt).compact}</span></span>
    </>}
    actions={coachMode ? <div className="row-actions">{activityMenu(state, activity, access.manage, now, run).map((action) => <Button key={action.name} size="small" theme={action.type === "danger" ? "light" : "solid"} type={action.type === "danger" ? "danger" : "primary"} disabled={action.disabled} onClick={action.onClick}>{action.name}</Button>)}</div> : <>{activity.status === "DRAFT" && <Button theme="solid" disabled={!access.manage} onClick={() => run({ type: "STATUS", activityId: activity.id, status: "PUBLISHED" })}>发布活动</Button>}<MarketingMenu menu={[
      ...activityMenu(state, activity, access.manage, now, run, () => go("prizes")),
    ]}><Button size="small" icon={<IconChevronDown />} iconPosition="right" aria-label="活动状态操作">活动状态操作</Button></MarketingMenu></>}
    sidebar={<>
      <SideSection title="活动信息" onEdit={() => setEditing(true)} editDisabled={!access.manage}><DataList rows={coreInfo} />
        {activity.bookingEnabled && !coachMode && <div className="marketing-rail-rule"><h3>活动预约</h3><DataList rows={[
          ["预约开放", displayDate(activity.bookingStart)], ["预约截止", displayDate(activity.bookingEnd)],
          ["完成条件", activity.completion === "CHECKIN" ? "签到即完成" : "工作人员确认完成"],
          ["允许取消", activity.allowCancel ? "截止前且未签到" : "不允许"], ["允许改约", activity.allowReschedule ? "允许" : "不允许"],
          ["现场报名", activity.allowWalkIn ? "允许" : "不允许"], ["活动场次", String(activity.slots.length)],
        ]} /></div>}
        <div className="marketing-rail-rule"><h3>活动规则</h3><ActivityRuleContent activity={activity} /></div>
      </SideSection>
      {activity.lotteryEnabled && !coachMode && <SideSection title="抽奖设置" onEdit={() => setConfiguration("lottery")} editDisabled={!access.manage}><DataList rows={[
        ["抽奖方式", lotteryScope(activity) === "ACTIVITY" ? "按活动抽奖" : "按场次抽奖"],
        ["抽奖时间", displayDateRange(activity.lotteryStart, activity.lotteryEnd).compact],
        ["完成后发放次数", String(activity.grantCount)], ["累计抽奖上限", String(activity.drawLimit)],
        ["每日上限", activity.dailyLimit === null ? "不限制" : String(activity.dailyLimit)], ["累计中奖上限", String(activity.winLimit)],
        ...(lotteryScope(activity) === "ACTIVITY" ? [["中奖概率合计", activity.pool.reduce((sum, item) => sum + prizeDefaultProbability(item), 0) + "%"], ["未中奖概率", Math.max(0, 100 - activity.pool.reduce((sum, item) => sum + prizeDefaultProbability(item), 0)) + "%"]] as Array<[string, ReactNode]> : []),
      ]} /></SideSection>}
    </>}
    tabs={<>{feedback}<Tabs type="line" className="record-tabs" activeKey={tab} onChange={go}>
      {coachMode ? <TabPane itemKey="sessions" tab="活动场次"><section className="marketing-record-content"><ActivitySessions activity={activity} /></section></TabPane> : <TabPane itemKey="bookings" tab="活动预约记录"><section className="marketing-record-content"><ActivityBookingData key={`${activity.id}:${currentUser.id}`} activity={activity} now={now} dataState={state} /></section></TabPane>}
      <TabPane itemKey="participants" tab="参与用户"><section className="marketing-record-content"><ParticipantTaskData key={`${activity.id}:${currentUser.id}`} activity={activity} dataState={state} /></section></TabPane>
      <TabPane itemKey="prizes" tab="奖品设置">{!activity.lotteryEnabled && <Banner type="info" title="此活动未启用抽奖" closeIcon={null} />}<PrizeSettings key={`${activity.id}:${currentUser.id}`} coachMode={coachMode} activity={activity} onCreate={() => { setNewSchedule(undefined); setNewPrize({ ...createActivityPrize(activity.id, Date.now()), fulfillmentMode: "DIRECT" }); }} /></TabPane>
      {coachMode && <TabPane itemKey="pickups" tab="兑奖预约设置"><section className="marketing-record-content"><PickupScheduleSection activity={activity} openId={scheduleId} onOpen={setScheduleId} onClose={() => setScheduleId("")} /></section></TabPane>}
      <TabPane itemKey="draws" tab="抽奖记录"><section className="marketing-record-content">{!activity.lotteryEnabled && <Banner type="info" title="此活动未启用抽奖" closeIcon={null} />}<DrawData key={`${activity.id}:${currentUser.id}`} activity={activity} now={now} dataState={state} /></section></TabPane>
    </Tabs></>}
  /></div>
    {editing && <ActivityEditor initial={structuredClone(activity)} onClose={() => setEditing(false)} />}
    {configuration && <ActivityConfigurationEditor key={configuration} initial={structuredClone(activity)} section={configuration} onClose={() => setConfiguration(null)} />}
    {newPrize && <FormSideSheet visible className={`marketing-prize-editor ${coachMode ? "coach-marketing-sheet" : ""}`} title="创建奖品" width={720} okText="创建奖品" cancelText="取消" okButtonProps={{ disabled: !access.manage }} onCancel={() => setNewPrize(null)} onOk={() => { if (!access.manage) return; if (run({ type: "SAVE_ACTIVITY_PRIZE", activityId: activity.id, prize: newPrize, newPickupSchedule: newSchedule }).ok) { setNewPrize(null); go("prizes"); } }}>{feedback}<PrizeFields prize={newPrize} onChange={setNewPrize} newSchedule={newSchedule} onNewSchedule={setNewSchedule} /></FormSideSheet>}
  </>;
}
