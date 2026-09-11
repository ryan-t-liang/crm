import { useEffect, type ReactNode } from "react";
import { Layout } from "@douyinfe/semi-ui";

import { useCrmShell, useOptionalCrmShell, type CrmBreadcrumb } from "./shell";
import { cn } from "@/lib/utils";

export function CRMAppShell({
  sidebar,
  header,
  children,
}: {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
}) {
  const { collapsed } = useCrmShell();

  return (
    <Layout className={cn("crm-shell", collapsed && "is-collapsed")} hasSider>
      <Layout.Sider className="crm-app-sider" aria-label="主导航">
        {sidebar}
      </Layout.Sider>
      <Layout className="crm-shell-main">
        <Layout.Header className="crm-app-header">{header}</Layout.Header>
        <Layout.Content className="crm-app-content">{children}</Layout.Content>
      </Layout>
    </Layout>
  );
}

export function CRMPageContainer({
  mode = "standard",
  breadcrumbs,
  className,
  children,
}: {
  mode?: "standard" | "list" | "record";
  breadcrumbs?: CrmBreadcrumb[];
  className?: string;
  children: ReactNode;
}) {
  const shell = useOptionalCrmShell();
  const setPageBreadcrumbs = shell?.setPageBreadcrumbs;
  const breadcrumbSignature = JSON.stringify(breadcrumbs || []);

  useEffect(() => {
    if (!breadcrumbs || !setPageBreadcrumbs) return;
    setPageBreadcrumbs(breadcrumbs);
    return () => setPageBreadcrumbs(null);
    // The signature intentionally tracks value changes without requiring every
    // page to memoize a short breadcrumb array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breadcrumbSignature, setPageBreadcrumbs]);

  return (
    <div
      className={cn(
        "crm-page-container",
        `crm-page-container--${mode}`,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CRMListLayout({
  header,
  stats,
  className,
  children,
}: {
  header: ReactNode;
  stats?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("crm-list-layout", className)}>
      {header}
      {stats ? <div className="crm-list-layout-stats">{stats}</div> : null}
      <div className="crm-list-layout-workspace">{children}</div>
    </div>
  );
}

export function CRMRecordLayout({
  header,
  inlineMeta,
  stages,
  sidebar,
  className,
  children,
}: {
  header: ReactNode;
  inlineMeta?: ReactNode;
  stages?: ReactNode;
  sidebar: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("crm-record-layout", className)}>
      <header className="crm-record-layout-header">{header}</header>
      {inlineMeta ? (
        <div className="crm-record-layout-meta">{inlineMeta}</div>
      ) : null}
      {stages ? <div className="crm-record-layout-stages">{stages}</div> : null}
      <div className="crm-record-layout-body">
        <aside className="crm-record-layout-sidebar">{sidebar}</aside>
        <section className="crm-record-layout-workspace">{children}</section>
      </div>
    </div>
  );
}
