import { useState } from "react";
import { Banner, Button, Dropdown, Empty, TextArea, Modal, Radio, RadioGroup, SideSheet, Steps, Switch, Table } from "@douyinfe/semi-ui";
import { IconAlertTriangle, IconChevronRight, IconMore, IconPlus, IconTickCircle } from "@douyinfe/semi-icons";
import { useCrm } from "@/stores/crm-store";
import { brandLabels } from "@/stores/member-operations-store";
import { useMarketing } from "@/stores/marketing-store";
import { createActivityPrize, createMarketingSlot } from "@/mock/marketing-demo-data";
import type { ActivityPrize, MarketingActivity, MarketingSlot } from "@/types/marketing";
import { navigate } from "@/utils/format";
import { codeInventory, draftActivityErrors, hasActivityBusinessData, marketingPermissions, needsReservation, prizeErrors, prizeTypeLabels, publishChecks, validateActivity, type MarketingPublishCheck } from "./marketing-model";
import { inspectMarketingCodes, parseMarketingCodeRows, type MarketingCodeImportReport } from "./marketing-code-import";
import { activityEditorSteps, buildPublishReadiness, editorStepComplete } from "./marketing-editor-readiness";
import { CodeManager } from "./MarketingCodes";
import { displayDate, ImageField, NumberField, options, Panel, SelectField, SlotFields, TextField, TimeField, useAction } from "./MarketingUi";

export function PublishChecklist({ checks, onFix, activity }: { checks: MarketingPublishCheck[]; onFix: (step: number) => void; activity?: MarketingActivity }) {
  const readiness = buildPublishReadiness(checks, activity);
  const rows = <div className="marketing-readiness-rows">{readiness.rows.map((row) => <section key={row.key} data-check-key={row.key} className={`marketing-readiness-row ${row.pending ? "is-error" : "is-complete"}`}>
      <span className="marketing-readiness-icon" aria-label={row.pending ? "待完善" : "已完成"}>{row.pending ? <IconAlertTriangle /> : <IconTickCircle />}</span>
      <div className="marketing-readiness-copy"><strong>{row.title}</strong><p>{row.summary}</p>{row.errors.length > 1 && <details><summary>查看另外 {row.errors.length - 1} 项</summary>{row.errors.slice(1).map((error) => <p key={error}>{error}</p>)}</details>}</div>
      {row.pending && <Button size="small" theme="borderless" icon={<IconChevronRight />} iconPosition="right" onClick={() => onFix(row.step)}>去完善</Button>}
    </section>)}</div>;
  return <section className="marketing-publish-readiness" aria-label="发布检查">
    <header className="marketing-readiness-header"><div><h2>{readiness.ready ? <><IconTickCircle /> 已准备好发布</> : "发布检查"}</h2><p className="marketing-readiness-counts">{readiness.pending ? `${readiness.pending} 项待完善 · ` : ""}已完成 {readiness.completed} / {readiness.total} 项检查</p></div></header>
    {!readiness.ready && rows}
    {readiness.ready && activity && <dl className="marketing-readiness-summary"><div><dt>所属品牌</dt><dd>{brandLabels[activity.brand]}</dd></div><div><dt>活动时间</dt><dd>{displayDate(activity.startAt)} — {displayDate(activity.endAt)}</dd></div><div><dt>参与方式</dt><dd>{activity.bookingEnabled ? "预约参与" : "直接参与"}</dd></div><div><dt>抽奖</dt><dd>{activity.lotteryEnabled ? "已启用" : "不启用"}</dd></div><div><dt>奖品数量</dt><dd>{activity.lotteryEnabled ? activity.pool.length : "—"}</dd></div></dl>}
    {readiness.ready && <details className="marketing-readiness-completed"><summary>查看已完成的检查</summary>{rows}</details>}
  </section>;
}
export function PublishReview({ activity, onClose, onFix }: { activity: MarketingActivity; onClose: () => void; onFix: (step: number) => void }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction();
  const checks = publishChecks(activity, state, access.brands);
  return <Modal visible className="marketing-prize-dialog" title={`发布活动 · ${activity.name}`} width={Math.min(760, window.innerWidth - 20)} onCancel={onClose} footer={<div className="marketing-footer-actions"><Button onClick={onClose}>取消</Button><Button theme="solid" disabled={!access.manage || checks.some((check) => check.errors.length > 0)} onClick={() => { if (run({ type: "STATUS", activityId: activity.id, status: "PUBLISHED" }).ok) onClose(); }}>发布活动</Button></div>}>
    {feedback}<PublishChecklist checks={checks} activity={activity} onFix={(step) => { onClose(); onFix(step); }} />
  </Modal>;
}

export function CodeImporter({ onImport }: { onImport: (codes: string[]) => MarketingCodeImportReport | undefined }) {
  const [text, setText] = useState(""), [error, setError] = useState(""), [report, setReport] = useState<MarketingCodeImportReport | null>(null);
  const submit = () => { try { const result = onImport(parseMarketingCodeRows(text)); if (result) { setReport(result); if (result.imported) setText(""); } setError(""); } catch (error) { setReport(null); setError(error instanceof Error ? error.message : "读取失败"); } };
  return <Panel title="导入兑换码" note="每行一个兑换码，或上传一列 CSV。重复与无效兑换码不会导入。">
    <label className="marketing-field"><span>兑换码文本</span><TextArea aria-label="兑换码文本" value={text} onChange={setText} autosize={{ minRows: 3, maxRows: 7 }} /></label>
    <label className="marketing-field"><span>上传 CSV</span><input aria-label="兑换码CSV" type="file" accept=".csv,text/csv" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1_000_000) { setError("请选择不超过1MB的一列CSV"); return; } try { setText(await file.text()); setError(""); } catch { setError("文件读取失败，未导入任何兑换码"); } }} /></label>
    {error && <Banner type="warning" title={error} closeIcon={null} />}{report && <><Banner type={report.duplicate || report.invalid ? "warning" : report.imported ? "success" : "warning"} title={`成功导入：${report.imported}，重复：${report.duplicate}，非法：${report.invalid}，忽略空值：${report.ignored}`} closeIcon={null} />{Boolean(report.failures.length) && <details><summary>查看导入失败明细（{report.failures.length}）</summary><Table rowKey="line" size="small" dataSource={report.failures} pagination={{ pageSize: 10 }} columns={[{ title: "批次行", dataIndex: "line", width: 70 }, { title: "输入值", dataIndex: "code" }, { title: "原因", dataIndex: "reason" }]} /></details>}</>}<Button size="small" onClick={submit}>确认导入兑换码</Button>
  </Panel>;
}

export function SlotConfigurationTable({ slots, onChange, parentStart, activityId, prizeId, title = "活动场次" }: {
  slots: MarketingSlot[]; onChange: (slots: MarketingSlot[]) => void; parentStart: string; activityId: string; prizeId?: string; title?: string;
}) {
  const { state } = useMarketing(); const [editing, setEditing] = useState<MarketingSlot | null>(null);
  const [isNew, setIsNew] = useState(false);
  const edit = (slot?: MarketingSlot) => { setIsNew(!slot); setEditing(slot ? structuredClone(slot) : createMarketingSlot(crypto.randomUUID(), parentStart)); };
  const save = () => { if (!editing) return; onChange(isNew ? [...slots, editing] : slots.map((row) => row.id === editing.id ? editing : row)); setEditing(null); };
  const bookings = (slot: MarketingSlot) => state.bookings.filter((row) => row.activityId === activityId && row.slotId === slot.id && row.kind === (prizeId ? "PRIZE" : "ACTIVITY") && (!prizeId || row.poolItemId === prizeId) && ["BOOKED", "CHECKED_IN", "FULFILLED"].includes(row.status)).length;
  return <Panel title={title}><div className="marketing-config-table">
    <div className="marketing-row-actions"><Button size="small" icon={<IconPlus />} onClick={() => edit()}>添加{prizeId ? "履约时段" : "活动场次"}</Button></div>
    {slots.length ? <Table size="small" rowKey="id" dataSource={slots} pagination={false} scroll={{ x: 720 }} columns={[
      { title: "日期 / 时间", width: 175, render: (_: unknown, row: MarketingSlot) => <div className="marketing-summary-cell"><strong>{row.label}</strong><span>{displayDate(row.startAt)} — {displayDate(row.endAt)}</span></div> },
      { title: "地点", dataIndex: "location", width: 110 }, { title: "已预约 / 容量", width: 100, render: (_: unknown, row: MarketingSlot) => `${bookings(row)} / ${row.capacity}` },
      { title: "预约截止", width: 145, render: (_: unknown, row: MarketingSlot) => displayDate(row.bookingClosesAt) },
      { title: "签到窗口", width: 180, render: (_: unknown, row: MarketingSlot) => `${displayDate(row.checkinStart)} — ${displayDate(row.checkinEnd)}` },
      { title: "操作", width: 100, fixed: "right", render: (_: unknown, row: MarketingSlot) => <div className="marketing-row-actions"><Button size="small" theme="borderless" onClick={() => edit(row)}>编辑</Button><Dropdown trigger="click" position="bottomRight" render={<Dropdown.Menu><Dropdown.Item type="danger" onClick={() => Modal.confirm({ title: `删除${prizeId ? "履约时段" : "活动场次"}？`, content: `将移除「${row.label}」。`, onOk: () => onChange(slots.filter((slot) => slot.id !== row.id)) })}>删除</Dropdown.Item></Dropdown.Menu>}><Button size="small" theme="borderless" icon={<IconMore />} aria-label={`更多操作 · ${row.label}`} /></Dropdown></div> },
    ]} /> : <Empty title={`暂无${prizeId ? "履约时段" : "活动场次"}`} description={prizeId ? "添加可预约的领奖时段与容量。" : "添加活动时间、地点与可预约名额。"} />}
    {editing && <Modal visible className="marketing-prize-dialog" title={`${isNew ? "添加" : "编辑"}${prizeId ? "履约时段" : "活动场次"}`} width={Math.min(700, window.innerWidth - 20)} okText="保存场次" cancelText="取消" onCancel={() => setEditing(null)} onOk={save}><SlotFields slot={editing} onChange={setEditing} /></Modal>}
  </div></Panel>;
}

export function PrizeFields({ prize, onChange }: { prize: ActivityPrize; onChange: (prize: ActivityPrize) => void }) {
  const { state } = useMarketing(); const [viewCodes, setViewCodes] = useState(false);
  const update = <K extends keyof ActivityPrize>(key: K, value: ActivityPrize[K]) => onChange({ ...prize, [key]: value });
  const inventory = codeInventory(prize), fulfillment = needsReservation(prize) ? "RESERVATION" : "DIRECT";
  const changeType = (type: string) => {
    const virtual = type === "VIRTUAL";
    const method = virtual ? ["REDEMPTION_CODE", "VIRTUAL_VOUCHER", "LINK"].includes(prize.method) ? prize.method : "REDEMPTION_CODE" : fulfillment === "RESERVATION" ? prize.method === "EXPERIENCE" ? "EXPERIENCE" : "PICKUP" : "DIRECT";
    onChange({ ...prize, prizeType: type as ActivityPrize["prizeType"], method, fulfillmentMode: fulfillment });
  };
  const changeFulfillment = (value: string) => {
    const mode = value as "DIRECT" | "RESERVATION";
    const method = prize.prizeType === "PHYSICAL" ? mode === "DIRECT" ? "DIRECT" : prize.method === "EXPERIENCE" ? "EXPERIENCE" : "PICKUP" : prize.method;
    onChange({ ...prize, method, fulfillmentMode: mode, slots: mode === "RESERVATION" ? prize.slots.length ? prize.slots : [createMarketingSlot(crypto.randomUUID(), prize.claimStart, Math.max(1, prize.quota))] : [] });
  };
  return <>
    <div className="marketing-form-grid">
      <TextField label="奖品名称" value={prize.name} onChange={(value) => update("name", value)} /><TextField label="奖项名称" value={prize.label} onChange={(value) => update("label", value)} />
      <TextField label="奖品说明" value={prize.description} onChange={(value) => update("description", value)} /><ImageField label="奖品图片" value={prize.image} onChange={(value) => update("image", value)} />
      <SelectField label="奖品类型" value={prize.prizeType} list={options({ ...(prize.prizeType === "UNKNOWN" ? { UNKNOWN: "类型待确认" } : {}), PHYSICAL: prizeTypeLabels.PHYSICAL, VIRTUAL: prizeTypeLabels.VIRTUAL })} onChange={changeType} />
      <SelectField label="领取方式" value={fulfillment} list={options(prize.prizeType === "VIRTUAL" ? { DIRECT: "直接发放", RESERVATION: "预约履约" } : { DIRECT: "直接领取", RESERVATION: "预约领取" })} onChange={changeFulfillment} />
      <NumberField label="奖品配置数量" value={prize.quota} onChange={(value) => update("quota", value)} /><NumberField label="中奖概率（%）" value={prize.probability} onChange={(value) => update("probability", value)} />
      <NumberField label="每人该奖品最多获得" value={prize.perPersonLimit} onChange={(value) => update("perPersonLimit", value)} />
      {prize.prizeType === "VIRTUAL" && <SelectField label="虚拟奖品内容" value={prize.method} list={options({ REDEMPTION_CODE: "兑换码", VIRTUAL_VOUCHER: "虚拟权益", LINK: "领取链接" })} onChange={(value) => update("method", value as ActivityPrize["method"])} />}
      {prize.prizeType === "PHYSICAL" && fulfillment === "RESERVATION" && <SelectField label="预约履约类型" value={prize.method} list={options({ PICKUP: "预约领取", EXPERIENCE: "预约体验" })} onChange={(value) => update("method", value as ActivityPrize["method"])} />}
      {(prize.prizeType === "PHYSICAL" || fulfillment === "RESERVATION") && <TextField label="奖品领取地点" value={prize.location} onChange={(value) => update("location", value)} />}
      <TextField label="使用 / 领取说明" value={prize.instructions} onChange={(value) => update("instructions", value)} /><TimeField label="奖品有效开始" value={prize.claimStart} onChange={(value) => update("claimStart", value)} /><TimeField label="奖品有效截止" value={prize.claimEnd} onChange={(value) => update("claimEnd", value)} />
    </div>
    <p className="marketing-field-help">{fulfillment === "RESERVATION" ? "中奖后需先选择领取时间，再办理履约。" : prize.prizeType === "VIRTUAL" ? "中奖后直接发放所配置的虚拟权益。" : "中奖后直接生成领奖核销凭证。"}</p>
    {needsReservation(prize) && <SlotConfigurationTable title="领奖时段" slots={prize.slots} parentStart={prize.claimStart} activityId={prize.activityId} prizeId={prize.id} onChange={(slots) => update("slots", slots)} />}
    {prize.prizeType === "VIRTUAL" && prize.method === "REDEMPTION_CODE" && <>
      <p>配置数量 {prize.quota} · 已导入 {inventory.imported} · 已分配 {inventory.assigned} · 剩余 {inventory.remaining}</p><Button size="small" onClick={() => setViewCodes(true)}>查看兑换码</Button>
      <CodeImporter onImport={(rows) => { const existing = state.activities.flatMap((activity) => activity.pool.flatMap((item) => item.codes.map((row) => row.code))).concat(prize.codes.map((row) => row.code)); const { codes, report } = inspectMarketingCodes(rows, existing); if (codes.length) update("codes", [...prize.codes, ...codes.map((code) => ({ code }))]); return report; }} />
      {viewCodes && <CodeManager prize={prize} published={false} remainingQuota={prize.quota} canManage onClose={() => setViewCodes(false)} onDelete={(codes) => { if (prize.codes.some((code) => codes.includes(code.code) && code.assignedAwardId)) return { ok: false, error: "已分配兑换码不能删除或重新分配。" }; update("codes", prize.codes.filter((code) => !codes.includes(code.code))); return { ok: true }; }} />}
    </>}
    {prize.prizeType === "VIRTUAL" && prize.method === "VIRTUAL_VOUCHER" && <div className="marketing-form-grid"><TextField label="虚拟凭证名称" value={prize.voucherName} onChange={(value) => update("voucherName", value)} /><TextField label="虚拟凭证描述" value={prize.voucherDescription} onChange={(value) => update("voucherDescription", value)} /></div>}
    {prize.prizeType === "VIRTUAL" && prize.method === "LINK" && <TextField label="领取链接" value={prize.link} onChange={(value) => update("link", value)} />}
  </>;
}

export function PrizeConfiguration({ activity, onChange }: { activity: MarketingActivity; onChange: (activity: MarketingActivity) => void }) {
  const { state } = useMarketing(); const [editing, setEditing] = useState<ActivityPrize | null>(null), [error, setError] = useState("");
  const savePrize = () => { if (!editing) return; const errors = prizeErrors(editing, activity, false); if (errors.length) { setError(errors.join("；")); return; } const old = activity.pool.find((row) => row.id === editing.id); onChange({ ...activity, pool: old ? activity.pool.map((row) => row.id === editing.id ? editing : row) : [...activity.pool, editing] }); setEditing(null); setError(""); };
  const awarded = (prize: ActivityPrize) => state.awards.filter((award) => award.activityId === activity.id && award.poolItemId === prize.id).length;
  return <Panel title="活动奖品"><div className="marketing-config-table">
    <div className="marketing-row-actions"><Button size="small" icon={<IconPlus />} onClick={() => setEditing({ ...createActivityPrize(activity.id, Date.now()), fulfillmentMode: "DIRECT", instructions: "凭领奖凭证在有效期内办理领取。" })}>添加奖品</Button></div>
    {activity.pool.length ? <Table size="small" rowKey="id" dataSource={activity.pool} pagination={false} scroll={{ x: 750 }} columns={[
      { title: "奖品", width: 180, render: (_: unknown, row: ActivityPrize) => <div className="marketing-summary-cell"><strong>{row.name}</strong><span>{row.label}</span></div> },
      { title: "类型", width: 90, render: (_: unknown, row: ActivityPrize) => prizeTypeLabels[row.prizeType] },
      { title: "领取方式", width: 100, render: (_: unknown, row: ActivityPrize) => needsReservation(row) ? row.prizeType === "VIRTUAL" ? "预约履约" : "预约领取" : row.prizeType === "VIRTUAL" ? "直接发放" : "直接领取" },
      { title: "概率", width: 75, render: (_: unknown, row: ActivityPrize) => `${row.probability}%` }, { title: "配额", dataIndex: "quota", width: 65 },
      { title: "已中奖", width: 75, render: (_: unknown, row: ActivityPrize) => awarded(row) }, { title: "剩余", width: 65, render: (_: unknown, row: ActivityPrize) => Math.max(0, row.quota - awarded(row)) },
      { title: "操作", width: 100, fixed: "right", render: (_: unknown, row: ActivityPrize) => <div className="marketing-row-actions"><Button size="small" theme="borderless" onClick={() => setEditing(structuredClone(row))}>编辑</Button><Dropdown trigger="click" position="bottomRight" render={<Dropdown.Menu><Dropdown.Item type="danger" onClick={() => Modal.confirm({ title: "删除奖品？", content: `将从当前活动移除「${row.name}」。`, onOk: () => onChange({ ...activity, pool: activity.pool.filter((prize) => prize.id !== row.id) }) })}>删除奖品</Dropdown.Item></Dropdown.Menu>}><Button size="small" theme="borderless" icon={<IconMore />} aria-label={`更多操作 · ${row.name}`} /></Dropdown></div> },
    ]} /> : <Empty title="暂无奖品" description="添加本活动的奖品、概率与领取方式。" />}
    {editing && <Modal visible className="marketing-prize-dialog" title="配置奖品" width={Math.min(760, window.innerWidth - 20)} okText="保存奖品" cancelText="取消" onCancel={() => { setEditing(null); setError(""); }} onOk={savePrize}>{error && <Banner type="warning" title={error} closeIcon={null} />}<PrizeFields prize={editing} onChange={setEditing} /></Modal>}
  </div></Panel>;
}

export function ActivityEditor({ initial, onClose, initialStep = 0 }: { initial: MarketingActivity; onClose: () => void; initialStep?: number }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction();
  const [form, setForm] = useState(initial), [step, setStep] = useState(Math.max(0, Math.min(4, initialStep))), [error, setError] = useState("");
  const locked = Boolean(initial.publishedAt || hasActivityBusinessData(state, initial.id));
  const update = <K extends keyof MarketingActivity>(key: K, value: MarketingActivity[K]) => setForm((old) => ({ ...old, [key]: value }));
  const checks = publishChecks(form, state, access.brands), errors = validateActivity(form, state, access.brands), draftErrors = draftActivityErrors(form);
  const save = (publish: boolean) => { if (publish && errors.length) { setError("还有配置待完善，请完成发布检查。"); setStep(4); return; } const result = run({ type: "SAVE_ACTIVITY", activity: form }); if (!result.ok) return; if (publish && !run({ type: "STATUS", activityId: form.id, status: "PUBLISHED" }).ok) return; onClose(); navigate(`marketing/activity/${form.id}`); };
  if (!access.manage || !access.brands.includes(initial.brand)) return <SideSheet visible title="无权编辑活动" onCancel={onClose}><Banner type="warning" title="当前账号没有活动管理权限或品牌授权。" closeIcon={null} /></SideSheet>;
  return <SideSheet visible closeOnEsc className="marketing-activity-editor" width={Math.min(960, window.innerWidth - 20)} title={locked ? "编辑活动内容" : state.activities.some((activity) => activity.id === initial.id) ? "编辑活动" : "新建活动"} onCancel={onClose} footer={<div className="marketing-editor-footer"><Button onClick={locked || step < 4 ? onClose : () => setStep(3)}>{!locked && step === 4 ? "返回" : "取消"}</Button><div className="marketing-footer-actions"><Button disabled={!locked && draftErrors.length > 0} onClick={() => save(false)}>{locked ? "保存内容" : "保存草稿"}</Button>{!locked && (step < 4 ? <Button theme="solid" onClick={() => { setError(""); setStep(step + 1); }}>下一步</Button> : <Button theme="solid" disabled={errors.length > 0} onClick={() => save(true)}>发布活动</Button>)}</div></div>}>
    <div className={`marketing-editor-layout ${locked ? "is-locked" : ""}`}>
      {!locked && <nav className="marketing-editor-nav" aria-label="活动配置步骤"><Steps type="basic" direction="vertical" size="small" current={step} hasLine={false} onChange={(next) => { setError(""); setStep(next); }}>{activityEditorSteps.map((title, index) => <Steps.Step key={title} title={<span className="marketing-step-copy">{title}</span>} className={`marketing-editor-step ${step === index ? "is-current" : editorStepComplete(checks, index) ? "is-complete" : ""}`} status={step === index ? "process" : editorStepComplete(checks, index) ? "finish" : "wait"} />)}</Steps></nav>}
      <div className="marketing-editor-content marketing-editor">{(locked || step !== 4) && <header className="marketing-editor-heading"><h2>{locked ? "活动内容" : activityEditorSteps[step]}</h2>{!locked && <p>{["完善活动介绍、规则与基本设置。", "设置参与方式对应的预约与完成条件。", "配置抽奖时间、次数与中奖限制。", "独立设置每个奖品的类型与领取方式。", "确认配置完整后发布活动。"][step]}</p>}</header>}{feedback}{error && <Banner type="warning" title={error} closeIcon={null} />}
        {(locked || step === 0) && <><Panel title="活动内容"><div className="marketing-form-grid"><TextField label="活动名称" value={form.name} onChange={(value) => update("name", value)} /><ImageField label="活动封面" value={form.cover} onChange={(value) => update("cover", value)} /><label className="marketing-field marketing-field-wide"><span>活动说明</span><TextArea aria-label="活动说明" value={form.description} onChange={(value) => update("description", value)} autosize={{ minRows: 2, maxRows: 5 }} /></label><label className="marketing-field marketing-field-wide"><span>活动规则</span><TextArea aria-label="活动规则" value={form.ruleContent ?? ""} onChange={(value) => update("ruleContent", value)} autosize={{ minRows: 3, maxRows: 8 }} placeholder="说明参与限制与奖品领取规则" /></label></div></Panel>
          {!locked && <Panel title="活动设置"><div className="marketing-form-grid"><SelectField label="所属品牌" value={form.brand} list={access.brands.map((brand) => ({ value: brand, label: brandLabels[brand] }))} onChange={(value) => update("brand", value as MarketingActivity["brand"])} /><SelectField label="活动类型" value={form.mode} list={options({ OFFLINE: "线下活动", ONLINE: "线上活动" })} onChange={(value) => setForm((old) => ({ ...old, mode: value as MarketingActivity["mode"], completion: value === "ONLINE" ? "STAFF" : old.completion }))} /><div className="marketing-field marketing-field-wide"><span>参与方式</span><RadioGroup aria-label="参与方式" value={form.bookingEnabled ? "RESERVATION" : "DIRECT"} onChange={(event) => update("bookingEnabled", event.target.value === "RESERVATION")}><Radio value="RESERVATION">预约参与</Radio><Radio value="DIRECT">直接参与</Radio></RadioGroup></div>{form.mode === "OFFLINE" && <TextField label="活动地点" value={form.location} onChange={(value) => update("location", value)} />}<TimeField label="活动开始" value={form.startAt} onChange={(value) => update("startAt", value)} /><TimeField label="活动结束" value={form.endAt} onChange={(value) => update("endAt", value)} /></div></Panel>}</>}
        {locked && <p className="marketing-field-help">参与、抽奖与奖品规则已锁定；需要更改时可复制为新活动。</p>}
        {!locked && step === 1 && <><Panel title="完成条件"><SelectField label="完成条件" value={form.completion} list={[{ value: "STAFF", label: "工作人员确认完成" }, ...(form.mode === "OFFLINE" ? [{ value: "CHECKIN", label: "签到即完成" }] : [])]} onChange={(value) => update("completion", value as MarketingActivity["completion"])} />{!form.bookingEnabled && <p className="marketing-field-help">用户直接参与活动，达到完成条件后获得抽奖机会。</p>}</Panel>
          {form.bookingEnabled && <><Panel title="预约规则"><div className="marketing-form-grid"><TimeField label="预约开放" value={form.bookingStart} onChange={(value) => update("bookingStart", value)} /><TimeField label="预约截止" value={form.bookingEnd} onChange={(value) => update("bookingEnd", value)} /><label className="marketing-field"><span>允许取消</span><Switch aria-label="允许取消预约" checked={form.allowCancel} onChange={(value) => update("allowCancel", value)} /></label><label className="marketing-field"><span>允许改约</span><Switch aria-label="允许改约" checked={form.allowReschedule} onChange={(value) => update("allowReschedule", value)} /></label><label className="marketing-field"><span>允许现场报名</span><Switch aria-label="允许现场报名" checked={form.allowWalkIn} onChange={(value) => update("allowWalkIn", value)} /></label></div></Panel><SlotConfigurationTable slots={form.slots} onChange={(slots) => update("slots", slots)} parentStart={form.startAt} activityId={form.id} /></>}
        </>}
        {!locked && step === 2 && <Panel title="抽奖规则"><label className="marketing-field"><span>启用抽奖</span><Switch aria-label="开启活动抽奖" checked={form.lotteryEnabled} onChange={(value) => update("lotteryEnabled", value)} /></label>{form.lotteryEnabled ? <div className="marketing-form-grid"><TimeField label="抽奖开始" value={form.lotteryStart} onChange={(value) => update("lotteryStart", value)} /><TimeField label="抽奖截止" value={form.lotteryEnd} onChange={(value) => update("lotteryEnd", value)} />{(["grantCount", "drawLimit", "winLimit", "noWinProbability"] as const).map((key, index) => <NumberField key={key} label={["完成后发放次数", "累计抽奖上限", "累计中奖上限", "未中奖概率（%）"][index]} value={form[key]} onChange={(value) => update(key, value)} />)}<label className="marketing-field"><span>每日上限</span><Switch aria-label="启用每日抽奖上限" checked={form.dailyLimit !== null} onChange={(value) => update("dailyLimit", value ? 1 : null)} /></label>{form.dailyLimit !== null && <NumberField label="每日抽奖上限" value={form.dailyLimit} onChange={(value) => update("dailyLimit", value)} />}</div> : <p className="marketing-field-help">本活动不启用抽奖</p>}</Panel>}
        {!locked && step === 3 && (form.lotteryEnabled ? <PrizeConfiguration activity={form} onChange={setForm} /> : <Empty title="本活动不启用抽奖" description="无需配置奖品与概率。" />)}
        {!locked && draftErrors.length > 0 && <Banner type="warning" title="部分字段需要修正" description={draftErrors.join("；")} closeIcon={null} />}
        {!locked && step === 4 && <PublishChecklist checks={checks} activity={form} onFix={setStep} />}
      </div>
    </div>
  </SideSheet>;
}
