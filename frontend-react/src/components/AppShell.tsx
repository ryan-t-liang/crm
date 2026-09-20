import { useState, type ReactNode } from "react";
import { Avatar, Button, Dropdown, Modal, Select, Typography } from "@douyinfe/semi-ui";
import {
  IconApartment, IconApps, IconBriefcase, IconChevronDown, IconCheckList, IconGridView, IconHome,
  IconLayers, IconMenu, IconSetting, IconUserGroup, IconUserList,
} from "@douyinfe/semi-icons";
import { useCrm } from "@/stores/crm-store";
import { useMemberOperations } from "@/stores/member-operations-store";
import { brandScopeLabels } from "@/utils/brand-display";
import { initials, navigate } from "@/utils/format";

type NavItem = { label: string; route: string; icon: ReactNode; count?: number; hqOnly?: boolean };

export function AppShell({ route, children, onLogout, coachMode = false }: { route: string; children: ReactNode; onLogout: () => void; coachMode?: boolean }) {
  const { state, currentUser, isHq, setCurrentUser, scoped, reset, recoveryIssue: salesIssue } = useCrm();
  const { state: memberState, resetMemberData, recoveryIssue: memberIssue } = useMemberOperations();
  const knownSalesCount = (size: number) => salesIssue ? undefined : size;
  const knownMemberCount = (size: number) => memberIssue ? undefined : size;
  const [collapsed, setCollapsed] = useState(false);
  const standardGroups: Array<{ label: string; items: NavItem[] }> = [
    { label: "OVERVIEW", items: [{ label: "数据概览", route: "dashboard", icon: <IconHome /> }] },
    { label: "SALES", items: [
      { label: "Leads", route: "leads", icon: <IconLayers />, count: knownSalesCount(scoped(state.leads).length) },
      { label: "Deals", route: "deals", icon: <IconBriefcase />, count: knownSalesCount(scoped(state.deals).length) },
      { label: "联系人", route: "contacts", icon: <IconUserGroup />, count: knownSalesCount(scoped(state.contacts).length) },
      { label: "组织", route: "organizations", icon: <IconApartment />, count: knownSalesCount(scoped(state.organizations).length) },
      { label: "产品", route: "products", icon: <IconGridView />, count: state.products.filter((item) => item.status === "ACTIVE").length },
    ] },
    { label: "MEMBER & BRAND", items: [
      { label: "集团客户", route: "member-customers", icon: <IconUserGroup />, count: knownMemberCount(memberState.customers.length), hqOnly: true },
      { label: "品牌会员", route: "brand-members", icon: <IconUserList />, count: knownMemberCount(memberState.brandUsers.length), hqOnly: true },
      { label: "购买意向", route: "purchase-intents", icon: <IconLayers />, count: knownMemberCount(memberState.purchaseIntents.length), hqOnly: true },
      { label: "营销活动", route: "marketing", icon: <IconApps />, hqOnly: true },
    ] },
    { label: "WORK", items: [{ label: "任务", route: "tasks", icon: <IconCheckList />, count: knownSalesCount(scoped(state.tasks).filter((item) => item.status === "OPEN").length) }] },
    { label: "MANAGEMENT", items: [
      { label: "分销商", route: "distributors", icon: <IconApps />, count: state.distributors.length, hqOnly: true },
      { label: "用户", route: "users", icon: <IconUserList />, count: state.users.length, hqOnly: true },
    ] },
  ];
  const groups: Array<{ label: string; items: NavItem[] }> = coachMode
    ? [{ label: "", items: [{ label: "营销活动", route: "marketing", icon: <IconApps />, hqOnly: true }] }]
    : standardGroups;
  const roleLabel = currentUser.role === "HQ_ADMIN" ? "Kivisense Super Admin" : currentUser.role === "DISTRIBUTOR_MANAGER" ? "Distributor Manager" : currentUser.role === "DISTRIBUTOR_SALES" ? "Distributor Sales" : "Viewer · Read only";
  const activeTop = route.split("/")[0];
  const isMemberWorkspace = ["member-customers", "brand-members", "purchase-intents"].includes(activeTop);

  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="app-sidebar">
        <button className={`brand ${coachMode ? "coach-brand" : ""}`} onClick={() => navigate(coachMode ? "marketing" : "dashboard")} aria-label={coachMode ? "打开营销活动" : "打开数据概览"}>
          {coachMode ? <img className="coach-brand-logo" src="./coach-logo.png" alt="Coach" /> : <><span className="brand-mark"><img src="./kivisense-logo.svg" alt="" /></span>{!collapsed && <span><strong>KIVISENSE</strong><small>CRM PROTOTYPE</small></span>}</>}
        </button>
        <nav className="sidebar-nav" aria-label="主导航">
          {groups.map((group) => {
            const items = group.items.filter((item) => !item.hqOnly || isHq);
            if (!items.length) return null;
            return <section key={group.label} className="nav-group">
              {!collapsed && group.label && <p>{group.label}</p>}
              {items.map((item) => <button key={item.route} className={`nav-item ${activeTop === item.route ? "is-active" : ""}`} title={collapsed ? item.label : undefined} onClick={() => navigate(item.route)}>
                <span className="nav-icon">{item.icon}</span>
                {!collapsed && <><span>{item.label}</span>{item.count !== undefined && <small>{item.count}</small>}</>}
              </button>)}
            </section>;
          })}
        </nav>
        {!coachMode && <div className="sidebar-footer">
          <button className={`nav-item ${activeTop === "settings" ? "is-active" : ""}`} onClick={() => navigate("settings")}><span className="nav-icon"><IconSetting /></span>{!collapsed && <span>设置</span>}</button>
        </div>}
      </aside>
      <main className="app-main">
        <header className="topbar">
          <div className="topbar-leading">
            <Button theme="borderless" icon={<IconMenu />} aria-label={collapsed ? "展开侧栏" : "收起侧栏"} onClick={() => setCollapsed((value) => !value)} />
            <span className="breadcrumb">Kivisense CRM <b>/</b> {groups.flatMap((group) => group.items).find((item) => item.route === activeTop)?.label || "详情"}</span>
          </div>
          <div className="topbar-actions">
            {isHq && !coachMode && <span className="scope-pill">{isMemberWorkspace ? `会员运营 · ${memberState.brandScope === "ALL" ? "全品牌" : brandScopeLabels[memberState.brandScope]}` : "HQ · 全局视图"}</span>}
            {!coachMode && <Select
              className="demo-user-select"
              value={currentUser.id}
              onChange={(value) => setCurrentUser(String(value))}
              optionList={state.users.map((user) => ({ value: user.id, label: `${user.name} · ${user.title}` }))}
              aria-label="切换 Demo User"
            />}
            <Dropdown
              trigger="click"
              render={<Dropdown.Menu>{!coachMode && <Dropdown.Item onClick={() => navigate("settings")}>Prototype 设置</Dropdown.Item>}{isHq && !coachMode && <><Dropdown.Item onClick={() => Modal.confirm({ title: "Reset Sales Demo Data?", content: "此操作会清除当前浏览器中的 Sales Demo 数据并恢复初始数据。会员和营销数据不会受影响。", onOk: () => { reset(); } })}>Reset Sales Demo Data</Dropdown.Item><Dropdown.Item onClick={() => Modal.confirm({ title: "Reset Member Demo Data?", content: "此操作会清除当前浏览器中的 Member Demo 数据并恢复初始数据。销售和营销数据不会受影响。", onOk: () => { resetMemberData(); } })}>Reset Member Demo Data</Dropdown.Item></>}<Dropdown.Item onClick={onLogout}>退出登录</Dropdown.Item></Dropdown.Menu>}
            >
              <Button theme="borderless" className="user-menu"><Avatar size="small" color={currentUser.avatarColor as "green"}>{initials(currentUser.name)}</Avatar><span className="user-menu-copy"><Typography.Text strong>{currentUser.name}</Typography.Text><small>{roleLabel}</small></span><IconChevronDown /></Button>
            </Dropdown>
          </div>
        </header>
        <div className="page-scroll">{children}</div>
      </main>
    </div>
  );
}
