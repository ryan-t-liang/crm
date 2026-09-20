import type { ComponentProps, ReactNode } from "react";
import { Avatar, Button, Empty, SideSheet, Skeleton, Tag, Tooltip, Typography } from "@douyinfe/semi-ui";
import { IconArrowLeft, IconEdit, IconPlus } from "@douyinfe/semi-icons";
import { initials, navigate } from "@/utils/format";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div><div className="page-actions">{actions}</div></header>;
}

type FormSideSheetProps = Omit<ComponentProps<typeof SideSheet>, "width" | "onCancel"> & {
  width?: number;
  onCancel: () => void;
  onOk?: () => void;
  okText?: string;
  cancelText?: string;
  okButtonProps?: ComponentProps<typeof Button>;
};

/** Shared create/edit surface; field validation and persistence remain with each caller. */
export function FormSideSheet({ width = 640, onCancel, onOk, okText = "保存", cancelText = "取消", okButtonProps, footer, ...props }: FormSideSheetProps) {
  return <SideSheet closeOnEsc maskClosable={false} {...props} placement="right" width={Math.min(width, typeof window === "undefined" ? width : window.innerWidth)} onCancel={onCancel}
    footer={<div className="sheet-footer">{footer !== undefined ? footer : <><Button onClick={onCancel}>{cancelText}</Button><Button theme="solid" {...okButtonProps} onClick={onOk}>{okText}</Button></>}</div>} />;
}

export function TableEntity({ name, detail, route }: { name: string; detail?: string; route?: string }) {
  return <div className="table-entity"><Avatar size="small" color="grey">{initials(name)}</Avatar><div>{route ? <a href={`#${route}`}>{name}</a> : <strong>{name}</strong>}{detail && <small>{detail}</small>}</div></div>;
}

const tagColors: Record<string, "green" | "blue" | "amber" | "red" | "grey" | "cyan"> = {
  QUALIFIED: "green", CONVERTED: "blue", WON: "green", LOST: "red", UNQUALIFIED: "grey", NEW: "cyan", CONTACTED: "blue", NURTURING: "amber", DISCOVERY: "cyan", SOLUTION: "blue", QUOTATION: "amber", NEGOTIATION: "amber", ACTIVE: "green", DISABLED: "grey", OPEN: "blue", DONE: "green", CANCELED: "grey",
};
export function StatusTag({ value, label }: { value: string; label: string }) { return <Tag color={tagColors[value] || "grey"} size="small">{label}</Tag>; }

export function LoadingBlock() { return <div className="state-block"><Skeleton placeholder={<><Skeleton.Title /><Skeleton.Paragraph rows={5} /></>} loading active /></div>; }
export function EmptyBlock({ title, description, action }: { title: string; description?: string; action?: () => void }) { return <div className="state-block"><Empty title={title} description={description}>{action && <Button icon={<IconPlus />} onClick={action}>创建记录</Button>}</Empty></div>; }

export function DetailWorkspace({
  eyebrow, title, subtitle, tags, actions, tabs, sidebar, backRoute,
}: {
  eyebrow: string; title: string; subtitle?: string; tags?: ReactNode; actions?: ReactNode; tabs: ReactNode; sidebar?: ReactNode; backRoute: string;
}) {
  return <div className="detail-page">
    <button className="back-link" onClick={() => navigate(backRoute)}><IconArrowLeft />返回列表</button>
    <header className="detail-header">
      <div className="detail-title"><span>{eyebrow}</span><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}<div className="detail-tags">{tags}</div></div>
      <div className="detail-actions">{actions}</div>
    </header>
    <div className={`detail-grid ${sidebar ? "" : "detail-grid-full"}`}><section className="detail-main">{tabs}</section>{sidebar && <aside className="detail-sidebar">{sidebar}</aside>}</div>
  </div>;
}

export function SideSection({ title, children, actions, onEdit, editDisabled = false, editLabel = `编辑${title}` }: {
  title: string; children: ReactNode; actions?: ReactNode; onEdit?: () => void; editDisabled?: boolean; editLabel?: string;
}) {
  return <section className="side-section"><header><Typography.Title heading={6}>{title}</Typography.Title>{actions}{onEdit && <Tooltip content={editLabel}><span><Button theme="borderless" size="small" icon={<IconEdit />} aria-label={editLabel} disabled={editDisabled} onClick={onEdit} /></span></Tooltip>}</header><div>{children}</div></section>;
}

export function DataList({ rows }: { rows: Array<[string, ReactNode]> }) {
  return <dl className="data-list">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>;
}
