import { useState } from "react";
import { Banner, Button, Empty, TextArea, Modal, SideSheet, Steps, Switch, Table } from "@douyinfe/semi-ui";
import { useCrm } from "@/stores/crm-store";
import { brandLabels } from "@/stores/member-operations-store";
import { useMarketing } from "@/stores/marketing-store";
import { createActivityPrize, createMarketingSlot } from "@/mock/marketing-demo-data";
import type { ActivityPrize, MarketingActivity, MarketingSlot } from "@/types/marketing";
import { navigate } from "@/utils/format";
import { claimLabels, codeInventory, draftActivityErrors, marketingPermissions, needsReservation, prizeErrors, prizeTypeLabels, publishChecks, validateActivity, type MarketingPublishCheck } from "./marketing-model";
import { inspectMarketingCodes, parseMarketingCodeRows, type MarketingCodeImportReport } from "./marketing-code-import";
import { CodeManager } from "./MarketingCodes";
import { DemoNote, ImageField, NumberField, options, Panel, SelectField, SlotFields, TextField, TimeField, useAction } from "./MarketingUi";

export function PublishChecklist({ checks, onFix }: { checks: MarketingPublishCheck[]; onFix: (step: number) => void }) {
  return <Panel title="发布检查" note="草稿允许未完成配置；发布须一次通过所有上线条件。点击错误返回对应配置，不依赖逐个Toast排查。">
    <div className="marketing-publish-checks">{checks.map((check) => <section key={check.key}>
      <strong>{check.errors.length ? "×" : "✓"} {check.label}</strong>
      {check.errors.length ? <ul>{check.errors.map((error) => <li key={error}><Button theme="borderless" type="danger" onClick={() => onFix(check.step)}>{error}</Button></li>)}</ul> : <span>检查通过</span>}
    </section>)}</div>
  </Panel>;
}
export function PublishReview({ activity, onClose, onFix }: { activity: MarketingActivity; onClose: () => void; onFix: (step: number) => void }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction();
  const checks = publishChecks(activity, state, access.brands);
  return <Modal visible className="marketing-prize-dialog" title={`发布检查 · ${activity.name}`} width={Math.min(760, window.innerWidth - 20)} onCancel={onClose} footer={<div className="button-row"><Button onClick={onClose}>取消</Button><Button theme="solid" disabled={!access.manage || checks.some((check) => check.errors.length > 0)} onClick={() => { if (run({ type: "STATUS", activityId: activity.id, status: "PUBLISHED" }).ok) onClose(); }}>确认发布活动</Button></div>}>
    {feedback}<PublishChecklist checks={checks} onFix={(step) => { onClose(); onFix(step); }} />
  </Modal>;
}

export function CodeImporter({ onImport }: { onImport: (codes: string[]) => MarketingCodeImportReport | undefined }) {
  const [text, setText] = useState(""), [error, setError] = useState(""), [report, setReport] = useState<MarketingCodeImportReport | null>(null);
  const submit = () => { try { const result = onImport(parseMarketingCodeRows(text)); if (result) { setReport(result); if (result.imported) setText(""); } setError(""); } catch (error) { setReport(null); setError(error instanceof Error ? error.message : "读取失败"); } };
  return <Panel title="批量导入兑换码" note="每行一个兑换码；CSV仅支持一列，可带code或兑换码表头。仅导入有效且唯一的值，重复 / 非法值明确报告，不静默成功。">
    <label className="marketing-field"><span>兑换码文本</span><TextArea aria-label="兑换码文本" value={text} onChange={setText} autosize={{ minRows: 3, maxRows: 7 }} /></label>
    <label className="marketing-field"><span>导入CSV（仅本地读取）</span><input aria-label="兑换码CSV" type="file" accept=".csv,text/csv" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1_000_000) { setError("请选择不超过1MB的一列CSV"); return; } try { setText(await file.text()); setError(""); } catch { setError("文件读取失败，未导入任何兑换码"); } }} /></label>
    {error && <Banner type="warning" title={error} closeIcon={null} />}{report && <><Banner type={report.duplicate || report.invalid ? "warning" : report.imported ? "success" : "warning"} title={`成功导入：${report.imported}，重复：${report.duplicate}，非法：${report.invalid}，忽略空值：${report.ignored}`} closeIcon={null} />{Boolean(report.failures.length) && <details><summary>查看导入失败明细（{report.failures.length}）</summary><Table rowKey="line" dataSource={report.failures} pagination={{ pageSize: 10 }} columns={[{ title: "批次行", dataIndex: "line", width: 70 }, { title: "输入值", dataIndex: "code" }, { title: "原因", dataIndex: "reason" }]} /></details>}</>}<Button size="small" onClick={submit}>确认导入兑换码</Button>
  </Panel>;
}

export function PrizeFields({ prize, onChange }: { prize: ActivityPrize; onChange: (prize: ActivityPrize) => void }) {
  const { state } = useMarketing(); const [viewCodes, setViewCodes] = useState(false);
  const update = <K extends keyof ActivityPrize>(key: K, value: ActivityPrize[K]) => onChange({ ...prize, [key]: value });
  const inventory = codeInventory(prize);
  const changeType = (type: string) => onChange({ ...prize, prizeType: type as ActivityPrize["prizeType"], method: type === "VIRTUAL" ? "REDEMPTION_CODE" : "DIRECT", location: type === "VIRTUAL" ? "" : "演示工作室", slots: [], codes: prize.codes.filter((code) => code.assignedAwardId), voucherName: "", voucherDescription: "", link: "" });
  const changeMethod = (method: string) => onChange({ ...prize, method: method as ActivityPrize["method"], slots: ["PICKUP", "EXPERIENCE"].includes(method) ? prize.slots.length ? prize.slots : [createMarketingSlot(crypto.randomUUID(), prize.claimStart, Math.max(1, prize.quota))] : [] });
  return <>
    <div className="marketing-form-grid">
      <TextField label="奖品名称" value={prize.name} onChange={(value) => update("name", value)} />
      <TextField label="奖项名称" value={prize.label} onChange={(value) => update("label", value)} />
      <TextField label="奖品说明" value={prize.description} onChange={(value) => update("description", value)} />
      <ImageField label="奖品图片" value={prize.image} onChange={(value) => update("image", value)} />
      <SelectField label="奖品类型" value={prize.prizeType} list={options({ PHYSICAL: prizeTypeLabels.PHYSICAL, VIRTUAL: prizeTypeLabels.VIRTUAL })} onChange={changeType} />
      <NumberField label="奖品配置数量" value={prize.quota} onChange={(value) => update("quota", value)} />
      <NumberField label="中奖概率（%）" value={prize.probability} onChange={(value) => update("probability", value)} />
      <NumberField label="每人该奖品最多获得" value={prize.perPersonLimit} onChange={(value) => update("perPersonLimit", value)} />
      <SelectField label={prize.prizeType === "VIRTUAL" ? "虚拟奖品发放方式" : "实体奖品领取方式"} value={prize.method} list={options(prize.prizeType === "VIRTUAL" ? { REDEMPTION_CODE: claimLabels.REDEMPTION_CODE, VIRTUAL_VOUCHER: claimLabels.VIRTUAL_VOUCHER, LINK: claimLabels.LINK } : { DIRECT: claimLabels.DIRECT, PICKUP: claimLabels.PICKUP, EXPERIENCE: claimLabels.EXPERIENCE })} onChange={changeMethod} />
      {prize.prizeType === "PHYSICAL" && <TextField label="奖品领取地点" value={prize.location} onChange={(value) => update("location", value)} />}
      <TextField label="使用 / 领取说明" value={prize.instructions} onChange={(value) => update("instructions", value)} />
      <TimeField label="奖品有效开始" value={prize.claimStart} onChange={(value) => update("claimStart", value)} />
      <TimeField label="奖品有效截止" value={prize.claimEnd} onChange={(value) => update("claimEnd", value)} />
    </div>
    {needsReservation(prize) && <Panel title="奖品履约时段" note="与活动参加场次独立；中奖前会预留未预约赢家的履约承诺，不得超出可履约容量。">
      {prize.slots.map((slot, index) => <details key={slot.id} open={index === 0}><summary>{slot.label}</summary><SlotFields slot={slot} onChange={(next) => update("slots", prize.slots.map((row) => row.id === next.id ? next : row))} /><Button type="danger" size="small" onClick={() => update("slots", prize.slots.filter((row) => row.id !== slot.id))}>删除履约时段</Button></details>)}
      <Button size="small" onClick={() => update("slots", [...prize.slots, createMarketingSlot(crypto.randomUUID(), prize.claimStart)])}>添加履约时段</Button>
    </Panel>}
    {prize.prizeType === "VIRTUAL" && <Banner type="info" description="原型发放方式：内容仅保存在本地中奖权益中，不调用第三方发券、不虚构外部领取或已查看事件。" closeIcon={null} />}
    {prize.prizeType === "VIRTUAL" && prize.method === "REDEMPTION_CODE" && <>
      <p>配置数量 {prize.quota} · 已导入 {inventory.imported} · 已分配 {inventory.assigned} · 剩余 {inventory.remaining}</p>
      <Button size="small" onClick={() => setViewCodes(true)}>查看兑换码</Button>
      <CodeImporter onImport={(rows) => { const existing = state.activities.flatMap((activity) => activity.pool.flatMap((item) => item.codes.map((row) => row.code))).concat(prize.codes.map((row) => row.code)); const { codes, report } = inspectMarketingCodes(rows, existing); if (codes.length) update("codes", [...prize.codes, ...codes.map((code) => ({ code }))]); return report; }} />
      {viewCodes && <CodeManager prize={prize} published={false} remainingQuota={prize.quota} canManage onClose={() => setViewCodes(false)} onDelete={(codes) => { if (prize.codes.some((code) => codes.includes(code.code) && code.assignedAwardId)) return { ok: false, error: "ASSIGNED兑换码永久不能删除或重新分配。" }; update("codes", prize.codes.filter((code) => !codes.includes(code.code))); return { ok: true }; }} />}
    </>}
    {prize.prizeType === "VIRTUAL" && prize.method === "VIRTUAL_VOUCHER" && <div className="marketing-form-grid"><TextField label="虚拟凭证名称" value={prize.voucherName} onChange={(value) => update("voucherName", value)} /><TextField label="虚拟凭证描述" value={prize.voucherDescription} onChange={(value) => update("voucherDescription", value)} /></div>}
    {prize.prizeType === "VIRTUAL" && prize.method === "LINK" && <TextField label="领取链接" value={prize.link} onChange={(value) => update("link", value)} />}
  </>;
}

export function PrizeConfiguration({ activity, onChange }: { activity: MarketingActivity; onChange: (activity: MarketingActivity) => void }) {
  const [editing, setEditing] = useState<ActivityPrize | null>(null), [error, setError] = useState("");
  const savePrize = () => {
    if (!editing) return;
    const errors = prizeErrors(editing, activity, false);
    if (errors.length) { setError(errors.join("；")); return; }
    const old = activity.pool.find((row) => row.id === editing.id);
    onChange({ ...activity, pool: old ? activity.pool.map((row) => row.id === editing.id ? editing : row) : [...activity.pool, editing] }); setEditing(null); setError("");
  };
  return <Panel title="当前活动奖品" note="同名奖品在其他活动也有独立配置、概率和库存。只打开正在编辑的一项。">
    <Table rowKey="id" dataSource={activity.pool} pagination={false} scroll={{ x: 650 }} columns={[
      { title: "奖品 / 奖项", render: (_: unknown, row: ActivityPrize) => `${row.name} · ${row.label}` },
      { title: "类型", render: (_: unknown, row: ActivityPrize) => prizeTypeLabels[row.prizeType] },
      { title: "数量 / 概率", render: (_: unknown, row: ActivityPrize) => `${row.quota} / ${row.probability}%` },
      { title: "操作", render: (_: unknown, row: ActivityPrize) => <div className="button-row"><Button size="small" onClick={() => setEditing(structuredClone(row))}>配置奖品</Button><Button size="small" type="danger" onClick={() => onChange({ ...activity, pool: activity.pool.filter((prize) => prize.id !== row.id) })}>删除奖品</Button></div> },
    ]} />
    <Button size="small" onClick={() => setEditing(createActivityPrize(activity.id, Date.now()))}>添加奖品</Button>
    {editing && <Modal visible className="marketing-prize-dialog" title="配置当前活动奖品" width={Math.min(720, window.innerWidth - 20)} onCancel={() => { setEditing(null); setError(""); }} onOk={savePrize}>{error && <Banner type="warning" title={error} closeIcon={null} />}<PrizeFields prize={editing} onChange={setEditing} /></Modal>}
  </Panel>;
}

export function ActivityEditor({ initial, onClose, initialStep = 0 }: { initial: MarketingActivity; onClose: () => void; initialStep?: number }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), access = marketingPermissions(currentUser), { run, feedback } = useAction();
  const [form, setForm] = useState(initial), [step, setStep] = useState(initialStep), [error, setError] = useState("");
  const locked = Boolean(initial.publishedAt);
  const update = <K extends keyof MarketingActivity>(key: K, value: MarketingActivity[K]) => setForm((old) => ({ ...old, [key]: value }));
  const checks = publishChecks(form, state, access.brands), errors = validateActivity(form, state, access.brands), draftErrors = draftActivityErrors(form);
  const save = (publish: boolean) => {
    if (publish && errors.length) { setError("发布检查未通过，请修正以下配置。"); setStep(4); return; }
    const result = run({ type: "SAVE_ACTIVITY", activity: form }); if (!result.ok) return;
    if (publish && !run({ type: "STATUS", activityId: form.id, status: "PUBLISHED" }).ok) return;
    onClose(); navigate(`marketing/activity/${form.id}`);
  };
  if (!access.manage || !access.brands.includes(initial.brand)) return <SideSheet visible title="无权编辑活动" onCancel={onClose}><Banner type="warning" title="当前账号没有活动管理权限或品牌授权。" closeIcon={null} /></SideSheet>;
  return <SideSheet visible closeOnEsc width={Math.min(780, window.innerWidth - 20)} title={locked ? "编辑活动说明（规则已锁定）" : "新建 / 编辑活动"} onCancel={onClose} footer={<div className="button-row"><Button onClick={onClose}>取消</Button>{!locked && step > 0 && <Button onClick={() => setStep(step - 1)}>上一步</Button>}{!locked && step < 4 && <Button onClick={() => setStep(step + 1)}>下一步</Button>}<Button onClick={() => save(false)}>{locked ? "保存说明" : "保存草稿"}</Button>{!locked && <Button theme="solid" onClick={() => save(true)}>保存并发布</Button>}</div>}>
    <div className="marketing-editor"><DemoNote />{feedback}{error && <Banner type="warning" title={error} closeIcon={null} />}
      {!locked && <Steps size="small" current={step} onChange={setStep}>{["基本信息", "预约设置", "抽奖设置", "奖品设置", "发布检查"].map((title) => <Steps.Step key={title} title={title} />)}</Steps>}
      {(locked || step === 0) && <Panel title="基本信息"><div className="marketing-form-grid">
        <TextField label="活动名称" value={form.name} onChange={(value) => update("name", value)} /><TextField label="活动说明" value={form.description} onChange={(value) => update("description", value)} /><ImageField label="活动封面" value={form.cover} onChange={(value) => update("cover", value)} />
        {!locked && <><SelectField label="所属品牌" value={form.brand} list={access.brands.map((brand) => ({ value: brand, label: brandLabels[brand] }))} onChange={(value) => update("brand", value as MarketingActivity["brand"])} /><SelectField label="活动类型" value={form.mode} list={options({ OFFLINE: "线下活动", ONLINE: "线上活动" })} onChange={(value) => setForm((old) => ({ ...old, mode: value as MarketingActivity["mode"], completion: value === "ONLINE" ? "STAFF" : old.completion }))} />{form.mode === "OFFLINE" && <TextField label="活动地点" value={form.location} onChange={(value) => update("location", value)} />}<TimeField label="活动开始" placeholder="请选择活动开始时间" value={form.startAt} onChange={(value) => update("startAt", value)} /><TimeField label="活动结束" placeholder="请选择活动结束时间" value={form.endAt} onChange={(value) => update("endAt", value)} /><label>开启预约 <Switch aria-label="开启活动预约" checked={form.bookingEnabled} onChange={(value) => update("bookingEnabled", value)} /></label><label>开启抽奖 <Switch aria-label="开启活动抽奖" checked={form.lotteryEnabled} onChange={(value) => update("lotteryEnabled", value)} /></label></>}
      </div></Panel>}
      {locked && <Banner type="info" title="品牌、完成条件、次数、概率、中奖上限与场次锁定" description="规则变化请复制活动。场次安全容量、奖品配额和兑换码通过活动详情的专用操作调整。" closeIcon={null} />}
      {!locked && step === 1 && <Panel title="预约与完成规则"><SelectField label="完成条件" value={form.completion} list={[{ value: "STAFF", label: "工作人员确认完成" }, ...(form.mode === "OFFLINE" ? [{ value: "CHECKIN", label: "签到即完成" }] : [])]} onChange={(value) => update("completion", value as MarketingActivity["completion"])} />
        {form.bookingEnabled ? <><div className="marketing-form-grid"><TimeField label="预约开放" value={form.bookingStart} onChange={(value) => update("bookingStart", value)} /><TimeField label="预约截止" value={form.bookingEnd} onChange={(value) => update("bookingEnd", value)} /><label>允许取消 <Switch aria-label="允许取消预约" checked={form.allowCancel} onChange={(value) => update("allowCancel", value)} /></label><label>允许改约 <Switch aria-label="允许改约" checked={form.allowReschedule} onChange={(value) => update("allowReschedule", value)} /></label><label>允许现场报名 <Switch aria-label="允许现场报名" checked={form.allowWalkIn} onChange={(value) => update("allowWalkIn", value)} /></label></div>
          {form.slots.map((slot: MarketingSlot, index) => <details key={slot.id} open={index === 0}><summary>{slot.label}</summary><SlotFields slot={slot} onChange={(next) => update("slots", form.slots.map((row) => row.id === next.id ? next : row))} /><Button type="danger" size="small" onClick={() => update("slots", form.slots.filter((row) => row.id !== slot.id))}>删除草稿场次</Button></details>)}<Button size="small" onClick={() => update("slots", [...form.slots, createMarketingSlot(crypto.randomUUID(), form.startAt)])}>添加活动场次</Button>
        </> : <Empty title="未开启预约，不配置活动场次" description="完成条件仍然适用；报名不会直接发放抽奖次数。" />}
      </Panel>}
      {!locked && step === 2 && <Panel title="抽奖设置">{form.lotteryEnabled ? <div className="marketing-form-grid"><TimeField label="抽奖开始" value={form.lotteryStart} onChange={(value) => update("lotteryStart", value)} /><TimeField label="抽奖截止" value={form.lotteryEnd} onChange={(value) => update("lotteryEnd", value)} />{(["grantCount", "drawLimit", "winLimit", "noWinProbability"] as const).map((key, index) => <NumberField key={key} label={["首次完成发放次数", "活动累计抽奖上限", "累计中奖上限", "未中奖概率（%）"][index]} value={form[key]} onChange={(value) => update(key, value)} />)}<label>每日上限 <Switch aria-label="启用每日抽奖上限" checked={form.dailyLimit !== null} onChange={(value) => update("dailyLimit", value ? 1 : null)} /></label>{form.dailyLimit !== null && <NumberField label="每日抽奖上限" value={form.dailyLimit} onChange={(value) => update("dailyLimit", value)} />}</div> : <Empty title="未开启抽奖，不配置概率或奖池" />}</Panel>}
      {!locked && step === 3 && (form.lotteryEnabled ? <PrizeConfiguration activity={form} onChange={setForm} /> : <Empty title="未开启抽奖，无需配置奖品" />)}
      {!locked && draftErrors.length > 0 && <Banner type="warning" title="字段存在非法值，保存前请修正" description={draftErrors.join("；")} closeIcon={null} />}
      {!locked && step === 4 && <PublishChecklist checks={checks} onFix={setStep} />}
    </div>
  </SideSheet>;
}
