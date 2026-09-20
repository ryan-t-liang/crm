import { useEffect, useState } from "react";
import { Banner, Button, InputNumber, Modal, Radio, RadioGroup, Select, Switch, Table, Tag } from "@douyinfe/semi-ui";
import { FormSideSheet } from "@/components/CrmUi";
import { useCrm } from "@/stores/crm-store";
import { useMarketing } from "@/stores/marketing-store";
import type { ActivityPrize, MarketingActivity, MarketingSlot, SessionPrize } from "@/types/marketing";
import { parseCreatedAt } from "@/features/dashboard/dashboard-model";
import {
  activityPrizeAllocation,
  codeInventory,
  marketingPermissions,
  lotteryScope,
  prizeQuantityMode,
  sessionPrizeAllocation,
  sessionPrizeConfigurations,
  sessionWonCount,
  slotOccupancy,
} from "./marketing-model";
import { DefinitionGrid, displayDateRange, useAction } from "./MarketingUi";

export type MarketingSessionLifecycle = "UPCOMING" | "ONGOING" | "ENDED";

export function marketingSessionLifecycle(activity: MarketingActivity, session: MarketingSlot, now: number): MarketingSessionLifecycle {
  const startsAt = parseCreatedAt(session.startAt), endsAt = parseCreatedAt(session.endAt), activityEndsAt = parseCreatedAt(activity.endAt);
  if (activity.status === "CANCELED" || session.disabled || session.deleted || Number.isFinite(endsAt) && now >= endsAt || Number.isFinite(activityEndsAt) && now >= activityEndsAt) return "ENDED";
  return Number.isFinite(startsAt) && now >= startsAt ? "ONGOING" : "UPCOMING";
}

export const marketingSessionLifecycleLabels: Record<MarketingSessionLifecycle, string> = {
  UPCOMING: "待开始",
  ONGOING: "进行中",
  ENDED: "已结束",
};

export function sessionPrizeSummary(state: ReturnType<typeof useMarketing>["state"], activity: MarketingActivity, sessionId: string) {
  if (!sessionPrizeConfigurations(activity, sessionId).length) return "待配置";
  const configured = sessionPrizeConfigurations(activity, sessionId).filter((row) => row.enabled);
  if (!configured.length) return "本场奖品全部停用";
  const session = activity.slots.find((row) => row.id === sessionId);
  const ended = session ? marketingSessionLifecycle(activity, session, Date.now()) === "ENDED" : false;
  const knownRemaining = configured.reduce((sum, row) => {
    const item = activity.pool.find((prize) => prize.id === row.prizeId);
    if (!item) return sum;
    const codeRemaining = item.method === "REDEMPTION_CODE" ? codeInventory(item).remaining : Number.POSITIVE_INFINITY;
    if (prizeQuantityMode(item) === "UNLIMITED") return sum + (Number.isFinite(codeRemaining) ? codeRemaining : 0);
    const sessionRemaining = Math.max(0, (row.allocatedQuantity ?? 0) - sessionWonCount(state, activity.id, sessionId, row.prizeId));
    return sum + (ended ? sessionRemaining : Math.min(sessionRemaining, codeRemaining));
  }, 0);
  const hasTrulyUnlimited = configured.some((row) => {
    const item = activity.pool.find((prize) => prize.id === row.prizeId);
    return item ? prizeQuantityMode(item) === "UNLIMITED" && item.method !== "REDEMPTION_CODE" : false;
  });
  if (ended) return `${configured.length}个奖品 · ${knownRemaining ? `未使用${knownRemaining}份已释放` : "历史配置"}`;
  return `${configured.length}个奖品 · ${hasTrulyUnlimited ? "含不限量" : `剩余${knownRemaining}份`}`;
}

function initialSessionPrizes(activity: MarketingActivity, session: MarketingSlot, state: ReturnType<typeof useMarketing>["state"]): SessionPrize[] {
  const existing = sessionPrizeConfigurations(activity, session.id);
  return activity.pool.map((item) => {
    const saved = existing.find((row) => row.prizeId === item.id);
    if (saved) return structuredClone(saved);
    const probability = 0;
    return {
      sessionId: session.id,
      prizeId: item.id,
      enabled: probability > 0,
      probability,
      allocatedQuantity: prizeQuantityMode(item) === "LIMITED" ? sessionWonCount(state, activity.id, session.id, item.id) : undefined,
    };
  });
}

function numberValue(value: number | string | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function SessionPrizeQuantityModal({ activity, session, prize, visible, onClose }: {
  activity: MarketingActivity;
  session: MarketingSlot;
  prize: ActivityPrize;
  visible: boolean;
  onClose: () => void;
}) {
  const { state } = useMarketing(), { run, feedback } = useAction();
  const [direction, setDirection] = useState<"INCREASE" | "DECREASE">("INCREASE"), [count, setCount] = useState(1), [error, setError] = useState("");
  const now = Date.now();
  const currentActivity = state.activities.find((row) => row.id === activity.id) ?? activity;
  const currentPrize = currentActivity.pool.find((row) => row.id === prize.id) ?? prize;
  const allocation = sessionPrizeAllocation(state, currentActivity, session.id, currentPrize, now);
  const activityAllocation = activityPrizeAllocation(state, currentActivity, currentPrize, now);
  const before = allocation.allocated ?? 0, won = allocation.won, remaining = allocation.remaining ?? 0, unallocated = activityAllocation.unallocated ?? 0;
  const after = direction === "INCREASE" ? before + count : before - count;
  const afterRemaining = Math.max(0, after - won);
  const afterAvailable = Math.max(0, direction === "INCREASE" ? unallocated - count : unallocated + count);
  useEffect(() => { if (visible) { setDirection("INCREASE"); setCount(1); setError(""); } }, [visible, prize.id, session.id]);
  const submit = () => {
    if (!Number.isSafeInteger(count) || count < 1) { setError("调整数量须为正整数。"); return; }
    if (direction === "INCREASE" && count > unallocated) { setError(`当前奖品仅剩${unallocated}份活动可分配数量。`); return; }
    if (after < won) { setError(`当前场次已有${won}份中奖记录，本场可发放数量不能低于${won}份。`); return; }
    const result = run({ type: "ADJUST_SESSION_PRIZE_QUANTITY", activityId: activity.id, sessionId: session.id, prizeId: prize.id, direction, count });
    if (result.ok) onClose();
  };
  return <Modal visible={visible} maskClosable={false} title="调整本场可发放数量" width={520} okText="确认调整" cancelText="取消" onCancel={onClose} onOk={submit}>
    {feedback}{error && <Banner type="warning" title={error} closeIcon={null} />}
    <DefinitionGrid rows={[
      ["奖品", prize.name], ["当前分配", before], ["已中奖", won], ["当前剩余", remaining], ["活动可分配", unallocated],
    ]} />
    <div className="marketing-adjust-form">
      <label className="marketing-field"><span>调整方式</span><RadioGroup value={direction} onChange={(event) => setDirection(event.target.value as "INCREASE" | "DECREASE")}><Radio value="INCREASE">增加</Radio><Radio value="DECREASE">减少</Radio></RadioGroup></label>
      <label className="marketing-field"><span>数量</span><InputNumber min={1} precision={0} value={count} onChange={(value) => setCount(numberValue(value))} /></label>
    </div>
    <DefinitionGrid rows={[["调整后分配", after], ["调整后剩余", afterRemaining], ["调整后活动可分配", afterAvailable]]} />
  </Modal>;
}

export function SessionPrizeDrawer({ activity, session, onClose }: { activity: MarketingActivity; session: MarketingSlot; onClose: () => void }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), { run, feedback } = useAction();
  const access = marketingPermissions(currentUser), now = Date.now();
  const currentActivity = state.activities.find((row) => row.id === activity.id) ?? activity;
  const currentSession = currentActivity.slots.find((row) => row.id === session.id) ?? session;
  const [rows, setRows] = useState<SessionPrize[]>(() => initialSessionPrizes(currentActivity, currentSession, state));
  const [sourceSessionId, setSourceSessionId] = useState(""), [copyOpen, setCopyOpen] = useState(false), [adjustPrizeId, setAdjustPrizeId] = useState(""), [localError, setLocalError] = useState("");
  const lifecycle = marketingSessionLifecycle(currentActivity, currentSession, now);
  const readOnly = !access.manage || lifecycle === "ENDED" || lotteryScope(currentActivity) !== "SESSION";
  const sessionHasDraws = state.draws.some((draw) => draw.activityId === currentActivity.id && draw.sessionId === currentSession.id);
  const savedRows = sessionPrizeConfigurations(currentActivity, currentSession.id);
  const probabilityTotal = rows.filter((row) => row.enabled).reduce((sum, row) => sum + row.probability, 0);
  const noWinProbability = Math.max(0, 100 - probabilityTotal);
  const copySources = currentActivity.slots.filter((row) => row.id !== currentSession.id && sessionPrizeConfigurations(currentActivity, row.id).length > 0);
  const copyDisabled = readOnly || lifecycle !== "UPCOMING" || sessionHasDraws;
  const adjustedPrize = currentActivity.pool.find((row) => row.id === adjustPrizeId);
  const titleRange = displayDateRange(currentSession.startAt, currentSession.endAt);

  useEffect(() => {
    setRows(initialSessionPrizes(currentActivity, currentSession, state));
  }, [currentActivity.sessionPrizeConfigVersion, currentActivity.pool, currentSession.id]);

  const update = (prizeId: string, patch: Partial<SessionPrize>) => setRows((current) => current.map((row) => row.prizeId === prizeId ? { ...row, ...patch } : row));
  const toggle = (item: ActivityPrize, enabled: boolean) => {
    const won = sessionWonCount(state, currentActivity.id, currentSession.id, item.id);
    update(item.id, enabled ? { enabled: true, probability: rows.find(row => row.prizeId === item.id)?.probability ?? 0, allocatedQuantity: prizeQuantityMode(item) === "LIMITED" ? Math.max(won, rows.find((row) => row.prizeId === item.id)?.allocatedQuantity ?? 0) : undefined }
      : { enabled: false, probability: 0, allocatedQuantity: prizeQuantityMode(item) === "LIMITED" ? won : undefined });
  };
  const save = () => {
    if (probabilityTotal > 100) { setLocalError(`当前中奖概率合计为${probabilityTotal}%，请调整至100%以内。`); return; }
    const result = run({ type: "SAVE_SESSION_PRIZES", activityId: currentActivity.id, sessionId: currentSession.id, prizes: rows });
    if (result.ok) onClose();
  };
  const copy = () => {
    if (!sourceSessionId) { setLocalError("请选择要复制的来源场次。"); return; }
    const result = run({ type: "COPY_SESSION_PRIZES", activityId: currentActivity.id, sourceSessionId, targetSessionId: currentSession.id });
    if (!result.ok) return;
    const nextActivity = result.state.activities.find((row) => row.id === currentActivity.id);
    if (nextActivity) setRows(initialSessionPrizes(nextActivity, currentSession, result.state));
    setLocalError(""); setCopyOpen(false); setSourceSessionId("");
  };

  return <>
    <FormSideSheet visible={!copyOpen && !adjustedPrize} className="marketing-session-prize-drawer" width={820} title={`${titleRange.compact} · 场次奖品`} onCancel={onClose} onOk={save}
      okText="保存本场奖池" cancelText="取消" okButtonProps={{ disabled: readOnly || probabilityTotal > 100 }} footer={readOnly ? <Button onClick={onClose}>关闭</Button> : undefined}>
      {feedback}{localError && <Banner type="warning" title={localError} closeIcon={null} />}
      {readOnly && <Banner type="info" title={lifecycle === "ENDED" ? "活动或场次已结束，奖品配置只读。" : "当前账号没有活动管理权限。"} closeIcon={null} />}
      <div className="marketing-session-context">
        <strong>{titleRange.compact}</strong>
        <span>{currentSession.location || "—"}</span>
        <span>预约 {slotOccupancy(state, currentActivity.id, "ACTIVITY", currentSession.id)} / {currentSession.capacity}</span>
      </div>
      <div className="marketing-session-toolbar"><Button theme="borderless" disabled={copyDisabled || !copySources.length} onClick={() => setCopyOpen(true)}>从其他场次复制</Button></div>
      <Table rowKey="id" dataSource={currentActivity.pool} pagination={false} empty="暂无可配置奖品" columns={[
        { title: "奖品", width: 170, render: (_: unknown, item: ActivityPrize) => <div className="marketing-summary-cell"><strong>{item.name}</strong><small>{item.label}</small></div> },
        { title: "参与", width: 72, render: (_: unknown, item: ActivityPrize) => { const row = rows.find((entry) => entry.prizeId === item.id)!; return <Switch size="small" checked={row?.enabled ?? false} disabled={readOnly} onChange={(value) => toggle(item, value)} aria-label={`${item.name}参与本场`} />; } },
        { title: "中奖概率", width: 118, render: (_: unknown, item: ActivityPrize) => { const row = rows.find((entry) => entry.prizeId === item.id)!; return readOnly ? `${row?.probability ?? 0}%` : <InputNumber suffix="%" min={0} max={100} value={row?.probability ?? 0} disabled={!row?.enabled} onChange={(value) => update(item.id, { probability: numberValue(value) })} aria-label={`${item.name}中奖概率`} />; } },
        { title: "本场数量", width: 185, render: (_: unknown, item: ActivityPrize) => {
          const row = rows.find((entry) => entry.prizeId === item.id)!;
          const codeRemaining = item.method === "REDEMPTION_CODE" ? codeInventory(item).remaining : Number.POSITIVE_INFINITY;
          if (prizeQuantityMode(item) === "UNLIMITED") return <div className="marketing-summary-cell"><span>{item.method === "REDEMPTION_CODE" ? `可用码 ${codeRemaining}` : "不限量"}</span>{codeRemaining === 0 && <Tag size="small">已发完</Tag>}</div>;
          const won = sessionWonCount(state, currentActivity.id, currentSession.id, item.id), allocated = row?.allocatedQuantity ?? 0;
          const remaining = Math.min(Math.max(0, allocated - won), codeRemaining);
          if (lifecycle === "ENDED") return <div className="marketing-summary-cell"><span>历史分配 {allocated}</span><small>已中奖 {won}</small><small>未使用 {Math.max(0, allocated - won)} · 已释放</small></div>;
          const requiresAdjustment = savedRows.length > 0 && (sessionHasDraws || now >= parseCreatedAt(currentSession.startAt));
          return <div className="marketing-summary-cell">{requiresAdjustment ? <span>分配 {allocated}</span> : <InputNumber min={0} precision={0} value={allocated} disabled={readOnly || !row?.enabled} onChange={(value) => update(item.id, { allocatedQuantity: numberValue(value) })} aria-label={`${item.name}本场分配`} />}<small>已中 {won} · 剩余 {remaining}</small></div>;
        } },
        { title: "活动可分配", width: 108, render: (_: unknown, item: ActivityPrize) => {
          if (prizeQuantityMode(item) === "UNLIMITED") return "不限量";
          const row = rows.find((entry) => entry.prizeId === item.id)!;
          const saved = savedRows.find((entry) => entry.prizeId === item.id);
          const won = sessionWonCount(state, currentActivity.id, currentSession.id, item.id);
          const currentAvailable = activityPrizeAllocation(state, currentActivity, item, now).unallocated ?? 0;
          const savedReserved = lifecycle === "ENDED" || !saved?.enabled ? 0 : Math.max(0, (saved.allocatedQuantity ?? 0) - won);
          const draftReserved = lifecycle === "ENDED" || !row?.enabled ? 0 : Math.max(0, (row?.allocatedQuantity ?? 0) - won);
          return Math.max(0, currentAvailable + savedReserved - draftReserved);
        } },
        { title: "操作", width: 105, render: (_: unknown, item: ActivityPrize) => {
          if (!savedRows.length) return "—";
          const row = rows.find((entry) => entry.prizeId === item.id), saved = savedRows.some((entry) => entry.prizeId === item.id);
          const requiresAdjustment = sessionHasDraws || now >= parseCreatedAt(currentSession.startAt);
          return prizeQuantityMode(item) === "LIMITED" && requiresAdjustment && lifecycle !== "ENDED" ? <Button theme="borderless" size="small" disabled={readOnly || !row?.enabled || !saved} onClick={() => setAdjustPrizeId(item.id)}>{saved ? "调整数量" : "保存后调整"}</Button> : "—";
        } },
      ]} />
      <div className="marketing-probability-summary"><span>中奖概率合计：<strong>{probabilityTotal}%</strong></span><span>未中奖概率：<strong>{noWinProbability}%</strong></span></div>
      {probabilityTotal > 100 && <Banner type="warning" title={`当前中奖概率合计为${probabilityTotal}%，请调整至100%以内。`} closeIcon={null} />}
    </FormSideSheet>
    <Modal visible={copyOpen} maskClosable={false} title="从其他场次复制" width={460} okText="复制配置" cancelText="取消" okButtonProps={{ disabled: !sourceSessionId }} onCancel={() => { setCopyOpen(false); setSourceSessionId(""); setLocalError(""); }} onOk={copy}>
      {feedback}{localError && <Banner type="warning" title={localError} closeIcon={null} />}
      <label className="marketing-field"><span>选择来源场次</span><Select aria-label="复制场次配置" placeholder="选择其它场次" value={sourceSessionId || undefined} optionList={copySources.map((row) => ({ value: row.id, label: `${row.label} · ${displayDateRange(row.startAt, row.endAt).compact}` }))} onChange={(value) => { setSourceSessionId(String(value)); setLocalError(""); }} /></label>
    </Modal>
    {adjustedPrize && <SessionPrizeQuantityModal activity={currentActivity} session={currentSession} prize={adjustedPrize} visible onClose={() => setAdjustPrizeId("")} />}
  </>;
}
