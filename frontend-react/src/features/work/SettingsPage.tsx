import { useState } from "react";
import { Banner, Button, Empty, Modal, Skeleton } from "@douyinfe/semi-ui";
import { PageHeader, SideSection } from "@/components/CrmUi";
import { useCrm } from "@/stores/crm-store";
import { useMemberOperations } from "@/stores/member-operations-store";

export function SettingsPage() {
  const { currentUser, state, reset, isHq } = useCrm();
  const { state: memberState, resetMemberData, recoveryIssue: memberIssue } = useMemberOperations();
  const [lab, setLab] = useState<"normal" | "loading" | "empty" | "error">("normal");
  const [memberResetOpen, setMemberResetOpen] = useState(false);

  return <div className="page">
    <PageHeader title="Prototype Settings" description="分别管理销售与会员运营 Demo 状态、LocalStorage 和交互状态预览。" />
    <div className="settings-grid">
      <SideSection title="Sales Demo Data">
        <p>销售数据使用原有 LocalStorage 键。重置只恢复 Lead、Deal、Organization、Contact 等销售数据。</p>
        {isHq ? <Button type="danger" onClick={() => Modal.confirm({ title: "Reset Sales Demo Data?", content: "此操作会清除当前浏览器中的 Sales Demo 数据并恢复初始数据。会员和营销数据不会受影响。", onOk: () => { reset(); } })}>Reset Sales Demo Data</Button> : <p>仅 HQ 管理员可重置销售演示数据。</p>}
      </SideSection>
      <SideSection title="Member Operations Data">
        {isHq ? <><p>{memberIssue ? "会员数据暂不可读取，数量未知；原始数据已保留。" : `${memberState.customers.length} 个 customer、${memberState.brandUsers.length} 个 brand user、${memberState.userProfiles.length} 个 user_profile、${memberState.purchaseIntents.length} 条 user_purchase_intent，使用独立 LocalStorage。`}</p><Button type="danger" onClick={() => setMemberResetOpen(true)}>Reset Member Demo Data</Button></> : <p>仅 HQ 管理员可查看和重置会员演示数据。</p>}
      </SideSection>
      <SideSection title="Current Demo User">
        <p><strong>{currentUser.name}</strong></p><p>{currentUser.title}</p><p>{state.distributors.find((item) => item.id === currentUser.distributorId)?.name}</p>
      </SideSection>
      <SideSection title="Interaction State Lab">
        <div className="button-row"><Button onClick={() => setLab("loading")}>Loading</Button><Button onClick={() => setLab("empty")}>Empty</Button><Button onClick={() => setLab("error")}>Error Mock</Button><Button onClick={() => setLab("normal")}>Normal</Button></div>
        <div className="state-preview">{lab === "loading" ? <Skeleton placeholder={<><Skeleton.Title /><Skeleton.Paragraph rows={3} /></>} loading active /> : lab === "empty" ? <Empty title="暂无数据" description="通过明确的下一步操作避免空白页面。" /> : lab === "error" ? <Banner type="danger" title="无法加载 Demo 数据" description="这是可恢复的前端错误状态，不会发起失败请求。" closeIcon={null} /> : <Banner type="success" title="Prototype ready" description="Normal、selected、hover、editing、disabled、confirmation 与 success 状态由各业务模块覆盖。" closeIcon={null} />}</div>
      </SideSection>
    </div>
    <Modal visible={memberResetOpen} title="Reset Member Demo Data?" onCancel={() => setMemberResetOpen(false)} onOk={() => { resetMemberData(); setMemberResetOpen(false); }}>
      此操作会清除当前浏览器中的 Member Demo 数据并恢复初始数据。销售和营销数据不会受影响。
    </Modal>
  </div>;
}
