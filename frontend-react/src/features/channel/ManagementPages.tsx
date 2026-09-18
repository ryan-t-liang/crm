import { TabPane, Table, Tabs, Tag } from "@douyinfe/semi-ui";
import { DataList, DetailWorkspace, EmptyBlock, PageHeader, SideSection, StatusTag, TableEntity } from "@/components/CrmUi";
import { useCrm } from "@/stores/crm-store";
import type { Distributor } from "@/types/crm";
import { navigate } from "@/utils/format";
import { buildCurrentDistributorMetrics } from "@/features/dashboard/dashboard-model";

export function DistributorsPage({ id }: { id?: string }) { return id ? <DistributorDetail id={id} /> : <DistributorList />; }

function DistributorList() {
  const { state, currentUser, isHq } = useCrm();
  const now = Date.now();
  const metrics = (item: Distributor) => buildCurrentDistributorMetrics(state, currentUser, item.id, now);
  const columns = [{ title: "Distributor", dataIndex: "name", width: 240, render: (_: unknown, item: Distributor) => <TableEntity name={item.name} detail={item.code} route={`distributors/${item.id}`} /> }, { title: "Country", dataIndex: "country" }, { title: "Manager", render: (_: unknown, item: Distributor) => state.users.find((user) => user.distributorId === item.id && user.role === "DISTRIBUTOR_MANAGER")?.name || "—" }, { title: "Users", render: (_: unknown, item: Distributor) => state.users.filter((user) => user.distributorId === item.id).length }, { title: "当前 Leads", render: (_: unknown, item: Distributor) => metrics(item).leads.length }, { title: "当前 Deals", render: (_: unknown, item: Distributor) => metrics(item).deals.length }, { title: "当前 Won Deals", render: (_: unknown, item: Distributor) => metrics(item).wonDeals.length }, { title: "Status", dataIndex: "status", render: (value: Distributor["status"]) => <StatusTag value={value} label={value} /> }];
  return <div className="page"><PageHeader title="Distributors" description="当前渠道存量，不受概览页面创建期筛选影响；已知未来记录不纳入。" /><section className="data-surface"><Table rowKey="id" columns={columns} dataSource={state.distributors.filter((item) => item.id !== "dist-hq" && (isHq || item.id === currentUser.distributorId))} pagination={false} /></section></div>;
}

function DistributorDetail({ id }: { id: string }) {
  const { state, currentUser, isHq } = useCrm(); const item = state.distributors.find((distributor) => distributor.id === id && (isHq || distributor.id === currentUser.distributorId)); if (!item) return <div className="page"><EmptyBlock title="分销商不存在或不在当前授权范围" action={() => navigate("distributors")} /></div>;
  const metrics = buildCurrentDistributorMetrics(state, currentUser, id, Date.now());
  const users = state.users.filter((user) => user.distributorId === id); const { leads, deals } = metrics; const products = state.products.map((product) => ({ product, count: deals.filter((deal) => deal.productId === product.id).length }));
  const rows = (items: Array<{ id: string; name: string }>, route: string) => <div className="related-list">{items.map((current) => <a key={current.id} href={`#${route}/${current.id}`}>{current.name}</a>)}</div>;
  return <DetailWorkspace eyebrow="Management / Distributors" title={item.name} subtitle={`${item.country} · ${item.code}`} backRoute="distributors" tags={<StatusTag value={item.status} label={item.status} />} tabs={<Tabs className="record-tabs">
    <TabPane tab="Overview" itemKey="overview"><div className="metric-strip"><div><span>当前 Users</span><strong>{users.length}</strong></div><div><span>当前 Leads</span><strong>{leads.length}</strong></div><div><span>当前 Open Deals</span><strong>{metrics.openDeals.length}</strong></div><div><span>当前 Won Deals</span><strong>{metrics.wonDeals.length}</strong></div></div></TabPane>
    <TabPane tab="Users" itemKey="users"><div className="related-list">{users.map((user) => <span key={user.id}>{user.name} · {user.title}</span>)}</div></TabPane>
    <TabPane tab="Leads" itemKey="leads">{rows(leads, "leads")}</TabPane><TabPane tab="Deals" itemKey="deals">{rows(deals, "deals")}</TabPane>
    <TabPane tab="Products / Interests" itemKey="products"><div className="related-list">{products.map(({ product, count }) => <span key={product.id}>{product.name}<Tag size="small">{count} Deals</Tag></span>)}</div></TabPane>
    <TabPane tab="Performance" itemKey="performance"><section className="data-panel"><PageHeader title="Performance" description="当前存量，截至当前；不受概览创建期筛选影响。缺失创建时间保留当前口径，已知未来记录排除。" /><DataList rows={[["当前 Lead → Deal", metrics.conversionRate], ["当前已结案 Deal Win Rate", metrics.winRate], ["当前转换数据待核验", String(metrics.conversion.conflicts.length)]]} /><p>转化：双向关联唯一且分销商一致的 Lead / 当前全部 Lead；胜率：WON / (WON + LOST)。分母为 0 显示 —。</p></section></TabPane>
  </Tabs>} sidebar={<SideSection title="Distributor"><DataList rows={[["Code", item.code], ["Country", item.country], ["Region", item.region], ["Manager", users.find((user) => user.role === "DISTRIBUTOR_MANAGER")?.name]]} /></SideSection>} />;
}

export function UsersPage() {
  const { state } = useCrm();
  const columns = [{ title: "User", dataIndex: "name", render: (_: unknown, user: (typeof state.users)[number]) => <TableEntity name={user.name} detail={user.email} /> }, { title: "Role", dataIndex: "role", render: (value: string) => <Tag>{value.replaceAll("_", " ")}</Tag> }, { title: "Title", dataIndex: "title" }, { title: "Distributor", dataIndex: "distributorId", render: (value: string) => state.distributors.find((item) => item.id === value)?.name }];
  return <div className="page"><PageHeader title="Users" description="Demo User 与角色范围。切换身份后，全应用数据范围同步变化。" /><section className="data-surface"><Table rowKey="id" columns={columns} dataSource={state.users} pagination={{ pageSize: 10 }} /></section></div>;
}
