import { createContext, useCallback, useContext, useState, type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ShellContextValue = {
  collapsed: boolean;
  toggle: () => void;
  pageBreadcrumbs: CrmBreadcrumb[] | null;
  setPageBreadcrumbs: (breadcrumbs: CrmBreadcrumb[] | null) => void;
};

export type CrmBreadcrumb = {
  label: string;
  href?: string;
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
  const [pageBreadcrumbs, setPageBreadcrumbsState] = useState<CrmBreadcrumb[] | null>(null);
  const setPageBreadcrumbs = useCallback((breadcrumbs: CrmBreadcrumb[] | null) => {
    setPageBreadcrumbsState(breadcrumbs);
  }, []);
  return <ShellContext.Provider value={{ collapsed, toggle, pageBreadcrumbs, setPageBreadcrumbs }}><div className={cn("crm-shell-provider", className)} {...props}>{children}</div></ShellContext.Provider>;
}

export function useCrmShell() {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useCrmShell must be used within CrmShellProvider");
  return value;
}

export function useOptionalCrmShell() {
  return useContext(ShellContext);
}
