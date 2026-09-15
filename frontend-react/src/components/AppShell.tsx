import { useState, type ReactNode } from "react";
import { Avatar, Button, Dropdown, Select, Typography } from "@douyinfe/semi-ui";
import {
  IconApartment, IconApps, IconBriefcase, IconChevronDown, IconCheckList, IconGridView, IconHome,
  IconLayers, IconMenu, IconSetting, IconUserGroup, IconUserList,
} from "@douyinfe/semi-icons";
import { useCrm } from "@/stores/crm-store";
import { initials, navigate } from "@/utils/format";

type NavItem = { label: string; route: string; icon: ReactNode; count?: number; hqOnly?: boolean };

export function AppShell({ route, children }: { route: string; children: ReactNode }) {
  const { state, currentUser, isHq, setCurrentUser, scoped, reset } = useCrm();
  const [collapsed, setCollapsed] = useState(false);
  const groups: Array<{ label: string; items: NavItem[] }> = [
    { label: "OVERVIEW", items: [{ label: "数据概览", route: "dashboard", icon: <IconHome /> }] },
    { label: "SALES", items: [
      { label: "Leads", route: "leads", icon: <IconLayers />, count: scoped(state.leads).length },
      { label: "Deals", route: "deals", icon: <IconBriefcase />, count: scoped(state.deals).length },
      { label: "联系人", route: "contacts", icon: <IconUserGroup />, count: scoped(state.contacts).length },
      { label: "组织", route: "organizations", icon: <IconApartment />, count: scoped(state.organizations).length },
    ] },
    { label: "CATALOG", items: [{ label: "产品", route: "products", icon: <IconGridView />, count: state.products.filter((item) => item.status === "ACTIVE").length }] },
    { label: "WORK", items: [{ label: "任务", route: "tasks", icon: <IconCheckList />, count: scoped(state.tasks).filter((item) => item.status === "OPEN").length }] },
    { label: "MANAGEMENT", items: [
      { label: "分销商", route: "distributors", icon: <IconApps />, count: state.distributors.length, hqOnly: true },
      { label: "用户", route: "users", icon: <IconUserList />, count: state.users.length, hqOnly: true },
    ] },
  ];
  const roleLabel = currentUser.role === "HQ_ADMIN" ? "Kivisense Super Admin" : currentUser.role === "DISTRIBUTOR_MANAGER" ? "Distributor Manager" : "Distributor Sales";
  const activeTop = route.split("/")[0];

  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="app-sidebar">
        <button className="brand" onClick={() => navigate("dashboard")} aria-label="打开数据概览">
          <span className="brand-mark"><img src="./kivisense-logo.svg" alt="" /></span>
          {!collapsed && <span><strong>KIVISENSE</strong><small>CRM PROTOTYPE</small></span>}
        </button>
        <nav className="sidebar-nav" aria-label="主导航">
          {groups.map((group) => {
            const items = group.items.filter((item) => !item.hqOnly || isHq);
            if (!items.length) return null;
            return <section key={group.label} className="nav-group">
              {!collapsed && <p>{group.label}</p>}
              {items.map((item) => <button key={item.route} className={`nav-item ${activeTop === item.route ? "is-active" : ""}`} title={collapsed ? item.label : undefined} onClick={() => navigate(item.route)}>
                <span className="nav-icon">{item.icon}</span>
                {!collapsed && <><span>{item.label}</span>{item.count !== undefined && <small>{item.count}</small>}</>}
              </button>)}
            </section>;
          })}
        </nav>
        <div className="sidebar-footer">
          <button className={`nav-item ${activeTop === "settings" ? "is-active" : ""}`} onClick={() => navigate("settings")}><span className="nav-icon"><IconSetting /></span>{!collapsed && <span>设置</span>}</button>
        </div>
      </aside>
      <main className="app-main">
        <header className="topbar">
          <div className="topbar-leading">
            <Button theme="borderless" icon={<IconMenu />} aria-label={collapsed ? "展开侧栏" : "收起侧栏"} onClick={() => setCollapsed((value) => !value)} />
            <span className="breadcrumb">Kivisense CRM <b>/</b> {groups.flatMap((group) => group.items).find((item) => item.route === activeTop)?.label || "详情"}</span>
          </div>
          <div className="topbar-actions">
            {isHq && <span className="scope-pill">HQ · 全局视图</span>}
            <Select
              className="demo-user-select"
              value={currentUser.id}
              onChange={(value) => setCurrentUser(String(value))}
              optionList={state.users.map((user) => ({ value: user.id, label: `${user.name} · ${user.title}` }))}
              aria-label="切换 Demo User"
            />
            <Dropdown
              trigger="click"
              render={<Dropdown.Menu><Dropdown.Item onClick={() => navigate("settings")}>Prototype 设置</Dropdown.Item><Dropdown.Item onClick={reset}>Reset Demo Data</Dropdown.Item></Dropdown.Menu>}
            >
              <Button theme="borderless" className="user-menu"><Avatar size="small" color={currentUser.avatarColor as "green"}>{initials(currentUser.name)}</Avatar><span><Typography.Text strong>{currentUser.name}</Typography.Text><small>{roleLabel}</small></span><IconChevronDown /></Button>
            </Dropdown>
          </div>
        </header>
        <div className="page-scroll">{children}</div>
      </main>
    </div>
  );
}
