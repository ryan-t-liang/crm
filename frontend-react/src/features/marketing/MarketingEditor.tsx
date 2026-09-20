import { useState } from "react";
import { Banner, Button, Form, TextArea, Radio, RadioGroup, Switch, Table } from "@douyinfe/semi-ui";
import { FormSideSheet } from "@/components/CrmUi";
import { createMarketingSlot } from "@/mock/marketing-demo-data";
import { useCrm } from "@/stores/crm-store";
import { brandScopeLabels } from "@/utils/brand-display";
import { useMarketing } from "@/stores/marketing-store";
import type { ActivityPrize, MarketingActivity, MarketingPickupSchedule } from "@/types/marketing";
import { navigate } from "@/utils/format";
import { codeInventory, hasActivityBusinessData, lotteryScope, marketingPermissions, needsReservation, prizeDefaultProbability, prizeQuantityLimit, prizeQuantityMode, prizeTypeLabels, publishChecks } from "./marketing-model";
import { inspectMarketingCodes, parseMarketingCodeRows, type MarketingCodeImportReport } from "./marketing-code-import";
import { parseCreatedAt } from "@/features/dashboard/dashboard-model";
import { MarketingRuleEditor } from "./MarketingRuleEditor";
import { COACH_EVENT_LOCATION, isCoachPrototype, prototypeBrandLabel, prototypeLocationLabel, prototypeMarketingCopy } from "@/utils/prototype-variant";
import { pickupBookings, pickupScheduleForPrize, pickupSchedules, pickupScheduleSummary } from "./marketing-pickup";
import { activityCodes, activityLifecycle, lifecycleLabels } from "./marketing-activity-code";
import { DefinitionGrid, ImageField, NumberField, options, Panel, SelectField, SlotFields, TextField, TimeField, useAction } from "./MarketingUi";

export function CodeImporter({ onImport }: { onImport: (codes: string[]) => MarketingCodeImportReport | undefined }) {
  const [text, setText] = useState(""), [error, setError] = useState(""), [report, setReport] = useState<MarketingCodeImportReport | null>(null);
  const submit = () => { try { const result = onImport(parseMarketingCodeRows(text)); if (result) { setReport(result); if (result.imported) setText(""); } setError(""); } catch (error) { setReport(null); setError(error instanceof Error ? error.message : "读取失败"); } };
  return <Panel title="导入兑换码" note="每行一个兑换码，或上传一列 CSV。重复与无效兑换码不会导入。">
    <label className="marketing-field"><span>兑换码文本</span><TextArea aria-label="兑换码文本" value={text} onChange={setText} autosize={{ minRows: 3, maxRows: 7 }} /></label>
    <label className="marketing-field"><span>上传 CSV</span><input aria-label="兑换码CSV" type="file" accept=".csv,text/csv" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1_000_000) { setError("请选择不超过1MB的一列CSV"); return; } try { setText(await file.text()); setError(""); } catch { setError("文件读取失败，未导入任何兑换码"); } }} /></label>
    {error && <Banner type="warning" title={error} closeIcon={null} />}{report && <><Banner type={report.duplicate || report.invalid ? "warning" : report.imported ? "success" : "warning"} title={`成功导入：${report.imported}，重复：${report.duplicate}，非法：${report.invalid}，忽略空值：${report.ignored}`} closeIcon={null} />{Boolean(report.failures.length) && <details><summary>查看导入失败明细（{report.failures.length}）</summary><Table rowKey="line" size="small" dataSource={report.failures} pagination={{ pageSize: 10 }} columns={[{ title: "批次行", dataIndex: "line", width: 70 }, { title: "输入值", dataIndex: "code" }, { title: "原因", dataIndex: "reason" }]} /></details>}</>}<Button size="small" onClick={submit}>确认导入兑换码</Button>
  </Panel>;
}

export function PrizeFields({ prize, onChange, locked = false, quantityLocked = false, newSchedule, onNewSchedule }: { prize: ActivityPrize; onChange: (prize: ActivityPrize) => void; locked?: boolean; quantityLocked?: boolean; newSchedule?: MarketingPickupSchedule; onNewSchedule?: (schedule: MarketingPickupSchedule | undefined) => void }) {
  const { state } = useMarketing();
  const coachMode = isCoachPrototype();
  const activity = state.activities.find((row) => row.id === prize.activityId);
  const update = <K extends keyof ActivityPrize>(key: K, value: ActivityPrize[K]) => onChange({ ...prize, [key]: value });
  const saved = activity?.pool.find(item => item.id === prize.id);
  const schedules = activity ? pickupSchedules(activity) : [];
  const selectedSchedule = activity && pickupScheduleForPrize(activity, prize);
  const scheduleLocked = Boolean(activity && saved && state.bookings.some(row => row.activityId === activity.id && row.kind === "PRIZE" && row.poolItemId === prize.id));
  const inventory = codeInventory(prize), fulfillment = needsReservation(prize) ? "RESERVATION" : "DIRECT";
  const changeType = (type: string) => {
    const virtual = type === "VIRTUAL";
    const method = virtual ? ["REDEMPTION_CODE", "VIRTUAL_VOUCHER", "LINK"].includes(prize.method) ? prize.method : "REDEMPTION_CODE" : fulfillment === "RESERVATION" ? prize.method === "EXPERIENCE" ? "EXPERIENCE" : "PICKUP" : "DIRECT";
    onChange({ ...prize, prizeType: type as ActivityPrize["prizeType"], method, fulfillmentMode: fulfillment });
  };
  const changeFulfillment = (value: string) => {
    const mode = value as "DIRECT" | "RESERVATION";
    if (mode === "DIRECT") onNewSchedule?.(undefined);
    const method = prize.prizeType === "PHYSICAL" ? mode === "DIRECT" ? "DIRECT" : prize.method === "EXPERIENCE" ? "EXPERIENCE" : "PICKUP" : prize.method;
    const next = { ...prize, method, fulfillmentMode: mode, ...(mode === "RESERVATION" ? { quantityMode: "LIMITED" as const, quantityLimit: prizeQuantityLimit(prize) ?? prize.quota, quota: prizeQuantityLimit(prize) ?? prize.quota } : { pickupScheduleId: undefined }) };
    if (coachMode && mode === "RESERVATION" && activity && onNewSchedule && !selectedSchedule && !newSchedule) {
      const schedule = { id: crypto.randomUUID(), activityId: activity.id, name: `${prize.name || "奖品"}兑奖预约`, location: COACH_EVENT_LOCATION, startAt: prize.claimStart, endAt: prize.claimEnd, slots: [] };
      onNewSchedule(schedule); onChange({ ...next, pickupScheduleId: schedule.id, location: schedule.location }); return;
    }
    onChange(next);
  };
  const changeQuantityMode = (value: string) => {
    const quantityMode = value as "LIMITED" | "UNLIMITED";
    const quantityLimit = quantityMode === "UNLIMITED" ? null : prizeQuantityLimit(prize) ?? Math.max(0, prize.quota);
    onChange({ ...prize, quantityMode, quantityLimit, quota: quantityLimit ?? 0 });
  };
  const changeQuantityLimit = (value: number) => onChange({ ...prize, quantityMode: "LIMITED", quantityLimit: value, quota: value });
  const changeDefaultProbability = (value: number) => onChange({ ...prize, defaultProbability: value, probability: value });
  if (coachMode) return <div className="form-grid marketing-form-grid">
    <div className="marketing-field-wide"><TextField label="奖品名称" value={prize.name} onChange={(value) => update("name", value)} /></div>
    <SelectField disabled={locked} label="奖品类型" value={prize.prizeType} list={options({ ...(prize.prizeType === "UNKNOWN" ? { UNKNOWN: "类型待确认" } : {}), PHYSICAL: prizeTypeLabels.PHYSICAL, VIRTUAL: prizeTypeLabels.VIRTUAL })} onChange={changeType} />
    <SelectField disabled={locked || scheduleLocked} label="领取方式" value={fulfillment} list={options(prize.prizeType === "VIRTUAL" ? { DIRECT: "直接发放", RESERVATION: "预约领取" } : { DIRECT: "直接领取", RESERVATION: "预约领取" })} onChange={changeFulfillment} />
    <NumberField disabled={locked || quantityLocked} label="总库存" value={prizeQuantityLimit(prize) ?? 0} onChange={changeQuantityLimit} />
    <TimeField disabled={locked} label="有效期开始" value={prize.claimStart} onChange={(value) => update("claimStart", value)} />
    <TimeField disabled={locked} label="有效期结束" value={prize.claimEnd} onChange={(value) => update("claimEnd", value)} />
  </div>;
  return <>
    <div className="form-grid marketing-form-grid">
      <TextField label="奖品名称" value={prize.name} onChange={(value) => update("name", value)} /><TextField label="奖项名称" value={prize.label} onChange={(value) => update("label", value)} />
      <TextField label="奖品说明" value={prize.description} onChange={(value) => update("description", value)} /><ImageField label="奖品图片" value={prize.image} onChange={(value) => update("image", value)} />
      <SelectField disabled={locked} label="奖品类型" value={prize.prizeType} list={options({ ...(prize.prizeType === "UNKNOWN" ? { UNKNOWN: "类型待确认" } : {}), PHYSICAL: prizeTypeLabels.PHYSICAL, VIRTUAL: prizeTypeLabels.VIRTUAL })} onChange={changeType} />
      <SelectField disabled={locked || scheduleLocked} label="领取方式" value={fulfillment} list={options(prize.prizeType === "VIRTUAL" ? { DIRECT: "直接发放", RESERVATION: "预约使用" } : { DIRECT: "直接领取", RESERVATION: "预约领取" })} onChange={changeFulfillment} />
      <SelectField disabled={locked || quantityLocked} label="数量模式" value={prizeQuantityMode(prize)} list={options(fulfillment === "RESERVATION" ? { LIMITED: "限量" } : { LIMITED: "限量", UNLIMITED: "不限量" })} onChange={changeQuantityMode} />
      {prizeQuantityMode(prize) === "LIMITED" && <NumberField disabled={locked || quantityLocked} label="可发放数量" value={prizeQuantityLimit(prize) ?? 0} onChange={changeQuantityLimit} />}
      {(!activity || lotteryScope(activity) === "ACTIVITY") && <NumberField label="中奖概率（%）" value={prizeDefaultProbability(prize)} onChange={changeDefaultProbability} />}
      <NumberField label="每人该奖品最多获得" value={prize.perPersonLimit} onChange={(value) => update("perPersonLimit", value)} />
      {prize.prizeType === "VIRTUAL" && <SelectField disabled={locked} label="虚拟奖品内容" value={prize.method} list={options({ REDEMPTION_CODE: "兑换码", VIRTUAL_VOUCHER: "虚拟权益", LINK: "领取链接" })} onChange={(value) => update("method", value as ActivityPrize["method"])} />}
      {prize.prizeType === "PHYSICAL" && fulfillment === "RESERVATION" && <SelectField disabled={locked} label="预约类型" value={prize.method} list={options({ PICKUP: "预约领取", EXPERIENCE: "预约使用" })} onChange={(value) => update("method", value as ActivityPrize["method"])} />}
      {(prize.prizeType === "PHYSICAL" || fulfillment === "RESERVATION") && <TextField disabled={locked || coachMode} label="奖品领取地点" value={coachMode ? COACH_EVENT_LOCATION : prize.location} onChange={(value) => update("location", value)} />}
      <TextField label="使用 / 领取说明" value={prize.instructions} onChange={(value) => update("instructions", value)} /><TimeField disabled={locked} label="奖品有效开始" value={prize.claimStart} onChange={(value) => update("claimStart", value)} /><TimeField disabled={locked} label="奖品有效截止" value={prize.claimEnd} onChange={(value) => update("claimEnd", value)} />
    </div>
    <p className="marketing-field-help">{fulfillment === "RESERVATION" ? "中奖后需先选择领取时间，再领取或使用奖品。" : prize.prizeType === "VIRTUAL" ? "中奖后直接发放所配置的虚拟权益。" : "中奖后直接生成领奖核销凭证。"}</p>
    {needsReservation(prize) && <Panel title="兑奖预约">
      <SelectField label="兑奖预约" disabled={scheduleLocked} value={newSchedule ? "NEW" : selectedSchedule?.id ?? ""} list={[...schedules.map(row => ({ value: row.id, label: row.name })), ...(onNewSchedule ? [{ value: "NEW", label: "新建兑奖预约" }] : [])]} onChange={pickupScheduleId => {
        if (pickupScheduleId === "NEW" && activity && onNewSchedule) {
          const schedule = { id: crypto.randomUUID(), activityId: activity.id, name: `${prize.name || "奖品"}兑奖预约`, location: prize.location || activity.location, startAt: prize.claimStart, endAt: prize.claimEnd, slots: [] };
          onNewSchedule(schedule); onChange({ ...prize, pickupScheduleId: schedule.id, location: schedule.location }); return;
        }
        onNewSchedule?.(undefined);
        const schedule = schedules.find(row => row.id === pickupScheduleId);
        onChange({ ...prize, pickupScheduleId, location: schedule?.location ?? prize.location });
      }} />
      {newSchedule && onNewSchedule && <>
        <div className="form-grid marketing-form-grid"><TextField label="兑奖预约名称" value={newSchedule.name} onChange={name => onNewSchedule({ ...newSchedule, name })} />
          <TextField label="兑奖地点" disabled={coachMode} value={coachMode ? COACH_EVENT_LOCATION : newSchedule.location} onChange={location => { onNewSchedule({ ...newSchedule, location }); onChange({ ...prize, location }); }} />
          <TimeField label="兑奖有效开始" value={newSchedule.startAt} onChange={startAt => onNewSchedule({ ...newSchedule, startAt })} /><TimeField label="兑奖有效截止" value={newSchedule.endAt} onChange={endAt => onNewSchedule({ ...newSchedule, endAt })} />
        </div><h3>兑奖时段</h3>
        {newSchedule.slots.map((slot, index) => <section className="marketing-form-section" key={slot.id}><h4>时段 {index + 1}</h4><div className="form-grid marketing-form-grid">
          <TimeField label="兑奖时段开始" value={slot.startAt} onChange={startAt => onNewSchedule({ ...newSchedule, slots: newSchedule.slots.map(row => row.id === slot.id ? { ...row, startAt, checkinStart: startAt } : row) })} />
          <TimeField label="兑奖时段结束" value={slot.endAt} onChange={endAt => onNewSchedule({ ...newSchedule, slots: newSchedule.slots.map(row => row.id === slot.id ? { ...row, endAt, checkinEnd: endAt, bookingClosesAt: endAt } : row) })} />
          <NumberField label="可预约数量" value={slot.capacity} onChange={capacity => onNewSchedule({ ...newSchedule, slots: newSchedule.slots.map(row => row.id === slot.id ? { ...row, capacity } : row) })} />
        </div><Button theme="borderless" type="danger" onClick={() => onNewSchedule({ ...newSchedule, slots: newSchedule.slots.filter(row => row.id !== slot.id) })}>移除此时段</Button></section>)}
        <Button onClick={() => { const slot = createMarketingSlot(crypto.randomUUID(), newSchedule.startAt, 10); onNewSchedule({ ...newSchedule, slots: [...newSchedule.slots, { ...slot, label: `兑奖时段 ${newSchedule.slots.length + 1}`, location: newSchedule.location, bookingClosesAt: slot.endAt, checkinStart: slot.startAt, checkinEnd: slot.endAt }] }); }}>添加兑奖时段</Button>
      </>}
      {scheduleLocked && <p className="marketing-field-help">已有领奖预约记录，不能更换兑奖预约设置。</p>}
      {selectedSchedule && activity && <><DefinitionGrid rows={[["地点", prototypeLocationLabel(selectedSchedule.location)], ["时段数量", selectedSchedule.slots.length], ["已预约", pickupBookings(state, activity, selectedSchedule.id).filter(row => row.status !== "CANCELED").length]]} />
        {pickupScheduleSummary(state, { ...activity, pool: [...activity.pool.filter(item => item.id !== prize.id), prize] }, selectedSchedule, Date.now()).warning && <Banner type="warning" title={pickupScheduleSummary(state, { ...activity, pool: [...activity.pool.filter(item => item.id !== prize.id), prize] }, selectedSchedule, Date.now()).warning} closeIcon={null} />}
      </>}
    </Panel>}
    {prize.prizeType === "VIRTUAL" && prize.method === "REDEMPTION_CODE" && <>
      <p>{prizeQuantityMode(prize) === "LIMITED" ? `可发放数量 ${prizeQuantityLimit(prize) ?? 0}` : "数量模式 不限量"} · 已导入 {inventory.imported} · 已分配 {inventory.assigned} · 剩余 {inventory.remaining}</p><details><summary>查看兑换码</summary><Table rowKey="code" dataSource={prize.codes} size="small" pagination={{ pageSize: 5 }} columns={[{ title: "兑换码", dataIndex: "code" }, { title: "状态", render: (_: unknown, row: ActivityPrize["codes"][number]) => row.assignedAwardId ? "已分配" : "未分配" }]} /></details>
      <CodeImporter onImport={(rows) => { const existing = state.activities.flatMap((activity) => activity.pool.flatMap((item) => item.codes.map((row) => row.code))).concat(prize.codes.map((row) => row.code)); const { codes, report } = inspectMarketingCodes(rows, existing); if (codes.length) update("codes", [...prize.codes, ...codes.map((code) => ({ code }))]); return report; }} />
    </>}
    {prize.prizeType === "VIRTUAL" && prize.method === "VIRTUAL_VOUCHER" && <div className="form-grid marketing-form-grid"><TextField disabled={locked} label="虚拟凭证名称" value={prize.voucherName} onChange={(value) => update("voucherName", value)} /><TextField disabled={locked} label="虚拟凭证描述" value={prize.voucherDescription} onChange={(value) => update("voucherDescription", value)} /></div>}
    {prize.prizeType === "VIRTUAL" && prize.method === "LINK" && <TextField disabled={locked} label="领取链接" value={prize.link} onChange={(value) => update("link", value)} />}
  </>;
}

export function ActivityEditor({ initial, onClose }: { initial: MarketingActivity; onClose: () => void }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction();
  const [form, setForm] = useState(initial), [error, setError] = useState("");
  const existing = state.activities.some(activity => activity.id === initial.id);
  const coachMode = isCoachPrototype();
  const simpleCreate = coachMode && !existing;
  const activityCode = coachMode ? String(state.activities.findIndex(activity => activity.id === initial.id) + 1) : activityCodes(state).get(initial.id) ?? initial.activityCode ?? "";
  const locked = Boolean(initial.publishedAt || hasActivityBusinessData(state, initial.id));
  const update = <K extends keyof MarketingActivity>(key: K, value: MarketingActivity[K]) => setForm(old => ({ ...old, [key]: value }));
  const save = () => {
    if (!form.name.trim() || !access.brands.includes(form.brand)) { setError("填写活动名称并选择授权品牌。"); return; }
    if (!Number.isFinite(parseCreatedAt(form.startAt)) || !Number.isFinite(parseCreatedAt(form.endAt)) || parseCreatedAt(form.endAt) <= parseCreatedAt(form.startAt)) { setError("填写有效的开始、结束时间，结束时间须晚于开始时间。"); return; }
    if (form.mode === "OFFLINE" && !form.location.trim()) { setError("填写线下活动场地。"); return; }
    const candidate = simpleCreate ? { ...form, bookingEnabled: true, bookingStart: form.startAt, bookingEnd: form.endAt, lotteryEnabled: true, lotteryScope: "SESSION" as const, lotteryStart: form.startAt, lotteryEnd: form.endAt } : form;
    if (!existing) {
      const setupErrors = publishChecks(candidate, state, access.brands).filter(check => check.key === "basic" || (!simpleCreate && check.key === "booking")).flatMap(check => check.errors);
      if (setupErrors.length) { setError(setupErrors.join("；")); return; }
    }
    const result = run({ type: "SAVE_ACTIVITY", activity: candidate, section: "information", publishOnCreate: simpleCreate });
    if (!result.ok) return;
    onClose();
    if (!existing) navigate(`marketing/activity/${form.id}/${simpleCreate ? "sessions" : form.lotteryEnabled ? "prizes" : "bookings"}`);
  };
  return <FormSideSheet visible className={`marketing-activity-editor ${coachMode ? "coach-marketing-sheet" : ""}`} width={820} title={existing ? "活动信息设置" : "新建活动"} onCancel={onClose}
    okText={existing ? "保存" : simpleCreate ? "创建活动" : form.lotteryEnabled ? "创建并设置奖品" : "创建活动"} cancelText="取消" onOk={save} okButtonProps={{ disabled: !access.manage || !access.brands.includes(initial.brand) }}>
    <Form className="marketing-editor" onSubmit={save}>{feedback}{error && <Banner type="warning" title={error} closeIcon={null} />}
      <section className="marketing-form-section"><h2>基本信息</h2><div className="form-grid marketing-form-grid">
        <div className="marketing-field-wide"><TextField label="活动名称" value={coachMode ? prototypeMarketingCopy(form.name) : form.name} onChange={value => update("name", value)} /></div>
        {coachMode && existing && <><TextField label="活动ID" value={activityCode} onChange={() => undefined} disabled /><SelectField label="活动状态" value={form.status === "CANCELED" ? "ENDED" : "ONGOING"} list={options({ ONGOING: lifecycleLabels.ONGOING, ENDED: lifecycleLabels.ENDED })} onChange={() => undefined} disabled /></>}
        {!coachMode && <SelectField label="所属品牌" value={form.brand} disabled={locked} list={access.brands.map(brand => ({ value: brand, label: prototypeBrandLabel(brandScopeLabels[brand]) }))} onChange={value => update("brand", value as MarketingActivity["brand"])} />}
        <div className="marketing-field"><span>活动类型</span><RadioGroup aria-label="活动类型" value={form.mode} onChange={event => setForm(old => ({ ...old, mode: event.target.value, completion: event.target.value === "ONLINE" ? "STAFF" : old.completion }))}><Radio value="ONLINE">线上活动</Radio><Radio value="OFFLINE">线下活动</Radio></RadioGroup></div>
        {form.mode === "OFFLINE" && <div className="marketing-field-wide"><TextField label="场地" disabled={coachMode} value={coachMode ? COACH_EVENT_LOCATION : form.location} onChange={value => update("location", value)} /></div>}
        <TimeField label="活动开始时间" value={form.startAt} onChange={value => setForm(old => ({ ...old, startAt: value, ...(!existing && (!old.lotteryStart || old.lotteryStart === old.startAt) ? { lotteryStart: value } : {}) }))} /><TimeField label="活动结束时间" value={form.endAt} onChange={value => setForm(old => ({ ...old, endAt: value, ...(!existing && (!old.lotteryEnd || old.lotteryEnd === old.endAt) ? { lotteryEnd: value } : {}) }))} />
        {!coachMode && <div className="marketing-field marketing-field-wide"><span>参与方式</span><RadioGroup disabled={hasActivityBusinessData(state, initial.id)} className="marketing-mode-options" aria-label="参与方式" value={form.bookingEnabled ? "RESERVATION" : "DIRECT"} onChange={event => setForm(old => ({ ...old, bookingEnabled: event.target.value === "RESERVATION", ...(!existing && event.target.value === "DIRECT" ? { lotteryScope: "ACTIVITY" as const } : {}) }))}>
          <Radio value="RESERVATION"><span>预约参与<small>用户需要先预约活动场次。</small></span></Radio><Radio value="DIRECT"><span>直接参与<small>用户无需预约，可直接参加活动。</small></span></Radio>
        </RadioGroup></div>}
      </div></section>
      {!coachMode && form.bookingEnabled && <>
        <section className="marketing-form-section"><h2>活动预约</h2><BookingFields form={form} onChange={setForm} /></section>
        <section className="marketing-form-section"><h2>活动场次</h2>
          {form.slots.map((slot, index) => <details key={slot.id} className="marketing-form-section" open={form.slots.length === 1 || undefined}><summary>{slot.label || `场次 ${index + 1}`}</summary><SlotFields slot={slot} onChange={value => update("slots", form.slots.map(row => row.id === slot.id ? value : row))} />
            <Button theme="borderless" type="danger" disabled={state.bookings.some(row => row.activityId === form.id && row.kind === "ACTIVITY" && row.slotId === slot.id) || (form.sessionPrizes ?? []).some(row => row.sessionId === slot.id)} onClick={() => update("slots", form.slots.filter(row => row.id !== slot.id))}>删除此场次</Button>
          </details>)}
          <Button onClick={() => update("slots", [...form.slots, { ...createMarketingSlot(crypto.randomUUID(), form.startAt, 10), label: `场次 ${form.slots.length + 1}`, location: form.location }])}>添加活动场次</Button>
        </section>
      </>}
      {!coachMode && <><section className="marketing-form-section"><h2>抽奖</h2><div className="marketing-field marketing-switch-field"><span>启用抽奖</span><Switch size="small" aria-label="启用抽奖" checked={form.lotteryEnabled} onChange={value => update("lotteryEnabled", value)} /></div>
        {form.lotteryEnabled && <><div className="marketing-field"><span>抽奖方式</span><RadioGroup disabled={existing} aria-label="抽奖方式" value={lotteryScope(form)} onChange={event => update("lotteryScope", event.target.value)}><Radio value="ACTIVITY">按活动抽奖</Radio><Radio value="SESSION" disabled={!form.bookingEnabled}>按场次抽奖</Radio></RadioGroup></div>
          {!existing && <LotteryFields form={form} onChange={setForm} />}</>}
      </section>
      <section className="marketing-form-section"><MarketingRuleEditor value={form.ruleContent ?? ""} format={form.ruleContentFormat} onChange={html => setForm(old => ({ ...old, ruleContent: html, ruleContentFormat: "html" }))} /></section></>}
    </Form>
  </FormSideSheet>;
}

function BookingFields({ form, onChange }: { form: MarketingActivity; onChange: (value: MarketingActivity) => void }) {
  const update = <K extends keyof MarketingActivity>(key: K, value: MarketingActivity[K]) => onChange({ ...form, [key]: value });
  return <div className="form-grid marketing-form-grid">
    <TimeField label="预约开放时间" value={form.bookingStart} onChange={value => update("bookingStart", value)} /><TimeField label="预约截止时间" value={form.bookingEnd} onChange={value => update("bookingEnd", value)} />
    <SelectField label="完成条件" value={form.completion} list={[{ value: "STAFF", label: "工作人员确认完成" }, ...(form.mode === "OFFLINE" ? [{ value: "CHECKIN", label: "签到即完成" }] : [])]} onChange={value => update("completion", value as MarketingActivity["completion"])} />
    {(["allowCancel", "allowReschedule", "allowWalkIn"] as const).map((key, index) => <div className="marketing-field marketing-switch-field" key={key}><span>{["允许取消", "允许改约", "允许现场报名"][index]}</span><Switch size="small" aria-label={["允许取消", "允许改约", "允许现场报名"][index]} checked={form[key]} onChange={value => update(key, value)} /></div>)}
  </div>;
}

function LotteryFields({ form, onChange }: { form: MarketingActivity; onChange: (value: MarketingActivity) => void }) {
  const update = <K extends keyof MarketingActivity>(key: K, value: MarketingActivity[K]) => onChange({ ...form, [key]: value });
  return <div className="form-grid marketing-form-grid">
    <TimeField label="抽奖开始时间" value={form.lotteryStart} onChange={value => update("lotteryStart", value)} /><TimeField label="抽奖截止时间" value={form.lotteryEnd} onChange={value => update("lotteryEnd", value)} />
    {(["grantCount", "drawLimit", "winLimit"] as const).map((key, index) => <NumberField key={key} label={["完成后发放次数", "累计抽奖上限", "累计中奖上限"][index]} value={form[key]} onChange={value => update(key, value)} />)}
    <div className="marketing-field marketing-switch-field"><span>启用每日上限</span><Switch size="small" aria-label="启用每日抽奖上限" checked={form.dailyLimit !== null} onChange={value => update("dailyLimit", value ? 1 : null)} /></div>
    {form.dailyLimit !== null && <NumberField label="每日抽奖上限" value={form.dailyLimit} onChange={value => update("dailyLimit", value)} />}
  </div>;
}

export function ActivityConfigurationEditor({ initial, section, onClose }: { initial: MarketingActivity; section: "lottery"; onClose: () => void }) {
  const { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction();
  const [form, setForm] = useState(initial);
  const probabilityTotal = form.pool.reduce((sum, item) => sum + prizeDefaultProbability(item), 0), noWinProbability = Math.max(0, 100 - probabilityTotal);
  return <FormSideSheet visible width={620} title="抽奖设置" onCancel={onClose} okButtonProps={{ disabled: !access.manage || !access.brands.includes(initial.brand) }} onOk={() => { if (run({ type: "SAVE_ACTIVITY", activity: { ...form, noWinProbability }, section }).ok) onClose(); }}>
    <div className="marketing-editor">{feedback}<section className="marketing-form-section"><DefinitionGrid rows={[["抽奖方式", lotteryScope(form) === "ACTIVITY" ? "按活动抽奖" : "按场次抽奖"]]} /><LotteryFields form={form} onChange={setForm} /></section>
    {lotteryScope(form) === "ACTIVITY" && <DefinitionGrid rows={[["中奖概率合计", probabilityTotal + "%"], ["未中奖概率", noWinProbability + "%"]]} />}</div>
  </FormSideSheet>;
}
