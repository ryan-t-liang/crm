import { createContext, useContext, useState, type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ShellContextValue = {
  collapsed: boolean;
  toggle: () => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function CrmShellProvider({ defaultCollapsed = false, className, children, ...props }: HTMLAttributes<HTMLDivElement> & { defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = window.localStorage.getItem("kivisense.crm.sidebar.collapsed");
    return stored === null ? defaultCollapsed : stored === "true";
  });
  const toggle = () => setCollapsed((current) => {
    const next = !current;
    window.localStorage.setItem("kivisense.crm.sidebar.collapsed", String(next));
    return next;
  });
  return <ShellContext.Provider value={{ collapsed, toggle }}><div className={cn("crm-shell", className)} data-collapsed={collapsed} {...props}>{children}</div></ShellContext.Provider>;
}

export function useCrmShell() {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useCrmShell must be used within CrmShellProvider");
  return value;
}

export function CrmShellMain({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("crm-shell-main", className)} {...props} />;
}
