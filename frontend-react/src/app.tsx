import { useEffect, useState, type CSSProperties } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/v1/ui";
import { Skeleton } from "@/components/v1/ui";
import { TooltipProvider } from "@/components/v1/ui";
import { DashboardPage } from "@/pages/dashboard-page";
import { OrganizationsPage } from "@/pages/organizations-page";
import { EntitiesPage } from "@/pages/entities-page";
import { OperationsPage, WorkbenchPage } from "@/pages/operations-page";
import { AccountsPage, RolesPage, AuditPage } from "@/pages/system-pages";
import { LoginPage, PasswordPage } from "@/pages/auth-page";
import { MarketingLeadsPage } from "@/pages/marketing-leads-page";
import { ScoringRulesPage } from "@/pages/scoring-rules-page";
import { migratedRoutes } from "@/lib/crm";
import { ErrorState, PageContent } from "@/components/crm/primitives";
import {
  ApiError,
  crmApi,
  getData,
  type CrmUser,
  type SessionUser,
} from "@/lib/api";

type NavigationCounts = Partial<
  Record<"organizations" | "contacts" | "leads" | "marketingLeads", number>
>;

function currentRoute() {
  return window.location.hash.replace(/^#\/?/, "") || "dashboard";
}

function LoadingShell() {
  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-muted/40">
      <aside className="border-r bg-background p-3">
        <Skeleton className="h-10 w-full rounded-[8px]" />
      </aside>
      <main className="bg-background">
        <div className="h-[52px] border-b p-3">
          <Skeleton className="h-7 w-52" />
        </div>
        <div className="space-y-5 p-6">
          <Skeleton className="h-14 w-80" />
          <Skeleton className="h-[360px] w-full rounded-[10px]" />
        </div>
      </main>
    </div>
  );
}

export function App() {
  const [route, setRoute] = useState(currentRoute);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [counts, setCounts] = useState<NavigationCounts>({});
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [family, entityId] = route.split("/");

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const expired = () => {
      setMe(null);
      setUsers([]);
      setCounts({});
      setSessionChecked(true);
    };
    window.addEventListener("crm:session-expired", expired);
    return () => window.removeEventListener("crm:session-expired", expired);
  }, []);

  useEffect(() => {
    let active = true;
    setError(null);
    async function initialize() {
      try {
        const session = await getData<SessionUser>("/api/v1/auth/me");
        if (!active) return;
        const permissions = new Set(session.permissions);
        setMe(session);
        setSessionChecked(true);
        if (session.mustChangePassword) return;

        const directoryPromise =
          permissions.has("crm.contact.view") ||
          permissions.has("crm.lead.view") ||
          permissions.has("crm.organization.view") ||
          permissions.has("crm.task.view")
            ? getData<CrmUser[]>("/api/v1/crm/users").catch(() => [])
            : Promise.resolve([]);
        const countRequests = [
          [
            "contacts",
            "crm.contact.view",
            "/api/v1/crm/contacts?page=1&pageSize=1",
          ],
          ["leads", "crm.lead.view", "/api/v1/crm/leads?page=1&pageSize=1"],
          ["marketingLeads", "crm.marketing_lead.view", "/api/v1/crm/marketing-leads?page=1&pageSize=1"],
          [
            "organizations",
            "crm.organization.view",
            "/api/v1/crm/organizations?page=1&pageSize=1",
          ],
        ] as const;
        const countPromise = Promise.all(
          countRequests.map(async ([key, permission, path]) => {
            if (!permissions.has(permission)) return [key, undefined] as const;
            const result = await crmApi<{ meta: { total: number } }>(
              path,
            ).catch(() => null);
            return [key, result?.meta.total] as const;
          }),
        );
        const [directory, countEntries] = await Promise.all([
          directoryPromise,
          countPromise,
        ]);
        if (!active) return;
        setUsers(directory);
        setCounts(
          Object.fromEntries(
            countEntries.filter((entry) => typeof entry[1] === "number"),
          ),
        );
      } catch (caught) {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) {
          setMe(null);
          setSessionChecked(true);
          return;
        }
        setError(caught);
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    const refreshCounts = () => {
      if (!me) return;
      for (const [key, permission] of [
        ["organizations", "organization"],
        ["contacts", "contact"],
        ["leads", "lead"],
        ["marketingLeads", "marketing_lead"],
      ] as const) {
        if (me.permissions.includes(`crm.${permission}.view`))
          void crmApi<{ meta: { total: number } }>(
            `/api/v1/crm/${key === "marketingLeads" ? "marketing-leads" : key}?pageSize=1`,
          )
            .then((r) => setCounts((c) => ({ ...c, [key]: r.meta.total })))
            .catch(() => {});
      }
    };
    window.addEventListener("crm:data-changed", refreshCounts);
    return () => window.removeEventListener("crm:data-changed", refreshCounts);
  }, [me]);

  async function logout() {
    try {
      await crmApi("/api/v1/auth/logout", { method: "POST", body: "{}" });
    } catch (caught) {
      if (!(caught instanceof ApiError && caught.status === 401)) {
        setError(caught);
        return;
      }
    }
    setMe(null);
    setUsers([]);
    setCounts({});
    setSessionChecked(true);
    window.location.hash = "dashboard";
  }

  if (error)
    return (
      <PageContent>
        <ErrorState error={error} retry={() => setReloadKey((v) => v + 1)} />
      </PageContent>
    );
  if (!me)
    return sessionChecked ? (
      <LoginPage
        onSignedIn={() => {
          setSessionChecked(false);
          setReloadKey((v) => v + 1);
          if (family === "login") window.location.hash = "dashboard";
        }}
      />
    ) : (
      <LoadingShell />
    );
  const sessionRefresh = () => setReloadKey((v) => v + 1);
  if (me.mustChangePassword)
    return (
      <PasswordPage
        me={me}
        onSaved={sessionRefresh}
        onLogout={() => {
          void logout();
        }}
      />
    );
  const titles: Record<string, string> = {
    accounts: "账户管理",
    roles: "角色与权限",
    audit: "审计日志",
    security: "账户安全",
    login: "数据看板",
    "scoring-rules": "评分规则",
  };
  const entityKind = family === "contacts" ? "contact" : "lead";
  const pageAllowed =
    family === "dashboard" || family === "login"
      ? me.permissions.some((p) =>
          ["crm.dashboard.management.view", "crm.dashboard.self.view"].includes(
            p,
          ),
        )
      : family === "security"
        ? true
        : family === "scoring-rules"
          ? me.permissions.includes("crm.marketing.score_rule.view")
          : family === "marketing-leads"
            ? me.permissions.includes("crm.marketing_lead.view")
        : ["accounts", "roles", "audit"].includes(family)
          ? me.permissions.includes(
              (
                {
                  accounts: "account.view",
                  roles: "roles.view",
                  audit: "audit.view",
                } as Record<string, string>
              )[family],
            )
          : me.permissions.includes(
              `crm.${["organizations", "operations", "suppliers", "vendors"].includes(family) ? "organization" : family === "workbench" ? "task" : entityKind}.view`,
            );

  const sidebarStyle = {
    "--sidebar-width": "14.75rem",
    "--sidebar-width-icon": "5.125rem",
  } as CSSProperties;

  return (
    <TooltipProvider delayDuration={250}>
      <SidebarProvider
        defaultOpen={window.innerWidth >= 1180}
        style={sidebarStyle}
      >
        <AppSidebar
          me={me}
          counts={counts}
          route={family}
          onLogout={() => {
            void logout();
          }}
        />
        <SidebarInset className="min-w-0 overflow-hidden bg-background">
          <SiteHeader
            title={
              titles[family] ||
              (family === "operations"
                ? "客户运营"
                : family === "workbench"
                  ? "工作台"
                  : ["suppliers", "vendors"].includes(family)
                    ? "供应商"
                    : family === "dashboard"
                      ? "数据看板"
                      : family === "organizations"
                        ? entityId
                          ? "组织 / 组织详情"
                          : "组织"
                        : family === "contacts"
                          ? entityId
                            ? "联系人详情"
                            : "联系人"
                          : family === "marketing-leads"
                            ? entityId
                              ? "线索 / 线索详情"
                              : "线索"
                            : entityId
                              ? "商机 / 商机详情"
                              : "商机")
            }
            dashboard={family === "dashboard"}
          />
          {!migratedRoutes.has(family) ? (
            <PageContent>
              <p>页面不存在。</p>
              <a href="#dashboard">返回数据看板</a>
            </PageContent>
          ) : !pageAllowed ? (
            <PageContent>
              <p>当前账号没有此页面的访问权限。</p>
            </PageContent>
          ) : family === "accounts" ? (
            <AccountsPage me={me} onSessionChanged={sessionRefresh} />
          ) : family === "roles" ? (
            <RolesPage me={me} onSessionChanged={sessionRefresh} />
          ) : family === "audit" ? (
            <AuditPage />
          ) : family === "security" ? (
            <PasswordPage
              me={me}
              onSaved={() => {
                sessionRefresh();
                window.location.hash = "dashboard";
              }}
              onLogout={() => {
                void logout();
              }}
            />
          ) : family === "scoring-rules" ? (
            <ScoringRulesPage me={me} />
          ) : family === "marketing-leads" ? (
            <MarketingLeadsPage me={me} users={users} id={entityId} />
          ) : family === "dashboard" || family === "login" ? (
            <DashboardPage me={me} users={users} />
          ) : family === "operations" ? (
            <OperationsPage me={me} users={users} />
          ) : family === "workbench" ? (
            <WorkbenchPage me={me} users={users} />
          ) : ["organizations", "suppliers", "vendors"].includes(family) ? (
            <OrganizationsPage
              key={family}
              me={me}
              users={users}
              id={entityId}
              supplier={family !== "organizations"}
            />
          ) : (
            <EntitiesPage
              key={`${family}/${entityId || "list"}`}
              kind={entityKind}
              me={me}
              users={users}
              id={entityId}
            />
          )}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
