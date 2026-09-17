import { useState } from "react";
import { Banner, Button, Empty, Modal, SideSheet, Table } from "@douyinfe/semi-ui";
import type { ActivityPrize, MarketingCode } from "@/types/marketing";
import { useMarketing } from "@/stores/marketing-store";
import { useMemberOperations } from "@/stores/member-operations-store";
import { displayDate, memberName } from "./MarketingUi";

/** Full codes are deliberately restricted to this management drawer and award detail. */
export function CodeManager({ prize, published, remainingQuota, canManage, onDelete, onClose }: {
  prize: ActivityPrize; published: boolean; remainingQuota: number; canManage: boolean;
  onDelete: (codes: string[]) => { ok: boolean; error?: string }; onClose: () => void;
}) {
  const { state } = useMarketing(), { state: members } = useMemberOperations();
  const [message, setMessage] = useState("");
  const available = prize.codes.filter((code) => !code.assignedAwardId);
  const remove = (codes: string[]) => Modal.confirm({
    title: codes.length === 1 ? "删除未分配兑换码？" : "清空未分配兑换码？",
    content: `仅删除 ${codes.length} 个未分配兑换码；已分配代码与历史权益不会删除。${published ? `当前剩余奖品配额为 ${remainingQuota}，不足时会阻止删除。` : "草稿可重新导入。"}`,
    onOk: () => { const result = onDelete(codes); setMessage(result.ok ? "" : result.error || "删除未完成，请核对兑换码与奖品配额。"); },
  });
  return <SideSheet visible closeOnEsc title={`兑换码管理 · ${prize.name}`} width={Math.min(780, window.innerWidth - 20)} onCancel={onClose}>
    <p>未分配兑换码可按规则删除；已分配兑换码永久不可删除或再次分配。完整兑换码仅在必要管理页面展示。</p>
    {published && <p>已发布活动：删除后有效未分配兑换码须覆盖剩余奖品配额 {remainingQuota}；可通过“导入兑换码”追加。</p>}
    {message && <Banner type="warning" title={message} closeIcon={null} />}
    <Button type="danger" size="small" disabled={!canManage || !available.length} onClick={() => remove(available.map((row) => row.code))}>清空未分配兑换码</Button>
    {prize.codes.length ? <Table rowKey="code" dataSource={prize.codes} pagination={{ pageSize: 10 }} scroll={{ x: 720 }} columns={[
      { title: "兑换码", width: 220, render: (_: unknown, row: MarketingCode) => <code className="marketing-code-cell">{row.code}</code> },
      { title: "状态", width: 130, render: (_: unknown, row: MarketingCode) => row.assignedAwardId ? "已分配" : "未分配" },
      { title: "分配时间（UTC+08）", width: 160, render: (_: unknown, row: MarketingCode) => displayDate(row.assignedAt) },
      { title: "关联用户", width: 130, render: (_: unknown, row: MarketingCode) => {
        if (!row.assignedAwardId) return "—";
        const award = state.awards.find((award) => award.id === row.assignedAwardId);
        return state.participations.find((participant) => participant.id === award?.participationId)?.identities.map((ref) => memberName(members, ref.userId)).join(" / ") || "关联待核对";
      } },
      { title: "操作", width: 80, fixed: "right", render: (_: unknown, row: MarketingCode) => <Button size="small" type="danger" disabled={!canManage || Boolean(row.assignedAwardId)} onClick={() => remove([row.code])}>删除</Button> },
    ]} /> : <Empty title="暂无兑换码" description="导入后可以查看库存；复制活动不会复制兑换码。" />}
  </SideSheet>;
}
