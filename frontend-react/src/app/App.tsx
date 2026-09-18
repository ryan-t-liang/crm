import { useEffect, useState } from "react";
import { Banner } from "@douyinfe/semi-ui";
import { AppShell } from "@/components/AppShell";
import { ProductsPage } from "@/features/catalog/ProductsPage";
import { DistributorsPage, UsersPage } from "@/features/channel/ManagementPages";
import { ContactsPage, OrganizationsPage } from "@/features/customer/CustomerPages";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { DealsPage } from "@/features/deals/DealsPage";
import { LeadsPage } from "@/features/leads/LeadsPage";
import { BrandMembersPage, MemberCustomersPage, PurchaseIntentsPage } from "@/features/member-operations/MemberOperationsPages";
import { SettingsPage } from "@/features/work/SettingsPage";
import { TasksPage } from "@/features/work/TasksPage";
import { MarketingPage, MarketingRedemptionSurface } from "@/features/marketing/MarketingPages";
import { useCrm } from "@/stores/crm-store";
import { useMemberOperations } from "@/stores/member-operations-store";

const readRoute = () => window.location.hash.replace(/^#\/?/, "") || "dashboard";

export function App() {
  const [route, setRoute] = useState(readRoute);
  const { state, currentUser, isHq, recoveryIssue: salesIssue } = useCrm();
  const { recoveryIssue: memberIssue } = useMemberOperations();
  useEffect(() => {
    const change = () => setRoute(readRoute());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const [section, id] = route.split("/");
  // A separate existing staff surface, never rendered inside CRM navigation.
  if (section === "redemption" || section === "marketing" && id === "redemption") return <MarketingRedemptionSurface code={route.split("/").slice(section === "redemption" ? 1 : 2).join("/")} />;
  const scopedDetailRows = section === "leads" ? state.leads : section === "deals" ? state.deals : section === "contacts" ? state.contacts : section === "organizations" ? state.organizations : null;
  const detailDenied = Boolean(id && scopedDetailRows && !isHq && !scopedDetailRows.some((row) => row.id === id && row.distributorId === currentUser.distributorId));
  let page: React.ReactNode;
  if (salesIssue && section !== "settings") page = <div className="page"><Banner type="danger" title={salesIssue} description="原有数据不会自动替换成演示数据。请刷新重试，或由 HQ 管理员在设置中确认重置 Sales Demo Data。" closeIcon={null} /></div>;
  else if (memberIssue && ["member-customers", "brand-members", "purchase-intents"].includes(section)) page = <div className="page"><Banner type="danger" title={memberIssue} description="未加载演示数据代替原数据。请刷新重试，或由 HQ 管理员在设置中确认重置 Member Demo Data。" closeIcon={null} /></div>;
  else if (detailDenied) page = <div className="page"><Banner type="warning" title="记录不存在或不在当前角色授权范围" description="返回对应列表查看当前分销商的记录。" closeIcon={null} /></div>;
  else if (section === "leads") page = <LeadsPage id={id} />;
  else if (section === "deals") page = <DealsPage id={id} />;
  else if (section === "contacts") page = <ContactsPage id={id} />;
  else if (section === "organizations") page = <OrganizationsPage id={id} />;
  else if (section === "products") page = <ProductsPage id={id} />;
  else if (section === "tasks") page = <TasksPage />;
  else if (section === "marketing") page = <MarketingPage path={route.split("/").slice(1)} />;
  else if (section === "member-customers" && isHq) page = <MemberCustomersPage id={id} />;
  else if (section === "brand-members" && isHq) page = <BrandMembersPage id={id} />;
  else if (section === "purchase-intents" && isHq) page = <PurchaseIntentsPage id={id} />;
  else if (section === "distributors" && isHq) page = <DistributorsPage id={id} />;
  else if (section === "users" && isHq) page = <UsersPage />;
  else if (section === "settings") page = <SettingsPage />;
  else if (["member-customers", "brand-members", "purchase-intents", "distributors", "users"].includes(section) && !isHq) page = <div className="page"><Banner type="warning" title="当前 Demo User 无权访问 HQ 工作区" description="会员与品牌运营不会复用分销商销售数据范围；请切换为 Kivisense Super Admin。" closeIcon={null} /></div>;
  else page = <DashboardPage view={section === "dashboard" ? id : undefined} />;
  return <AppShell route={route}>{section === "settings" && <>{salesIssue && <Banner type="danger" title={salesIssue} closeIcon={null} />}{isHq && memberIssue && <Banner type="danger" title={memberIssue} closeIcon={null} />}</>}{page}</AppShell>;
}
