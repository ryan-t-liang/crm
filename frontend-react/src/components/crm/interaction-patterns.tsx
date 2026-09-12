import { Fragment, type ReactNode } from "react";
import {
  Avatar,
  Descriptions,
  Dropdown,
  Empty,
  Form,
  Popover,
  SideSheet,
  Tabs,
  Tag,
  Timeline as SemiTimeline,
  Typography,
} from "@douyinfe/semi-ui";
import {
  IconActivity,
  IconInbox,
  IconMore,
} from "@douyinfe/semi-icons";

import { Button } from "./ui";
import { CRMListLayout } from "./layout";

export function CRMPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="crm-pattern-page-header">
      <div>
        <Typography.Title heading={2}>{title}</Typography.Title>
        {description ? <Typography.Text type="tertiary">{description}</Typography.Text> : null}
      </div>
      {actions ? <div className="crm-pattern-page-actions">{actions}</div> : null}
    </header>
  );
}

export function CRMListPage({
  header,
  metrics,
  children,
}: {
  header: ReactNode;
  metrics?: ReactNode;
  children: ReactNode;
}) {
  return (
    <CRMListLayout header={header} stats={metrics}>
      {children}
    </CRMListLayout>
  );
}

export type CRMActiveFilter = {
  key: string;
  label: string;
  onRemove: () => void;
};

export function CRMFilterBar({
  children,
  activeFilters = [],
  onClear,
}: {
  children: ReactNode;
  activeFilters?: CRMActiveFilter[];
  onClear?: () => void;
}) {
  return (
    <div className="crm-pattern-filter-bar">
      <div className="crm-pattern-filter-controls">{children}</div>
      {activeFilters.length ? (
        <div className="crm-pattern-filter-state" aria-label="已应用筛选条件">
          <span>已应用</span>
          {activeFilters.map((filter) => (
            <Tag
              key={filter.key}
              className="crm-pattern-filter-tag"
              closable
              color="grey"
              onClose={filter.onRemove}
            >
              {filter.label}
            </Tag>
          ))}
          {onClear ? (
            <Button variant="link" size="sm" onClick={onClear}>清除全部</Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CRMEntityCell({
  name,
  secondary,
  href,
}: {
  name: string;
  secondary?: string | null;
  href: string;
}) {
  return (
    <div className="crm-pattern-entity-cell">
      <Avatar size="small" color="grey" aria-label={name}>{name.trim().slice(0, 1) || "—"}</Avatar>
      <div>
        <a href={href}>{name}</a>
        {secondary ? <span>{secondary}</span> : <span className="is-empty">暂无联系方式</span>}
      </div>
    </div>
  );
}

export type CRMActionItem = {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  destructive?: boolean;
  dividerBefore?: boolean;
};

export function CRMActionMenu({
  label,
  items,
  triggerLabel,
}: {
  label: string;
  items: CRMActionItem[];
  triggerLabel?: string;
}) {
  if (!items.length) return null;
  return (
    <Dropdown
      trigger="click"
      position="bottomRight"
      render={(
        <Dropdown.Menu className="crm-pattern-action-menu">
          {items.map((item) => (
            <Fragment key={item.label}>
              {item.dividerBefore ? <Dropdown.Divider /> : null}
              <Dropdown.Item
                type={item.destructive ? "danger" : "tertiary"}
                icon={item.icon}
                onClick={item.onClick}
              >
                {item.label}
              </Dropdown.Item>
            </Fragment>
          ))}
        </Dropdown.Menu>
      )}
    >
      <Button
        variant={triggerLabel ? "outline" : "ghost"}
        size={triggerLabel ? "sm" : "icon"}
        aria-label={`${label}的更多操作`}
      >
        <IconMore />
        {triggerLabel}
      </Button>
    </Dropdown>
  );
}

export function CRMSystemInfoPopover({
  id,
  createdAt,
  updatedAt,
  createdBy,
  updatedBy,
  footer,
}: {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
  footer?: ReactNode;
}) {
  const rows = [
    {
      key: "联系人 ID",
      value: (
        <Typography.Text
          code
          copyable={{ content: id, copyTip: "复制 ID", successTip: "已复制" }}
        >
          {id}
        </Typography.Text>
      ),
    },
    ...(createdAt ? [{ key: "创建时间", value: createdAt }] : []),
    ...(updatedAt ? [{ key: "更新时间", value: updatedAt }] : []),
    ...(createdBy ? [{ key: "创建人", value: createdBy }] : []),
    ...(updatedBy ? [{ key: "最后更新人", value: updatedBy }] : []),
  ];
  return (
    <Popover
      trigger="click"
      position="bottomRight"
      content={(
        <div className="crm-pattern-system-popover">
          <strong>系统信息</strong>
          <Descriptions align="left" column={1} data={rows} size="small" />
          {footer ? <div className="crm-pattern-system-popover-footer">{footer}</div> : null}
        </div>
      )}
    >
      <Button variant="ghost" size="sm" aria-label="查看更多联系人信息">
        <IconMore />更多
      </Button>
    </Popover>
  );
}

export function CRMRecordHeader({
  backHref,
  backLabel,
  identity,
  name,
  subtitle,
  tags,
  actions,
}: {
  backHref?: string;
  backLabel?: string;
  identity?: ReactNode;
  name: string;
  subtitle?: ReactNode;
  tags?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="crm-pattern-record-header">
      {backHref && backLabel ? <a className="crm-pattern-record-back" href={backHref}>{backLabel}</a> : null}
      <div className="crm-pattern-record-identity">
        {identity || <Avatar size="large" color="grey" aria-label={name}>{name.trim().slice(0, 1) || "—"}</Avatar>}
        <div>
          <Typography.Title heading={2}>{name}</Typography.Title>
          {subtitle ? <Typography.Text type="secondary">{subtitle}</Typography.Text> : null}
          {tags ? <div className="crm-pattern-record-tags">{tags}</div> : null}
        </div>
      </div>
      {actions ? <div className="crm-pattern-record-actions">{actions}</div> : null}
    </div>
  );
}

export type CRMDescriptionItem = {
  label: string;
  value?: ReactNode;
};

function hasValue(value: ReactNode) {
  return value !== undefined && value !== null && value !== "";
}

export function CRMDescriptions({
  title,
  items,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  title: string;
  items: CRMDescriptionItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}) {
  const visibleItems = items.filter((item) => hasValue(item.value));
  return (
    <section className="crm-pattern-descriptions">
      <h2>{title}</h2>
      {visibleItems.length ? (
        <Descriptions
          align="left"
          column={1}
          size="small"
          data={visibleItems.map((item) => ({ key: item.label, value: item.value }))}
        />
      ) : (
        <CRMEmptyState
          compact
          title={emptyTitle || `暂无${title}`}
          description={emptyDescription}
          action={emptyAction}
        />
      )}
    </section>
  );
}

export function CRMAssociationCard({
  title,
  name,
  href,
  meta,
  detail,
  emptyTitle = "暂无关联记录",
  emptyDescription,
  emptyAction,
}: {
  title: string;
  name?: string | null;
  href?: string;
  meta?: ReactNode;
  detail?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}) {
  return (
    <section className="crm-pattern-association">
      <h2>{title}</h2>
      {name ? (
        <div className="crm-pattern-association-body">
          <Avatar shape="square" size="small" color="grey">{name.slice(0, 2)}</Avatar>
          <div>
            {href ? <a href={href}>{name}</a> : <strong>{name}</strong>}
            {meta ? <span>{meta}</span> : null}
            {detail ? <small>{detail}</small> : null}
          </div>
        </div>
      ) : (
        <CRMEmptyState compact title={emptyTitle} description={emptyDescription} action={emptyAction} />
      )}
    </section>
  );
}

export function CRMRecordTabs({
  value,
  onChange,
  items,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  items: Array<[string, ReactNode]>;
  children: ReactNode;
}) {
  return (
    <Tabs
      className="crm-pattern-record-tabs"
      type="line"
      activeKey={value}
      onChange={onChange}
      tabList={items.map(([itemKey, tab]) => ({ itemKey, tab }))}
    >
      <Tabs.TabPane itemKey={value}>{children}</Tabs.TabPane>
    </Tabs>
  );
}

export function CRMActivityTimeline({
  items,
  emptyAction,
}: {
  items: Array<{
    id: string;
    time: ReactNode;
    title: ReactNode;
    content?: ReactNode;
    meta?: ReactNode;
    detail?: ReactNode;
  }>;
  emptyAction?: ReactNode;
}) {
  if (!items.length) {
    return (
      <CRMEmptyState
        title="暂无活动记录"
        description="记录电话、会议或邮件互动后，客户旅程会显示在这里。"
        action={emptyAction}
      />
    );
  }
  return (
    <SemiTimeline className="crm-pattern-timeline">
      {items.map((item) => (
        <SemiTimeline.Item key={item.id} dot={<IconActivity />} time={item.time}>
          <article className="crm-pattern-timeline-item">
            <strong>{item.title}</strong>
            {item.meta ? <div className="crm-pattern-timeline-meta">{item.meta}</div> : null}
            {item.content ? <div className="crm-pattern-timeline-content">{item.content}</div> : null}
            {item.detail ? <div className="crm-pattern-timeline-detail">{item.detail}</div> : null}
          </article>
        </SemiTimeline.Item>
      ))}
    </SemiTimeline>
  );
}

export function CRMRecordListItem({
  title,
  href,
  meta,
  detail,
  aside,
}: {
  title: string;
  href: string;
  meta?: ReactNode;
  detail?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <article className="crm-pattern-record-list-item">
      <div>
        <a href={href}>{title}</a>
        {meta ? <div className="crm-pattern-record-list-meta">{meta}</div> : null}
        {detail ? <div className="crm-pattern-record-list-detail">{detail}</div> : null}
      </div>
      {aside ? <div className="crm-pattern-record-list-aside">{aside}</div> : null}
    </article>
  );
}

export function CRMFormSideSheet({
  mode,
  entityLabel,
  title,
  description,
  width = 684,
  children,
  footer,
  busy,
  onClose,
}: {
  mode: "create" | "edit";
  entityLabel: string;
  title?: string;
  description?: string;
  width?: number;
  children: ReactNode;
  footer: ReactNode;
  busy?: boolean;
  onClose: () => void;
}) {
  const creating = mode === "create";
  const resolvedTitle = title || `${creating ? "新增" : "编辑"}${entityLabel}`;
  const resolvedDescription = description || (creating
    ? `填写${entityLabel}的基本身份与业务关系。`
    : `修改${entityLabel}资料与关联关系。`);
  return (
    <SideSheet
      visible
      width={width}
      className="crm-pattern-form-sheet"
      closeOnEsc={!busy}
      closable={!busy}
      maskClosable={!busy}
      keepDOM={false}
      onCancel={() => { if (!busy) onClose(); }}
      title={(
        <div className="crm-pattern-form-heading">
          <h2>{resolvedTitle}</h2>
          <p>{resolvedDescription}</p>
        </div>
      )}
      footer={<div className="crm-pattern-form-footer">{footer}</div>}
    >
      <Form className="crm-pattern-form" labelPosition="top">{children}</Form>
    </SideSheet>
  );
}

export function CRMFormSection({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`crm-pattern-form-section${className ? ` ${className}` : ""}`}>
      <header>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function CRMEmptyState({
  title,
  description,
  action,
  compact = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="crm-pattern-empty is-compact">
        <div>
          <strong>{title}</strong>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="crm-pattern-empty-action">{action}</div> : null}
      </div>
    );
  }
  return (
    <Empty
      className="crm-pattern-empty"
      imageStyle={{ width: 40, height: 40 }}
      image={<span className="crm-pattern-empty-icon"><IconInbox /></span>}
      title={title}
      description={description}
    >
      {action}
    </Empty>
  );
}
