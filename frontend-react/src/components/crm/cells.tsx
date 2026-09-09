import { Avatar, Tooltip } from "@douyinfe/semi-ui";

import { dateTime, relativeDate } from "@/lib/crm";

function initial(name?: string | null) {
  return name?.trim().slice(0, 1).toUpperCase() || "—";
}

export function OwnerCell({ name }: { name?: string | null }) {
  const displayName = name?.trim() || "未分配";
  const unassigned = !name?.trim();

  return (
    <span className={`crm-owner-cell${unassigned ? " is-unassigned" : ""}`}>
      <Avatar
        className="crm-owner-avatar"
        color="grey"
        size="extra-small"
        aria-label={displayName}
      >
        {initial(name)}
      </Avatar>
      <span className="crm-owner-name">{displayName}</span>
    </span>
  );
}

export function RelativeDateCell({
  value,
  emptyLabel = "—",
}: {
  value?: string | null;
  emptyLabel?: string;
}) {
  if (!value || Number.isNaN(Date.parse(value))) {
    return <span className="crm-relative-date-cell is-empty">{emptyLabel}</span>;
  }

  const fullDate = dateTime(value);
  return (
    <Tooltip content={fullDate} position="top" showArrow>
      <time
        className="crm-relative-date-cell"
        dateTime={value}
        tabIndex={0}
        aria-label={fullDate}
      >
        {relativeDate(value)}
      </time>
    </Tooltip>
  );
}

export function RelationCountCell({
  label,
  count,
  href,
}: {
  label: string;
  count?: number | null;
  href?: string;
}) {
  const content = (
    <>
      <strong className="crm-relation-count-value">{count ?? 0}</strong>
      <span className="crm-relation-count-label">{label}</span>
    </>
  );

  return href ? (
    <a className="crm-relation-count-cell is-link" href={href} aria-label={`${count ?? 0} ${label}`}>
      {content}
    </a>
  ) : (
    <span className="crm-relation-count-cell">{content}</span>
  );
}

export function NextActionCell({
  title,
  date,
  overdue = false,
}: {
  title?: string | null;
  date?: string | null;
  overdue?: boolean;
}) {
  return (
    <div className={`crm-next-action-cell${overdue ? " is-overdue" : ""}`}>
      <span className="crm-next-action-title">{title?.trim() || "待安排"}</span>
      <span className="crm-next-action-meta">
        {overdue && date ? <span className="crm-next-action-overdue">逾期</span> : null}
        <RelativeDateCell value={date} emptyLabel="未设置日期" />
      </span>
    </div>
  );
}
