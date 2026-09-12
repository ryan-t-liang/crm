import * as React from "react";
import {
  Avatar as SemiAvatar,
  Banner as SemiBanner,
  Button as SemiButton,
  Card as SemiCard,
  Checkbox as SemiCheckbox,
  DatePicker as SemiDatePicker,
  Input as SemiInput,
  Select as SemiSelect,
  Skeleton as SemiSkeleton,
  Tag as SemiTag,
  TextArea as SemiTextArea,
  Typography,
  Upload as SemiUpload,
} from "@douyinfe/semi-ui";
import { IconUpload as UploadIcon } from "@douyinfe/semi-icons";
import * as Recharts from "recharts";

import { cn } from "@/lib/utils";

type AnyProps = Record<string, any>;
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
  block?: boolean;
};
type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> & {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  showClear?: boolean;
  onValueChange?: (value: string) => void;
};
type CheckboxValue = boolean | "indeterminate";
type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "checked"> & {
  checked?: CheckboxValue;
  onCheckedChange?: (checked: CheckboxValue) => void;
};
type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & {
  onValueChange?: (value: string) => void;
};
function toSemiButton(variant: ButtonProps["variant"]) {
  if (variant === "destructive") return { type: "danger" as const, theme: "solid" as const };
  if (variant === "ghost" || variant === "link") return { type: "tertiary" as const, theme: "borderless" as const };
  if (variant === "outline") return { type: "tertiary" as const, theme: "outline" as const };
  if (variant === "secondary") return { type: "secondary" as const, theme: "light" as const };
  return { type: "primary" as const, theme: "solid" as const };
}

export const Button = React.forwardRef<React.ComponentRef<typeof SemiButton>, ButtonProps>(
  ({ className, variant = "default", size = "default", type, block, children, ...props }, _ref) => {
    const semi = toSemiButton(variant);
    const iconOnly = size.startsWith("icon");
    const childNodes = React.Children.toArray(children);
    const firstChild = childNodes[0];
    const leadingSemiIcon = React.isValidElement(firstChild)
      && (firstChild.type as { elementType?: string }).elementType === "Icon";
    const icon = iconOnly || leadingSemiIcon ? firstChild : undefined;
    const content = iconOnly ? null : leadingSemiIcon ? childNodes.slice(1) : children;
    const semiSize = size === "lg" ? "large" : size === "default" ? "default" : "small";
    return (
      <SemiButton
        {...(props as AnyProps)}
        ref={_ref}
        htmlType={type || "button"}
        className={cn("crm-button", className)}
        data-size={size}
        data-variant={variant}
        type={semi.type}
        theme={semi.theme}
        size={semiSize}
        block={block}
        aria-label={props["aria-label"]}
        icon={icon}
      >
        {content}
      </SemiButton>
    );
  },
);
Button.displayName = "CrmButton";

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, onChange, onValueChange, ...props }, ref) => (
    <SemiInput
      {...(props as AnyProps)}
      ref={ref}
      className={cn("crm-input", className)}
      validateStatus={props["aria-invalid"] ? "error" : undefined}
      onChange={(value, event) => {
        onValueChange?.(value);
        onChange?.(event);
      }}
    />
  ),
);
Input.displayName = "CrmInput";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, onChange, ...props }, ref) => (
    <SemiTextArea
      {...(props as AnyProps)}
      ref={ref}
      className={cn("crm-textarea", className)}
      validateStatus={props["aria-invalid"] ? "error" : undefined}
      onChange={(_value: string, event) => onChange?.(event as unknown as React.ChangeEvent<HTMLTextAreaElement>)}
    />
  ),
);
Textarea.displayName = "CrmTextarea";

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, onChange: _onChange, ...props }, _forwardedRef) => (
    <SemiCheckbox
      {...(props as AnyProps)}
      className={cn("crm-checkbox", className)}
      checked={checked === true}
      indeterminate={checked === "indeterminate"}
      onChange={(event) => onCheckedChange?.(Boolean(event.target.checked))}
    />
  ),
);
Checkbox.displayName = "CrmCheckbox";

export function Skeleton({ className, ...props }: AnyProps) {
  return <SemiSkeleton placeholder={<SemiSkeleton.Title className={cn("crm-skeleton", className)} {...props} />} loading active />;
}

export function Alert({ className, variant = "default", children, ...props }: AnyProps) {
  const title = findElement(children, AlertTitle)?.props.children;
  const description = findElement(children, AlertDescription)?.props.children;
  return <SemiBanner {...props} className={cn("crm-alert", className)} type={variant === "destructive" ? "danger" : "info"} fullMode={false} bordered title={title} description={description} />;
}
export function AlertTitle(_props: AnyProps) { return null; }
export function AlertDescription(_props: AnyProps) { return null; }

export function Badge({ className, variant = "default", ...props }: AnyProps) {
  return <SemiTag className={cn("crm-badge", className)} data-variant={variant} size="small" {...props} />;
}

export function Avatar({ className, children, ...props }: AnyProps) {
  let src: string | undefined;
  let alt = "";
  let fallback: React.ReactNode;
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === AvatarImage) {
      src = (child.props as AnyProps).src;
      alt = (child.props as AnyProps).alt || "";
    }
    if (child.type === AvatarFallback) fallback = (child.props as AnyProps).children;
  });
  const size = /size-11/.test(className || "") ? "large" : /size-(?:6|7|8)/.test(className || "") ? "small" : "default";
  return <SemiAvatar className={cn("crm-avatar", className)} src={src} alt={alt} size={size} color="grey" {...props}>{fallback}</SemiAvatar>;
}
export function AvatarImage(_props: AnyProps) { return null; }
export function AvatarFallback(_props: AnyProps) { return null; }

export function Card({ className, ...props }: AnyProps) {
  return <SemiCard className={cn("crm-card", className)} {...props} />;
}
export function CardHeader({ className, ...props }: AnyProps) { return <header className={cn("crm-card-header", className)} {...props} />; }
export function CardTitle({ className, ...props }: AnyProps) { return <Typography.Title heading={5} className={cn("crm-card-title", className)} {...props} />; }
export function CardDescription({ className, ...props }: AnyProps) { return <Typography.Text type="tertiary" className={cn("crm-card-description", className)} {...props} />; }
export function CardContent({ className, ...props }: AnyProps) { return <div className={cn("crm-card-content", className)} {...props} />; }
export function CardFooter({ className, ...props }: AnyProps) { return <footer className={cn("crm-card-footer", className)} {...props} />; }

function findElement(children: React.ReactNode, type: any): React.ReactElement<AnyProps> | null {
  let found: React.ReactElement<AnyProps> | null = null;
  React.Children.forEach(children, (child) => {
    if (found || !React.isValidElement(child)) return;
    if (child.type === type) found = child as React.ReactElement<AnyProps>;
    else found = findElement((child.props as AnyProps).children, type);
  });
  return found;
}

type SelectOption = { value: string; label: React.ReactNode; disabled?: boolean };
function collectSelectOptions(children: React.ReactNode, rows: SelectOption[] = []): SelectOption[] {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as AnyProps;
    if (child.type === SelectItem) rows.push({ value: props.value, label: props.children, disabled: props.disabled });
    else if (props.children) collectSelectOptions(props.children, rows);
  });
  return rows;
}
export function Select({ value, defaultValue, onValueChange, disabled, children, className, ...props }: SelectProps) {
  const trigger = findElement(children, SelectTrigger);
  const valueElement = findElement(children, SelectValue);
  const options = collectSelectOptions(children);
  const widthMatch = String(trigger?.props.className || "").match(/w-\[(\d+)px\]/);
  const generatedLabelId = `${React.useId()}-label`;
  const explicitLabelledBy = trigger?.props["aria-labelledby"] || props["aria-labelledby"];
  const fallbackLabel = trigger?.props["aria-label"] || props["aria-label"];
  const labelledBy = explicitLabelledBy || (fallbackLabel ? generatedLabelId : undefined);
  return (
    <>
      {!explicitLabelledBy && fallbackLabel ? <span className="sr-only" id={generatedLabelId}>{fallbackLabel}</span> : null}
      <SemiSelect
        {...(props as AnyProps)}
        aria-labelledby={labelledBy}
        className={cn("crm-select", trigger?.props.className, className)}
        style={{ ...(trigger?.props.style || {}), width: widthMatch ? `${widthMatch[1]}px` : undefined }}
        value={(value || undefined) as AnyProps}
        defaultValue={defaultValue as AnyProps}
        disabled={disabled || trigger?.props.disabled}
        placeholder={valueElement?.props.placeholder}
        optionList={options}
        dropdownClassName="crm-select-dropdown"
        onChange={(next) => onValueChange?.(String(next))}
      />
    </>
  );
}
export function SelectTrigger(_props: AnyProps) { return null; }
export function SelectValue(_props: AnyProps) { return null; }
export function SelectContent({ children }: AnyProps) { return <>{children}</>; }
export function SelectItem(_props: AnyProps) { return null; }

type DateInputProps = {
  id?: string;
  value?: string;
  onValueChange: (value: string) => void;
  mode?: "date" | "dateTime";
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

function serializePickerDate(value: unknown, mode: "date" | "dateTime") {
  if (typeof value === "string") {
    return mode === "dateTime" ? value.replace(" ", "T") : value;
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  return mode === "dateTime" ? `${date}T${pad(value.getHours())}:${pad(value.getMinutes())}` : date;
}

export function DateInput({
  id,
  value,
  onValueChange,
  mode = "date",
  className,
  ...props
}: DateInputProps) {
  const format = mode === "dateTime" ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd";
  const pickerValue = value ? (mode === "dateTime" ? value.replace("T", " ") : value) : undefined;
  return (
    <SemiDatePicker
      {...(props as AnyProps)}
      aria-labelledby={props["aria-labelledby"] || (id ? `${id}-label` : undefined)}
      className={cn("crm-date-picker", className)}
      type={mode === "dateTime" ? "dateTime" : "date"}
      density="compact"
      format={format}
      value={pickerValue}
      showClear
      onChange={(date, dateString) => onValueChange(serializePickerDate(dateString || date, mode))}
      onClear={() => onValueChange("")}
    />
  );
}

type FilePickerProps = {
  id?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  files?: File[];
  onFilesChange: (files: File[]) => void;
  label?: string;
  className?: string;
  "aria-label"?: string;
};

export function FilePicker({
  id,
  accept,
  multiple = false,
  disabled = false,
  files = [],
  onFilesChange,
  label,
  className,
  ...props
}: FilePickerProps) {
  return (
    <SemiUpload
      {...(props as AnyProps)}
      action=""
      accept={accept}
      className={cn("crm-file-picker", className)}
      disabled={disabled}
      limit={multiple ? undefined : 1}
      multiple={multiple}
      showUploadList={false}
      uploadTrigger="custom"
      onFileChange={(selected) => onFilesChange(selected)}
    >
      <Button id={id} variant="outline" disabled={disabled}>
        <UploadIcon />
        {label || (files.length ? `已选择 ${files.length} 个文件` : multiple ? "选择文件" : "选择文件")}
      </Button>
    </SemiUpload>
  );
}

export function TooltipProvider({ children }: AnyProps) { return <>{children}</>; }

export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string; theme?: Record<string, string>; icon?: React.ComponentType }>;
const ChartContext = React.createContext<ChartConfig>({});
export function ChartContainer({ config, className, children, ...props }: AnyProps) {
  const variables = Object.fromEntries(Object.entries(config || {}).flatMap(([key, entry]: [string, any]) => entry.color ? [[`--color-${key}`, entry.color]] : []));
  return <ChartContext.Provider value={config}><div className={cn("crm-chart", className)} style={variables as React.CSSProperties} {...props}><Recharts.ResponsiveContainer width="100%" height="100%">{children}</Recharts.ResponsiveContainer></div></ChartContext.Provider>;
}
export const ChartTooltip = Recharts.Tooltip;
export function ChartTooltipContent({ active, payload, hideLabel, label, className }: AnyProps) {
  const config = React.useContext(ChartContext);
  if (!active || !payload?.length) return null;
  return <div className={cn("crm-chart-tooltip", className)}>{!hideLabel && label ? <div className="crm-chart-tooltip-label">{label}</div> : null}{payload.map((item: any, index: number) => <div key={`${item.dataKey || item.name}-${index}`} className="crm-chart-tooltip-row"><span className="crm-chart-tooltip-dot" style={{ background: item.color || item.fill }} /><span>{config[item.dataKey]?.label || item.name}</span><strong>{item.value}</strong></div>)}</div>;
}
