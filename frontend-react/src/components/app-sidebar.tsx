import { Avatar, Button, Dropdown, Nav as Navigation, Typography } from "@douyinfe/semi-ui";
import {
  IconBriefcaseStroked,
  IconExit,
  IconHistogram,
  IconHomeStroked,
  IconKanban,
  IconKeyStroked,
  IconSettingStroked,
  IconShieldStroked,
  IconUserGroup,
  IconUserListStroked,
} from "@douyinfe/semi-icons";
import type { ReactNode } from "react";

import { useCrmShell } from "@/components/crm/shell";
import { assetUrl, type SessionUser } from "@/lib/api";

type CountKey = "organizations" | "contacts" | "leads" | "marketingLeads";
type NavigationCounts = Partial<Record<CountKey, number>>;
type NavItem = { label: string; route: string; icon: ReactNode; permission?: string; anyPermissions?: string[]; countKey?: CountKey };

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "概览",
    items: [
      { label: "数据看板", route: "dashboard", icon: <IconHomeStroked />, anyPermissions: ["crm.dashboard.self.view", "crm.dashboard.management.view"] },
      { label: "我的工作台", route: "workbench", icon: <IconKanban />, permission: "crm.task.view" },
    ],
  },
  {
    label: "客户管理",
    items: [
      { label: "组织", route: "organizations", icon: <IconBriefcaseStroked />, permission: "crm.organization.view", countKey: "organizations" },
      { label: "联系人", route: "contacts", icon: <IconUserListStroked />, permission: "crm.contact.view", countKey: "contacts" },
      { label: "线索", route: "marketing-leads", icon: <IconHistogram />, permission: "crm.marketing_lead.view", countKey: "marketingLeads" },
      { label: "商机", route: "leads", icon: <IconKanban />, permission: "crm.lead.view", countKey: "leads" },
    ],
  },
  {
    label: "资源",
    items: [{ label: "供应商", route: "suppliers", icon: <IconUserGroup />, permission: "crm.organization.view" }],
  },
  {
    label: "系统",
    items: [
      { label: "账户管理", route: "accounts", icon: <IconUserGroup />, permission: "account.view" },
      { label: "角色与权限", route: "roles", icon: <IconShieldStroked />, permission: "roles.view" },
      { label: "评分规则", route: "scoring-rules", icon: <IconSettingStroked />, permission: "crm.marketing.score_rule.view" },
      { label: "审计日志", route: "audit", icon: <IconKeyStroked />, permission: "audit.view" },
    ],
  },
];

function allowed(item: NavItem, permissions: Set<string>) {
  if (item.permission) return permissions.has(item.permission);
  if (item.anyPermissions) return item.anyPermissions.some((permission) => permissions.has(permission));
  return true;
}

function UserMenu({ me, onLogout }: { me: SessionUser; onLogout: () => void }) {
  const initials = me.name.trim().slice(0, 1).toUpperCase() || "K";
  return (
    <Dropdown
      trigger="click"
      position="rightBottom"
      render={
        <Dropdown.Menu className="crm-user-menu">
          <Dropdown.Title><div className="crm-user-menu-copy"><strong>{me.name}</strong><span>{me.loginAccount}</span></div></Dropdown.Title>
          <Dropdown.Divider />
          <Dropdown.Item icon={<IconShieldStroked />} onClick={() => { window.location.hash = "security"; }}>账户安全</Dropdown.Item>
          <Dropdown.Item icon={<IconExit />} type="danger" onClick={onLogout}>退出登录</Dropdown.Item>
        </Dropdown.Menu>
      }
    >
      <Button theme="borderless" type="tertiary" className="crm-sidebar-user" aria-label="打开用户菜单">
        <Avatar size="small" color="grey">{initials}</Avatar>
        <span className="crm-sidebar-user-copy"><strong>{me.name}</strong><small>{me.role.name}</small></span>
      </Button>
    </Dropdown>
  );
}

export function AppSidebar({ me, counts, onLogout, route = "dashboard" }: { me: SessionUser; counts: NavigationCounts; onLogout: () => void; route?: string }) {
  const permissions = new Set(me.permissions);
  const { collapsed } = useCrmShell();
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowed(item, permissions)),
    }))
    .filter((group) => group.items.length > 0);
  return (
    <div className="crm-sidebar" data-collapsed={collapsed}>
      <Navigation className="crm-navigation" mode="vertical" isCollapsed={collapsed} selectedKeys={[route]} header={
        <a className="crm-brand-lockup" href="#dashboard" aria-label="返回数据看板">
          <span className="crm-logo-tile"><img src={assetUrl("/assets/kivisense-logo.svg")} alt="Kivisense 标志" /></span>
          {!collapsed && <span className="crm-brand-copy"><Typography.Text strong>KIVISENSE</Typography.Text><small>CRM 2.0</small></span>}
        </a>
      } footer={<UserMenu me={me} onLogout={onLogout} />}>
        {visibleGroups.flatMap((group) => [
          <li key={`${group.label}-label`} className="crm-nav-group" role="presentation">
            {!collapsed && <div className="crm-nav-group-label">{group.label}</div>}
          </li>,
          ...group.items.map((item) => {
            const count = item.countKey ? counts[item.countKey] : undefined;
            return <Navigation.Item key={item.route} itemKey={item.route} icon={item.icon} link={`#${item.route}`} text={<span className="crm-nav-item-text"><span>{item.label}</span>{typeof count === "number" && <b>{count > 999 ? "999+" : count}</b>}</span>} />;
          }),
        ])}
      </Navigation>
    </div>
  );
}
