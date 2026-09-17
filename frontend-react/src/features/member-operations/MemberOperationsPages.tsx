import { useMemo, useState, type ReactNode } from "react";
import { Input, Select, TabPane, Table, Tabs, Tag } from "@douyinfe/semi-ui";
import { IconSearch } from "@douyinfe/semi-icons";
import { DataList, DetailWorkspace, EmptyBlock, PageHeader, SideSection, TableEntity } from "@/components/CrmUi";
import { describeSowindPhoneMatch } from "@/features/member-operations/member-model";
import { readBrandPhone, readIntentPhone } from "@/features/member-operations/sowind-read";
import { brandLabels, useMemberOperations } from "@/stores/member-operations-store";
import type { MemberBrandScope, SowindBrandCode, SowindBrandUser, SowindIntentChoice, SowindPurchaseIntent, SowindUserProfile } from "@/types/member-operations";
import { navigate } from "@/utils/format";
import { MemberMarketingRecords } from "@/features/marketing/MarketingPages";

const brandOptions = [
  { value: "ALL", label: "全部品牌" },
  { value: "gp", label: "Girard-Perregaux" },
  { value: "un", label: "Ulysse Nardin" },
];
const profileWatchOptions = [{ value: "0", label: "0 · 否" }, { value: "1", label: "1 · 是" }, { value: "NULL", label: "NULL · 未提供" }];
const intentWatchOptions = [{ value: "0", label: "0 · 未选择" }, { value: "1", label: "1 · 是" }, { value: "2", label: "2 · 否" }, { value: "NULL", label: "NULL · 未提供" }];

function BrandTag({ brand }: { brand: SowindBrandCode }) {
  return <Tag color={brand === "gp" ? "green" : "blue"} size="small">{brand}</Tag>;
}

function BrandScopeSelect() {
  const { state, setBrandScope } = useMemberOperations();
  return <Select aria-label="会员品牌范围" value={state.brandScope} onChange={(value) => setBrandScope(String(value) as MemberBrandScope)} optionList={brandOptions} />;
}

function raw(value: string | number | null): ReactNode {
  return value === null ? <span className="null-value">未提供（NULL）</span> : String(value);
}

function dictionary(value: string | number | null): ReactNode {
  return value === null ? raw(value) : <span>{value} <small className="dictionary-pending">字典待配置</small></span>;
}

function profileHasWatch(value: SowindUserProfile["has_watch"]) {
  return value === null ? "未提供（NULL）" : value === 1 ? "1 · 是" : "0 · 否";
}

function intentChoice(value: SowindIntentChoice) {
  return value === null ? "未提供（NULL）" : value === 1 ? "1 · 是" : value === 2 ? "2 · 否" : "0 · 未选择";
}

function profileFor(profiles: SowindUserProfile[], userId: string) {
  return profiles.find((item) => item.user_id === userId);
}

function userFor(users: SowindBrandUser[], userId: string | null) {
  return userId ? users.find((item) => item.id === userId) : undefined;
}

function phone(countryCode: string | null, number: string | null) {
  return countryCode && number ? `${countryCode} ${number}` : countryCode || number || "未提供（NULL）";
}

function HqSync({ value, error }: { value: 0 | 1; error: string | null }) {
  return <span className="tag-line"><Tag color={value === 1 ? "green" : "grey"} size="small">{value} · {value === 1 ? "成功" : "未同步"}</Tag>{error && <Tag color="red" size="small">有错误</Tag>}</span>;
}

function IntentLinks({ rows }: { rows: SowindPurchaseIntent[] }) {
  return rows.length ? <div className="related-list">{rows.map((item) => <a key={item.id} href={`#purchase-intents/${item.id}`}><span><BrandTag brand={item.brand} /> {item.name || item.id}</span><span>{intentChoice(item.has_watch)}</span></a>)}</div> : <EmptyBlock title="暂无购买意向" description="关联缺失时不会自动创建购买意向或会员。" />;
}

export function MemberCustomersPage({ id }: { id?: string }) {
  return id ? <MemberCustomerDetail id={id} /> : <MemberCustomerList />;
}

function MemberCustomerList() {
  const { state } = useMemberOperations();
  const [keyword, setKeyword] = useState("");
  const rows = useMemo(() => state.customers.filter((customer) => {
    const users = state.brandUsers.filter((item) => item.customer_id === customer.id);
    return (state.brandScope === "ALL" || users.some((item) => item.brand === state.brandScope)) && (!keyword || `${customer.id} ${users.map((item) => item.id).join(" ")}`.toLowerCase().includes(keyword.toLowerCase()));
  }), [keyword, state]);
  const columns = [
    { title: "集团客户", dataIndex: "id", width: 230, render: (value: string) => <TableEntity name={value} detail="customer.id" route={`member-customers/${value}`} /> },
    { title: "品牌用户", width: 100, render: (_: unknown, item: { id: string }) => state.brandUsers.filter((user) => user.customer_id === item.id).length },
    { title: "品牌范围", width: 150, render: (_: unknown, item: { id: string }) => <div className="tag-line">{state.brandUsers.filter((user) => user.customer_id === item.id).map((user) => <BrandTag key={user.id} brand={user.brand} />)}</div> },
    { title: "用户标识", width: 360, render: (_: unknown, item: { id: string }) => state.brandUsers.filter((user) => user.customer_id === item.id).map((user) => user.id).join(" · ") },
    { title: "资料覆盖", width: 140, render: (_: unknown, item: { id: string }) => { const users = state.brandUsers.filter((user) => user.customer_id === item.id); return `${users.filter((user) => profileFor(state.userProfiles, user.id)).length} / ${users.length}`; } },
  ];
  const scopedUsers = state.brandUsers.filter((item) => state.brandScope === "ALL" || item.brand === state.brandScope);
  return <div className="page member-workspace"><PageHeader title="集团客户" description="customer 集团主档；已核对 SQL，仅含主键与时间字段，不新增姓名、等级、积分或会员编码。" actions={<BrandScopeSelect />} />
    <div className="metric-strip"><div><span>customer</span><strong>{rows.length}</strong></div><div><span>user</span><strong>{scopedUsers.length}</strong></div><div><span>跨 GP / UN</span><strong>{state.customers.filter((customer) => new Set(state.brandUsers.filter((user) => user.customer_id === customer.id).map((user) => user.brand)).size > 1).length}</strong></div><div><span>未关联 customer</span><strong>{scopedUsers.filter((item) => item.customer_id === null).length}</strong></div></div>
    <section className="data-surface"><div className="table-toolbar"><Input prefix={<IconSearch />} value={keyword} onChange={setKeyword} showClear placeholder="搜索 customer.id 或 user.id" /></div>{rows.length ? <Table rowKey="id" columns={columns} dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 980 }} /> : <EmptyBlock title="没有匹配的集团客户" description="调整搜索或品牌范围。" />}</section>
  </div>;
}

function MemberCustomerDetail({ id }: { id: string }) {
  const { state } = useMemberOperations();
  const customer = state.customers.find((item) => item.id === id);
  if (!customer) return <div className="page"><EmptyBlock title="集团客户不存在" action={() => navigate("member-customers")} /></div>;
  const users = state.brandUsers.filter((item) => item.customer_id === id);
  const userIds = new Set(users.map((item) => item.id));
  const intents = state.purchaseIntents.filter((item) => item.user_id && userIds.has(item.user_id));
  return <DetailWorkspace eyebrow="会员与品牌运营 / customer" title={customer.id} subtitle="集团客户主档（仅展示已确认字段）" backRoute="member-customers" tags={<>{users.map((user) => <BrandTag key={user.id} brand={user.brand} />)}{new Set(users.map((user) => user.brand)).size > 1 && <Tag color="amber" size="small">跨品牌关联</Tag>}</>} actions={<BrandScopeSelect />} tabs={<Tabs className="record-tabs">
    <TabPane tab="集团主档" itemKey="overview"><section className="data-panel"><PageHeader title="customer" description="已核对附件 Sowind SQL：集团主档仅含主键与创建、更新时间。" /><DataList rows={[["customer.id", customer.id], ["关联 user 数", users.length], ["关联购买意向数", intents.length]]} /></section></TabPane>
    <TabPane tab="品牌用户" itemKey="users"><div className="member-profile-grid">{users.map((user) => <a className="member-profile-card" key={user.id} href={`#brand-members/${user.id}`}><header><BrandTag brand={user.brand} />{profileFor(state.userProfiles, user.id) ? <Tag size="small" color="green">有 user_profile</Tag> : <Tag size="small" color="amber">资料缺失</Tag>}</header><strong>{user.id}</strong><span>{raw(user.openid)}</span><small>来源：user + user_profile</small></a>)}</div></TabPane>
    <TabPane tab="购买意向" itemKey="intents"><IntentLinks rows={intents} /></TabPane>
  </Tabs>} sidebar={<><SideSection title="SQL 来源"><DataList rows={[["对象", "customer"], ["主键", customer.id], ["关联方式", "user.customer_id"]]} /></SideSection><SideSection title="资料边界"><p>每条品牌资料都标注为 user + user_profile 来源；营销选择不会跨品牌复制，购买意向快照不会反向覆盖资料。</p></SideSection></>} />;
}

export function BrandMembersPage({ id }: { id?: string }) {
  return id ? <BrandMemberDetail id={id} /> : <BrandMemberList />;
}

function BrandMemberList() {
  const { state } = useMemberOperations();
  const [keyword, setKeyword] = useState("");
  const rows = state.brandUsers.filter((item) => (state.brandScope === "ALL" || item.brand === state.brandScope) && (!keyword || `${item.id} ${item.openid} ${item.unionid} ${item.country_code} ${item.phone}`.toLowerCase().includes(keyword.toLowerCase())));
  const columns = [
    { title: "品牌用户身份", dataIndex: "id", width: 250, render: (value: string, item: SowindBrandUser) => <TableEntity name={value} detail="user.id" route={`brand-members/${item.id}`} /> },
    { title: "brand", dataIndex: "brand", width: 90, render: (value: SowindBrandCode) => <BrandTag brand={value} /> },
    { title: "customer_id", dataIndex: "customer_id", width: 160, render: (value: string | null) => value ? <a href={`#member-customers/${value}`}>{value}</a> : <Tag color="amber" size="small">未关联（NULL）</Tag> },
    { title: "openid", dataIndex: "openid", width: 190, render: raw },
    { title: "unionid", dataIndex: "unionid", width: 190, render: raw },
    { title: "国家码 + 手机号", width: 175, render: (_: unknown, item: SowindBrandUser) => phone(readBrandPhone(item, state.userProfiles).country, readBrandPhone(item, state.userProfiles).number) },
    { title: "user_profile", width: 125, render: (_: unknown, item: SowindBrandUser) => profileFor(state.userProfiles, item.id) ? "已关联" : <Tag color="amber" size="small">资料缺失</Tag> },
  ];
  return <div className="page member-workspace"><PageHeader title="品牌会员" description="品牌会员详情由 user 与 user_profile 组合；user 是品牌身份，不是后台登录账号。" actions={<BrandScopeSelect />} /><section className="data-surface"><div className="table-toolbar"><Input prefix={<IconSearch />} value={keyword} onChange={setKeyword} showClear placeholder="搜索 user / openid / unionid / 手机号" /></div>{rows.length ? <Table rowKey="id" columns={columns} dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1190 }} /> : <EmptyBlock title="没有匹配的品牌用户" description="调整搜索或品牌范围。" />}</section></div>;
}

function BrandMemberDetail({ id }: { id: string }) {
  const { state, updateUserProfileHasWatch } = useMemberOperations();
  const user = state.brandUsers.find((item) => item.id === id);
  if (!user) return <div className="page"><EmptyBlock title="品牌用户不存在" action={() => navigate("brand-members")} /></div>;
  const profile = profileFor(state.userProfiles, user.id);
  const intents = state.purchaseIntents.filter((item) => item.user_id === user.id);
  return <DetailWorkspace eyebrow="会员与品牌运营 / user + user_profile" title={`${user.brand} · ${user.id}`} subtitle={phone(readBrandPhone(user, state.userProfiles).country, readBrandPhone(user, state.userProfiles).number)} backRoute="brand-members" tags={<><BrandTag brand={user.brand} />{user.customer_id === null && <Tag color="amber" size="small">未关联 customer</Tag>}{!profile && <Tag color="amber" size="small">user_profile 缺失</Tag>}</>} actions={<BrandScopeSelect />} tabs={<Tabs className="record-tabs">
    <TabPane tab="品牌用户身份" itemKey="user"><section className="data-panel"><PageHeader title="user" description="保留 gp / un、openid、unionid 与 customer_id 空值。" /><DataList rows={[["user.id", user.id], ["user.brand", user.brand], ["user.customer_id", user.customer_id ? <a href={`#member-customers/${user.customer_id}`}>{user.customer_id}</a> : raw(null)], ["user.openid", raw(user.openid)], ["user.unionid", raw(user.unionid)], ["国家码 + 手机号", phone(readBrandPhone(user, state.userProfiles).country, readBrandPhone(user, state.userProfiles).number)]]} /></section></TabPane>
    <TabPane tab="品牌用户资料" itemKey="profile">{profile ? <section className="data-panel"><PageHeader title="user_profile" description="profile.has_watch 与 accepts_marketing 按原数字枚举展示，不转换为布尔值。" actions={<Select aria-label="user_profile.has_watch" value={profile.has_watch === null ? "NULL" : String(profile.has_watch)} onChange={(value) => updateUserProfileHasWatch(profile.id, value === "NULL" ? null : Number(value) as 0 | 1)} optionList={profileWatchOptions} />} /><DataList rows={[["user_profile.id", profile.id], ["user_profile.user_id", profile.user_id], ["has_watch", profileHasWatch(profile.has_watch)], ["accepts_marketing", `${profile.accepts_marketing} · ${profile.accepts_marketing === 1 ? "是" : "否"}`], ["region（profile 映射）", raw(profile.region)], ["areas_of_interest", raw(profile.areas_of_interest)], ["favorite_series", dictionary(profile.favorite_series)], ["retailer", dictionary(profile.retailer)]]} /></section> : <EmptyBlock title="user_profile 缺失" description="保持缺失状态；原型不会自动补建资料。" />}</TabPane>
    <TabPane tab="购买意向" itemKey="intents"><IntentLinks rows={intents} /></TabPane>
    <TabPane tab="营销活动" itemKey="marketing"><MemberMarketingRecords userId={user.id} /></TabPane>
  </Tabs>} sidebar={<><SideSection title="身份约束"><p>仅遵循 brand + openid 的原约束语义；NULL openid 不被合并，unionid 不执行全局唯一校验。</p></SideSection><SideSection title="资料独立"><p>修改 user_profile.has_watch 只更新此资料，不覆盖历史 user_purchase_intent 快照。</p></SideSection></>} />;
}

export function PurchaseIntentsPage({ id }: { id?: string }) {
  return id ? <PurchaseIntentDetail id={id} /> : <PurchaseIntentList />;
}

function PurchaseIntentList() {
  const { state } = useMemberOperations();
  const [keyword, setKeyword] = useState("");
  const rows = state.purchaseIntents.filter((item) => (state.brandScope === "ALL" || item.brand === state.brandScope) && (!keyword || `${item.id} ${item.name} ${item.phone} ${item.email}`.toLowerCase().includes(keyword.toLowerCase())));
  const columns = [
    { title: "购买意向", dataIndex: "name", width: 250, render: (value: string | null, item: SowindPurchaseIntent) => <TableEntity name={value || item.id} detail={item.id} route={`purchase-intents/${item.id}`} /> },
    { title: "brand", dataIndex: "brand", width: 90, render: (value: SowindBrandCode) => <BrandTag brand={value} /> },
    { title: "user_id", dataIndex: "user_id", width: 180, render: (value: string | null) => value ? <a href={`#brand-members/${value}`}>{value}</a> : <Tag color="amber" size="small">未关联（NULL）</Tag> },
    { title: "国家码 + 手机号", width: 175, render: (_: unknown, item: SowindPurchaseIntent) => phone(readIntentPhone(item).country, readIntentPhone(item).number) },
    { title: "has_watch", dataIndex: "has_watch", width: 125, render: intentChoice },
    { title: "accepts_marketing", dataIndex: "accepts_marketing", width: 155, render: intentChoice },
    { title: "手机号匹配", width: 230, render: (_: unknown, item: SowindPurchaseIntent) => describeSowindPhoneMatch(state.brandUsers, item).label },
    { title: "HQ 同步", width: 145, render: (_: unknown, item: SowindPurchaseIntent) => <HqSync value={item.hq_sync_status} error={item.error} /> },
  ];
  const noUser = rows.filter((item) => item.user_id === null).length;
  return <div className="page member-workspace"><PageHeader title="品牌购买意向" description="user_purchase_intent 保留独立联系资料，可不关联 user；不会创建 Sales Lead 或 Deal。" actions={<BrandScopeSelect />} />
    <div className="metric-strip"><div><span>user_purchase_intent</span><strong>{rows.length}</strong></div><div><span>未关联 user</span><strong>{noUser}</strong></div><div><span>多候选待处理</span><strong>{rows.filter((item) => describeSowindPhoneMatch(state.brandUsers, item).code === "AMBIGUOUS").length}</strong></div><div><span>HQ 未同步</span><strong>{rows.filter((item) => item.hq_sync_status === 0).length}</strong></div></div>
    <section className="data-surface"><div className="table-toolbar"><Input prefix={<IconSearch />} value={keyword} onChange={setKeyword} showClear placeholder="搜索意向 ID、姓名、电话或 Email" /></div>{rows.length ? <Table rowKey="id" columns={columns} dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1350 }} /> : <EmptyBlock title="没有匹配的购买意向" description="调整搜索或品牌范围。" />}</section>
  </div>;
}

function PurchaseIntentDetail({ id }: { id: string }) {
  const { state, updatePurchaseIntentHasWatch } = useMemberOperations();
  const intent = state.purchaseIntents.find((item) => item.id === id);
  if (!intent) return <div className="page"><EmptyBlock title="购买意向不存在" action={() => navigate("purchase-intents")} /></div>;
  const user = userFor(state.brandUsers, intent.user_id);
  const customer = user?.customer_id ? state.customers.find((item) => item.id === user.customer_id) : undefined;
  const matching = describeSowindPhoneMatch(state.brandUsers, intent);
  return <DetailWorkspace eyebrow="会员与品牌运营 / user_purchase_intent" title={intent.name || intent.id} subtitle={`${intent.id} · ${phone(readIntentPhone(intent).country, readIntentPhone(intent).number)}`} backRoute="purchase-intents" tags={<><BrandTag brand={intent.brand} />{!user && <Tag color="amber" size="small">未关联 user</Tag>}</>} actions={<Select aria-label="user_purchase_intent.has_watch" value={intent.has_watch === null ? "NULL" : String(intent.has_watch)} onChange={(value) => updatePurchaseIntentHasWatch(intent.id, value === "NULL" ? null : Number(value) as 0 | 1 | 2)} optionList={intentWatchOptions} />} tabs={<Tabs className="record-tabs">
    <TabPane tab="购买意向资料" itemKey="data"><section className="data-panel"><PageHeader title="user_purchase_intent" description="姓名、电话、Email 与选择项是意向快照；即使关联 user 也不从会员资料实时覆盖。" /><DataList rows={[["id", intent.id], ["brand", intent.brand], ["user_id", intent.user_id ? <a href={`#brand-members/${intent.user_id}`}>{intent.user_id}</a> : raw(null)], ["name", raw(intent.name)], ["country_code", raw(intent.country_code)], ["phone", raw(intent.phone)], ["email", raw(intent.email)], ["has_watch", intentChoice(intent.has_watch)], ["accepts_marketing", intentChoice(intent.accepts_marketing)], ["region（intent 映射）", raw(intent.region)], ["areas_of_interest", raw(intent.areas_of_interest)], ["favorite_series", dictionary(intent.favorite_series)], ["retailer", dictionary(intent.retailer)], ["hq_ref", raw(intent.hq_ref === null ? null : typeof intent.hq_ref === "string" ? intent.hq_ref : JSON.stringify(intent.hq_ref))], ["hq_sync_status", `${intent.hq_sync_status} · ${intent.hq_sync_status === 1 ? "成功" : "未同步"}`], ["error", raw(intent.error)]]} /></section></TabPane>
  </Tabs>} sidebar={<><SideSection title="关联关系"><DataList rows={[["品牌 user", user ? <a href={`#brand-members/${user.id}`}>{user.id}</a> : "未关联（NULL）"], ["集团 customer", customer ? <a href={`#member-customers/${customer.id}`}>{customer.id}</a> : "未关联"], ["手机号匹配", matching.label]]} /></SideSection><SideSection title="待核对规则"><p>当前仅展示“同品牌 + 国家码 + 手机号”候选结果。管理员创建可留空与自动尝试匹配的差异仍需后端确认；原型不会自动建 user 或合并 customer。</p></SideSection><SideSection title="资料独立"><p>修改此处 has_watch 只更新购买意向，不覆盖 user_profile；两个 region 也分别原样展示。</p></SideSection></>} />;
}
