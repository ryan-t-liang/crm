import { Breadcrumb, Button, Tag, Tooltip } from "@douyinfe/semi-ui";
import { IconMenu, IconTickCircle } from "@douyinfe/semi-icons";

import { useCrmShell, type CrmBreadcrumb } from "@/components/crm/shell";

export function SiteHeader({ breadcrumbs, dashboard = true }: { breadcrumbs: CrmBreadcrumb[]; dashboard?: boolean }) {
  const { toggle, pageBreadcrumbs } = useCrmShell();
  const items = pageBreadcrumbs || breadcrumbs;
  return (
    <div className="crm-site-header">
      <div className="crm-site-header-leading">
        <Button className="crm-sidebar-trigger" theme="borderless" type="tertiary" icon={<IconMenu />} aria-label="展开或收起侧栏" onClick={toggle} />
        <Breadcrumb className="crm-site-breadcrumb" compact={false} showTooltip={{ width: 240, ellipsisPos: "end" }}>
          {items.map((item, index) => (
            <Breadcrumb.Item key={`${item.label}-${index}`} href={item.href} noLink={!item.href}>
              {index === items.length - 1 && item.label.length > 24 ? (
                <Tooltip content={item.label}><span className="crm-breadcrumb-record-name">{item.label}</span></Tooltip>
              ) : item.label}
            </Breadcrumb.Item>
          ))}
        </Breadcrumb>
      </div>
      <div className="crm-site-header-actions">
        {dashboard && <Tag className="crm-header-status" color="grey" prefixIcon={<IconTickCircle />}>非金额运营视图</Tag>}
        <div id="crm-site-header-context-actions" className="crm-site-header-context-actions" />
      </div>
    </div>
  );
}
