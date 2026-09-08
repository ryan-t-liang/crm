import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, PanelLeft, Search, X } from "lucide-react";
import * as Recharts from "recharts";

import { cn } from "@/lib/utils";

type AnyProps = Record<string, any>;
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
};
type CheckboxValue = boolean | "indeterminate";
type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "checked"> & {
  checked?: CheckboxValue;
  onCheckedChange?: (checked: CheckboxValue) => void;
};
type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & {
  onValueChange?: (value: string) => void;
};
type TabsProps = Omit<React.HTMLAttributes<HTMLDivElement>, "defaultValue"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};
type OpenRootProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
};

function composeHandlers(
  first?: (event: any) => void,
  second?: (event: any) => void,
) {
  return (event: any) => {
    first?.(event);
    if (!event.defaultPrevented) second?.(event);
  };
}

function V1Slot({ children, className, ...props }: AnyProps) {
  if (!React.isValidElement(children)) return null;
  const child = children as React.ReactElement<AnyProps>;
  return React.cloneElement(child, {
    ...props,
    ...child.props,
    className: cn(className, child.props.className),
    onClick: composeHandlers(child.props.onClick, props.onClick),
  });
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild, className, variant = "default", size = "default", type, ...props }, ref) => {
    const shared = {
      ...props,
      className: cn("v1-button", className),
      "data-variant": variant,
      "data-size": size,
    };
    if (asChild) return <V1Slot {...shared} />;
    return <button ref={ref} type={type || "button"} {...shared} />;
  },
);
Button.displayName = "V1Button";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn("v1-input", className)} {...props} />
  ),
);
Input.displayName = "V1Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn("v1-textarea", className)} {...props} />
  ),
);
Textarea.displayName = "V1Textarea";

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn("v1-label", className)} {...props} />
  ),
);
Label.displayName = "V1Label";

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, onChange, ...props }, forwardedRef) => {
    const localRef = React.useRef<HTMLInputElement | null>(null);
    React.useEffect(() => {
      if (localRef.current) localRef.current.indeterminate = checked === "indeterminate";
    }, [checked]);
    return (
      <input
        {...props}
        ref={(node) => {
          localRef.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        type="checkbox"
        className={cn("v1-checkbox", className)}
        checked={checked === true}
        onChange={(event) => {
          onChange?.(event);
          onCheckedChange?.(event.target.checked);
        }}
      />
    );
  },
);
Checkbox.displayName = "V1Checkbox";

export function Skeleton({ className, ...props }: AnyProps) {
  return <div aria-hidden="true" className={cn("v1-skeleton", className)} {...props} />;
}

export function Alert({ className, variant = "default", ...props }: AnyProps) {
  return <div role="alert" className={cn("v1-alert", className)} data-variant={variant} {...props} />;
}
export function AlertTitle({ className, ...props }: AnyProps) {
  return <h3 className={cn("v1-alert-title", className)} {...props} />;
}
export function AlertDescription({ className, ...props }: AnyProps) {
  return <div className={cn("v1-alert-description", className)} {...props} />;
}

export function Badge({ className, variant = "default", ...props }: AnyProps) {
  return <span className={cn("v1-badge", className)} data-variant={variant} {...props} />;
}

export function Avatar({ className, ...props }: AnyProps) {
  return <span className={cn("v1-avatar", className)} {...props} />;
}
export function AvatarImage({ className, src, alt = "", ...props }: AnyProps) {
  return src ? <img className={cn("v1-avatar-image", className)} src={src} alt={alt} {...props} /> : null;
}
export function AvatarFallback({ className, ...props }: AnyProps) {
  return <span className={cn("v1-avatar-fallback", className)} {...props} />;
}

export function Card({ className, ...props }: AnyProps) {
  return <section className={cn("v1-card", className)} {...props} />;
}
export function CardHeader({ className, ...props }: AnyProps) {
  return <header className={cn("v1-card-header", className)} {...props} />;
}
export function CardTitle({ className, ...props }: AnyProps) {
  return <h2 className={cn("v1-card-title", className)} {...props} />;
}
export function CardDescription({ className, ...props }: AnyProps) {
  return <p className={cn("v1-card-description", className)} {...props} />;
}
export function CardContent({ className, ...props }: AnyProps) {
  return <div className={cn("v1-card-content", className)} {...props} />;
}
export function CardFooter({ className, ...props }: AnyProps) {
  return <footer className={cn("v1-card-footer", className)} {...props} />;
}

export function Table({ className, ...props }: AnyProps) {
  return (
    <div className="v1-table-container">
      <table className={cn("v1-table", className)} {...props} />
    </div>
  );
}
export function TableHeader({ className, ...props }: AnyProps) {
  return <thead className={cn("v1-table-header", className)} {...props} />;
}
export function TableBody({ className, ...props }: AnyProps) {
  return <tbody className={cn("v1-table-body", className)} {...props} />;
}
export function TableFooter({ className, ...props }: AnyProps) {
  return <tfoot className={cn("v1-table-foot", className)} {...props} />;
}
export function TableRow({ className, ...props }: AnyProps) {
  return <tr className={cn("v1-table-row", className)} {...props} />;
}
export function TableHead({ className, ...props }: AnyProps) {
  return <th className={cn("v1-table-head", className)} {...props} />;
}
export function TableCell({ className, ...props }: AnyProps) {
  return <td className={cn("v1-table-cell", className)} {...props} />;
}
export function TableCaption({ className, ...props }: AnyProps) {
  return <caption className={cn("v1-table-caption", className)} {...props} />;
}

export function Breadcrumb({ className, ...props }: AnyProps) {
  return <nav aria-label="面包屑" className={cn("v1-breadcrumb", className)} {...props} />;
}
export function BreadcrumbList({ className, ...props }: AnyProps) {
  return <ol className={cn("v1-breadcrumb-list", className)} {...props} />;
}
export function BreadcrumbItem({ className, ...props }: AnyProps) {
  return <li className={cn("v1-breadcrumb-item", className)} {...props} />;
}
export function BreadcrumbPage({ className, ...props }: AnyProps) {
  return <span aria-current="page" className={cn("v1-breadcrumb-page", className)} {...props} />;
}
export function BreadcrumbSeparator({ className, children = "/", ...props }: AnyProps) {
  return <li aria-hidden="true" className={cn("v1-breadcrumb-separator", className)} {...props}>{children}</li>;
}
export function Separator({ className, orientation = "horizontal", ...props }: AnyProps) {
  return <span aria-hidden="true" className={cn("v1-separator", className)} data-orientation={orientation} {...props} />;
}

type TabsContextValue = { value: string; change: (value: string) => void };
const TabsContext = React.createContext<TabsContextValue | null>(null);

export function Tabs({ value, defaultValue = "", onValueChange, className, children, ...props }: TabsProps) {
  const [localValue, setLocalValue] = React.useState(defaultValue);
  const current = value ?? localValue;
  const change = (next: string) => {
    if (value === undefined) setLocalValue(next);
    onValueChange?.(next);
  };
  return <TabsContext.Provider value={{ value: current, change }}><div className={cn("v1-tabs", className)} {...props}>{children}</div></TabsContext.Provider>;
}
export function TabsList({ className, ...props }: AnyProps) {
  return <div role="tablist" className={cn("v1-tabs-list", className)} {...props} />;
}
export function TabsTrigger({ value, className, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const context = React.useContext(TabsContext);
  const active = context?.value === value;
  return <button type="button" role="tab" aria-selected={active} data-state={active ? "active" : "inactive"} className={cn("v1-tabs-trigger", className)} onClick={composeHandlers(onClick, () => context?.change(value))} {...props} />;
}
export function TabsContent({ value, className, ...props }: AnyProps) {
  const context = React.useContext(TabsContext);
  if (context?.value !== value) return null;
  return <div role="tabpanel" className={cn("v1-tabs-content", className)} {...props} />;
}

type OpenContextValue = { open: boolean; setOpen: (open: boolean) => void };
const DialogContext = React.createContext<OpenContextValue | null>(null);

function useOpenState(open: boolean | undefined, defaultOpen: boolean, onOpenChange?: (open: boolean) => void) {
  const [local, setLocal] = React.useState(defaultOpen);
  return {
    open: open ?? local,
    setOpen: (next: boolean) => {
      if (open === undefined) setLocal(next);
      onOpenChange?.(next);
    },
  };
}

export function Dialog({ open, defaultOpen = false, onOpenChange, children }: OpenRootProps) {
  const state = useOpenState(open, defaultOpen, onOpenChange);
  return <DialogContext.Provider value={state}>{children}</DialogContext.Provider>;
}
export function DialogTrigger({ asChild, children, ...props }: AnyProps) {
  const context = React.useContext(DialogContext);
  const triggerProps = { ...props, onClick: () => context?.setOpen(true) };
  return asChild ? <V1Slot {...triggerProps}>{children}</V1Slot> : <button type="button" {...triggerProps}>{children}</button>;
}
export function DialogClose({ asChild, children, ...props }: AnyProps) {
  const context = React.useContext(DialogContext);
  const closeProps = { ...props, onClick: () => context?.setOpen(false) };
  return asChild ? <V1Slot {...closeProps}>{children}</V1Slot> : <button type="button" {...closeProps}>{children}</button>;
}
export function DialogPortal({ children }: AnyProps) {
  return typeof document === "undefined" ? null : createPortal(children, document.body);
}
export function DialogOverlay({ className, ...props }: AnyProps) {
  return <div className={cn("v1-dialog-overlay", className)} {...props} />;
}
export function DialogContent({ className, children, onInteractOutside, ...props }: React.HTMLAttributes<HTMLDivElement> & { onInteractOutside?: (event: React.MouseEvent) => void }) {
  const context = React.useContext(DialogContext);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!context?.open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        context.setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = original;
    };
  }, [context?.open]);
  if (!context?.open) return null;
  return <DialogPortal><div className="v1-dialog-layer"><DialogOverlay onMouseDown={(event: React.MouseEvent) => {
    onInteractOutside?.(event);
    if (!event.defaultPrevented) context.setOpen(false);
  }} /><div ref={panelRef} role="dialog" aria-modal="true" className={cn("v1-dialog-panel", className)} {...props}>{children}<button type="button" className="v1-dialog-close" aria-label="关闭" onClick={() => context.setOpen(false)}><X /></button></div></div></DialogPortal>;
}
export function DialogHeader({ className, ...props }: AnyProps) { return <header className={cn("v1-dialog-header", className)} {...props} />; }
export function DialogFooter({ className, ...props }: AnyProps) { return <footer className={cn("v1-dialog-footer", className)} {...props} />; }
export function DialogTitle({ className, ...props }: AnyProps) { return <h2 className={cn("v1-dialog-title", className)} {...props} />; }
export function DialogDescription({ className, ...props }: AnyProps) { return <p className={cn("v1-dialog-description", className)} {...props} />; }

export const AlertDialog = Dialog;
export const AlertDialogTrigger = DialogTrigger;
export function AlertDialogContent({ className, ...props }: AnyProps) { return <DialogContent role="alertdialog" className={cn("v1-alert-dialog-panel", className)} {...props} />; }
export const AlertDialogHeader = DialogHeader;
export const AlertDialogFooter = DialogFooter;
export const AlertDialogTitle = DialogTitle;
export const AlertDialogDescription = DialogDescription;
export function AlertDialogCancel(props: ButtonProps) { return <DialogClose asChild><Button variant="outline" {...props} /></DialogClose>; }
export function AlertDialogAction(props: ButtonProps) { return <DialogClose asChild><Button {...props} /></DialogClose>; }

const DropdownContext = React.createContext<OpenContextValue | null>(null);
export function DropdownMenu({ open, defaultOpen = false, onOpenChange, children }: OpenRootProps) {
  const state = useOpenState(open, defaultOpen, onOpenChange);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!state.open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) state.setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") state.setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [state.open]);
  return <DropdownContext.Provider value={state}><div ref={rootRef} className="v1-dropdown-root">{children}</div></DropdownContext.Provider>;
}
export function DropdownMenuTrigger({ asChild, children, ...props }: AnyProps) {
  const context = React.useContext(DropdownContext);
  const triggerProps = { ...props, "aria-expanded": context?.open, onClick: () => context?.setOpen(!context.open) };
  return asChild ? <V1Slot {...triggerProps}>{children}</V1Slot> : <button type="button" {...triggerProps}>{children}</button>;
}
export function DropdownMenuContent({ className, align, side, sideOffset, ...props }: AnyProps) {
  const context = React.useContext(DropdownContext);
  if (!context?.open) return null;
  return <div role="menu" data-align={align} data-side={side} style={{ "--v1-menu-offset": `${sideOffset || 0}px` } as React.CSSProperties} className={cn("v1-dropdown-menu", className)} {...props} />;
}
export function DropdownMenuItem({ asChild, className, onSelect, onClick, children, ...props }: ButtonProps & { onSelect?: (event: React.MouseEvent) => void }) {
  const context = React.useContext(DropdownContext);
  const activate = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    onSelect?.(event);
    if (!event.defaultPrevented) context?.setOpen(false);
  };
  const itemProps = { ...props, role: "menuitem", className: cn("v1-dropdown-item", className), onClick: activate };
  return asChild ? <V1Slot {...itemProps}>{children}</V1Slot> : <button type="button" {...itemProps}>{children}</button>;
}
export function DropdownMenuCheckboxItem({ checked, onCheckedChange, children, className, ...props }: Omit<ButtonProps, "onChange"> & { checked?: boolean; onCheckedChange?: (checked: boolean) => void; onSelect?: (event: React.MouseEvent) => void }) {
  return <DropdownMenuItem {...props} className={cn("v1-dropdown-checkbox", className)} onClick={() => onCheckedChange?.(!checked)}><span className="v1-dropdown-check">{checked ? <Check /> : null}</span>{children}</DropdownMenuItem>;
}
export function DropdownMenuLabel({ className, ...props }: AnyProps) { return <div className={cn("v1-dropdown-label", className)} {...props} />; }
export function DropdownMenuSeparator({ className, ...props }: AnyProps) { return <div className={cn("v1-dropdown-separator", className)} {...props} />; }

const PopoverContext = React.createContext<OpenContextValue | null>(null);
export function Popover({ open, defaultOpen = false, onOpenChange, children }: OpenRootProps) {
  const state = useOpenState(open, defaultOpen, onOpenChange);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!state.open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) state.setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") state.setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [state.open]);
  return <PopoverContext.Provider value={state}><div ref={rootRef} className="v1-popover-root">{children}</div></PopoverContext.Provider>;
}
export function PopoverTrigger({ asChild, children, ...props }: AnyProps) {
  const context = React.useContext(PopoverContext);
  const triggerProps = { ...props, "aria-expanded": context?.open, onClick: () => context?.setOpen(!context.open) };
  return asChild ? <V1Slot {...triggerProps}>{children}</V1Slot> : <button type="button" {...triggerProps}>{children}</button>;
}
export function PopoverContent({ className, align, ...props }: AnyProps) {
  const context = React.useContext(PopoverContext);
  if (!context?.open) return null;
  return <div className={cn("v1-popover-panel", className)} data-align={align} {...props} />;
}

type CommandContextValue = { query: string; setQuery: (value: string) => void; shouldFilter: boolean };
const CommandContext = React.createContext<CommandContextValue | null>(null);
export function Command({ className, shouldFilter = true, children, ...props }: AnyProps) {
  const [query, setQuery] = React.useState("");
  return <CommandContext.Provider value={{ query, setQuery, shouldFilter }}><div className={cn("v1-command", className)} {...props}>{children}</div></CommandContext.Provider>;
}
export function CommandInput({ className, value, onValueChange, onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value"> & { value?: string; onValueChange?: (value: string) => void }) {
  const context = React.useContext(CommandContext);
  const current = value ?? context?.query ?? "";
  return <div className="v1-command-search"><Search /><input className={cn("v1-command-input", className)} value={current} onChange={(event) => { context?.setQuery(event.target.value); onValueChange?.(event.target.value); onChange?.(event); }} {...props} /></div>;
}
export function CommandList({ className, ...props }: AnyProps) { return <div className={cn("v1-command-list", className)} {...props} />; }
export function CommandEmpty({ className, ...props }: AnyProps) { return <div className={cn("v1-command-empty", className)} {...props} />; }
export function CommandItem({ className, value = "", onSelect, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { value?: string; onSelect?: (value: string) => void }) {
  const context = React.useContext(CommandContext);
  const hidden = Boolean(context?.shouldFilter && context.query.trim() && !String(value).toLocaleLowerCase().includes(context.query.trim().toLocaleLowerCase()));
  return <button type="button" hidden={hidden} className={cn("v1-command-item", className)} onClick={(event) => { onClick?.(event); onSelect?.(value); }} {...props} />;
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
function findElement(children: React.ReactNode, type: any): React.ReactElement<AnyProps> | null {
  let found: React.ReactElement<AnyProps> | null = null;
  React.Children.forEach(children, (child) => {
    if (found || !React.isValidElement(child)) return;
    if (child.type === type) found = child as React.ReactElement<AnyProps>;
    else found = findElement((child.props as AnyProps).children, type);
  });
  return found;
}
export function Select({ value, defaultValue, onValueChange, disabled, children, ...props }: SelectProps) {
  const trigger = findElement(children, SelectTrigger);
  const valueElement = findElement(children, SelectValue);
  const options = collectSelectOptions(children);
  const widthMatch = String(trigger?.props.className || "").match(/w-\[(\d+)px\]/);
  const wrapStyle = {
    ...(trigger?.props.style || {}),
    width: widthMatch ? `${widthMatch[1]}px` : undefined,
  };
  return <span className="v1-select-wrap" style={wrapStyle}><select {...props} {...trigger?.props} disabled={disabled || trigger?.props.disabled} value={value} defaultValue={defaultValue} className={cn("v1-select", trigger?.props.className)} onChange={(event) => onValueChange?.(event.target.value)}>{valueElement?.props.placeholder && !value && <option value="" disabled>{valueElement.props.placeholder}</option>}{options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select><ChevronDown aria-hidden="true" /></span>;
}
export function SelectTrigger(_props: AnyProps) { return null; }
export function SelectValue(_props: AnyProps) { return null; }
export function SelectContent({ children }: AnyProps) { return <>{children}</>; }
export function SelectItem(_props: AnyProps) { return null; }
export function SelectGroup({ children }: AnyProps) { return <>{children}</>; }
export function SelectLabel({ children }: AnyProps) { return <>{children}</>; }
export function SelectSeparator() { return null; }

type SidebarContextValue = { open: boolean; toggle: () => void };
const SidebarContext = React.createContext<SidebarContextValue | null>(null);
export function SidebarProvider({ defaultOpen = true, className, style, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState<boolean>(() => {
    const saved = window.localStorage.getItem("kivisense.crm.v1.sidebar.open");
    return saved === null ? Boolean(defaultOpen) : saved === "true";
  });
  const toggle = () => setOpen((current) => {
    const next = !current;
    window.localStorage.setItem("kivisense.crm.v1.sidebar.open", String(next));
    return next;
  });
  return <SidebarContext.Provider value={{ open, toggle }}><div className={cn("v1-sidebar-wrapper", className)} style={style} data-open={open} {...props}>{children}</div></SidebarContext.Provider>;
}
export function Sidebar({ className, children, collapsible: _collapsible, variant: _variant, ...props }: AnyProps) { const context = React.useContext(SidebarContext); return <aside className={cn("v1-sidebar", className)} data-collapsed={!context?.open} {...props}><div className="v1-sidebar-inner">{children}</div></aside>; }
export function SidebarHeader({ className, ...props }: AnyProps) { return <header className={cn("v1-sidebar-header", className)} {...props} />; }
export function SidebarContent({ className, ...props }: AnyProps) { return <div className={cn("v1-sidebar-content", className)} {...props} />; }
export function SidebarFooter({ className, ...props }: AnyProps) { return <footer className={cn("v1-sidebar-footer", className)} {...props} />; }
export function SidebarGroup({ className, ...props }: AnyProps) { return <section className={cn("v1-sidebar-group", className)} {...props} />; }
export function SidebarGroupLabel({ className, ...props }: AnyProps) { return <div className={cn("v1-sidebar-group-label", className)} {...props} />; }
export function SidebarGroupContent({ className, ...props }: AnyProps) { return <div className={cn("v1-sidebar-group-content", className)} {...props} />; }
export function SidebarMenu({ className, ...props }: AnyProps) { return <ul className={cn("v1-sidebar-menu", className)} {...props} />; }
export function SidebarMenuItem({ className, ...props }: AnyProps) { return <li className={cn("v1-sidebar-menu-item", className)} {...props} />; }
export function SidebarMenuButton({ asChild, className, isActive, tooltip, size, children, ...props }: AnyProps) {
  const buttonProps = { ...props, className: cn("v1-sidebar-menu-button", className), "data-active": isActive, "data-size": size, title: typeof tooltip === "string" ? tooltip : undefined };
  return asChild ? <V1Slot {...buttonProps}>{children}</V1Slot> : <button type="button" {...buttonProps}>{children}</button>;
}
export function SidebarMenuBadge({ className, ...props }: AnyProps) { return <span className={cn("v1-sidebar-menu-badge", className)} {...props} />; }
export function SidebarRail({ className, ...props }: AnyProps) { const context = React.useContext(SidebarContext); return <button type="button" aria-label="展开或收起侧栏" className={cn("v1-sidebar-rail", className)} onClick={context?.toggle} {...props} />; }
export function SidebarInset({ className, ...props }: AnyProps) { return <div className={cn("v1-sidebar-inset", className)} {...props} />; }
export function SidebarTrigger({ className, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { const context = React.useContext(SidebarContext); return <button type="button" className={cn("v1-sidebar-trigger", className)} onClick={composeHandlers(onClick, context?.toggle)} {...props}><PanelLeft /></button>; }

export function TooltipProvider({ children }: AnyProps) { return <>{children}</>; }
export function Tooltip({ children }: AnyProps) { return <>{children}</>; }
export function TooltipTrigger({ asChild, children, ...props }: AnyProps) { return asChild ? <V1Slot {...props}>{children}</V1Slot> : <span {...props}>{children}</span>; }
export function TooltipContent({ children }: AnyProps) { return <span className="sr-only">{children}</span>; }

export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string; theme?: Record<string, string>; icon?: React.ComponentType }>;
const ChartContext = React.createContext<ChartConfig>({});
export function ChartContainer({ config, className, children, ...props }: AnyProps) {
  const variables = Object.fromEntries(Object.entries(config || {}).flatMap(([key, entry]: [string, any]) => entry.color ? [[`--color-${key}`, entry.color]] : []));
  return <ChartContext.Provider value={config}><div className={cn("v1-chart", className)} style={variables as React.CSSProperties} {...props}><Recharts.ResponsiveContainer width="100%" height="100%">{children}</Recharts.ResponsiveContainer></div></ChartContext.Provider>;
}
export const ChartTooltip = Recharts.Tooltip;
export function ChartTooltipContent({ active, payload, hideLabel, label, className }: AnyProps) {
  const config = React.useContext(ChartContext);
  if (!active || !payload?.length) return null;
  return <div className={cn("v1-chart-tooltip", className)}>{!hideLabel && label ? <div className="v1-chart-tooltip-label">{label}</div> : null}{payload.map((item: any, index: number) => <div key={`${item.dataKey || item.name}-${index}`} className="v1-chart-tooltip-row"><span className="v1-chart-tooltip-dot" style={{ background: item.color || item.fill }} /><span>{config[item.dataKey]?.label || item.name}</span><strong>{item.value}</strong></div>)}</div>;
}
