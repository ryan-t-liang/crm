import {
  Building2,
  ChevronsUpDown,
  ContactRound,
  Goal,
  Gauge,
  LayoutDashboard,
  ListTodo,
  LogOut,
  ScrollText,
  ShieldCheck,
  Truck,
  UsersRound,
  type LucideIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { assetUrl, legacyUrl, type SessionUser } from "@/lib/api"
import { migratedRoutes } from "@/lib/crm"

type NavItem = {
  label: string
  route: string
  icon: LucideIcon
  permission?: string
  anyPermissions?: string[]
  countKey?: "organizations" | "contacts" | "leads" | "marketingLeads"
}

type NavigationCounts = Partial<Record<NonNullable<NavItem["countKey"]>, number>>

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "概览",
    items: [
      { label: "数据看板", route: "dashboard", icon: LayoutDashboard, anyPermissions: ["crm.dashboard.self.view", "crm.dashboard.management.view"] },
      { label: "我的工作台", route: "workbench", icon: ListTodo, permission: "crm.task.view" },
    ],
  },
  {
    label: "客户管理",
    items: [
      { label: "公司", route: "organizations", icon: Building2, permission: "crm.organization.view", countKey: "organizations" },
      { label: "联系人", route: "contacts", icon: ContactRound, permission: "crm.contact.view", countKey: "contacts" },
      { label: "线索", route: "marketing-leads", icon: Goal, permission: "crm.marketing_lead.view", countKey: "marketingLeads" },
      { label: "商机", route: "leads", icon: Gauge, permission: "crm.lead.view", countKey: "leads" },
    ],
  },
  {
    label: "资源",
    items: [
      { label: "供应商", route: "suppliers", icon: Truck, permission: "crm.organization.view" },
    ],
  },
  {
    label: "系统",
    items: [
      { label: "账户管理", route: "accounts", icon: UsersRound, permission: "account.view" },
      { label: "角色与权限", route: "roles", icon: ShieldCheck, permission: "roles.view" },
      { label: "评分规则", route: "scoring-rules", icon: Goal, permission: "crm.marketing.score_rule.view" },
      { label: "审计日志", route: "audit", icon: ScrollText, permission: "audit.view" },
    ],
  },
]

function allowed(item: NavItem, permissions: Set<string>) {
  if (item.permission) return permissions.has(item.permission)
  if (item.anyPermissions) return item.anyPermissions.some((permission) => permissions.has(permission))
  return true
}

export function AppSidebar({ me, counts, onLogout, route = "dashboard" }: { me: SessionUser; counts: NavigationCounts; onLogout: () => void; route?: string }) {
  const permissions = new Set(me.permissions)
  const initials = me.name.trim().slice(0, 1).toUpperCase() || "K"

  return (
    <Sidebar collapsible="icon" variant="sidebar" aria-label="主导航" className="crm-sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="crm-brand-lockup data-[slot=sidebar-menu-button]:hover:bg-transparent">
              <a href="#dashboard" aria-label="返回数据看板">
                <span className="crm-logo-tile flex items-center justify-center border border-sidebar-border bg-white">
                  <img src={assetUrl("/assets/kivisense-logo.svg")} alt="Kivisense 标志" />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-[13px] font-semibold tracking-[0.12em]">KIVISENSE</span>
                  <span className="truncate text-xs text-muted-foreground">CRM 2.0</span>
                </span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => {
          const items = group.items.filter((item) => allowed(item, permissions))
          if (!items.length) return null
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const Icon = item.icon
                    const isActive = item.route === route
                    const count = item.countKey ? counts[item.countKey] : undefined
                    return (
                      <SidebarMenuItem key={item.route}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                          <a href={migratedRoutes.has(item.route) ? `#${item.route}` : legacyUrl(item.route)}>
                            <Icon />
                            <span>{item.label}</span>
                          </a>
                        </SidebarMenuButton>
                        {typeof count === "number" ? <SidebarMenuBadge>{count > 999 ? "999+" : count}</SidebarMenuBadge> : null}
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="min-h-[52px] data-[state=open]:bg-sidebar-accent">
                  <Avatar className="size-[34px]">
                    <AvatarFallback className="bg-[#eee6d8] font-serif text-xs font-semibold text-[#0b0b0b]">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-medium">{me.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{me.role.name}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" sideOffset={8} className="w-56 rounded-[8px]">
                <DropdownMenuLabel className="font-normal">
                  <div className="grid gap-1">
                    <span className="text-sm font-medium">{me.name}</span>
                    <span className="text-xs text-muted-foreground">{me.loginAccount}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><a href="#security"><ShieldCheck />账户安全</a></DropdownMenuItem>
                <DropdownMenuItem onSelect={onLogout}>
                  <LogOut />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
