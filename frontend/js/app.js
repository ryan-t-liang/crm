"use strict";

import { ADDRESS_TREE, COUNTRY_OPTIONS, canonicalCountry, countryLabel } from "./address-data.js";

const APP_BASE_PATH = (() => {
  const modulePath = new URL(import.meta.url).pathname;
  const suffix = "/js/app.js";
  return modulePath.endsWith(suffix) ? modulePath.slice(0, -suffix.length) : "";
})();
const appUrl = (path) => `${APP_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
const state = {
  me: null, brands: [], customers: [], leads: [], users: [], roles: [], permissions: [],
  currentCustomer: null, currentLead: null, currentBrand: "ALL", currentBrandProfile: "ALL", forms: new Map(),
  importType: null, importBrand: null, importStep: 1, importResult: null, importFileName: "", importError: "", importing: false,
  importHistoryMode: false, importHistory: [],
};
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const dt = (value) => value ? new Date(value).toLocaleString("sv-SE", { hour12: false }).replace("T", " ").slice(0, 19) : "-";
const brandLabel = (brand) => brand?.name || ({ UN: "UN 雅典表", GP: "GP 芝柏表" }[brand] || brand || "-");
const statusLabel = (status) => ({ NOT_SYNCED: "未同步", PENDING: "待同步", RETRY_WAITING: "待重试", GATEWAY_QUEUED: "Gateway 已受理", SUCCEEDED: "同步成功", FAILED: "同步失败", FAILED_AUTH: "鉴权失败", FAILED_VALIDATION: "校验失败", FAILED_PERMANENT: "同步失败", ACTIVE: "启用", DISABLED: "禁用" })[status] || status || "-";
const can = (permission) => Boolean(state.me?.permissions?.includes(permission));
const sourceLabel = (source) => ({ ADMIN_MANUAL: "后台手动新增", BATCH_IMPORT: "批量导入", WECHAT_MINIPROGRAM: "微信小程序", USER_SUBMITTED: "用户提交" })[source] || source || "-";

async function api(path, options = {}) {
  const headers = { accept: "application/json", ...(options.body instanceof FormData ? {} : { "content-type": "application/json" }), ...(options.headers || {}) };
  const response = await fetch(appUrl(path), { credentials: "same-origin", ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.blob();
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `请求失败（${response.status}）`);
    error.code = payload?.error?.code;
    error.status = response.status;
    if (response.status === 401) showLogin();
    if (error.code === "PASSWORD_CHANGE_REQUIRED") showForcePassword();
    throw error;
  }
  return payload;
}

function notify(message) {
  $("toastText").textContent = message;
  $("toast").classList.add("is-visible");
  clearTimeout(notify.timer); notify.timer = setTimeout(() => $("toast").classList.remove("is-visible"), 2200);
}
function showError(target, error) { target.textContent = error.message || String(error); target.hidden = false; }
function lockApplication() { const shell = document.querySelector(".app-shell"); shell.inert = true; shell.setAttribute("aria-hidden", "true"); document.body.classList.add("is-locked"); }
function unlockApplication() { if (!$("loginOverlay").hidden || !$("forcePasswordOverlay").hidden) return; const shell = document.querySelector(".app-shell"); shell.inert = false; shell.removeAttribute("aria-hidden"); document.body.classList.remove("is-locked"); }
function showLogin() { $("loginOverlay").hidden = false; $("accountMenu").hidden = true; lockApplication(); setTimeout(() => $("loginAccountInput").focus(), 30); }
function hideLogin() { $("loginOverlay").hidden = true; unlockApplication(); }
function showForcePassword() { $("forcePasswordOverlay").hidden = false; lockApplication(); }
function hideForcePassword() { $("forcePasswordOverlay").hidden = true; unlockApplication(); }

function profileInitial(customer) { return customer.displayName?.trim()?.[0] || "会"; }
function brandPill(brand) { return `<span class="brand-badge brand-${esc(brand.code?.toLowerCase())}">● ${esc(brand.name)}</span>`; }
function syncPill(status) { const failed = String(status).startsWith("FAILED"); return `<span class="sync-pill ${failed ? "failed" : status === "GATEWAY_QUEUED" || status === "SUCCEEDED" ? "synced" : "not-synced"}">● ${esc(statusLabel(status))}</span>`; }

function renderIdentity() {
  if (!state.me) return;
  $("currentUserName").textContent = state.me.name; $("accountMenuName").textContent = state.me.name;
  $("currentUserAvatar").textContent = state.me.name.slice(0, 2).toUpperCase();
  const scope = state.me.allBrands ? "全部品牌" : state.brands.map((b) => b.shortName).join(" / ");
  const meta = `${state.me.role.name} · ${scope}`; $("currentUserMeta").textContent = meta; $("accountMenuMeta").textContent = meta;
}

function renderNavigation() {
  const nav = $("primaryNavigation");
  const items = [];
  if (can("customer.view")) items.push({ key: "contacts", label: "会员", icon: "users", count: "memberNavCount" });
  if (can("lead.view")) items.push({ key: "leads", label: "线索", icon: "lead", count: "leadNavCount" });
  if (can("account.view") || can("roles.view") || can("audit.view")) items.push({ divider: true, label: "系统管理" });
  if (can("account.view")) items.push({ key: "accounts", label: "账户管理", icon: "user" });
  if (can("roles.view")) items.push({ key: "roles", label: "角色与权限", icon: "lock" });
  if (can("audit.view")) items.push({ key: "audit", label: "审计日志", icon: "clock" });
  nav.innerHTML = items.map((item) => item.divider ? `<div class="nav-section">${item.label}</div>` : `<button class="nav-item" data-nav="${item.key}"><svg class="icon"><use href="#i-${item.icon}"/></svg><span>${item.label}</span>${item.count ? `<em class="nav-count" id="${item.count}">0</em>` : ""}</button>`).join("");
  nav.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.nav)));
}

function renderBrandFilters() {
  const options = `<option value="ALL">全部品牌</option>${state.brands.map((brand) => `<option value="${esc(brand.code)}">${esc(brand.name)}</option>`).join("")}`;
  $("memberBrandFilter").innerHTML = options;
  $("leadBrandFilter").innerHTML = options;
}

function applyPermissionVisibility() {
  const controls = {
    memberExportBtn: "customer.export", memberImportBtn: "customer.import", newMemberBtn: "customer.create",
    leadExportBtn: "lead.export", leadImportBtn: "lead.import", openLeadCreate: "lead.create", newLeadBtn: "lead.create", panelNewLead: "lead.create",
    addAccountBtn: "account.create", addNoteBtn: "customer.edit",
  };
  Object.entries(controls).forEach(([id, permission]) => { if ($(id)) $(id).hidden = !can(permission); });
}

function navigate(key) {
  const map = { contacts: "listView", leads: "leadView", accounts: "accountManagementView", roles: "roleManagementView", audit: "auditLogView" };
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("is-active"));
  $(map[key] || "listView").classList.add("is-active");
  document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === key));
  $("breadcrumbText").textContent = ({ contacts: "会员", leads: "线索", accounts: "账户管理", roles: "角色与权限", audit: "审计日志" })[key] || "会员";
  if (key === "contacts") loadCustomers(); if (key === "leads") loadLeads(); if (key === "accounts") loadAccounts(); if (key === "roles") loadRoles(); if (key === "audit") loadAudit();
  location.hash = key;
}

function memberQueryParams() {
  const fieldMap = { id: "customerNo", name: "displayName", phone: "mobile", email: "email", country: "country", region: "region", city: "city", language: "language", channel: "preferredContact", interestCenter: "interestCenter", favorite: "favoriteCollection" };
  const params = new URLSearchParams({ pageSize: "200" }); const field = $("memberQueryField").value; const value = $("memberSearch").value.trim();
  if (value) { params.set(field === "ALL" ? "keyword" : "value", value); if (field !== "ALL") params.set("field", fieldMap[field] || field); }
  if ($("memberBrandFilter").value !== "ALL") params.set("brand", $("memberBrandFilter").value);
  return params;
}
async function loadCustomers() {
  $("memberRows").innerHTML = `<tr><td colspan="8">正在加载会员…</td></tr>`;
  try {
    const result = await api(`/api/v1/customers?${memberQueryParams()}`); state.customers = result.data;
    const total = result.meta.total; const dual = result.data.filter((c) => c.profiles.length > 1).length;
    $("memberMetricTotal").textContent = total; $("memberMetricDual").textContent = dual;
    const profiles = result.data.flatMap((c) => c.profiles); const marketing = profiles.filter((p) => p.consents?.some((x) => x.purpose === "MARKETING_COMMUNICATION" && x.status === "GRANTED")).length;
    $("memberMetricMarketing").textContent = profiles.length ? `${Math.round(marketing / profiles.length * 100)}%` : "0%";
    $("resultCount").textContent = `${total} 条结果`; $("tableSummary").textContent = `显示 ${result.data.length ? 1 : 0}–${result.data.length}，共 ${total} 位会员`; if ($("memberNavCount")) $("memberNavCount").textContent = total; $("memberRows").closest(".table-panel").querySelector(".pagination").hidden = result.meta.pageCount <= 1;
    $("emptyState").hidden = result.data.length > 0;
    $("memberRows").innerHTML = result.data.map((customer) => `<tr data-customer-id="${customer.id}"><td class="select-column"><input type="checkbox" aria-label="选择 ${esc(customer.displayName)}"></td><td><div class="member-cell"><span class="member-avatar">${esc(profileInitial(customer))}</span><span><strong>${esc(customer.displayName)}</strong><small>${esc(customer.customerNo)}</small></span></div></td><td>${esc(customer.mobile)}</td><td>${customer.profiles.map((p) => brandPill(p.brand)).join(" ")}</td><td>${customer.profiles.map((p) => `<div><small>${esc(p.brand.shortName)}</small> ${esc(p.favoriteCollection || "-")}</div>`).join("")}</td><td>${customer.profiles.map((p) => `<div><small>${esc(p.brand.shortName)}</small> ${p.ownsBrandWatch == null ? "-" : p.ownsBrandWatch ? "是" : "否"}</div>`).join("")}</td><td>${esc(dt(customer.createdAt))}</td><td class="action-cell"><button class="row-action" data-open-customer="${customer.id}" aria-label="查看会员"><svg><use href="#i-chevron"/></svg></button></td></tr>`).join("");
    document.querySelectorAll("[data-open-customer]").forEach((button) => button.addEventListener("click", () => openCustomer(button.dataset.openCustomer)));
  } catch (error) { $("memberRows").innerHTML = `<tr><td colspan="8">${esc(error.message)}</td></tr>`; }
}

function leadQueryParams() {
  const fieldMap = { contact: "firstname", topic: "sku", preferred_contact: "preferredContact", source: "source", createdAt: "createdAt" };
  const params = new URLSearchParams({ pageSize: "200" }); const field = $("leadQueryField").value; const value = $("leadKeyword").value.trim();
  if (value) { params.set(field === "ALL" ? "keyword" : "value", value); if (field !== "ALL") params.set("field", fieldMap[field] || field); }
  if ($("leadBrandFilter").value !== "ALL") params.set("brand", $("leadBrandFilter").value); return params;
}
async function loadLeads() {
  $("leadLoadingState").hidden = false; $("leadReadyState").hidden = true; $("leadErrorState").hidden = true;
  try {
    const result = await api(`/api/v1/leads?${leadQueryParams()}`); state.leads = result.data; const total = result.meta.total;
    $("leadMetricTotal").textContent = total; $("leadMetricOpen").textContent = result.data.filter((l) => ["NOT_SYNCED", "PENDING", "FAILED"].includes(l.syncStatus)).length;
    $("leadMetricSynced").textContent = result.data.filter((l) => ["GATEWAY_QUEUED", "SUCCEEDED"].includes(l.syncStatus)).length;
    $("leadMetricFailed").textContent = result.data.filter((l) => String(l.syncStatus).startsWith("FAILED")).length;
    if ($("leadNavCount")) $("leadNavCount").textContent = total; $("leadResultCount").textContent = `${total} 条结果`; $("leadTableSummary").textContent = `显示 ${result.data.length ? 1 : 0}–${result.data.length}，共 ${total} 条线索`; $("leadRows").closest(".table-panel").querySelector(".pagination").hidden = result.meta.pageCount <= 1;
    $("leadRows").innerHTML = result.data.map((lead) => `<tr><td class="select-column"><input type="checkbox" aria-label="选择 ${esc(lead.leadNo)}"></td><td><div class="lead-no"><strong>${esc(lead.leadNo)}</strong><span>${esc(lead.source === "ADMIN_MANUAL" ? "后台手动提交" : "用户提交")}</span></div></td><td>${brandPill(lead.brand)}</td><td><div class="lead-contact"><strong>${esc(lead.lastname + lead.firstname)}</strong><span>${esc(lead.phone)}</span></div></td><td><div class="lead-topic"><strong>${esc(lead.sku || "-")}</strong></div></td><td>${esc(lead.status === "NEW" ? "新建" : lead.status)}</td><td>${esc(dt(lead.createdAt))}</td><td>${lead.ownerUserId ? esc(lead.ownerUserId) : "未分配"}</td><td>${syncPill(lead.syncStatus)}</td><td class="action-cell"><div class="table-actions"><button class="btn btn-small" data-open-lead="${lead.id}">详情</button>${can("lead.sync") && !["GATEWAY_QUEUED", "SUCCEEDED"].includes(lead.syncStatus) ? `<button class="btn btn-small btn-primary" data-sync-lead="${lead.id}">${String(lead.syncStatus).startsWith("FAILED") ? "重试同步" : "手动同步"}</button>` : ""}</div></td></tr>`).join("");
    $("leadLoadingState").hidden = true; $("leadReadyState").hidden = result.data.length === 0; $("leadEmptyState").hidden = result.data.length > 0;
    document.querySelectorAll("[data-open-lead]").forEach((button) => button.addEventListener("click", () => openLead(button.dataset.openLead)));
    document.querySelectorAll("[data-sync-lead]").forEach((button) => button.addEventListener("click", () => syncLead(button.dataset.syncLead)));
  } catch (error) { $("leadLoadingState").hidden = true; $("leadErrorState").hidden = false; $("leadReadyState").hidden = true; }
}

async function syncLead(id) { try { await api(`/api/v1/leads/${id}/sync`, { method: "POST", body: "{}" }); notify("已加入待同步队列"); await loadLeads(); if (state.currentLead?.id === id) await openLead(id); } catch (error) { notify(error.message); } }
async function openLead(id) {
  try {
    const result = await api(`/api/v1/leads/${id}`); const lead = result.data; state.currentLead = lead;
    $("drawerSyncStatusBadge").textContent = statusLabel(lead.syncStatus); $("drawerSyncStatusBadge").className = `sync-pill ${String(lead.syncStatus).startsWith("FAILED") ? "failed" : ["GATEWAY_QUEUED", "SUCCEEDED"].includes(lead.syncStatus) ? "synced" : "not-synced"}`;
    const fields = [["线索编号", lead.leadNo], ["品牌", lead.brand.name], ["来源", lead.source === "ADMIN_MANUAL" ? "后台手动提交" : "用户提交"], ["关联会员 ID", lead.customer?.customerNo || "-"], ["称谓", lead.salutation], ["姓氏", lead.lastname], ["名字", lead.firstname], ["Email", lead.email], ["电话号码", lead.phone], ["国家 / 地区", lead.country], ["城市", lead.city || "-"], ["通信语言", lead.language], ["首选联系方式", lead.preferredContact], [`您是否拥有 ${lead.brand.name}`, lead.ownership === "Yes" || lead.ownership === "是" ? "是" : lead.ownership === "No" || lead.ownership === "否" ? "否" : "-"], ["产品", lead.sku || "-"], ["营销选择", lead.marketingOptIn ? "已选择" : "未选择"], ["个人数据处理同意", lead.processingConsent ? "已同意" : "未同意"], ["创建人", lead.submissionMode === "ADMIN_MANUAL" ? lead.createdByName || "-" : "-"], ["创建时间", dt(lead.createdAt)]];
    const attempts = lead.syncRecord?.attempts || [];
    $("leadDrawerSections").innerHTML = `<section class="drawer-section"><h3>线索详情</h3><div class="drawer-field-grid">${fields.map(([k, v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("")}</div></section><section class="drawer-section"><h3>同步记录</h3>${attempts.length ? attempts.map((a) => `<div class="activity-item"><strong>${esc(statusLabel(a.httpStatus === 202 ? "SUCCEEDED" : "FAILED"))}</strong><span>${esc(dt(a.completedAt))} · HTTP ${esc(a.httpStatus ?? "-")} ${a.errorMessage ? `· ${esc(a.errorMessage)}` : ""}</span></div>`).join("") : `<div class="empty-copy">暂无同步记录</div>`}</section>${can("lead.sync") && !["GATEWAY_QUEUED", "SUCCEEDED"].includes(lead.syncStatus) ? `<div class="drawer-footer"><button class="btn btn-primary" id="drawerSyncBtn">${String(lead.syncStatus).startsWith("FAILED") ? "重试同步" : "手动同步"}</button></div>` : ""}`;
    $("leadDrawer").classList.add("is-open"); $("leadDrawer").setAttribute("aria-hidden", "false"); if ($("drawerSyncBtn")) $("drawerSyncBtn").onclick = () => syncLead(id);
  } catch (error) { notify(error.message); }
}

function profileField(label, value, wide = false) {
  return `<div class="brand-profile-field${wide ? " wide" : ""}"><label>${esc(label)}</label><strong>${esc(value == null || value === "" ? "-" : value)}</strong></div>`;
}
function profileConsentField(label, granted) {
  return `<div class="brand-profile-field"><label>${esc(label)}</label><strong class="brand-profile-consent${granted ? "" : " no"}"><svg><use href="#i-${granted ? "check" : "x"}"/></svg>${granted ? "已选择" : "未选择"}</strong></div>`;
}
function consentGranted(profile, purpose) {
  return profile.consents?.find((record) => record.purpose === purpose)?.status === "GRANTED";
}
function profileDisplayName(profile) { return profile.displayName || `${profile.lastName || ""}${profile.firstName || ""}` || "-"; }
function brandTheme(profile) {
  const config = profile.brand.themeConfig || {};
  return { accent: config.accent || (profile.brand.code === "UN" ? "#607f99" : "#b4935e"), tint: config.tint || (profile.brand.code === "UN" ? "#eef3f6" : "#f7f1e6") };
}
function brandVisual(profile) {
  const theme = brandTheme(profile);
  return `<div class="brand-affiliation-visual" style="--brand-accent:${esc(theme.accent)};--brand-tint:${esc(theme.tint)}"><h3>${esc(profile.brand.name)}</h3><span class="brand-affiliation-logo">${esc(profile.brand.shortName || profile.brand.code)}</span></div>`;
}
function brandSummary(profile) {
  return `<article class="brand-profile-summary" data-profile-brand="${esc(profile.brand.code)}">${brandVisual(profile)}<div class="brand-summary-body"><div class="brand-summary-name"><strong>${esc(profileDisplayName(profile))}</strong><span>${esc(profile.email || "未填写 Email")}</span></div><div class="brand-summary-grid">${profileField("品牌会员 ID", profile.brandMemberNo)}${profileField("国家 / 城市", `${countryLabel(profile.country)} · ${profile.city || "-"}`)}${profileField("偏爱的系列", profile.favoriteCollection)}${profileField(`您是否拥有${profile.brand.name}`, profile.ownsBrandWatch == null ? "-" : profile.ownsBrandWatch ? "是" : "否")}${profileConsentField("营销选择", consentGranted(profile, "MARKETING_COMMUNICATION"))}${profileField("注册时间", dt(profile.registeredAt || profile.createdAt))}</div></div><div class="brand-summary-footer"><button class="btn btn-small" data-view-brand-profile="${esc(profile.brand.code)}">查看完整资料</button></div></article>`;
}
function profileGroup(title, fields, wide = false) {
  return `<section class="brand-profile-group${wide ? " wide" : ""}"><h4>${esc(title)}</h4><div class="brand-profile-group-grid">${fields.join("")}</div></section>`;
}
function brandDetail(profile) {
  const groups = [
    profileGroup("个人信息", [profileField("姓氏", profile.lastName), profileField("名字", profile.firstName), profileField("称谓", profile.salutation), profileField("出生日期", profile.birthday?.slice(0, 10))]),
    profileGroup("联系方式", [profileField(`${profile.brand.name} Email`, profile.email), profileField("品牌注册手机号", profile.mobile), profileField("首选联系方式", profile.preferredContact)]),
    profileGroup("地址", [profileField("国家 / 地区", countryLabel(profile.country)), profileField("省 / 地区", profile.region), profileField("城市", profile.city), profileField("邮编", profile.postalCode), profileField("联系地址", profile.addressLine, true)], true),
    profileGroup("会员信息", [profileField("品牌会员 ID", profile.brandMemberNo), profileField("注册时间", dt(profile.registeredAt || profile.createdAt)), profileField("注册来源", sourceLabel(profile.registrationSource)), profileField("创建时间", dt(profile.createdAt)), profileField("更新时间", dt(profile.updatedAt)), profileField(`您是否拥有${profile.brand.name}`, profile.ownsBrandWatch == null ? "-" : profile.ownsBrandWatch ? "是" : "否")]),
    profileGroup("偏好", [profileField("通信语言", profile.language), profileField("偏爱的系列", profile.favoriteCollection), profileField("兴趣中心", profile.interestCenter), profileField("希望购买渠道", profile.purchaseChannel)]),
    profileGroup("授权", [profileConsentField("营销选择", consentGranted(profile, "MARKETING_COMMUNICATION")), profileConsentField("个人数据处理同意", consentGranted(profile, "DATA_PROCESSING"))], true),
  ].join("");
  return `<article class="brand-profile-detail" data-profile-brand="${esc(profile.brand.code)}">${brandVisual(profile)}<div class="brand-profile-detail-body">${groups}</div></article>`;
}
function renderWechatIdentity() {
  const profiles = state.currentCustomer?.profiles || [];
  const visible = state.currentBrandProfile === "ALL" ? profiles : profiles.filter((profile) => profile.brand.code === state.currentBrandProfile);
  const content = $("wechatIdentityContent");
  content.className = `wechat-identity-content${visible.length <= 1 ? " is-single" : ""}`;
  content.innerHTML = visible.length ? visible.map((profile) => `<section class="wechat-identity-group"><h4>${esc(profile.brand.name)}</h4><div class="wechat-identity-fields"><div class="wechat-identity-field"><label>OpenID</label><strong>${esc(profile.openId ? `****${profile.openId.slice(-6)}` : "未获取")}</strong></div><div class="wechat-identity-field"><label>UnionID（Open Platform 作用域）</label><strong>${esc(profile.unionId ? `****${profile.unionId.slice(-6)}` : "未获取")}</strong></div></div></section>`).join("") : `<div class="wechat-identity-empty">暂无微信身份信息</div>`;
}
async function openCustomer(id) {
  try {
    const result = await api(`/api/v1/customers/${id}`); const customer = result.data; state.currentCustomer = customer;
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("is-active")); $("detailView").classList.add("is-active"); $("breadcrumbText").textContent = "会员 / 会员详情";
    $("detailAvatar").textContent = profileInitial(customer); $("detailName").textContent = customer.displayName; $("detailContact").textContent = customer.mobile; $("detailMemberId").textContent = `会员 ID · ${customer.customerNo}`; $("detailBrandBadges").innerHTML = customer.profiles.map((p) => brandPill(p.brand)).join(" ");
    $("customerIdentityFields").innerHTML = [["会员 ID", customer.customerNo], ["手机号", customer.mobile], ["关联品牌", customer.profiles.map((p) => p.brand.name).join(" · ")], ["创建时间", dt(customer.createdAt)]].map(([k, v]) => `<div class="customer-identity-item"><label>${esc(k)}</label><strong>${esc(v)}</strong></div>`).join("");
    state.currentBrandProfile = "ALL";
    $("brandProfileSwitcher").innerHTML = `<button class="segment is-active" data-detail-brand="ALL">全部品牌</button>${customer.profiles.map((p) => `<button class="segment" data-detail-brand="${p.brand.code}">${esc(p.brand.name)}</button>`).join("")}`;
    $("brandProfileSwitcher").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => renderBrandProfile(b.dataset.detailBrand)));
    renderBrandProfile("ALL");
    $("wechatIdentityDetails").open = false;
    renderCustomerTabs(customer); renderCustomerModule("leads");
  } catch (error) { notify(error.message); }
}
function renderBrandProfile(code) {
  const profiles = state.currentCustomer?.profiles || [];
  state.currentBrandProfile = code === "ALL" || profiles.some((profile) => profile.brand.code === code) ? code : "ALL";
  const content = $("brandProfileContent");
  content.className = `brand-profile-content brand-profile-grid ${state.currentBrandProfile === "ALL" ? profiles.length === 1 ? "is-single" : profiles.length === 2 ? "is-pair" : "is-grid" : "is-detail"}`;
  content.innerHTML = state.currentBrandProfile === "ALL" ? profiles.map(brandSummary).join("") : brandDetail(profiles.find((profile) => profile.brand.code === state.currentBrandProfile));
  $("brandProfileSwitcher").querySelectorAll("button").forEach((button) => button.classList.toggle("is-active", button.dataset.detailBrand === state.currentBrandProfile));
  content.querySelectorAll("[data-view-brand-profile]").forEach((button) => button.addEventListener("click", () => renderBrandProfile(button.dataset.viewBrandProfile)));
  renderWechatIdentity();
}
function renderCustomerTabs(customer) {
  const tabs = [["leads", `线索 ${customer.leads.length}`], ["journey", "客户旅程"], ["notes", `备注 ${customer.notes.length}`], ["activity", "操作记录"]];
  $("customerDetailModuleTabs").innerHTML = tabs.map(([key, label], i) => `<button class="${i === 0 ? "is-active" : ""}" data-module="${key}">${label}</button>`).join("");
  $("customerDetailModuleTabs").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => renderCustomerModule(b.dataset.module)));
}
function renderCustomerModule(key) {
  document.querySelectorAll("[data-customer-module-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.customerModulePanel === key));
  $("customerDetailModuleTabs").querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.module === key)); const c = state.currentCustomer; if (!c) return;
  if (key === "leads") $("leadList").innerHTML = c.leads.length ? c.leads.map((l) => `<button class="lead-list-row" data-open-lead="${l.id}"><span>${brandPill(l.brand)}</span><strong>${esc(l.sku || "-")}</strong><span>${esc(dt(l.createdAt))}</span>${syncPill(l.syncStatus)}</button>`).join("") : `<div class="empty-copy">暂无线索</div>`;
  if (key === "journey") $("journeyTimeline").innerHTML = c.journeyEvents.map((e) => `<div class="timeline-item"><strong>${esc(e.title)}</strong><span>${esc(e.description || "")} · ${esc(dt(e.eventAt))}</span></div>`).join("") || `<div class="empty-copy">暂无客户旅程</div>`;
  if (key === "notes") $("notesList").innerHTML = c.notes.map((n) => `<div class="note-item"><p>${esc(n.body)}</p><span>${esc(dt(n.createdAt))}</span></div>`).join("") || `<div class="empty-copy">暂无备注</div>`;
  if (key === "activity") $("activityList").innerHTML = c.journeyEvents.map((e) => `<div class="activity-item"><strong>${esc(e.title)}</strong><span>${esc(dt(e.eventAt))}</span></div>`).join("") || `<div class="empty-copy">暂无操作记录</div>`;
  document.querySelectorAll("[data-open-lead]").forEach((button) => button.addEventListener("click", () => openLead(button.dataset.openLead)));
}

async function getForm(brandCode, objectType) { const key = `${brandCode}:${objectType}`; if (!state.forms.has(key)) state.forms.set(key, (await api(`/api/v1/forms?brandCode=${brandCode}&objectType=${objectType}`)).data[0]); return state.forms.get(key); }
function dynamicField(field, prefix) {
  const id = `${prefix}-${field.key}`; const required = field.required ? `<span class="required-mark">*</span>` : ""; const requiredAttr = field.required ? " required" : "";
  if (field.type === "checkbox") return `<label class="full consent-control"><input id="${id}" data-field="${field.key}" type="checkbox"${requiredAttr}><span>${esc(field.label)}${required}</span></label>`;
  if (field.key === "country") return `<label><span class="field-label">${esc(field.label)}${required}</span><select class="control" id="${id}" data-field="${field.key}"${requiredAttr}><option value="">请选择</option>${COUNTRY_OPTIONS.map((option) => `<option value="${esc(option.value)}">${esc(option.label)}</option>`).join("")}</select></label>`;
  if (prefix === "member" && ["province", "city"].includes(field.key)) return `<label><span class="field-label">${esc(field.label)}${required}</span><select class="control" id="${id}" data-field="${field.key}"${requiredAttr} disabled><option value="">请先选择${field.key === "province" ? "国家 / 地区" : "省 / 地区"}</option></select></label>`;
  if (field.type === "select") return `<label><span class="field-label">${esc(field.label)}${required}</span><select class="control" id="${id}" data-field="${field.key}"${requiredAttr}><option value="">请选择</option>${(field.options || []).map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select></label>`;
  const inputType = field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text";
  return `<label><span class="field-label">${esc(field.label)}${required}</span><input class="control" id="${id}" data-field="${field.key}" type="${inputType}"${requiredAttr}></label>`;
}
function replaceSelectOptions(select, values, placeholder, selectedValue = "") {
  select.innerHTML = `<option value="">${esc(placeholder)}</option>${values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("")}`;
  select.disabled = values.length === 0;
  select.value = values.includes(selectedValue) ? selectedValue : "";
}
function bindMemberAddressControls() {
  const country = $("member-country"); const province = $("member-province"); const city = $("member-city");
  if (!country || !province || !city) return;
  const refreshCities = (selected = "") => {
    const values = ADDRESS_TREE[canonicalCountry(country.value)]?.[province.value] || [];
    replaceSelectOptions(city, values, province.value ? "请选择城市" : "请先选择省 / 地区", selected);
  };
  const refreshProvinces = (selectedProvince = "", selectedCity = "") => {
    const values = Object.keys(ADDRESS_TREE[canonicalCountry(country.value)] || {});
    replaceSelectOptions(province, values, country.value ? "请选择省 / 地区" : "请先选择国家 / 地区", selectedProvince);
    refreshCities(selectedCity);
  };
  country.addEventListener("change", () => refreshProvinces());
  province.addEventListener("change", () => refreshCities());
  if (!country.value) country.value = "China";
  refreshProvinces();
}
async function openCreateLead(customerId = null) {
  const brands = customerId ? state.currentCustomer.profiles.map((p) => p.brand) : state.brands; $("createLeadBrand").innerHTML = brands.map((b) => `<option value="${b.code}">${esc(b.name)}</option>`).join("");
  $("createLeadType").innerHTML = `<option value="PURCHASE_INTENT">购买意向</option>`; $("createLeadStatus").innerHTML = `<option value="NEW">新建</option>`; $("createLeadOwner").innerHTML = `<option value="">未分配</option>`; $("createLeadSource").innerHTML = `<option value="ADMIN_MANUAL">后台手动提交</option><option value="WECHAT_MINIPROGRAM">微信小程序</option>`;
  $("canonicalLeadForm").dataset.customerId = customerId || ""; await renderLeadFields(); $("leadCreateDialog").showModal();
}
async function renderLeadFields() { const form = await getForm($("createLeadBrand").value, "LEAD"); $("createLeadVersion").value = form.version; $("dynamicLeadFields").innerHTML = `<div class="dynamic-form-grid">${form.schemaJson.fields.map((f) => dynamicField(f, "lead")).join("")}</div>`; }
async function saveLead(event) {
  event.preventDefault(); const fields = Object.fromEntries(Array.from($("dynamicLeadFields").querySelectorAll("[data-field]"), (el) => [el.dataset.field, el.type === "checkbox" ? el.checked : el.value]));
  const body = { ...fields, brandCode: $("createLeadBrand").value, leadType: "PURCHASE_INTENT", source: $("createLeadSource").value, submissionMode: $("createLeadSource").value === "ADMIN_MANUAL" ? "ADMIN_MANUAL" : "USER_SUBMITTED", formVersion: $("createLeadVersion").value, customerId: $("canonicalLeadForm").dataset.customerId || null };
  try { await api("/api/v1/leads", { method: "POST", body: JSON.stringify(body), headers: { "idempotency-key": crypto.randomUUID() } }); $("leadCreateDialog").close(); notify("线索已创建并进入待同步队列"); await loadLeads(); if (state.currentCustomer) await openCustomer(state.currentCustomer.id); } catch (error) { showError($("createLeadErrors"), error); }
}
async function openCreateMember() {
  $("memberRegistrationForm").reset(); $("createMemberErrors").hidden = true;
  $("createMemberBrand").innerHTML = state.brands.map((b) => `<option value="${b.code}">${esc(b.name)}</option>`).join("");
  await renderMemberFields(); $("memberCreateDialog").showModal();
  $("memberCreateDialog").querySelector(".dialog-body").scrollTop = 0;
}
async function renderMemberFields() {
  const form = await getForm($("createMemberBrand").value, "CUSTOMER");
  $("dynamicMemberRegistrationFields").innerHTML = `<div class="dynamic-form-grid">${form.schemaJson.fields.map((f) => dynamicField(f, "member")).join("")}</div>`;
  bindMemberAddressControls();
}
async function saveMember(event) {
  event.preventDefault(); const fields = Object.fromEntries(Array.from($("dynamicMemberRegistrationFields").querySelectorAll("[data-field]"), (el) => [el.dataset.field, el.type === "checkbox" ? el.checked : el.value]));
  const profile = { brandCode: $("createMemberBrand").value, salutation: fields.salutation, lastName: fields.last_name, firstName: fields.first_name, birthday: fields.birthday || null, email: fields.email || null, country: fields.country || null, region: fields.province || null, city: fields.city || null, postalCode: fields.postal_code || null, addressLine: fields.address_line || null, language: fields.language || null, preferredContact: fields.preferred_contact || null, ownsBrandWatch: fields.owns_brand_watch === "Yes", interestCenter: fields.interest_center || null, favoriteCollection: fields.favorite_collection || null, marketingOptIn: Boolean(fields.marketing_opt_in), processingConsent: Boolean(fields.processing_consent), registrationData: fields };
  try { await api("/api/v1/customers", { method: "POST", body: JSON.stringify({ mobile: fields.mobile, profile }) }); $("memberCreateDialog").close(); notify("会员已创建"); await loadCustomers(); } catch (error) { showError($("createMemberErrors"), error); }
}

async function loadAccounts() {
  const result = await api("/api/v1/users"); state.users = result.data;
  $("accountResultCount").textContent = `${result.data.length} 个账号`;
  $("accountRows").innerHTML = result.data.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.loginAccount)}</td><td>${esc(u.role.name)}</td><td>${u.role.key === "SUPER_ADMIN" ? "全部品牌" : esc(u.brandAccess.map((x) => x.brand.name).join("、"))}</td><td><span class="status-badge ${u.status === "DISABLED" ? "disabled" : ""}">${esc(statusLabel(u.status))}</span></td><td>${esc(dt(u.lastLoginAt))}</td><td class="action-cell"><div class="table-actions">${can("account.edit") ? `<button class="btn btn-small" data-edit-user="${u.id}">编辑</button>` : ""}${can("account.reset") ? `<button class="btn btn-small" data-reset-user="${u.id}">重置密码</button>` : ""}${can("account.disable") && u.id !== state.me.id ? `<button class="btn btn-small" data-toggle-user="${u.id}" data-status="${u.status}">${u.status === "ACTIVE" ? "禁用" : "启用"}</button>` : ""}</div></td></tr>`).join("");
  document.querySelectorAll("[data-edit-user]").forEach((b) => b.onclick = () => openAccountDrawer(state.users.find((u) => u.id === b.dataset.editUser)));
  document.querySelectorAll("[data-reset-user]").forEach((b) => b.onclick = () => accountAction(b.dataset.resetUser, "reset-password"));
  document.querySelectorAll("[data-toggle-user]").forEach((b) => b.onclick = () => accountAction(b.dataset.toggleUser, b.dataset.status === "ACTIVE" ? "disable" : "enable"));
}
async function accountAction(id, action) { try { await api(`/api/v1/users/${id}/${action}`, { method: "POST", body: "{}" }); notify("账号操作已完成"); await loadAccounts(); } catch (error) { notify(error.message); } }

async function prepareAccountDrawer(user = null) {
  if (!state.roles.length) state.roles = (await api("/api/v1/roles")).data;
  $("accountForm").dataset.userId = user?.id || "";
  $("accountDrawerTitle").textContent = user ? "编辑账号" : "新增账号"; $("saveAccountBtn").textContent = user ? "保存更改" : "创建账号";
  $("accountNameInput").value = user?.name || ""; $("accountLoginInput").value = user?.loginAccount || ""; $("accountStatusInput").value = user?.status || "ACTIVE";
  $("accountRoleInput").innerHTML = state.roles.map((role) => `<option value="${role.id}">${esc(role.name)}</option>`).join("");
  $("accountRoleInput").value = user?.role.id || state.roles[0]?.id || "";
  const selected = new Set(user?.brandAccess?.map((item) => item.brand.id) || []);
  $("accountScopeInput").innerHTML = state.brands.map((brand) => `<label><input type="checkbox" value="${brand.id}" ${selected.has(brand.id) ? "checked" : ""}><span>${esc(brand.name)}</span></label>`).join("");
  $("accountFormError").hidden = true;
  updateAccountScopeState();
}
function updateAccountScopeState() {
  const role = state.roles.find((item) => item.id === $("accountRoleInput").value); const allBrands = role?.key === "SUPER_ADMIN";
  $("accountScopeInput").classList.toggle("is-disabled", allBrands);
  $("accountScopeInput").querySelectorAll("input").forEach((input) => { input.disabled = allBrands; if (allBrands) input.checked = true; });
}
async function openAccountDrawer(user = null) { try { await prepareAccountDrawer(user); $("accountDrawer").classList.add("is-open"); $("accountDrawer").setAttribute("aria-hidden", "false"); } catch (error) { notify(error.message); } }
function closeAccountDrawer() { $("accountDrawer").classList.remove("is-open"); $("accountDrawer").setAttribute("aria-hidden", "true"); }
async function saveAccount(event) {
  event.preventDefault(); $("accountFormError").hidden = true;
  const role = state.roles.find((item) => item.id === $("accountRoleInput").value);
  const brandIds = role?.key === "SUPER_ADMIN" ? [] : Array.from($("accountScopeInput").querySelectorAll("input:checked"), (input) => input.value);
  if (role?.key !== "SUPER_ADMIN" && brandIds.length === 0) return showError($("accountFormError"), new Error("请至少选择一个品牌范围"));
  const body = { name: $("accountNameInput").value.trim(), loginAccount: $("accountLoginInput").value.trim(), roleId: $("accountRoleInput").value, brandIds, status: $("accountStatusInput").value };
  const id = $("accountForm").dataset.userId;
  try { await api(id ? `/api/v1/users/${id}` : "/api/v1/users", { method: id ? "PATCH" : "POST", body: JSON.stringify(body) }); closeAccountDrawer(); notify(id ? "账号已更新" : "账号已创建，首次登录需修改密码"); await loadAccounts(); } catch (error) { showError($("accountFormError"), error); }
}

const permissionModuleLabels = { customer: "会员", lead: "线索", account: "账户", role: "角色与权限", audit: "审计日志" };
async function loadRoles(preferredRoleId = null) {
  const [roleResult, permissionResult] = await Promise.all([api("/api/v1/roles"), api("/api/v1/permissions")]); state.roles = roleResult.data; state.permissions = permissionResult.data;
  $("roleList").innerHTML = state.roles.map((r, i) => `<button class="role-list-button ${r.id === preferredRoleId || (!preferredRoleId && i === 0) ? "is-active" : ""}" data-role-id="${r.id}"><strong>${esc(r.name)}</strong><span>${esc(r.description || "")}</span></button>`).join("");
  const render = (role) => {
    const selected = new Set(role.permissions.map((item) => item.permission.key)); const readOnly = role.system || !can("roles.configure");
    const grouped = Object.groupBy ? Object.groupBy(state.permissions, (permission) => permission.module) : state.permissions.reduce((groups, permission) => ((groups[permission.module] ||= []).push(permission), groups), {});
    $("roleDetail").innerHTML = `<div class="role-detail-header"><div><h2>${esc(role.name)}</h2><p>${esc(role.description || "")}</p></div><span class="spacer"></span>${role.system ? `<span class="role-system-note">系统角色不可修改</span>` : can("roles.configure") ? `<button class="btn btn-primary btn-small" id="saveRolePermissions">保存权限</button>` : `<span class="role-system-note">只读</span>`}</div><div class="role-detail-body">${Object.entries(grouped).map(([module, permissions]) => `<section class="permission-section"><h3>${esc(permissionModuleLabels[module] || module)}</h3>${permissions.map((permission) => `<div class="permission-row"><div class="permission-copy"><strong>${esc(permission.name)}</strong><span>${esc(permission.key)}</span></div><label class="permission-switch"><input type="checkbox" data-permission-key="${esc(permission.key)}" ${selected.has(permission.key) ? "checked" : ""} ${readOnly ? "disabled" : ""}><span></span></label></div>`).join("")}</section>`).join("")}</div>`;
    if ($("saveRolePermissions")) $("saveRolePermissions").onclick = async () => { const permissionKeys = Array.from($("roleDetail").querySelectorAll("[data-permission-key]:checked"), (input) => input.dataset.permissionKey); try { await api(`/api/v1/roles/${role.id}/permissions`, { method: "PATCH", body: JSON.stringify({ permissionKeys }) }); notify("角色权限已保存"); await loadRoles(role.id); } catch (error) { notify(error.message); } };
    $("roleList").querySelectorAll("button").forEach((button) => button.classList.toggle("is-active", button.dataset.roleId === role.id));
  };
  const active = state.roles.find((role) => role.id === preferredRoleId) || state.roles[0]; if (active) render(active);
  $("roleList").querySelectorAll("button").forEach((button) => button.onclick = () => render(state.roles.find((role) => role.id === button.dataset.roleId)));
}
async function loadAudit() { const result = await api("/api/v1/audit-logs?pageSize=200"); $("securityAuditCount").textContent = `${result.meta.total} 条记录`; $("securityAuditRows").innerHTML = result.data.map((a) => `<tr><td>${esc(dt(a.createdAt))}</td><td>${esc(a.actorName)}</td><td>${esc(a.action)}</td><td>${esc(a.module)}</td><td>${esc(`${a.targetType}${a.targetId ? ` · ${a.targetId}` : ""}`)}</td><td>${esc(a.details ? JSON.stringify(a.details) : "-")}</td></tr>`).join(""); }

async function exportData(type) { try { const result = await api(`/api/v1/exports/${type}`, { method: "POST", body: "{}" }); const link = document.createElement("a"); link.href = appUrl(result.data.downloadUrl); link.download = result.data.fileName; document.body.append(link); link.click(); link.remove(); notify(`已导出 ${result.data.rowCount} 条数据`); } catch (error) { notify(error.message); } }
function importObjectLabel() { return state.importType === "customers" ? "会员" : "线索"; }
function importBrandLabel() { return brandLabel(state.brands.find((brand) => brand.code === state.importBrand)); }
function renderImportSteps() {
  const labels = ["选择品牌与文件", "服务端校验与导入", "导入结果"];
  $("importSteps").hidden = state.importHistoryMode;
  $("importSteps").innerHTML = labels.map((label, index) => { const step = index + 1; return `<div class="import-step${step === state.importStep ? " is-active" : ""}${step < state.importStep ? " is-complete" : ""}"><strong>${esc(label)}</strong></div>`; }).join("");
}
function renderImportHistory() {
  const rows = state.importHistory.filter((job) => job.type === state.importType).map((job) => `<tr><td>${esc(job.result.jobNo)}</td><td>${esc(job.fileName)}</td><td>${esc(brandLabel(state.brands.find((brand) => brand.code === job.brand)))}</td><td>${esc(state.me?.name || "-")}</td><td>${job.result.totalCount}</td><td>${job.result.failedCount}</td><td>${esc(dt(job.createdAt))}</td><td><span class="row-status ${job.result.failedCount ? "warning" : "success"}">${job.result.failedCount ? "部分完成" : "已完成"}</span></td></tr>`).join("");
  $("importBody").innerHTML = `<div class="history-view"><h3>本次会话导入记录</h3><p class="section-intro">显示本次登录会话中已完成的${importObjectLabel()}导入。</p>${rows ? `<div class="preview-table-wrap"><table class="history-table"><thead><tr><th>导入编号</th><th>文件</th><th>品牌</th><th>操作人</th><th>处理数量</th><th>失败数量</th><th>时间</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="preview-empty">本次会话暂无导入记录</div>`}</div>`;
  $("importFooter").innerHTML = `<button class="btn" type="button" id="backToImport">返回导入</button><span class="spacer"></span><button class="btn" type="button" id="closeImportHistory">关闭</button>`;
  $("backToImport").onclick = () => { state.importHistoryMode = false; renderImport(); };
  $("closeImportHistory").onclick = () => $("importDialog").close();
}
function renderImportUpload() {
  const leadType = state.importType === "leads" ? `<label><span class="field-label">线索类型</span><select class="control" disabled><option>购买意向</option></select></label>` : "";
  return `<div class="upload-stage"><h3>上传${importObjectLabel()}数据</h3><p class="section-intro">选择导入范围并上传文件，服务端将按当前品牌的有效表单配置校验。</p><div class="import-context${state.importType === "customers" ? " is-single" : ""}"><label><span class="field-label">导入品牌</span><select class="control" id="importBrand">${state.brands.map((brand) => `<option value="${esc(brand.code)}"${brand.code === state.importBrand ? " selected" : ""}>${esc(brand.name)}</option>`).join("")}</select></label>${leadType}</div>${state.importError ? `<div class="inline-alert error">${esc(state.importError)}</div>` : ""}<div class="upload-card" id="uploadCard"><div><div class="upload-symbol"><svg><use href="#i-upload"/></svg></div><div class="upload-copy"><strong>拖放 XLSX 文件</strong><span>单个文件不超过 10 MB，单次最多 5,000 行</span></div><div class="upload-actions"><button class="btn btn-primary btn-small" type="button" id="chooseImportFile">选择文件</button><button class="text-action" type="button" id="downloadTemplate">下载 ${esc(importBrandLabel())} ${importObjectLabel()}模板</button></div><span class="template-guidance">Excel 模板 · 红色 <b>*</b> 为必填字段 · 手机号按文本格式保存完整数字</span></div></div></div>`;
}
function renderImportProcessing() {
  return `<div class="upload-stage"><h3>服务端校验与导入</h3><p class="section-intro">正在按 ${esc(importBrandLabel())} 当前有效表单配置校验并写入数据。</p><div class="file-summary"><div class="file-summary-icon"><svg><use href="#i-upload"/></svg></div><div class="file-summary-copy"><strong>${esc(state.importFileName)}</strong><span>校验、去重与导入由同一个服务端任务执行</span><span class="file-state">处理中，请勿关闭窗口</span></div><span class="state-spinner"></span></div></div>`;
}
function renderImportResult() {
  const result = state.importResult;
  const summary = `共处理 ${result.totalCount} 条，成功 ${result.successCount} 条${result.failedCount ? `，失败 ${result.failedCount} 条` : ""}${result.skippedCount ? `，跳过 ${result.skippedCount} 条` : ""}。`;
  return `<div class="result-body"><div class="result-hero"><div class="result-icon"><svg><use href="#i-check"/></svg></div><div><h3>导入完成</h3><p>${esc(summary)}</p></div></div><div class="result-stats"><div class="result-stat"><span>处理总数</span><strong>${result.totalCount}</strong></div><div class="result-stat"><span>成功</span><strong>${result.successCount}</strong></div><div class="result-stat"><span>失败</span><strong>${result.failedCount}</strong></div><div class="result-stat"><span>跳过</span><strong>${result.skippedCount}</strong></div></div></div>`;
}
function bindImportUploadActions() {
  if ($("importBrand")) $("importBrand").onchange = (event) => { state.importBrand = event.target.value; state.importError = ""; renderImport(); };
  if ($("chooseImportFile")) $("chooseImportFile").onclick = () => { $("importFileInput").value = ""; $("importFileInput").click(); };
  if ($("downloadTemplate")) $("downloadTemplate").onclick = () => { location.href = appUrl(`/api/v1/templates/${state.importType}?brandCode=${state.importBrand}`); };
  const card = $("uploadCard");
  if (card) {
    ["dragenter", "dragover"].forEach((type) => card.addEventListener(type, (event) => { event.preventDefault(); card.classList.add("is-dragging"); }));
    ["dragleave", "drop"].forEach((type) => card.addEventListener(type, (event) => { event.preventDefault(); card.classList.remove("is-dragging"); }));
    card.addEventListener("drop", (event) => { const file = event.dataTransfer?.files?.[0]; if (file) uploadImport(file); });
  }
}
function renderImport() {
  $("importDialogTitle").textContent = `批量导入${importObjectLabel()}`;
  $("importDialogSubtitle").textContent = state.importHistoryMode ? "本次会话记录" : `${importBrandLabel()}${state.importType === "leads" ? " · 购买意向" : ""}`;
  document.querySelector(".import-shell").classList.toggle("is-compact", !state.importHistoryMode && [1, 3].includes(state.importStep));
  renderImportSteps();
  if (state.importHistoryMode) return renderImportHistory();
  $("importBody").innerHTML = state.importStep === 1 ? renderImportUpload() : state.importStep === 2 ? renderImportProcessing() : renderImportResult();
  if (state.importStep === 1) {
    $("importFooter").innerHTML = `<span class="spacer"></span><button class="btn" type="button" id="cancelImport">取消</button>`;
    $("cancelImport").onclick = () => $("importDialog").close(); bindImportUploadActions();
  } else if (state.importStep === 2) {
    $("importFooter").innerHTML = `<span class="spacer"></span><button class="btn" type="button" disabled>正在处理</button>`;
  } else {
    $("importFooter").innerHTML = `<button class="btn" type="button" id="newImportJob">继续导入</button><span class="spacer"></span><button class="btn btn-primary" type="button" id="finishImport">返回${importObjectLabel()}列表</button>`;
    $("newImportJob").onclick = () => { state.importStep = 1; state.importResult = null; state.importFileName = ""; state.importError = ""; renderImport(); };
    $("finishImport").onclick = () => { $("importDialog").close(); state.importType === "customers" ? loadCustomers() : loadLeads(); };
  }
}
function openImport(type) {
  state.importType = type; state.importBrand = state.brands[0]?.code; state.importStep = 1; state.importResult = null; state.importFileName = ""; state.importError = ""; state.importing = false; state.importHistoryMode = false;
  renderImport(); $("importDialog").showModal(); $("importDialogTitle").focus({ preventScroll: true });
}
async function uploadImport(file) {
  if (state.importing) return;
  if (!file.name.toLowerCase().endsWith(".xlsx")) { state.importError = "请上传 .xlsx 文件"; return renderImport(); }
  if (file.size > 10 * 1024 * 1024) { state.importError = "单个文件不能超过 10 MB"; return renderImport(); }
  state.importing = true; state.importFileName = file.name; state.importError = ""; state.importStep = 2; renderImport();
  const data = new FormData(); data.append("file", file);
  try {
    const result = await api(`/api/v1/imports/${state.importType}?brandCode=${state.importBrand}&conflictStrategy=SKIP`, { method: "POST", body: data });
    state.importResult = result.data; state.importHistory.unshift({ type: state.importType, brand: state.importBrand, fileName: file.name, result: result.data, createdAt: new Date().toISOString() }); state.importStep = 3;
  } catch (error) { state.importStep = 1; state.importError = error.message; notify(error.message); }
  finally { state.importing = false; renderImport(); }
}

function passwordAssessment(value) {
  const password = String(value || ""); const lower = password.toLowerCase();
  const obvious = ["123456789012", "password1234", "aaaaaaaaaaaa", "qwerty123456"].includes(lower) || /^\d+$/.test(password) || /^(.)\1{11,}$/.test(password);
  if (!password) return { level: "empty", label: "—", width: 0 };
  if (password.length < 12 || obvious) return { level: "weak", label: "弱", width: 28 };
  const variety = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  if (password.length >= 16 || variety >= 3) return { level: "strong", label: "强", width: 100 };
  return { level: "medium", label: "中", width: 62 };
}
function updateStrength(containerId, value) {
  const assessment = passwordAssessment(value); const container = $(containerId); if (!container) return;
  container.className = `password-strength${assessment.level === "medium" ? " is-medium" : assessment.level === "strong" ? " is-strong" : ""}`;
  container.querySelector(".password-strength-fill").style.width = `${assessment.width}%`;
  container.querySelector(".password-strength-label").textContent = `密码强度：${assessment.label}`;
}

function bindEvents() {
  $("loginForm").addEventListener("submit", async (event) => { event.preventDefault(); $("loginError").hidden = true; try { const result = await api("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ loginAccount: $("loginAccountInput").value, password: $("loginPasswordInput").value }) }); state.me = result.data; await afterAuth(); } catch (error) { showError($("loginError"), error); } });
  $("forcePasswordForm").addEventListener("submit", async (event) => { event.preventDefault(); $("forcePasswordError").hidden = true; const password = $("forcedNewPasswordInput").value; const confirm = $("forcedConfirmPasswordInput").value; try { await api("/api/v1/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: $("loginPasswordInput").value, newPassword: password, confirmPassword: confirm }) }); state.me.mustChangePassword = false; hideForcePassword(); notify("密码已更新"); await afterAuth(); } catch (error) { showError($("forcePasswordError"), error); } });
  $("backToList").onclick = () => navigate("contacts"); $("searchMembers").onclick = loadCustomers; $("resetMemberFilters").onclick = () => { $("memberSearch").value = ""; $("memberBrandFilter").value = "ALL"; loadCustomers(); }; $("searchLeads").onclick = loadLeads; $("resetLeadFilters").onclick = () => { $("leadKeyword").value = ""; $("leadBrandFilter").value = "ALL"; loadLeads(); }; $("reloadLeads").onclick = loadLeads;
  $("newMemberBtn").onclick = openCreateMember; $("closeMemberCreate").onclick = () => $("memberCreateDialog").close(); $("cancelMemberCreate").onclick = () => $("memberCreateDialog").close(); $("createMemberBrand").onchange = renderMemberFields; $("memberRegistrationForm").onsubmit = saveMember;
  $("openLeadCreate").onclick = () => openCreateLead(); $("newLeadBtn").onclick = () => openCreateLead(state.currentCustomer?.id); $("panelNewLead").onclick = () => openCreateLead(state.currentCustomer?.id); $("closeLeadCreate").onclick = () => $("leadCreateDialog").close(); $("cancelLeadCreate").onclick = () => $("leadCreateDialog").close(); $("createLeadBrand").onchange = renderLeadFields; $("canonicalLeadForm").onsubmit = saveLead; $("closeLeadDrawer").onclick = () => $("leadDrawer").classList.remove("is-open");
  $("memberExportBtn").onclick = () => exportData("customers"); $("leadExportBtn").onclick = () => exportData("leads"); $("memberImportBtn").onclick = () => openImport("customers"); $("leadImportBtn").onclick = () => openImport("leads"); $("closeImportDialog").onclick = () => $("importDialog").close(); $("importHistoryBtn").onclick = () => { state.importHistoryMode = !state.importHistoryMode; renderImport(); }; $("importFileInput").onchange = (event) => event.target.files[0] && uploadImport(event.target.files[0]);
  $("addAccountBtn").onclick = () => openAccountDrawer(); $("closeAccountDrawer").onclick = $("cancelAccountDrawer").onclick = closeAccountDrawer; $("accountRoleInput").onchange = updateAccountScopeState; $("accountForm").onsubmit = saveAccount;
  $("addNoteBtn").onclick = () => $("noteComposer").classList.add("is-open"); $("cancelNote").onclick = () => $("noteComposer").classList.remove("is-open"); $("saveNote").onclick = async () => { if (!$("noteInput").value.trim()) return; await api(`/api/v1/customers/${state.currentCustomer.id}/notes`, { method: "POST", body: JSON.stringify({ body: $("noteInput").value }) }); $("noteInput").value = ""; await openCustomer(state.currentCustomer.id); renderCustomerModule("notes"); };
  $("accountMenuTrigger").onclick = () => { $("accountMenu").hidden = !$("accountMenu").hidden; }; $("logoutMenuItem").onclick = async () => { await api("/api/v1/auth/logout", { method: "POST", body: "{}" }); state.me = null; showLogin(); };
  $("personalSettingsMenuItem").onclick = () => { $("personalSettingsBody").innerHTML = `<div class="settings-summary"><strong>${esc(state.me.name)}</strong><span>${esc(state.me.loginAccount)}</span><span>${esc(state.me.role.name)}</span></div>`; $("personalSettingsDrawer").classList.add("is-open"); };
  $("closePersonalSettings").onclick = $("closePersonalSettingsFooter").onclick = () => $("personalSettingsDrawer").classList.remove("is-open"); $("changePasswordMenuItem").onclick = () => { $("changePasswordForm").reset(); $("changePasswordError").hidden = true; updateStrength("changePasswordStrength", ""); $("changePasswordDialog").showModal(); }; $("closeChangePassword").onclick = $("cancelChangePassword").onclick = () => $("changePasswordDialog").close();
  $("changePasswordForm").onsubmit = async (event) => { event.preventDefault(); try { await api("/api/v1/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: $("currentPasswordInput").value, newPassword: $("newPasswordInput").value, confirmPassword: $("confirmPasswordInput").value }) }); $("changePasswordDialog").close(); notify("密码已更新"); } catch (error) { showError($("changePasswordError"), error); } };
  $("forgotPasswordBtn").onclick = () => $("forgotPasswordDialog").showModal(); $("closeForgotPassword").onclick = $("ackForgotPassword").onclick = () => $("forgotPasswordDialog").close();
  $("newPasswordInput").addEventListener("input", (event) => updateStrength("changePasswordStrength", event.target.value));
  $("forcedNewPasswordInput").addEventListener("input", (event) => updateStrength("forcePasswordStrength", event.target.value));
  document.addEventListener("click", (event) => { const toggle = event.target.closest("[data-password-toggle]"); if (toggle) { const input = $(toggle.dataset.passwordToggle); input.type = input.type === "password" ? "text" : "password"; toggle.textContent = input.type === "password" ? "显示" : "隐藏"; } });
}

async function afterAuth() {
  hideLogin(); if (state.me.mustChangePassword) { renderIdentity(); return showForcePassword(); }
  state.brands = (await api("/api/v1/brands")).data; state.roles = []; state.permissions = [];
  renderIdentity(); renderNavigation(); renderBrandFilters(); applyPermissionVisibility();
  if (can("customer.view")) api("/api/v1/customers?pageSize=1").then((result) => { if ($("memberNavCount")) $("memberNavCount").textContent = result.meta.total; }).catch(() => {});
  if (can("lead.view")) api("/api/v1/leads?pageSize=1").then((result) => { if ($("leadNavCount")) $("leadNavCount").textContent = result.meta.total; }).catch(() => {});
  const requested = location.hash.slice(1); const allowed = { contacts: can("customer.view"), leads: can("lead.view"), accounts: can("account.view"), roles: can("roles.view"), audit: can("audit.view") };
  navigate(allowed[requested] ? requested : can("customer.view") ? "contacts" : can("lead.view") ? "leads" : can("account.view") ? "accounts" : can("roles.view") ? "roles" : "audit");
}
async function init() { bindEvents(); try { state.me = (await api("/api/v1/auth/me")).data; await afterAuth(); } catch (error) { if (error.status !== 401) notify(error.message); showLogin(); } }
init();
