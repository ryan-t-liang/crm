import { useState } from "react";
import { Banner, Button, Dropdown, Form, TextArea, Modal, Radio, RadioGroup, SideSheet, Switch, Table } from "@douyinfe/semi-ui";
import { IconMore, IconPlus } from "@douyinfe/semi-icons";
import { EmptyBlock } from "@/components/CrmUi";
import { useCrm } from "@/stores/crm-store";
import { brandLabels } from "@/stores/member-operations-store";
import { useMarketing } from "@/stores/marketing-store";
import { createMarketingSlot } from "@/mock/marketing-demo-data";
import type { ActivityPrize, MarketingActivity, MarketingSlot } from "@/types/marketing";
import { navigate } from "@/utils/format";
import { codeInventory, hasActivityBusinessData, marketingPermissions, needsReservation, prizeTypeLabels } from "./marketing-model";
import { inspectMarketingCodes, parseMarketingCodeRows, type MarketingCodeImportReport } from "./marketing-code-import";
import { parseCreatedAt } from "@/features/dashboard/dashboard-model";
import { MarketingRuleEditor } from "./MarketingRuleEditor";
import { CodeManager } from "./MarketingCodes";
import { displayDate, ImageField, NumberField, options, Panel, SelectField, SlotFields, TextField, TimeField, useAction } from "./MarketingUi";

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
    <div className="row-actions"><Button size="small" icon={<IconPlus />} onClick={() => edit()}>添加{prizeId ? "领奖时段" : "活动场次"}</Button></div>
    {slots.length ? <Table size="small" rowKey="id" dataSource={slots} pagination={false} scroll={{ x: 720 }} columns={[
      { title: "日期 / 时间", width: 175, render: (_: unknown, row: MarketingSlot) => <div className="marketing-summary-cell"><strong>{row.label}</strong><span>{displayDate(row.startAt)} — {displayDate(row.endAt)}</span></div> },
      { title: "场地", dataIndex: "location", width: 110 }, { title: "已预约 / 容量", width: 100, render: (_: unknown, row: MarketingSlot) => `${bookings(row)} / ${row.capacity}` },
      { title: "预约截止", width: 145, render: (_: unknown, row: MarketingSlot) => displayDate(row.bookingClosesAt) },
      { title: "签到窗口", width: 180, render: (_: unknown, row: MarketingSlot) => `${displayDate(row.checkinStart)} — ${displayDate(row.checkinEnd)}` },
      { title: "操作", width: 100, fixed: "right", render: (_: unknown, row: MarketingSlot) => <div className="row-actions"><Button size="small" theme="borderless" onClick={() => edit(row)}>编辑</Button><Dropdown trigger="click" position="bottomRight" render={<Dropdown.Menu><Dropdown.Item type="danger" onClick={() => Modal.confirm({ title: `删除${prizeId ? "领奖时段" : "活动场次"}？`, content: `将移除「${row.label}」。`, onOk: () => onChange(slots.filter((slot) => slot.id !== row.id)) })}>删除</Dropdown.Item></Dropdown.Menu>}><Button size="small" theme="borderless" icon={<IconMore />} aria-label={`更多操作 · ${row.label}`} /></Dropdown></div> },
    ]} /> : <EmptyBlock title={`暂无${prizeId ? "领奖时段" : "活动场次"}`} description={prizeId ? "添加可预约的领奖时段与容量。" : "添加活动时间、地点与可预约名额。"} />}
    {editing && <Modal visible centered className="marketing-prize-dialog" title={`${isNew ? "添加" : "编辑"}${prizeId ? "领奖时段" : "活动场次"}`} width={Math.min(640, window.innerWidth - 32)} okText="保存场次" cancelText="取消" onCancel={() => setEditing(null)} onOk={save}><SlotFields slot={editing} onChange={setEditing} /></Modal>}
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
    <div className="form-grid marketing-form-grid">
      <TextField label="奖品名称" value={prize.name} onChange={(value) => update("name", value)} /><TextField label="奖项名称" value={prize.label} onChange={(value) => update("label", value)} />
      <TextField label="奖品说明" value={prize.description} onChange={(value) => update("description", value)} /><ImageField label="奖品图片" value={prize.image} onChange={(value) => update("image", value)} />
      <SelectField label="奖品类型" value={prize.prizeType} list={options({ ...(prize.prizeType === "UNKNOWN" ? { UNKNOWN: "类型待确认" } : {}), PHYSICAL: prizeTypeLabels.PHYSICAL, VIRTUAL: prizeTypeLabels.VIRTUAL })} onChange={changeType} />
      <SelectField label="领取方式" value={fulfillment} list={options(prize.prizeType === "VIRTUAL" ? { DIRECT: "直接发放", RESERVATION: "预约使用" } : { DIRECT: "直接领取", RESERVATION: "预约领取" })} onChange={changeFulfillment} />
      <NumberField label="奖品配置数量" value={prize.quota} onChange={(value) => update("quota", value)} /><NumberField label="中奖概率（%）" value={prize.probability} onChange={(value) => update("probability", value)} />
      <NumberField label="每人该奖品最多获得" value={prize.perPersonLimit} onChange={(value) => update("perPersonLimit", value)} />
      {prize.prizeType === "VIRTUAL" && <SelectField label="虚拟奖品内容" value={prize.method} list={options({ REDEMPTION_CODE: "兑换码", VIRTUAL_VOUCHER: "虚拟权益", LINK: "领取链接" })} onChange={(value) => update("method", value as ActivityPrize["method"])} />}
      {prize.prizeType === "PHYSICAL" && fulfillment === "RESERVATION" && <SelectField label="预约类型" value={prize.method} list={options({ PICKUP: "预约领取", EXPERIENCE: "预约使用" })} onChange={(value) => update("method", value as ActivityPrize["method"])} />}
      {(prize.prizeType === "PHYSICAL" || fulfillment === "RESERVATION") && <TextField label="奖品领取地点" value={prize.location} onChange={(value) => update("location", value)} />}
      <TextField label="使用 / 领取说明" value={prize.instructions} onChange={(value) => update("instructions", value)} /><TimeField label="奖品有效开始" value={prize.claimStart} onChange={(value) => update("claimStart", value)} /><TimeField label="奖品有效截止" value={prize.claimEnd} onChange={(value) => update("claimEnd", value)} />
    </div>
    <p className="marketing-field-help">{fulfillment === "RESERVATION" ? "中奖后需先选择领取时间，再领取或使用奖品。" : prize.prizeType === "VIRTUAL" ? "中奖后直接发放所配置的虚拟权益。" : "中奖后直接生成领奖核销凭证。"}</p>
    {needsReservation(prize) && <SlotConfigurationTable title="领奖时段" slots={prize.slots} parentStart={prize.claimStart} activityId={prize.activityId} prizeId={prize.id} onChange={(slots) => update("slots", slots)} />}
    {prize.prizeType === "VIRTUAL" && prize.method === "REDEMPTION_CODE" && <>
      <p>配置数量 {prize.quota} · 已导入 {inventory.imported} · 已分配 {inventory.assigned} · 剩余 {inventory.remaining}</p><Button size="small" onClick={() => setViewCodes(true)}>查看兑换码</Button>
      <CodeImporter onImport={(rows) => { const existing = state.activities.flatMap((activity) => activity.pool.flatMap((item) => item.codes.map((row) => row.code))).concat(prize.codes.map((row) => row.code)); const { codes, report } = inspectMarketingCodes(rows, existing); if (codes.length) update("codes", [...prize.codes, ...codes.map((code) => ({ code }))]); return report; }} />
      {viewCodes && <CodeManager prize={prize} published={false} remainingQuota={prize.quota} canManage onClose={() => setViewCodes(false)} onDelete={(codes) => { if (prize.codes.some((code) => codes.includes(code.code) && code.assignedAwardId)) return { ok: false, error: "已分配兑换码不能删除或重新分配。" }; update("codes", prize.codes.filter((code) => !codes.includes(code.code))); return { ok: true }; }} />}
    </>}
    {prize.prizeType === "VIRTUAL" && prize.method === "VIRTUAL_VOUCHER" && <div className="form-grid marketing-form-grid"><TextField label="虚拟凭证名称" value={prize.voucherName} onChange={(value) => update("voucherName", value)} /><TextField label="虚拟凭证描述" value={prize.voucherDescription} onChange={(value) => update("voucherDescription", value)} /></div>}
    {prize.prizeType === "VIRTUAL" && prize.method === "LINK" && <TextField label="领取链接" value={prize.link} onChange={(value) => update("link", value)} />}
  </>;
}

export function ActivityEditor({ initial, onClose }: { initial: MarketingActivity; onClose: () => void }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction();
  const [form, setForm] = useState(initial), [error, setError] = useState("");
  const existing = state.activities.some(activity => activity.id === initial.id);
  const locked = Boolean(initial.publishedAt || hasActivityBusinessData(state, initial.id));
  const update = <K extends keyof MarketingActivity>(key: K, value: MarketingActivity[K]) => setForm(old => ({ ...old, [key]: value }));
  const save = () => {
    if (!form.name.trim() || !access.brands.includes(form.brand)) { setError("填写活动名称并选择授权品牌。"); return; }
    if (!Number.isFinite(parseCreatedAt(form.startAt)) || !Number.isFinite(parseCreatedAt(form.endAt)) || parseCreatedAt(form.endAt) <= parseCreatedAt(form.startAt)) { setError("填写有效的开始、结束时间，结束时间须晚于开始时间。"); return; }
    if (form.mode === "OFFLINE" && !form.location.trim()) { setError("填写线下活动场地。"); return; }
    const result = run({ type: "SAVE_ACTIVITY", activity: form, section: "basic" });
    if (!result.ok) return;
    onClose();
    if (!existing) navigate(`marketing/activity/${form.id}`);
  };
  return <Modal visible centered closeOnEsc maskClosable={false} className="marketing-activity-modal" width={Math.min(760, window.innerWidth - 32)} title={existing ? "编辑活动" : "新建活动"} onCancel={onClose}
    okText={existing ? "保存" : "创建活动"} cancelText="取消" onOk={save} okButtonProps={{ disabled: !access.manage || !access.brands.includes(initial.brand) }}>
    <Form className="marketing-editor" onSubmit={save}>{feedback}{error && <Banner type="warning" title={error} closeIcon={null} />}
      <section className="marketing-form-section"><h2>基本信息</h2><div className="form-grid marketing-form-grid">
        <div className="marketing-field-wide"><TextField label="活动名称" value={form.name} onChange={value => update("name", value)} /></div>
        <SelectField label="所属品牌" value={form.brand} disabled={locked} list={access.brands.map(brand => ({ value: brand, label: brandLabels[brand] }))} onChange={value => update("brand", value as MarketingActivity["brand"])} />
        <div className="marketing-field"><span>活动类型</span><RadioGroup aria-label="活动类型" value={form.mode} disabled={locked} onChange={event => setForm(old => ({ ...old, mode: event.target.value, completion: event.target.value === "ONLINE" ? "STAFF" : old.completion }))}><Radio value="ONLINE">线上活动</Radio><Radio value="OFFLINE">线下活动</Radio></RadioGroup></div>
        {form.mode === "OFFLINE" && <div className="marketing-field-wide"><TextField label="场地" value={form.location} disabled={locked} onChange={value => update("location", value)} /></div>}
        <TimeField label="活动开始时间" value={form.startAt} disabled={locked} onChange={value => update("startAt", value)} /><TimeField label="活动结束时间" value={form.endAt} disabled={locked} onChange={value => update("endAt", value)} />
        <div className="marketing-field marketing-field-wide"><span>参与方式</span><RadioGroup className="marketing-mode-options" aria-label="参与方式" value={form.bookingEnabled ? "RESERVATION" : "DIRECT"} disabled={locked} onChange={event => update("bookingEnabled", event.target.value === "RESERVATION")}>
          <Radio value="RESERVATION"><span>预约参与<small>用户需要先预约活动场次。</small></span></Radio><Radio value="DIRECT"><span>直接参与<small>用户无需预约，可直接参加活动。</small></span></Radio>
        </RadioGroup></div>
        <div className="marketing-field marketing-field-wide marketing-switch-field"><span>启用抽奖</span><Switch aria-label="启用抽奖" checked={form.lotteryEnabled} disabled={locked} onChange={value => update("lotteryEnabled", value)} /></div>
      </div></section>
      <section className="marketing-form-section"><MarketingRuleEditor value={form.ruleContent ?? ""} format={form.ruleContentFormat} onChange={html => setForm(old => ({ ...old, ruleContent: html, ruleContentFormat: "html" }))} /></section>
    </Form>
  </Modal>;
}

/** Created objects own their later configuration; these are independent forms, never steps. */
export function ActivityConfigurationEditor({ initial, section, onClose }: { initial: MarketingActivity; section: "booking" | "lottery"; onClose: () => void }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction();
  const [form, setForm] = useState(initial);
  const locked = Boolean(initial.publishedAt || hasActivityBusinessData(state, initial.id));
  const update = <K extends keyof MarketingActivity>(key: K, value: MarketingActivity[K]) => setForm(old => ({ ...old, [key]: value }));
  return <SideSheet visible closeOnEsc className="marketing-configuration-editor" width={Math.min(620, window.innerWidth - 24)} title={section === "booking" ? "预约设置" : "抽奖设置"} onCancel={onClose}
    footer={<div className="sheet-footer"><Button onClick={onClose}>取消</Button><Button theme="solid" disabled={locked || !access.manage || !access.brands.includes(initial.brand)} onClick={() => { if (run({ type: "SAVE_ACTIVITY", activity: form, section }).ok) onClose(); }}>保存</Button></div>}>
    <div className="marketing-editor">{feedback}{section === "booking" ? <>
      <section className="marketing-form-section"><h2>预约规则</h2><div className="form-grid marketing-form-grid">
        <TimeField label="预约开放时间" value={form.bookingStart} onChange={value => update("bookingStart", value)} /><TimeField label="预约截止时间" value={form.bookingEnd} onChange={value => update("bookingEnd", value)} />
        <SelectField label="完成条件" value={form.completion} list={[{ value: "STAFF", label: "工作人员确认完成" }, ...(form.mode === "OFFLINE" ? [{ value: "CHECKIN", label: "签到即完成" }] : [])]} onChange={value => update("completion", value as MarketingActivity["completion"])} />
        {(["allowCancel", "allowReschedule", "allowWalkIn"] as const).map((key, index) => <div className="marketing-field marketing-switch-field" key={key}><span>{["允许取消", "允许改约", "允许现场报名"][index]}</span><Switch aria-label={["允许取消", "允许改约", "允许现场报名"][index]} checked={form[key]} onChange={value => update(key, value)} /></div>)}
      </div></section>
      <SlotConfigurationTable slots={form.slots} parentStart={form.startAt} activityId={form.id} onChange={slots => update("slots", slots)} />
    </> : <section className="marketing-form-section"><h2>抽奖规则</h2><div className="form-grid marketing-form-grid">
      <TimeField label="抽奖开始时间" value={form.lotteryStart} onChange={value => update("lotteryStart", value)} /><TimeField label="抽奖截止时间" value={form.lotteryEnd} onChange={value => update("lotteryEnd", value)} />
      {(["grantCount", "drawLimit", "winLimit", "noWinProbability"] as const).map((key, index) => <NumberField key={key} label={["完成后发放次数", "累计抽奖上限", "累计中奖上限", "未中奖概率（%）"][index]} value={form[key]} onChange={value => update(key, value)} />)}
      <div className="marketing-field marketing-switch-field"><span>启用每日上限</span><Switch aria-label="启用每日抽奖上限" checked={form.dailyLimit !== null} onChange={value => update("dailyLimit", value ? 1 : null)} /></div>
      {form.dailyLimit !== null && <NumberField label="每日抽奖上限" value={form.dailyLimit} onChange={value => update("dailyLimit", value)} />}
    </div></section>}</div>
  </SideSheet>;
}
