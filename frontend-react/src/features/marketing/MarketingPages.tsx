import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Empty, Modal, Table } from "@douyinfe/semi-ui";
import qrcode from "qrcode-generator";
import { DataList, PageHeader } from "@/components/CrmUi";
import { useCrm } from "@/stores/crm-store";
import { brandLabels, useMemberOperations } from "@/stores/member-operations-store";
import { useMarketing } from "@/stores/marketing-store";
import type { MarketingActivity, MarketingAward, MarketingBooking, MarketingParticipantIdentity, MarketingParticipationChannel } from "@/types/marketing";
import { navigate } from "@/utils/format";
import { parseCreatedAt } from "@/features/dashboard/dashboard-model";
import { awardFulfillmentLabel, bookingLabels, bookingStatus, canViewMarketing, chances, claimLabels, drawBlock, isAwardFulfilled, marketingPermissions, needsReservation, participantChannel, participationChannelLabels, participantDisplayName, participantIdentity, readActivityRule, participationFor, participationIssue, resolveCredential, slotFor, slotOccupancy } from "./marketing-model";
import { MarketingDetail, MarketingList } from "./MarketingAdmin";
import { VirtualAwardContent } from "./MarketingData";
import { ActivityPhases, DefinitionGrid, displayDate, Panel, SelectField, TextField, options, useAction } from "./MarketingUi";

const uid = () => crypto.randomUUID();
const decodeCode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };

export function MarketingPage({ path }: { path: string[] }) {
  const pathKey = path.join("/");
  useEffect(() => { void window.scrollTo(0, 0); }, [pathKey]);
  const { currentUser } = useCrm(), access = marketingPermissions(currentUser);
  const { state, issue, reset } = useMarketing();
  if (!canViewMarketing(access) || !access.brands.length) return <div className="page"><Banner type="warning" title="当前角色无权访问营销活动" description={!access.brands.length ? "当前账号没有可管理的品牌。" : "当前账号没有活动查看权限。"} closeIcon={null} /></div>;
  if (issue) return <div className="page"><Banner type="danger" title={issue} closeIcon={null} /><Button disabled={!access.manage} onClick={() => Modal.confirm({ title: "重置营销数据？", content: "只恢复营销模块，销售、会员数据及历史备份不变；请先备份无法读取的数据。", onOk: reset })}>确认后重置营销数据</Button></div>;
  if (path[0] === "activity" || path[0] === "preview") {
    const activity = state.activities.find((row) => row.id === path[1] && access.brands.includes(row.brand));
    if (!activity) return <div className="page"><Empty title="活动不存在或无权访问" /></div>;
    if (path[0] === "preview" && !access.preview) return <div className="page"><Banner type="warning" title="当前角色无权操作用户流程预览" closeIcon={null} /></div>;
    return path[0] === "preview" ? <MarketingPreview key={`${activity.id}:${path[2] || ""}`} activity={activity} initialUserId={path[2]} /> : <MarketingDetail key={activity.id} activity={activity} requestedTab={path[2]} />;
  }
  return <div className="page marketing-page"><MarketingList migratedEntry={path[0]} /></div>;
}
export function MarketingRedemptionSurface({ code = "" }: { code?: string }) {
  const { currentUser } = useCrm(), { issue } = useMarketing();
  const access = marketingPermissions(currentUser);
  if (!access.redeem || !access.brands.length) return <div className="page"><Banner type="warning" title="当前角色无权访问核销端" closeIcon={null} /></div>;
  if (issue) return <div className="page"><Banner type="danger" title={issue} closeIcon={null} /></div>;
  return <main className="marketing-redemption-surface"><header><strong>KIVISENSE · 独立核销端</strong><span>{currentUser.name}</span>{canViewMarketing(access) && <Button size="small" onClick={() => navigate("marketing")}>返回CRM管理后台</Button>}</header><div className="page-scroll"><RedemptionWorkbench key={code || "input"} initialCode={decodeCode(code)} /></div></main>;
}

function Credential({ code, label }: { code: string; label: string }) { const data = useMemo(() => { const qr = qrcode(0, "M"); qr.addData(code); qr.make(); return qr.createDataURL(4, 16); }, [code]); return <div className="marketing-credential"><img src={data} alt={`${label}二维码`} /><div><strong>{label}</strong><code>{code}</code><small>出示此凭证完成核验。</small><Button size="small" onClick={() => navigate(`redemption/${encodeURIComponent(code)}`)}>模拟扫码 / 输入核验</Button></div></div>; }

function BookingTable({ rows }: { rows: MarketingBooking[] }) {
  const { state } = useMarketing(), { run, feedback } = useAction(); const [change, setChange] = useState<MarketingBooking | null>(null), [target, setTarget] = useState("");
  const activity = state.activities.find((row) => row.id === change?.activityId), slots = change?.kind === "ACTIVITY" ? activity?.slots : activity?.pool.find((item) => item.id === change?.poolItemId)?.slots;
  return <>{feedback}{rows.length ? <Table rowKey="id" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 920 }} columns={[{ title: "预约类型 / 活动", width: 250, render: (_: unknown, row: MarketingBooking) => <span>{row.kind === "ACTIVITY" ? "参加活动" : "中奖履约"} · <a href={`#marketing/activity/${row.activityId}`}>{state.activities.find((activity) => activity.id === row.activityId)?.name}</a></span> }, { title: "参与主体", dataIndex: "participationId", width: 210 }, { title: "场次", width: 200, render: (_: unknown, row: MarketingBooking) => `${slotFor(state, row)?.label || "场次待核对"} · ${displayDate(slotFor(state, row)?.startAt)}` }, { title: "当前状态", width: 100, render: (_: unknown, row: MarketingBooking) => bookingLabels[bookingStatus(row, slotFor(state, row), Date.now())] }, { title: "操作", width: 160, fixed: "right", render: (_: unknown, row: MarketingBooking) => <div className="button-row"><Button size="small" disabled={row.status !== "BOOKED"} onClick={() => { setChange(row); setTarget(row.slotId); }}>改约</Button><Button size="small" disabled={row.status !== "BOOKED"} onClick={() => run({ type: "CANCEL_BOOKING", bookingId: row.id })}>取消预约</Button></div> }]} /> : <Empty title="暂无当前范围预约" description="预约后可查看时间与状态。" />}{change && <Modal visible title="改约（失败保留原预约）" onCancel={() => setChange(null)} onOk={() => { if (run({ type: "RESCHEDULE", bookingId: change.id, slotId: target }).ok) setChange(null); }}>{feedback}<SelectField label="目标场次" value={target} list={(slots || []).map((slot) => ({ value: slot.id, label: `${slot.label} · ${displayDate(slot.startAt)}` }))} onChange={setTarget} /></Modal>}</>;
}

type IdentityScene = "MEMBER" | "WX_FULL" | "WX_OPEN" | "PHONE" | "ANONYMOUS";
const identityScenes = [{ value: "WX_FULL", label: "微信完整身份" }, { value: "WX_OPEN", label: "微信 OpenID" }, { value: "PHONE", label: "手机号 H5" }, { value: "ANONYMOUS", label: "匿名 H5" }, { value: "MEMBER", label: "已有会员" }];
function MarketingPreview({ activity, initialUserId }: { activity: MarketingActivity; initialUserId?: string }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), { state: members } = useMemberOperations(), { run, feedback } = useAction();
  const users = members.brandUsers.filter((row) => row.brand === activity.brand && row.is_deleted === 0 && marketingPermissions(currentUser).brands.includes(row.brand));
  const pointer = initialUserId?.startsWith("p:") ? initialUserId.slice(2) : "";
  const saved = pointer ? state.participations.find((row) => row.id === pointer && row.activityId === activity.id) : undefined;
  const savedIdentity = saved ? participantIdentity(saved, members) : undefined;
  const initialScene = initialUserId?.startsWith("scene:") ? initialUserId.slice(6) : savedIdentity ? savedIdentity.memberId ? savedIdentity.unionId && savedIdentity.wechatAppId ? "WX_FULL" : "MEMBER" : savedIdentity.openId ? "WX_OPEN" : savedIdentity.phone ? "PHONE" : "ANONYMOUS" : users.length ? "MEMBER" : "ANONYMOUS";
  const scene: IdentityScene = identityScenes.some((option) => option.value === initialScene) ? initialScene as IdentityScene : "ANONYMOUS";
  const [userId, setUserId] = useState(savedIdentity?.memberId || (initialUserId && !initialUserId.includes(":") ? initialUserId : users[0]?.id) || "");
  const [participantId] = useState(saved?.participantId || saved?.id || uid());
  const [phone, setPhone] = useState(savedIdentity?.phone || "13800008888"), [country, setCountry] = useState(savedIdentity?.phoneCountryCode || "86");
  const [slotId, setSlotId] = useState(activity.slots[0]?.id || ""), [prizeSlots, setPrizeSlots] = useState<Record<string, string>>({}), [drawing, setDrawing] = useState(false);
  const memberScene = scene === "MEMBER" || scene === "WX_FULL", selectedUser = users.find((user) => user.id === userId);
  const memberResult = memberScene && userId ? participationFor(state, activity, members, userId) : undefined;
  const row = saved || memberResult?.participation || state.participations.find((row) => row.activityId === activity.id && row.participantId === participantId);
  const identity: MarketingParticipantIdentity = scene === "MEMBER" ? { memberId: userId || null } : scene === "WX_FULL" ? { memberId: selectedUser?.id || null, unionId: selectedUser?.unionid || "demo-union-" + participantId, openId: selectedUser?.openid || "demo-open-" + participantId, wechatAppId: "demo-kivisense-" + activity.brand, phone, phoneCountryCode: country, displayName: "微信参与者" } : scene === "WX_OPEN" ? { openId: savedIdentity?.openId || "demo-open-" + participantId, wechatAppId: savedIdentity?.wechatAppId || "demo-kivisense-" + activity.brand, displayName: "微信参与者" } : scene === "PHONE" ? { phone: phone || null, phoneCountryCode: country || null, displayName: "H5 参与者" } : { anonymousId: savedIdentity?.anonymousId || "anon-" + participantId };
  const [channel, setChannel] = useState<MarketingParticipationChannel>(saved ? participantChannel(saved) : scene.startsWith("WX") ? "WECHAT_MINIPROGRAM" : scene === "MEMBER" ? "OTHER" : "WEB_H5");
  const ctx = { actor: currentUser, members, now: Date.now() }, identityError = memberResult?.error || (scene === "MEMBER" && !selectedUser ? "请选择可用会员，或切换其他身份场景。" : "");
  const reason = identityError || drawBlock(state, activity, row, ctx), balance = row ? chances(state, row) : { earned: 0, used: 0, remaining: 0 };
  const draws = state.draws.filter((draw) => draw.participationId === row?.id), last = draws.at(-1), awards = state.awards.filter((award) => award.participationId === row?.id), bookings = state.bookings.filter((booking) => booking.participationId === row?.id);
  if (pointer && !saved) return <div className="page"><Empty title="参与记录不存在或无权访问" /></div>;
  return <div className="page marketing-preview"><Button theme="borderless" onClick={() => navigate("marketing/activity/" + activity.id)}>返回活动后台</Button><PageHeader title="用户流程预览" description={activity.name + " · " + brandLabels[activity.brand]} />
    <div className="marketing-toolbar">{state.participations.some((item) => item.activityId === activity.id) && <SelectField label="预览参与记录" value={row?.id || ""} list={state.participations.filter((item) => item.activityId === activity.id).map((item) => ({ value: item.id, label: participantDisplayName(item, members) + " · " + item.id.slice(-6) }))} onChange={(value) => navigate("marketing/preview/" + activity.id + "/p:" + value)} />}<SelectField label="身份演示场景" value={scene} list={identityScenes} onChange={(value) => navigate("marketing/preview/" + activity.id + "/scene:" + value)} />
      {memberScene && users.length > 0 && <SelectField label="预览现有品牌用户" value={userId} onChange={(value) => { setUserId(value); if (pointer) navigate("marketing/preview/" + activity.id + "/" + value); }} list={users.map((user) => ({ value: user.id, label: user.id }))} />}
      <SelectField label="参与渠道" value={channel} disabled={Boolean(row)} list={options(participationChannelLabels)} onChange={(value) => setChannel(value as MarketingParticipationChannel)} />
      {(scene === "PHONE" || scene === "WX_FULL") && <><TextField label="参与手机号" value={phone} onChange={setPhone} /><TextField label="参与国家码" value={country} onChange={setCountry} /></>}
    </div>{feedback}{identityError && <Banner type="warning" title={identityError} closeIcon={null} />}
    <Panel title="参加活动"><ActivityPhases activity={activity} /><p>{activity.description}</p>{readActivityRule(activity) && <details className="marketing-rule"><summary>活动规则</summary><p>{readActivityRule(activity)}</p></details>}
      <DefinitionGrid rows={[["参与方式", activity.bookingEnabled ? "预约参与" : "直接参与"], ["会员状态", participantIdentity(row || { id: "", activityId: activity.id, identities: [], subjectKey: "", credential: "", registeredAt: "", ruleVersion: 0, identity }, members).memberId ? "已关联会员" : "未关联会员"]]} />
      {activity.bookingEnabled && <SelectField label="参加活动场次" value={slotId} onChange={setSlotId} list={activity.slots.map((slot) => ({ value: slot.id, label: slot.label + " · " + displayDate(slot.startAt) + " · 剩余 " + Math.max(0, slot.capacity - slotOccupancy(state, activity.id, "ACTIVITY", slot.id)) }))} />}
      <Button theme="solid" disabled={activity.status !== "PUBLISHED" || Boolean(identityError)} onClick={() => { const result = run({ type: "REGISTER", activityId: activity.id, userId: memberScene && selectedUser ? selectedUser.id : undefined, participantId: row?.participantId || row?.id || participantId, identity, participationChannel: channel, slotId: activity.bookingEnabled ? slotId : undefined }); if (result.ok && result.resultId) navigate("marketing/preview/" + activity.id + "/p:" + result.resultId); }}>{activity.bookingEnabled ? "预约参加" : "直接报名参加"}</Button>
      {row && <><p>参与状态：{row.completedAt ? "已完成" : row.checkedInAt ? "已签到 / 参与中" : "已报名 / 待到场"}</p><Credential code={row.credential} label="活动凭证（签到 / 完成）" /></>}
    </Panel>
    {activity.bookingEnabled || bookings.length > 0 ? <Panel title="我的预约"><BookingTable rows={bookings} /></Panel> : null}
    {activity.lotteryEnabled && <Panel title="完成后抽奖"><DefinitionGrid rows={[["累计获得", balance.earned], ["已使用", balance.used], ["剩余", balance.remaining], ["活动抽奖上限", activity.drawLimit], ["当前状态", reason || "可抽奖"]]} />
      <div className="button-row"><Button theme="solid" loading={drawing} disabled={Boolean(reason) || drawing} onClick={async () => { setDrawing(true); await Promise.resolve(); run({ type: "DRAW", activityId: activity.id, participationId: row?.id, operationId: uid() }); setDrawing(false); }}>即时抽奖</Button>{last && <Button onClick={() => run({ type: "DRAW", activityId: activity.id, participationId: row?.id, operationId: last.operationId })}>重试上次请求（返回原结果）</Button>}</div>
      {last && <p className="marketing-draw-result" role="status">最近已保存结果：{last.poolItemId ? state.awards.find((award) => award.drawId === last.id)?.prizeName : "未中奖"} · 结果ID {last.id}</p>}
    </Panel>}
    {activity.lotteryEnabled && <Panel title="我的奖品">{awards.length ? awards.map((award) => { const item = activity.pool.find((pool) => pool.id === award.poolItemId), active = bookings.find((booking) => booking.awardId === award.id && ["BOOKED", "FULFILLED"].includes(booking.status)); return <section className="marketing-my-award" key={award.id}>
      <h3>{award.prizeName}</h3><p>{needsReservation(award) ? "预约领取" : award.prizeType === "VIRTUAL" ? "直接发放" : "直接领取"} · {awardFulfillmentLabel(state, award, Date.now())}</p><p>{award.instructions} · 截止 {displayDate(award.claimEnd)}</p>
      {needsReservation(award) && !award.fulfilledAt && <><SelectField label={"奖品预约时段 " + award.id} value={prizeSlots[award.id] || item?.slots[0]?.id || ""} onChange={(value) => setPrizeSlots((old) => ({ ...old, [award.id]: value }))} list={(item?.slots || []).map((slot) => ({ value: slot.id, label: slot.label + " · " + displayDate(slot.startAt) + " · 剩余 " + Math.max(0, slot.capacity - slotOccupancy(state, activity.id, "PRIZE", slot.id, item?.id)) }))} /><Button disabled={Boolean(active) || Date.now() >= parseCreatedAt(award.claimEnd)} onClick={() => run({ type: "BOOK_PRIZE", awardId: award.id, slotId: prizeSlots[award.id] || item?.slots[0]?.id || "" })}>预约奖品领取 / 体验</Button></>}
      {(award.prizeType === "PHYSICAL" || needsReservation(award)) && (!needsReservation(award) || active) ? <Credential code={award.credential} label="奖品凭证（具体获奖权益）" /> : null}
      {award.prizeType === "VIRTUAL" && (!needsReservation(award) || award.issuedAt) ? <VirtualAwardContent award={award} /> : null}
      {award.prizeType === "UNKNOWN" && <Banner type="warning" title="待补充奖品类型" closeIcon={null} />}
    </section>; }) : <Empty title="暂无获奖权益" description="中奖后可在这里查看奖品与领取方式。" />}</Panel>}
  </div>;
}

function WalkInPanel({ onRegistered }: { onRegistered: (credential: string) => void }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), { state: members } = useMemberOperations(), { run, feedback } = useAction();
  const access = marketingPermissions(currentUser), activities = state.activities.filter((activity) => access.brands.includes(activity.brand) && activity.allowWalkIn && activity.status === "PUBLISHED");
  const [activityId, setActivityId] = useState(activities[0]?.id || ""), [userId, setUserId] = useState(""), [slotId, setSlotId] = useState("");
  const [identityMode, setIdentityMode] = useState("MEMBER"), [participantId, setParticipantId] = useState(uid);
  const [phone, setPhone] = useState(""), [country, setCountry] = useState("86");
  const activity = activities.find((activity) => activity.id === activityId), users = members.brandUsers.filter((user) => user.brand === activity?.brand && user.is_deleted === 0 && access.brands.includes(user.brand));
  const mode = !users.length && identityMode === "MEMBER" ? "ANONYMOUS" : identityMode;
  const selectedUser = users.some((user) => user.id === userId) ? userId : users[0]?.id || "", selectedSlot = activity?.slots.some((slot) => slot.id === slotId) ? slotId : activity?.slots[0]?.id || "";
  return <Panel title="工作人员现场报名">
    {feedback}{activities.length ? <><div className="marketing-form-grid"><SelectField label="现场报名活动" value={activityId} list={activities.map((activity) => ({ value: activity.id, label: activity.name + " · " + brandLabels[activity.brand] }))} onChange={(value) => { setActivityId(value); setUserId(""); setSlotId(""); setParticipantId(uid()); }} />
      <SelectField label="现场登记身份" value={mode} list={[...(users.length ? [{ value: "MEMBER", label: "已有会员" }] : []), { value: "ANONYMOUS", label: "匿名参与者" }, { value: "PHONE", label: "手机号用户" }]} onChange={(value) => { setIdentityMode(value); setParticipantId(uid()); }} />
      {mode === "MEMBER" && <SelectField label="现场报名品牌用户" value={selectedUser} list={users.map((user) => ({ value: user.id, label: user.id }))} onChange={setUserId} />}
      {mode === "PHONE" && <><TextField label="现场登记手机号" value={phone} onChange={setPhone} /><TextField label="现场登记国家码" value={country} onChange={setCountry} /></>}
      {activity?.bookingEnabled && <SelectField label="现场报名场次" value={selectedSlot} list={activity.slots.filter((slot) => !slot.disabled && !slot.deleted).map((slot) => ({ value: slot.id, label: slot.label + " · " + displayDate(slot.startAt) + " · 剩余" + Math.max(0, slot.capacity - slotOccupancy(state, activity.id, "ACTIVITY", slot.id)) }))} onChange={setSlotId} />}
    </div><div className="button-row"><Button theme="solid" disabled={!access.redeem || !activity} onClick={() => { if (!activity) return; const result = run({ type: "REGISTER", activityId: activity.id, userId: mode === "MEMBER" ? selectedUser : undefined, participantId, identity: mode === "MEMBER" ? { memberId: selectedUser } : mode === "PHONE" ? { phone: phone || null, phoneCountryCode: country || null } : { anonymousId: "staff-" + participantId }, participationChannel: "STAFF", slotId: activity.bookingEnabled ? selectedSlot : undefined, walkIn: true }); const participant = result.state.participations.find((participant) => participant.id === result.resultId); if (result.ok && participant) onRegistered(participant.credential); }}>确认现场报名</Button><Button theme="borderless" onClick={() => { setParticipantId(uid()); setPhone(""); }}>登记下一位</Button></div>
    </> : <Empty title="暂无允许现场报名的已发布活动" />}
  </Panel>;
}
function RedemptionWorkbench({ initialCode = "" }: { initialCode?: string }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), { state: members } = useMemberOperations(), { run, feedback } = useAction(); const [code, setCode] = useState(initialCode), [recognized, setRecognized] = useState(""), [action, setAction] = useState("CHECKIN"), [location, setLocation] = useState(""), [slotId, setSlotId] = useState("");
  const ctx = { actor: currentUser, members, now: Date.now() }, token = recognized ? resolveCredential(state, recognized, ctx) : null;
  const booking = state.bookings.find((row) => token?.award ? row.awardId === token.award.id && row.status === "BOOKED" : row.participationId === token?.participation?.id && row.kind === "ACTIVITY" && ["BOOKED", "CHECKED_IN"].includes(row.status));
  const slot = booking && slotFor(state, booking);
  const recognize = () => { setRecognized(code.trim()); const result = resolveCredential(state, code.trim(), ctx); const matched = state.bookings.find((row) => result.award ? row.awardId === result.award.id && row.status === "BOOKED" : row.participationId === result.participation?.id && row.kind === "ACTIVITY" && ["BOOKED", "CHECKED_IN"].includes(row.status)); const matchedSlot = matched && slotFor(state, matched); setAction(result.award ? "CLAIM" : result.participation?.checkedInAt ? "COMPLETE" : "CHECKIN"); setLocation(matchedSlot?.location ?? result.award?.location ?? result.activity?.location ?? ""); setSlotId(matchedSlot?.id ?? ""); };
  return <div className="marketing-redemption"><PageHeader title="核销端" description="活动签到、完成确认与奖品核销分别执行；先识别再明确确认。" /><div className="marketing-toolbar"><TextField label="凭证码" value={code} onChange={(value) => { setCode(value); setRecognized(""); }} /><Button theme="solid" onClick={recognize}>识别凭证 / 模拟扫码</Button></div>{feedback}{token?.error && <Banner type="warning" title={token.error} closeIcon={null} />}{token?.activity && token.participation && <Panel title="核验后确认" note="请核对凭证、场次和地点后确认。"><DataList rows={[["凭证类型", token.award ? "具体获奖权益" : "活动参与"], ["活动", token.activity.name], ["品牌", brandLabels[token.activity.brand]], ["用户引用", participantDisplayName(token.participation, members)], ["奖品 / 当前状态", token.award ? `${token.award.prizeName} · ${awardFulfillmentLabel(state, token.award, Date.now())}` : token.participation.completedAt ? "已完成" : token.participation.checkedInAt ? "已签到 / 参与中" : "待到场"], ["预约场次", slot ? `${slot.label} · ${displayDate(slot.startAt)} · ${bookingLabels[bookingStatus(booking!, slot, Date.now())]}` : "没有有效预约"], ["允许窗口", slot ? `${displayDate(slot.checkinStart)} 至 ${displayDate(slot.checkinEnd)}` : "按活动 / 奖品有效期"]]} /><div className="marketing-form-grid"><SelectField label="本次核验动作" value={action} onChange={setAction} list={[{ value: "CHECKIN", label: "活动签到（不默认完成）" }, { value: "COMPLETE", label: "工作人员确认完成（不默认领奖）" }, { value: "CLAIM", label: "奖品领取 / 体验核销" }]} /><TextField label="当前核验地点" value={location} onChange={setLocation} /><TextField label="本次场次标识" value={slotId} onChange={setSlotId} /></div><Button theme="solid" onClick={() => Modal.confirm({ title: "确认执行核验？", content: `${options({ CHECKIN: "活动签到", COMPLETE: "完成确认", CLAIM: "奖品核销" }).find((row) => row.value === action)?.label} · ${token.activity!.name} · ${location}，会按当前真实状态验证。`, onOk: () => { run({ type: "VERIFY", credential: recognized, action: action as "CHECKIN" | "COMPLETE" | "CLAIM", location, slotId }); } })}>确认执行所选动作</Button></Panel>}{!recognized && <Empty title="请输入或从用户预览带入凭证码" description="扫描二维码或输入凭证编号后核验。" />}<WalkInPanel onRegistered={(credential) => { setCode(credential); setRecognized(""); }} /></div>;
}

export function MemberMarketingRecords({ userId }: { userId: string }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), { state: members } = useMemberOperations(); const user = members.brandUsers.find((row) => row.id === userId), brands = marketingPermissions(currentUser).brands;
  if (!user || !brands.includes(user.brand) || !canViewMarketing(marketingPermissions(currentUser))) return <Empty title="无权查看营销记录" />;
  const rows = state.participations.filter((row) => { const activity = state.activities.find((item) => item.id === row.activityId); return activity?.brand === user.brand && row.identities.some((ref) => ref.userId === userId); });
  return <Panel title="营销活动">{rows.length ? <Table rowKey="id" dataSource={rows} scroll={{ x: 700 }} columns={[{ title: "活动", render: (_: unknown, row: typeof rows[number]) => <a href={`#marketing/activity/${row.activityId}`}>{state.activities.find((activity) => activity.id === row.activityId)?.name}</a> }, { title: "参与 / 完成", render: (_: unknown, row: typeof rows[number]) => participationIssue(row, members) || (row.completedAt ? "已完成" : row.checkedInAt ? "已签到" : "已报名") }, { title: "预约 / 中奖 / 已履约", render: (_: unknown, row: typeof rows[number]) => `${state.bookings.filter((item) => item.participationId === row.id).length} / ${state.awards.filter((item) => item.participationId === row.id).length} / ${state.awards.filter((item) => item.participationId === row.id && isAwardFulfilled(item)).length}` }, { title: "预览", render: (_: unknown, row: typeof rows[number]) => <a href={`#marketing/preview/${row.activityId}/${userId}`}>查看用户记录</a> }]} /> : <Empty title="此品牌用户暂无营销参与记录" />}</Panel>;
}
