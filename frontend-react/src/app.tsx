import { useEffect, useState, type CSSProperties } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DashboardPage } from "@/pages/dashboard-page"
import { ApiError, crmApi, getData, legacyUrl, type CrmUser, type SessionUser } from "@/lib/api"

type NavigationCounts = Partial<Record<"organizations" | "contacts" | "leads", number>>

function currentRoute() {
  return window.location.hash.replace(/^#\/?/, "").split("/")[0] || "dashboard"
}

function LoadingShell() {
  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-muted/40">
      <aside className="border-r bg-background p-3"><Skeleton className="h-10 w-full rounded-[8px]" /></aside>
      <main className="bg-background">
        <div className="h-[52px] border-b p-3"><Skeleton className="h-7 w-52" /></div>
        <div className="space-y-5 p-6"><Skeleton className="h-14 w-80" /><Skeleton className="h-[360px] w-full rounded-[10px]" /></div>
      </main>
    </div>
  )
}

export function App() {
  const [route, setRoute] = useState(currentRoute)
  const [me, setMe] = useState<SessionUser | null>(null)
  const [users, setUsers] = useState<CrmUser[]>([])
  const [counts, setCounts] = useState<NavigationCounts>({})

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute())
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  useEffect(() => {
    if (route !== "dashboard") window.location.replace(legacyUrl(route))
  }, [route])

  useEffect(() => {
    if (route !== "dashboard") return
    let active = true
    async function initialize() {
      try {
        const session = await getData<SessionUser>("/api/v1/auth/me")
        if (!active) return
        if (session.mustChangePassword) {
          window.location.replace(legacyUrl("dashboard"))
          return
        }
        const permissions = new Set(session.permissions)
        const dashboardAllowed = permissions.has("crm.dashboard.management.view") || permissions.has("crm.dashboard.self.view")
        if (!dashboardAllowed) {
          window.location.replace(legacyUrl("dashboard"))
          return
        }
        setMe(session)

        const directoryPromise = permissions.has("crm.contact.view") || permissions.has("crm.lead.view") || permissions.has("crm.organization.view") || permissions.has("crm.task.view")
          ? getData<CrmUser[]>("/api/v1/crm/users").catch(() => [])
          : Promise.resolve([])
        const countRequests = [
          ["contacts", "crm.contact.view", "/api/v1/crm/contacts?page=1&pageSize=1"],
          ["leads", "crm.lead.view", "/api/v1/crm/leads?page=1&pageSize=1"],
          ["organizations", "crm.organization.view", "/api/v1/crm/organizations?page=1&pageSize=1"],
        ] as const
        const countPromise = Promise.all(countRequests.map(async ([key, permission, path]) => {
          if (!permissions.has(permission)) return [key, undefined] as const
          const result = await crmApi<{ meta: { total: number } }>(path).catch(() => null)
          return [key, result?.meta.total] as const
        }))
        const [directory, countEntries] = await Promise.all([directoryPromise, countPromise])
        if (!active) return
        setUsers(directory)
        setCounts(Object.fromEntries(countEntries.filter((entry) => typeof entry[1] === "number")))
      } catch (caught) {
        if (!active) return
        if (caught instanceof ApiError && caught.status === 401) {
          window.location.replace(legacyUrl("dashboard"))
          return
        }
        window.location.replace(legacyUrl("dashboard"))
      }
    }
    void initialize()
    return () => { active = false }
  }, [route])

  async function logout() {
    try { await crmApi("/api/v1/auth/logout", { method: "POST", body: "{}" }) } catch { /* The legacy login surface handles an already-expired session. */ }
    window.location.replace(legacyUrl("dashboard"))
  }

  if (route !== "dashboard" || !me) return <LoadingShell />

  const sidebarStyle = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3.75rem",
  } as CSSProperties

  return (
    <TooltipProvider delayDuration={250}>
      <SidebarProvider defaultOpen={window.innerWidth >= 1180} style={sidebarStyle}>
        <AppSidebar me={me} counts={counts} onLogout={() => { void logout() }} />
        <SidebarInset className="min-w-0 overflow-hidden bg-background">
          <SiteHeader />
          <DashboardPage me={me} users={users} />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
