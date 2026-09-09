import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  IconFilterStroked as SlidersHorizontal,
  IconInbox as Inbox,
  IconMore as MoreHorizontal,
  IconSearch as Search,
} from "@douyinfe/semi-icons";
import {
  AutoComplete,
  Descriptions,
  Dropdown,
  Empty,
  Form,
  Modal,
  Popover as SemiPopover,
  SideSheet,
  Steps,
  Tabs as SemiTabs,
} from "@douyinfe/semi-ui";
import { Button } from "@/components/crm/ui";
import { Input } from "@/components/crm/ui";
import { Badge } from "@/components/crm/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/crm/ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/crm/ui";
import { Skeleton } from "@/components/crm/ui";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/crm/ui";
import { appUrl } from "@/lib/api";
import { friendlyError, type Organization } from "@/lib/crm";
import { cn } from "@/lib/utils";

export function PageContent({
  children,
  detail = false,
}: {
  children: ReactNode;
  detail?: boolean;
}) {
  return (
    <main className={cn("crm-page flex min-w-0 flex-1 flex-col gap-5 p-4 md:p-6", detail && "crm-detail-page")}>
      {children}
    </main>
  );
}
export function DetailScaffold({
  top,
  highlights,
  stages,
  sidebar,
  children,
}: {
  top: ReactNode;
  highlights?: ReactNode;
  stages?: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="crm-detail-scaffold">
      <header className="crm-detail-top">{top}</header>
      {highlights && <div className="crm-record-highlights">{highlights}</div>}
      {stages && <div className="crm-record-stages">{stages}</div>}
      <div className="crm-detail-grid">
        <aside className="crm-detail-side">{sidebar}</aside>
        <section className="crm-detail-main">{children}</section>
      </div>
    </div>
  );
}
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="crm-page-header flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="crm-display-title text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="crm-page-description">{description}</p> : null}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
export function PageToolbar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <div role="toolbar" className="crm-toolbar flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{left}</div>
      <div className="flex flex-wrap items-center gap-2">{right}</div>
    </div>
  );
}
export function CopyValue({ value, label = "复制" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return <Button variant="link" size="sm" className="crm-copy-value" title={`${label} ${value}`} onClick={() => { void navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }); }}>{copied ? "已复制" : value}</Button>;
}

export function focusFirstInvalidField() {
  window.setTimeout(() => {
    const field = document.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!field) return;
    const directlyFocusable = field.matches(
      'input, textarea, select, button, a[href], [tabindex]:not([tabindex="-1"])',
    );
    const focusTarget = directlyFocusable
      ? field
      : field.querySelector<HTMLElement>(
          'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) || field;
    focusTarget.focus();
    focusTarget.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 0);
}
export function SystemIdField({ value, label = "系统编号" }: { value: string; label?: string }) {
  return <span className="inline-flex items-center gap-2"><span>{label}</span><CopyValue value={value} label="复制 ID" /></span>;
}
export const RecordHeader = EntityHeader;
export const RecordHighlights = SummaryStrip;
export const MetricStrip = SummaryStrip;
export const DetailSection = Section;
export const SectionHeader = PageHeader;
export const CompactEmptyState = EmptyState;
export function StagePath({ stages, current }: { stages: Array<{ key: string; label: string }>; current: string }) {
  const currentIndex = stages.findIndex((stage) => stage.key === current);
  return <div aria-label="阶段路径" className="crm-stage-path"><Steps type="basic" size="small" current={Math.max(0, currentIndex)}>{stages.map((stage) => <Steps.Step key={stage.key} title={stage.label} className={stage.key === "WON" ? "crm-stage-won" : stage.key === "LOST" ? "crm-stage-lost" : undefined} />)}</Steps></div>;
}
export const FieldGrid = ({ children }: { children: ReactNode }) => <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
export const RecordActions = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-center gap-2">{children}</div>;
export function EmptyState({
  title = "暂无记录",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return <Empty className="crm-empty-state" image={<span className="crm-empty-icon"><Inbox className="size-7" /></span>} title={title} description={description}>{action}</Empty>;
}
export function ErrorState({
  error,
  retry,
}: {
  error?: unknown;
  retry?: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>加载失败</AlertTitle>
      <AlertDescription>
        {friendlyError(error)}
        {retry && (
          <Button variant="outline" size="sm" onClick={retry}>
            请重试
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
export function LoadingSkeleton({ detail = false }: { detail?: boolean }) {
  return (
    <div aria-label="正在加载" className="space-y-4">
      <Skeleton className="h-12 w-64" />
      {detail ? (
        <>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-80 w-full" />
        </>
      ) : (
        Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))
      )}
    </div>
  );
}
export function StatusBadge({ children }: { children: ReactNode }) {
  const text = typeof children === "string" ? children : "";
  const tone = /成交|完成|启用|活跃|合格|已确认|成功|可导入/.test(text)
    ? "crm-status-success"
    : /失败|丢失|无效|停用|错误|逾期|取消/.test(text)
      ? "crm-status-danger"
      : /待|培育|处理中|注意|降温|中/.test(text)
        ? "crm-status-warning"
        : "crm-status-neutral";
  return (
    <Badge
      variant="secondary"
      className={cn("crm-status-badge border font-medium", tone)}
    >
      {children}
    </Badge>
  );
}
export function UserAvatar({
  name,
  large = false,
  showName = true,
}: {
  name?: string;
  large?: boolean;
  showName?: boolean;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar className={large ? "size-11" : "size-6"}>
        <AvatarFallback className="bg-muted text-xs">
          {name?.slice(0, 1) || "—"}
        </AvatarFallback>
      </Avatar>
      {showName && <span className="truncate text-sm">{name || "未分配"}</span>}
    </span>
  );
}
export function CompanyLogo({
  organization,
  large = false,
}: {
  organization: Pick<Organization, "id" | "name" | "shortName" | "logo">;
  large?: boolean;
}) {
  return (
    <Avatar className={cn("crm-company-logo shrink-0 rounded-md", large ? "size-11" : "size-7")}>
      <AvatarImage
        className="bg-white object-contain p-0.5"
        src={
          organization.logo
            ? appUrl(
                `/api/v1/crm/organizations/${organization.id}/attachments/${organization.logo.id}/download`,
              )
            : undefined
        }
        alt={organization.name}
      />
      <AvatarFallback className="rounded-md border bg-muted/50 text-xs">
        {(organization.shortName || organization.name).slice(0, 2)}
      </AvatarFallback>
    </Avatar>
  );
}
export function EntityHeader({
  icon,
  title,
  meta,
  actions,
}: {
  icon: ReactNode;
  title: string;
  meta: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="crm-entity-header flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {icon}
        <div className="min-w-0">
          <h1 className="crm-display-title break-words text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          {meta ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
              {meta}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}
export function SummaryStrip({
  items,
}: {
  items: { label: string; value: ReactNode; detail?: ReactNode }[];
}) {
  return (
    <div className="crm-summary-strip grid gap-0 overflow-hidden border bg-card">
      {items.map((item) => (
        <div key={item.label} className="crm-summary-item min-w-0 px-5 py-4">
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div
            className="mt-1 line-clamp-2 break-words text-sm font-medium"
            title={typeof item.value === "string" ? item.value : undefined}
          >
            {item.value ?? "—"}
          </div>
          {item.detail && (
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {item.detail}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
export function ListMetrics({
  items,
}: {
  items: { label: string; value: ReactNode; note?: ReactNode }[];
}) {
  return (
    <div className="crm-list-metrics" aria-label="列表指标">
      {items.map((item) => (
        <article className="crm-list-metric" key={item.label}>
          <div className="crm-list-metric-label">{item.label}</div>
          <div className="crm-list-metric-value">{item.value ?? "—"}</div>
          {item.note && <div className="crm-list-metric-note">{item.note}</div>}
        </article>
      ))}
    </div>
  );
}
export function DetailTabs({
  value,
  onChange,
  items,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  items: [string, string][];
  children: ReactNode;
}) {
  return <SemiTabs className="crm-detail-tabs" type="line" activeKey={value} onChange={onChange} tabList={items.map(([itemKey, tab]) => ({ itemKey, tab }))}><SemiTabs.TabPane itemKey={value}>{children}</SemiTabs.TabPane></SemiTabs>;
}
export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="crm-section">
      <div className="crm-section-header flex items-center justify-between gap-3 border-b px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      <div className="crm-section-body p-5">{children}</div>
    </section>
  );
}
export function EntityMeta({
  items,
  columns = 2,
}: {
  items: { label: string; value: ReactNode }[];
  columns?: 1 | 2;
}) {
  return <Descriptions className="crm-entity-meta" column={columns} data={items.map((item) => ({ key: item.label, value: item.value ?? "—" }))} align="left" size="small" />;
}
export type ActionItem = {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  icon?: ReactNode;
};
export function RowActions({
  label,
  items,
  triggerLabel,
}: {
  label: string;
  items: ActionItem[];
  triggerLabel?: string;
}) {
  if (!items.length) return null;
  return <Dropdown trigger="click" position="bottomRight" render={<Dropdown.Menu className="crm-row-actions-menu">{items.map((item) => <Dropdown.Item key={item.label} type={item.destructive ? "danger" : "primary"} icon={item.icon} onClick={item.onClick}>{item.label}</Dropdown.Item>)}</Dropdown.Menu>}><Button variant={triggerLabel ? "outline" : "ghost"} size={triggerLabel ? "sm" : "icon-sm"} aria-label={`${label}的更多操作`}><MoreHorizontal />{triggerLabel}</Button></Dropdown>;
}
export function FilterControl({
  label,
  value,
  onChange,
  options,
  all = true,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string>;
  all?: boolean;
  className?: string;
}) {
  const labelId = `${useId()}-label`;
  return (
    <label className="crm-filter-control">
      <span className="crm-filter-label" id={labelId}>{label}</span>
      <Select
        value={value || "all"}
        onValueChange={(v) => onChange(v === "all" ? "" : v)}
      >
        <SelectTrigger
          aria-labelledby={labelId}
          className={cn("h-9 min-w-32 bg-background shadow-none", className)}
        >
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {all && <SelectItem value="all">全部{label}</SelectItem>}
          {Object.entries(options).map(([key, text]) => (
            <SelectItem key={key} value={key}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
export function SearchInput({
  value,
  onChange,
  label = "搜索",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
}) {
  return (
    <label className="crm-search-control">
      <span className="crm-filter-label">查询内容</span>
      <span className="crm-search-field">
        <Search className="pointer-events-none size-4 text-muted-foreground" />
        <Input
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-9 shadow-none"
        />
      </span>
    </label>
  );
}
export function FilterPopover({
  children,
  active = false,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  return <SemiPopover trigger="click" position="bottomLeft" content={<div className="crm-filter-popover"><p className="text-sm font-medium">更多筛选</p>{children}</div>}><Button variant="outline" className="crm-filter-popover-trigger shadow-none"><SlidersHorizontal />更多筛选{active && <span className="crm-filter-active-dot" />}</Button></SemiPopover>;
}
export function Field({
  label,
  children,
  required = false,
  error,
  wide = false,
}: {
  label: string;
  children: (id: string) => ReactNode;
  required?: boolean;
  error?: string;
  wide?: boolean;
}) {
  const id = useId();
  const control = children(id);
  const accessibleControl = isValidElement<Record<string, unknown>>(control)
    ? cloneElement(control, {
        id: control.props.id || id,
        "aria-labelledby": control.props["aria-labelledby"] || `${id}-label`,
        ...(error && !control.props["aria-describedby"]
          ? { "aria-describedby": `${id}-error` }
          : {}),
        ...(error && control.props["aria-invalid"] === undefined
          ? { "aria-invalid": true }
          : {}),
      })
    : control;
  return (
    <Form.Slot
      className={cn("crm-form-field", wide && "sm:col-span-2")}
      label={{ text: label, required, name: id, id: `${id}-label` }}
      error={error ? { error, errorMessageId: `${id}-error` } : undefined}
    >
      {accessibleControl}
    </Form.Slot>
  );
}
export function EntityCombobox({
  label,
  value,
  selectedLabel,
  onChange,
  load,
  options,
  allowCustom = false,
  maxLength,
}: {
  label: string;
  value: string;
  selectedLabel?: string;
  onChange: (id: string, label: string) => void;
  load?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<{ id: string; label: string; description?: string }[]>;
  options?: { id: string; label: string; description?: string }[];
  allowCustom?: boolean;
  maxLength?: number;
}) {
  const selectedChangeRef = useRef<string | null>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(selectedLabel || ""),
    [rows, setRows] = useState(options || []),
    [loading, setLoading] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open) setQuery(selectedLabel || rows.find((row) => row.id === value)?.label || "");
  }, [open, rows, selectedLabel, value]);
  useEffect(() => {
    if (!open || !load) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      void load(query, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) {
            setRows(data);
            setFailed(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setRows([]);
            setFailed(true);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, load]);
  const availableRows = load ? rows : options || rows;
  const data = availableRows.map((row) => ({
    value: row.id,
    label: row.label,
    description: row.description,
  }));
  if (
    allowCustom &&
    query.trim() &&
    !availableRows.some((row) => row.label === query.trim())
  ) {
    data.push({ value: query.trim(), label: query.trim(), description: undefined });
  }
  const selectedOptionLabel =
    selectedLabel || availableRows.find((row) => row.id === value)?.label || "";
  const handleQueryChange = (nextValue: string | number) => {
    const nextQuery = String(nextValue);
    setQuery(nextQuery);

    // Semi fires onSelect first and then onChange with the selected label.
    // Preserve that selection while still invalidating an edited old label.
    if (selectedChangeRef.current === nextQuery) {
      selectedChangeRef.current = null;
      return;
    }
    if (value && nextQuery !== selectedOptionLabel) onChange("", "");
  };
  const clearSelection = () => {
    selectedChangeRef.current = null;
    setQuery("");
    if (value || selectedLabel) onChange("", "");
  };
  return (
    <AutoComplete
      aria-label={label}
      className="crm-entity-combobox"
      data={data}
      dropdownClassName="crm-entity-combobox-dropdown"
      dropdownMatchSelectWidth
      emptyContent={failed ? "搜索失败，请重新输入后重试" : "没有匹配结果"}
      loading={loading}
      maxHeight={320}
      onChange={handleQueryChange}
      onClear={clearSelection}
      onDropdownVisibleChange={setOpen}
      onSearch={setQuery}
      onSelectWithObject
      onSelect={(option) => {
        if (typeof option !== "object" || !option) return;
        const nextId = String(option.value);
        const nextLabel = String(option.label || option.value);
        selectedChangeRef.current = nextLabel;
        onChange(nextId, nextLabel);
        setQuery(nextLabel);
        setOpen(false);
      }}
      placeholder={`搜索或选择${label}`}
      renderItem={(option) => {
        if (typeof option !== "object" || !option) return String(option);
        const isCustom = allowCustom && option.value === query.trim() && option.label === query.trim();
        return (
          <div className="crm-entity-combobox-option">
            <span className="crm-entity-combobox-label">
              {isCustom ? `使用“${String(option.label)}”` : option.label}
            </span>
            {option.description ? (
              <span className="crm-entity-combobox-description">{String(option.description)}</span>
            ) : null}
          </div>
        );
      }}
      renderSelectedItem={(option) =>
        typeof option === "object" && option ? String(option.label || option.value) : String(option)
      }
      showClear
      value={query}
      {...(maxLength ? { maxLength } : {})}
    />
  );
}
export function FormDialog({
  title,
  description,
  children,
  footer,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
}) {
  return (
    <SideSheet
      bodyStyle={{ padding: 0 }}
      className="crm-form-sheet"
      closeOnEsc={!busy}
      closable={!busy}
      footer={<div className="crm-form-footer">{footer}</div>}
      keepDOM={false}
      maskClosable={!busy}
      onCancel={() => {
        if (!busy) onClose();
      }}
      title={(
        <div className="crm-form-heading">
          <h2>{title}</h2>
          <p>{description || "填写完成后统一保存。"}</p>
        </div>
      )}
      visible
      width={wide ? 800 : 640}
    >
      <Form className="crm-form-body" labelPosition="top">{children}</Form>
    </SideSheet>
  );
}

export function FormDrawer({
  title,
  description,
  children,
  footer,
  onClose,
  busy = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <SideSheet
      bodyStyle={{ padding: 0 }}
      className="crm-form-sheet crm-form-sheet-wide"
      closeOnEsc={!busy}
      closable={!busy}
      footer={<div className="crm-form-footer">{footer}</div>}
      keepDOM={false}
      maskClosable={!busy}
      onCancel={() => {
        if (!busy) onClose();
      }}
      title={(
        <div className="crm-form-heading">
          <h2>{title}</h2>
          <p>{description || "填写完成后统一保存。"}</p>
        </div>
      )}
      visible
      width={800}
    >
      <Form className="crm-form-body" labelPosition="top">{children}</Form>
    </SideSheet>
  );
}
export function ConfirmDeleteDialog({
  name,
  onConfirm,
  onClose,
  description,
}: {
  name: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  description?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      centered
      className="crm-confirm-dialog"
      closeOnEsc={!busy}
      closable={!busy}
      footer={(
        <div className="crm-confirm-actions">
          <Button variant="outline" disabled={busy} onClick={onClose}>取消</Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onConfirm()
                .then(onClose)
                .catch((e) => setError(friendlyError(e)))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "删除中…" : "确认删除"}
          </Button>
        </div>
      )}
      maskClosable={!busy}
      onCancel={() => {
        if (!busy) onClose();
      }}
      title={`删除“${name}”？`}
      visible
    >
      <p>{description || "此操作将执行软删除，并保留系统历史。"}</p>
      {error && <p role="alert" className="crm-confirm-error">{error}</p>}
    </Modal>
  );
}
