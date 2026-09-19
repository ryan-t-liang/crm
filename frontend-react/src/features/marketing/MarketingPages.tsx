import { useEffect, useState } from "react";
import { Banner, Button, Empty, Modal, Table } from "@douyinfe/semi-ui";
import { DataList, PageHeader } from "@/components/CrmUi";
import { useCrm } from "@/stores/crm-store";
import { brandLabels, useMemberOperations } from "@/stores/member-operations-store";
import { useMarketing } from "@/stores/marketing-store";
import { navigate } from "@/utils/format";
import { bookingStatus, canViewMarketing, isAwardFulfilled, marketingPermissions, participantDisplayName, participationIssue, resolveCredential, slotFor, slotOccupancy } from "./marketing-model";
import { MarketingDetail, MarketingList } from "./MarketingAdmin";
import { displayDate, displayAwardStatus as awardFulfillmentLabel, displayBookingLabels as bookingLabels, Panel, SelectField, TextField, options, useAction } from "./MarketingUi";

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
    return <MarketingDetail key={activity.id} activity={activity} requestedTab={path[0] === "activity" ? path[2] : undefined} requestedSecondaryTab={path[0] === "activity" ? path[3] : undefined} />;
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
  return <div className="marketing-redemption"><PageHeader title="核销端" description="活动签到、完成确认与奖品核销分别执行；先识别再明确确认。" /><div className="marketing-toolbar"><TextField label="凭证码" value={code} onChange={(value) => { setCode(value); setRecognized(""); }} /><Button theme="solid" onClick={recognize}>识别凭证 / 模拟扫码</Button></div>{feedback}{token?.error && <Banner type="warning" title={token.error} closeIcon={null} />}{token?.activity && token.participation && <Panel title="核验后确认" note="请核对凭证、场次和地点后确认。"><DataList rows={[["凭证类型", token.award ? "具体获奖权益" : "活动参与"], ["活动", token.activity.name], ["品牌", brandLabels[token.activity.brand]], ["用户引用", participantDisplayName(token.participation, members)], ["奖品 / 当前状态", token.award ? `${token.award.prizeName} · ${awardFulfillmentLabel(state, token.award, Date.now())}` : token.participation.completedAt ? "已完成" : token.participation.checkedInAt ? "已签到 / 参与中" : "待到场"], ["预约场次", slot ? `${slot.label} · ${displayDate(slot.startAt)} · ${bookingLabels[bookingStatus(booking!, slot, Date.now())]}` : "没有有效预约"], ["允许窗口", slot ? `${displayDate(slot.checkinStart)} 至 ${displayDate(slot.checkinEnd)}` : "按活动 / 奖品有效期"]]} /><div className="marketing-form-grid"><SelectField label="本次核验动作" value={action} onChange={setAction} list={[{ value: "CHECKIN", label: "活动签到（不默认完成）" }, { value: "COMPLETE", label: "工作人员确认完成（不默认领奖）" }, { value: "CLAIM", label: "奖品领取 / 体验核销" }]} /><TextField label="当前核验地点" value={location} onChange={setLocation} /><TextField label="本次场次标识" value={slotId} onChange={setSlotId} /></div><Button theme="solid" onClick={() => Modal.confirm({ title: "确认执行核验？", content: `${options({ CHECKIN: "活动签到", COMPLETE: "完成确认", CLAIM: "奖品核销" }).find((row) => row.value === action)?.label} · ${token.activity!.name} · ${location}，会按当前真实状态验证。`, onOk: () => { run({ type: "VERIFY", credential: recognized, action: action as "CHECKIN" | "COMPLETE" | "CLAIM", location, slotId }); } })}>确认执行所选动作</Button></Panel>}{!recognized && <Empty title="请输入凭证码" description="扫描二维码或输入凭证编号后核验。" />}<WalkInPanel onRegistered={(credential) => { setCode(credential); setRecognized(""); }} /></div>;
}

export function MemberMarketingRecords({ userId }: { userId: string }) {
  const { state } = useMarketing(), { currentUser } = useCrm(), { state: members } = useMemberOperations(); const user = members.brandUsers.find((row) => row.id === userId), brands = marketingPermissions(currentUser).brands;
  if (!user || !brands.includes(user.brand) || !canViewMarketing(marketingPermissions(currentUser))) return <Empty title="无权查看营销记录" />;
  const rows = state.participations.filter((row) => { const activity = state.activities.find((item) => item.id === row.activityId); return activity?.brand === user.brand && row.identities.some((ref) => ref.userId === userId); });
  return <Panel title="营销活动">{rows.length ? <Table rowKey="id" dataSource={rows} scroll={{ x: 700 }} columns={[{ title: "活动", render: (_: unknown, row: typeof rows[number]) => <a href={`#marketing/activity/${row.activityId}`}>{state.activities.find((activity) => activity.id === row.activityId)?.name}</a> }, { title: "参与 / 完成", render: (_: unknown, row: typeof rows[number]) => participationIssue(row, members) || (row.completedAt ? "已完成" : row.checkedInAt ? "已签到" : "已报名") }, { title: "预约 / 中奖 / 已领取或发放", render: (_: unknown, row: typeof rows[number]) => `${state.bookings.filter((item) => item.participationId === row.id).length} / ${state.awards.filter((item) => item.participationId === row.id).length} / ${state.awards.filter((item) => item.participationId === row.id && isAwardFulfilled(item)).length}` }, { title: "参与记录", render: (_: unknown, row: typeof rows[number]) => <a href={`#marketing/activity/${row.activityId}/participants`}>查看参与记录</a> }]} /> : <Empty title="此品牌用户暂无营销参与记录" />}</Panel>;
}
