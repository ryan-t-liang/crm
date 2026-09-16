import { useState } from "react";
import { Banner, Button, Empty, Modal, Skeleton } from "@douyinfe/semi-ui";
import { PageHeader, SideSection } from "@/components/CrmUi";
import { useCrm } from "@/stores/crm-store";
import { useMemberOperations } from "@/stores/member-operations-store";

export function SettingsPage() {
  const { currentUser, state, reset } = useCrm();
  const { state: memberState, resetMemberData } = useMemberOperations();
  const [lab, setLab] = useState<"normal" | "loading" | "empty" | "error">("normal");
  const [memberResetOpen, setMemberResetOpen] = useState(false);

  return <div className="page">
    <PageHeader title="Prototype Settings" description="分别管理销售与会员运营 Demo 状态、LocalStorage 和交互状态预览。" />
    <div className="settings-grid">
      <SideSection title="Sales Demo Data">
        <p>销售数据使用原有 LocalStorage 键。重置只恢复 Lead、Deal、Organization、Contact 等销售数据。</p>
        <Button type="danger" onClick={() => Modal.confirm({ title: "Reset Sales Demo Data?", content: "只清除当前浏览器中的销售原型操作；会员数据不会受影响。", onOk: reset })}>Reset Sales Demo Data</Button>
      </SideSection>
      <SideSection title="Member Operations Data">
        <p>{memberState.customers.length} 个 customer、{memberState.brandUsers.length} 个 brand user、{memberState.userProfiles.length} 个 user_profile、{memberState.purchaseIntents.length} 条 user_purchase_intent，使用独立 LocalStorage。</p>
        <Button type="danger" onClick={() => setMemberResetOpen(true)}>Reset Member Demo Data</Button>
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
      只清除会员与品牌运营原型操作；销售数据不会受影响。
    </Modal>
  </div>;
}
