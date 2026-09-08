import { useEffect, useId, useState, type ReactNode } from "react";
import {
  Check,
  ChevronsUpDown,
  Inbox,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/v1/ui";
import { Input } from "@/components/v1/ui";
import { Label } from "@/components/v1/ui";
import { Badge } from "@/components/v1/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/v1/ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/v1/ui";
import { Skeleton } from "@/components/v1/ui";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/v1/ui";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/v1/ui";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/v1/ui";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/v1/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/v1/ui";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/v1/ui";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/v1/ui";
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
  sidebar,
  children,
}: {
  top: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="crm-detail-scaffold">
      <header className="crm-detail-top">{top}</header>
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
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
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
  return <button type="button" className="font-mono text-xs text-muted-foreground underline-offset-4 hover:underline" title={`${label} ${value}`} onClick={() => { void navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }); }}>{copied ? "已复制" : value}</button>;
}

export function focusFirstInvalidField() {
  window.setTimeout(() => {
    const field = document.querySelector<HTMLElement>('[aria-invalid="true"]');
    field?.focus();
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
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
  return <ol aria-label="阶段路径" className="crm-stage-path flex min-w-0 overflow-x-auto border bg-card">{stages.map((stage, index) => {
    const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "future";
    const terminal = stage.key === "WON" ? "won" : stage.key === "LOST" ? "lost" : undefined;
    return <li key={stage.key} data-stage-state={state} data-terminal={terminal} className="crm-stage-step flex min-w-28 items-center gap-2 text-xs"><span className="crm-stage-marker flex size-5 items-center justify-center rounded-full border">{state === "complete" ? <Check className="size-3" /> : index + 1}</span><span className="font-medium">{stage.label}</span>{index < stages.length - 1 && <span className="crm-stage-connector ml-auto h-px w-5" />}</li>;
  })}</ol>;
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
  return (
    <div className="crm-empty-state flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="crm-empty-icon"><Inbox className="size-7" /></span>
      <h3 className="text-sm font-medium">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
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
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
            {meta}
          </div>
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
  return (
    <Tabs value={value} onValueChange={onChange} className="min-w-0 gap-5">
      <div className="crm-detail-tabs max-w-full overflow-x-auto rounded-t-xl border border-b-0 bg-card px-2">
        <TabsList className="h-10 rounded-none bg-transparent p-0">
          {items.map(([key, label]) => (
            <TabsTrigger
              key={key}
              value={key}
              className="crm-detail-tab h-10 border-0 px-4 text-sm shadow-none"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value={value} className="min-w-0">
        {children}
      </TabsContent>
    </Tabs>
  );
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
    <section className="crm-section min-w-0 overflow-hidden rounded-xl border bg-card">
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
  return (
    <dl className={cn("grid gap-x-6 gap-y-5", columns === 1 ? "grid-cols-1" : "grid-cols-2")}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 break-words text-sm">{item.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={triggerLabel ? "outline" : "ghost"}
          size={triggerLabel ? "sm" : "icon-sm"}
          aria-label={`${label}的更多操作`}
        >
          <MoreHorizontal />
          {triggerLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            onSelect={item.onClick}
            className={
              item.destructive
                ? "text-destructive focus:text-destructive"
                : undefined
            }
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
  return (
    <label className="crm-filter-control">
      <span className="crm-filter-label">{label}</span>
      <Select
        value={value || "all"}
        onValueChange={(v) => onChange(v === "all" ? "" : v)}
      >
        <SelectTrigger
          aria-label={label}
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
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="crm-filter-popover-trigger shadow-none">
          <SlidersHorizontal />
          更多筛选
          {active && <span className="size-1.5 rounded-full bg-primary" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-4 rounded-xl">
        <p className="text-sm font-medium">更多筛选</p>
        {children}
      </PopoverContent>
    </Popover>
  );
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
  return (
    <div className={cn("grid content-start gap-2", wide && "sm:col-span-2")}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && (
          <span
            aria-hidden="true"
            className="text-destructive after:content-['*']"
          />
        )}
      </Label>
      {children(id)}
      {error && (
        <p role="alert" id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
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
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [rows, setRows] = useState(options || []),
    [loading, setLoading] = useState(false),
    [failed, setFailed] = useState(false);
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
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          className="h-9 w-full justify-between shadow-none"
        >
          <span className="truncate">
            {selectedLabel ||
              rows.find((r) => r.id === value)?.label ||
              `选择${label}`}
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="crm-entity-combobox w-[var(--radix-popover-trigger-width)] min-w-64 p-0"
        align="start"
      >
        <Command shouldFilter={!load}>
          <CommandInput
            maxLength={maxLength}
            placeholder={`搜索${label}…`}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList aria-label={`${label}选项`}>
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">正在搜索…</div>
            ) : (
              <>
                <CommandEmpty>
                  {failed ? "搜索失败，请重新输入后重试" : "没有匹配结果"}
                </CommandEmpty>
                {(load ? rows : options || rows).map((row) => (
                  <CommandItem
                    key={row.id}
                    value={`${row.label} ${row.description || ""} ${row.id}`}
                    onSelect={() => {
                      onChange(row.id, row.label);
                      setOpen(false);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{row.label}</div>
                      {row.description && (
                        <div className="truncate text-xs text-muted-foreground">
                          {row.description}
                        </div>
                      )}
                    </div>
                    {value === row.id && <Check className="size-4" />}
                  </CommandItem>
                ))}
                {allowCustom &&
                  query.trim() &&
                  !rows.some((r) => r.label === query.trim()) && (
                    <CommandItem
                      value={query}
                      onSelect={() => {
                        onChange(query.trim(), query.trim());
                        setOpen(false);
                      }}
                    >
                      使用“{query.trim()}”
                    </CommandItem>
                  )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent
        className={cn(
          "crm-form-dialog flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0",
          wide ? "sm:max-w-3xl" : "sm:max-w-xl",
        )}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description || "填写完成后统一保存。"}
          </DialogDescription>
        </DialogHeader>
        <div className="crm-form-body min-h-0 overflow-y-auto p-6">{children}</div>
        <div className="crm-form-footer flex shrink-0 items-center justify-end gap-2 border-t px-6 py-4">
          {footer}
        </div>
      </DialogContent>
    </Dialog>
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
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent
        className="crm-form-drawer flex flex-col gap-0 overflow-hidden p-0"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description || "填写完成后统一保存。"}
          </DialogDescription>
        </DialogHeader>
        <div className="crm-form-body min-h-0 flex-1 overflow-y-auto p-6">
          {children}
        </div>
        <div className="crm-form-footer flex shrink-0 items-center justify-end gap-2 border-t px-6 py-4">
          {footer}
        </div>
      </DialogContent>
    </Dialog>
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
    <AlertDialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <AlertDialogContent className="crm-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>删除“{name}”？</AlertDialogTitle>
          <AlertDialogDescription>
            {description || "此操作将执行软删除，并保留系统历史。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
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
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
