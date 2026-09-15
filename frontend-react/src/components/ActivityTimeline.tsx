import { Avatar, Empty, Tag } from "@douyinfe/semi-ui";
import { IconCalendarClock, IconComment, IconMail, IconPhone, IconTickCircle } from "@douyinfe/semi-icons";
import { useCrm } from "@/stores/crm-store";
import type { Activity } from "@/types/crm";
import { dateTime, initials } from "@/utils/format";

const iconFor = (type: Activity["type"]) => type === "EMAIL" ? <IconMail /> : type === "CALL" ? <IconPhone /> : type === "COMMENT" ? <IconComment /> : type === "TASK" ? <IconTickCircle /> : <IconCalendarClock />;

export function ActivityTimeline({ entityType, entityId }: { entityType: Activity["entityType"]; entityId: string }) {
  const { state } = useCrm();
  const rows = state.activities.filter((item) => item.entityType === entityType && item.entityId === entityId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!rows.length) return <Empty title="暂无活动" description="邮件、电话、评论、任务和状态变化会统一出现在这里。" />;
  return <div className="activity-timeline">{rows.map((item) => {
    const actor = state.users.find((user) => user.id === item.actorId);
    return <article key={item.id} className="activity-item"><div className="activity-rail"><span>{iconFor(item.type)}</span></div><div className="activity-card"><header><div><Avatar size="extra-small" color={actor?.avatarColor as "green" || "grey"}>{initials(actor?.name || "System")}</Avatar><strong>{actor?.name || "System"}</strong><Tag size="small">{item.type.replace("_", " ")}</Tag></div><time>{dateTime(item.createdAt)}</time></header><h3>{item.title}</h3>{item.detail && <p>{item.detail}</p>}</div></article>;
  })}</div>;
}
