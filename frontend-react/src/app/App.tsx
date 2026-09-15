import { useEffect, useState } from "react";
import { Banner } from "@douyinfe/semi-ui";
import { AppShell } from "@/components/AppShell";
import { ProductsPage } from "@/features/catalog/ProductsPage";
import { DistributorsPage, UsersPage } from "@/features/channel/ManagementPages";
import { ContactsPage, OrganizationsPage } from "@/features/customer/CustomerPages";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { DealsPage } from "@/features/deals/DealsPage";
import { LeadsPage } from "@/features/leads/LeadsPage";
import { SettingsPage } from "@/features/work/SettingsPage";
import { TasksPage } from "@/features/work/TasksPage";
import { useCrm } from "@/stores/crm-store";

const readRoute = () => window.location.hash.replace(/^#\/?/, "") || "dashboard";

export function App() {
  const [route, setRoute] = useState(readRoute);
  const { isHq } = useCrm();
  useEffect(() => {
    const change = () => setRoute(readRoute());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const [section, id] = route.split("/");
  let page: React.ReactNode;
  if (section === "leads") page = <LeadsPage id={id} />;
  else if (section === "deals") page = <DealsPage id={id} />;
  else if (section === "contacts") page = <ContactsPage id={id} />;
  else if (section === "organizations") page = <OrganizationsPage id={id} />;
  else if (section === "products") page = <ProductsPage id={id} />;
  else if (section === "tasks") page = <TasksPage />;
  else if (section === "distributors" && isHq) page = <DistributorsPage id={id} />;
  else if (section === "users" && isHq) page = <UsersPage />;
  else if (section === "settings") page = <SettingsPage />;
  else if (["distributors", "users"].includes(section) && !isHq) page = <div className="page"><Banner type="warning" title="当前 Demo User 无权访问 HQ 管理功能" description="请从右上角切换为 Kivisense Super Admin。" closeIcon={null} /></div>;
  else page = <DashboardPage />;
  return <AppShell route={route}>{page}</AppShell>;
}
