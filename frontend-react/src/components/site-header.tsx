import { Breadcrumb, Button, Tag } from "@douyinfe/semi-ui";
import { IconMenu, IconTickCircle } from "@douyinfe/semi-icons";

import { useCrmShell } from "@/components/crm/shell";

export function SiteHeader({ title = "数据看板", dashboard = true }: { title?: string; dashboard?: boolean }) {
  const { toggle } = useCrmShell();
  return (
    <header className="crm-site-header">
      <div className="crm-site-header-leading">
        <Button className="crm-sidebar-trigger" theme="borderless" type="tertiary" icon={<IconMenu />} aria-label="展开或收起侧栏" onClick={toggle} />
        <Breadcrumb routes={["Kivisense CRM", title]} compact={false} />
      </div>
      <div className="crm-site-header-actions">
        {dashboard && <Tag className="crm-header-status" color="grey" prefixIcon={<IconTickCircle />}>非金额运营视图</Tag>}
        <div id="crm-site-header-context-actions" className="crm-site-header-context-actions" />
      </div>
    </header>
  );
}
