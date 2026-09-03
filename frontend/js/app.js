"use strict";

import { ADDRESS_TREE, COUNTRY_OPTIONS, canonicalCountry, countryLabel } from "./address-data.js";
import { initializeContacts, loadContacts as loadCrmContacts, openContact as openCrmContact, syncContactUsers } from "./contacts.js";
import { initializeFollowups } from "./followups.js";
import { initializeCrmJobs, openCrmExport, openCrmImport } from "./crm-jobs.js";
import { initializeLeads, loadLeads as loadCrmLeads, openLead as openCrmLead, openLeadForm as openCrmLeadForm, syncLeadUsers } from "./leads.js";

const APP_BASE_PATH = (() => {
  const modulePath = new URL(import.meta.url).pathname;
  const suffix = "/js/app.js";
  return modulePath.endsWith(suffix) ? modulePath.slice(0, -suffix.length) : "";
})();
const appUrl = (path) => `${APP_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
const SIDEBAR_STORAGE_KEY = "sowind.crm.sidebar.collapsed";
const state = {
  me: null, brands: [], customers: [], leads: [], users: [], roles: [], permissions: [],
  currentCustomer: null, currentLead: null, currentBrand: "ALL", currentBrandProfile: "ALL", forms: new Map(),
  crmUsers: [], currentCrmContact: null, currentCrmLead: null,
  importType: null, importBrand: null, importStep: 1, importJob: null, importResult: null, importFileName: "", importError: "", importing: false,
  importHistoryMode: false, importHistory: [], importPreflightFilter: "ALL", importConflictStrategy: "SKIP",
  importUnmatchedStrategy: "IMPORT_LEAD_ONLY", importDuplicateFile: null, exportType: null,
  memberForm: null, leadForm: null, profileForm: null,
  selectedCustomerIds: new Set(), selectedLeadIds: new Set(),
};
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const dt = (value) => value ? new Date(value).toLocaleString("sv-SE", { hour12: false }).replace("T", " ").slice(0, 19) : "-";
const brandLabel = (brand) => brand?.name || ({ UN: "UN 雅典表", GP: "GP 芝柏表" }[brand] || brand || "-");
const statusLabel = (status) => ({ NOT_SYNCED: "未同步", SYNC_PENDING: "待同步", SYNCING: "提交中", GATEWAY_ACCEPTED: "HQ", SYNC_FAILED: "同步失败", DEAD_LETTER: "同步失败（已停止重试）", PENDING: "处理中", UPLOADED: "已上传", PREFLIGHT_READY: "数据检查完成", READY_TO_EXECUTE: "待确认导入", PROCESSING: "处理中", COMPLETED: "已完成", COMPLETED_WITH_ERRORS: "部分完成", RETRY_WAITING: "待重试", SUCCEEDED: "已完成", FAILED: "失败", ACTIVE: "启用", DISABLED: "禁用" })[status] || status || "-";
const can = (permission) => Boolean(state.me?.permissions?.includes(permission));
const permissionDependencies = {
  "customer.view": ["customer.edit", "customer.import", "customer.export"],
  "lead.view": ["lead.edit", "lead.import", "lead.export"],
  "account.view": ["account.create", "account.edit", "account.disable", "account.reset"],
  "roles.view": ["roles.configure"],
  "crm.contact.view": ["crm.contact.create", "crm.contact.edit", "crm.contact.import", "crm.contact.export", "crm.contact_followup.view", "crm.contact_followup.create"],
  "crm.contact_followup.view": ["crm.contact_followup.create"],
  "crm.lead.view": ["crm.lead.create", "crm.lead.edit", "crm.lead.import", "crm.lead.export", "crm.lead_followup.view", "crm.lead_followup.create"],
  "crm.lead_followup.view": ["crm.lead_followup.create"],
};
const sourceLabel = (source) => ({ ADMIN_MANUAL: "后台手动新增", BATCH_IMPORT: "批量导入", MINI_PROGRAM: "微信小程序", WECHAT_MINIPROGRAM: "微信小程序", USER_SUBMITTED: "用户提交" })[source] || source || "-";
const contactChannelLabel = (channel) => ({
  WECHAT: "微信", PHONE: "电话", EMAIL: "电子邮件", SMS: "短信",
  WHATSAPP: "WhatsApp 消息", SIGNAL: "Signal 消息", TELEGRAM: "Telegram 消息",
  "ALL OF THE ABOVE": "以上全部",
})[String(channel || "").trim().toUpperCase()] || channel || "-";
const yesNoLabel = (value) => ({ YES: "是", NO: "否", TRUE: "是", FALSE: "否" })[String(value ?? "").trim().toUpperCase()] || value || "-";
function formOptionLabel(fieldKey, option) {
  if (["preferred_contact", "preferredContact"].includes(fieldKey)) return contactChannelLabel(option);
  if (["owns_brand_watch", "ownsBrandWatch", "ownership"].includes(fieldKey)) return yesNoLabel(option);
  return option;
}
function normalizeFormOption(fieldKey, option) {
  if (option && typeof option === "object") return { value: String(option.value), label: String(option.label ?? option.value) };
  return { value: String(option), label: String(formOptionLabel(fieldKey, option)) };
}

async function api(path, options = {}) {
  const headers = { accept: "application/json", ...(options.body instanceof FormData ? {} : { "content-type": "application/json" }), ...(options.headers || {}) };
  const response = await fetch(appUrl(path), { credentials: "same-origin", ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.blob();
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `请求失败（${response.status}）`);
    error.code = payload?.error?.code;
    error.details = payload?.error?.details;
    error.fieldErrors = payload?.error?.fieldErrors || [];
    error.traceId = payload?.traceId || response.headers.get("x-trace-id");
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
function setAccountMenuOpen(open) {
  $("accountMenu").hidden = !open;
  $("accountMenuTrigger").setAttribute("aria-expanded", String(open));
}
function closeAccountMenu() { setAccountMenuOpen(false); }
function showError(target, error) {
  const message = String(error?.message || error || "操作失败");
  target.textContent = /[A-Za-z].*(Invalid|expected|Too small|address)/i.test(message) ? "提交内容有误，请检查标红字段后重试" : message;
  target.hidden = false;
}

const apiFieldAliases = {
  lastName: "last_name", firstName: "first_name", postalCode: "postal_code", addressLine: "address_line",
  preferredContact: "preferred_contact", ownsBrandWatch: "owns_brand_watch", interestCenter: "interest_center",
  favoriteCollection: "favorite_collection", processingConsent: "processing_consent", marketingOptIn: "marketing_opt_in",
  region: "province",
};
function fieldErrorMessage(field, element) {
  if (field.type === "checkbox") return `请勾选“${field.label}”`;
  if (field.type === "select" || element?.tagName === "SELECT") return `请选择${field.label}`;
  return `请输入${field.label}`;
}
function clearFieldErrors(container, summary) {
  container?.querySelectorAll(".dynamic-field.is-invalid").forEach((field) => field.classList.remove("is-invalid"));
  container?.querySelectorAll(".field-error").forEach((message) => { message.textContent = ""; });
  if (summary) { summary.textContent = ""; summary.hidden = true; }
}
function markFieldInvalid(element, message) {
  const shell = element?.closest(".dynamic-field");
  if (!shell) return false;
  shell.classList.add("is-invalid");
  const error = shell.querySelector(".field-error");
  if (error) error.textContent = message;
  return true;
}
function validateDynamicFields(container, fields, summary) {
  clearFieldErrors(container, summary);
  const invalid = [];
  fields.forEach((field) => {
    const element = container.querySelector(`[data-field="${CSS.escape(field.key)}"]`);
    if (!element) return;
    const empty = element.type === "checkbox" ? !element.checked : !String(element.value || "").trim();
    let message = field.required && empty ? fieldErrorMessage(field, element) : "";
    if (!message && field.type === "email" && element.value && !element.validity.valid) message = "请输入有效的 Email 地址";
    if (!message && field.type === "tel" && element.value && String(element.value).replace(/\D/g, "").length < 8) message = "请输入有效的电话号码";
    if (message) { markFieldInvalid(element, message); invalid.push(element); }
  });
  if (invalid.length) {
    summary.textContent = `请检查并完善 ${invalid.length} 个标红字段`;
    summary.hidden = false;
    invalid[0].focus({ preventScroll: true });
    invalid[0].scrollIntoView({ block: "center", behavior: "smooth" });
    return false;
  }
  return true;
}
function showFormError(target, error, container, prefix, fields) {
  clearFieldErrors(container, target);
  const byKey = new Map(fields.map((field) => [field.key, field]));
  let marked = 0;
  (error.fieldErrors || []).forEach((item) => {
    const raw = String(item.field || "").split(".").pop();
    const key = [raw, apiFieldAliases[raw]].find((candidate) => candidate && byKey.has(candidate));
    if (!key) return;
    const field = byKey.get(key);
    const element = container.querySelector(`#${CSS.escape(`${prefix}-${key}`)}`);
    if (field && element && markFieldInvalid(element, fieldErrorMessage(field, element))) marked += 1;
  });
  if (error.code === "DUPLICATE_BRAND_MEMBER") {
    const mobile = container.querySelector(`#${CSS.escape(`${prefix}-mobile`)}`);
    if (mobile && markFieldInvalid(mobile, error.message)) marked += 1;
  }
  target.textContent = error.code === "DUPLICATE_BRAND_MEMBER"
    ? error.message
    : marked ? `请检查并完善 ${marked} 个标红字段` : (/找不到有效的品牌线索表单配置/.test(error.message || "") ? "当前品牌的线索表单配置不可用，请刷新页面后重试" : "提交内容有误，请检查后重试");
  target.hidden = false;
}

function showActionDialog({ title, copy, confirmLabel = "确认", cancelLabel = "取消", showCancel = true }) {
  const dialog = $("securityConfirmDialog");
  const confirmButton = $("confirmSecurityAction");
  const cancelButton = $("cancelSecurityConfirm");
  const closeButton = $("closeSecurityConfirm");
  if (dialog.open) dialog.close();
  $("securityConfirmTitle").textContent = title;
  $("securityConfirmCopy").textContent = copy;
  confirmButton.textContent = confirmLabel;
  cancelButton.textContent = cancelLabel;
  cancelButton.hidden = !showCancel;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (accepted) => {
      if (settled) return;
      settled = true;
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
      resolve(accepted);
    };
    const onCancel = (event) => { event.preventDefault(); finish(false); };
    confirmButton.onclick = () => finish(true);
    cancelButton.onclick = () => finish(false);
    closeButton.onclick = () => finish(false);
    dialog.addEventListener("cancel", onCancel);
    dialog.showModal();
  });
}
function lockApplication() { const shell = document.querySelector(".app-shell"); shell.inert = true; shell.setAttribute("aria-hidden", "true"); document.body.classList.add("is-locked"); }
function unlockApplication() { if (!$("loginOverlay").hidden || !$("forcePasswordOverlay").hidden) return; const shell = document.querySelector(".app-shell"); shell.inert = false; shell.removeAttribute("aria-hidden"); document.body.classList.remove("is-locked"); }
function showLogin() { $("loginOverlay").hidden = false; closeAccountMenu(); lockApplication(); setTimeout(() => $("loginAccountInput").focus(), 30); }
function hideLogin() { $("loginOverlay").hidden = true; unlockApplication(); }
function showForcePassword() { $("forcePasswordOverlay").hidden = false; lockApplication(); }
function hideForcePassword() { $("forcePasswordOverlay").hidden = true; unlockApplication(); }

function profileInitial(customer) { return customer.displayName?.trim()?.[0] || "会"; }
function memberAvatarTone(customer) { const codes = customer.profiles?.map((profile) => profile.brand.code) || []; return codes.length > 1 ? "" : codes[0] === "UN" ? "alt" : "warm"; }
function brandPill(brand) {
  const fallback = brand?.code === "UN" ? { accent: "#607f99", tint: "#eef3f6" } : { accent: "#b4935e", tint: "#f7f1e6" };
  const safeColor = (value, defaultValue) => /^#[0-9a-f]{3,8}$/i.test(String(value || "")) ? String(value) : defaultValue;
  const accent = safeColor(brand?.themeConfig?.accent, fallback.accent);
  const tint = safeColor(brand?.themeConfig?.tint, fallback.tint);
  return `<span class="badge" style="color:${esc(accent)};background:${esc(tint)};border-color:${esc(accent)}55"><span class="badge-dot" style="background:${esc(accent)}"></span>${esc(brand?.name || brand?.code || "-")}</span>`;
}
const failedSyncStatus = (status) => ["SYNC_FAILED", "DEAD_LETTER"].includes(status);
const canRequestSync = (status) => ["NOT_SYNCED", "SYNC_FAILED", "DEAD_LETTER"].includes(status);
function syncPill(status) { return `<span class="sync-pill ${failedSyncStatus(status) ? "failed" : status === "GATEWAY_ACCEPTED" ? "succeeded" : status === "SYNC_PENDING" || status === "SYNCING" ? "pending" : "not-synced"}">${esc(statusLabel(status))}</span>`; }

function renderIdentity() {
  if (!state.me) return;
  $("currentUserName").textContent = state.me.name; $("accountMenuName").textContent = state.me.name;
  $("currentUserAvatar").textContent = state.me.name.slice(0, 2).toUpperCase();
  const scope = state.me.role?.key === "SALES" ? "Kivisense CRM" : state.me.allBrands ? "全部品牌" : state.brands.map((b) => b.shortName).join(" / ");
  const meta = `${state.me.role.name} · ${scope}`; $("currentUserMeta").textContent = meta; $("accountMenuMeta").textContent = meta;
}

function renderNavigation() {
  const nav = $("primaryNavigation");
  const items = [];
  if (can("crm.contact.view")) items.push({ key: "contacts", label: "客户联系人", icon: "users", count: "crmContactNavCount" });
  if (can("crm.lead.view")) items.push({ key: "leads", label: "Leads", icon: "lead", count: "crmLeadNavCount" });
  if (can("customer.view") || can("lead.view")) items.push({ divider: true, label: "Legacy / Sowind" });
  if (can("customer.view")) items.push({ key: "legacy-customers", label: "会员", icon: "users", count: "memberNavCount" });
  if (can("lead.view")) items.push({ key: "legacy-leads", label: "旧线索", icon: "lead", count: "leadNavCount" });
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

function applyCrmPermissions() {
  document.querySelectorAll("[data-crm-permission]").forEach((element) => {
    element.hidden = !can(element.dataset.crmPermission);
  });
}

function setCrmNavCount(key, total) {
  const target = $(key === "contacts" ? "crmContactNavCount" : "crmLeadNavCount");
  if (target) target.textContent = total;
}

function applySidebarState(collapsed, persist = false) {
  if (collapsed) closeAccountMenu();
  document.body.classList.toggle("is-sidebar-collapsed", collapsed);
  const toggle = $("sidebarToggle");
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.setAttribute("aria-label", collapsed ? "展开侧边栏" : "收起侧边栏");
  if (persist) {
    try { localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0"); } catch { /* localStorage may be disabled. */ }
  }
}

function initializeSidebar() {
  let collapsed = false;
  try { collapsed = localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1"; } catch { collapsed = false; }
  applySidebarState(collapsed);
  document.body.classList.remove("is-sidebar-transitioning");
  $("sidebarToggle").addEventListener("click", () => {
    const sidebar = $("primarySidebar");
    const toggle = $("sidebarToggle");
    let fallbackTimer;
    const finish = () => {
      clearTimeout(fallbackTimer);
      sidebar.removeEventListener("transitionend", onTransitionEnd);
      document.body.classList.remove("is-sidebar-transitioning");
      toggle.disabled = false;
    };
    const onTransitionEnd = (event) => {
      if (event.target === sidebar && event.propertyName === "width") finish();
    };
    document.body.classList.add("is-sidebar-transitioning");
    toggle.disabled = true;
    sidebar.addEventListener("transitionend", onTransitionEnd);
    applySidebarState(!document.body.classList.contains("is-sidebar-collapsed"), true);
    fallbackTimer = setTimeout(finish, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 320);
  });
}

const listSelectionConfig = {
  customers: { headerId: "selectAllMembers", rowsId: "memberRows", summaryId: "memberSelectedCount", stateKey: "selectedCustomerIds", dataKey: "selectCustomer", noun: "位会员" },
  leads: { headerId: "selectAllLeads", rowsId: "leadRows", summaryId: "leadSelectedCount", stateKey: "selectedLeadIds", dataKey: "selectLead", noun: "条线索" },
};

function updateListSelection(type) {
  const config = listSelectionConfig[type];
  const selectedIds = state[config.stateKey];
  const checkboxes = Array.from($(config.rowsId).querySelectorAll(`input[data-${config.dataKey.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`));
  const selectedVisible = checkboxes.filter((input) => selectedIds.has(input.dataset[config.dataKey])).length;
  const selectAll = $(config.headerId);
  selectAll.disabled = checkboxes.length === 0;
  selectAll.checked = checkboxes.length > 0 && selectedVisible === checkboxes.length;
  selectAll.indeterminate = selectedVisible > 0 && selectedVisible < checkboxes.length;
  const summary = $(config.summaryId);
  summary.hidden = selectedIds.size === 0;
  summary.textContent = `已选择 ${selectedIds.size} ${config.noun}`;
}

function bindListSelection(type) {
  const config = listSelectionConfig[type];
  const selectedIds = state[config.stateKey];
  $(config.headerId).addEventListener("change", (event) => {
    $(config.rowsId).querySelectorAll(`input[data-${config.dataKey.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`).forEach((input) => {
      input.checked = event.target.checked;
      if (input.checked) selectedIds.add(input.dataset[config.dataKey]);
      else selectedIds.delete(input.dataset[config.dataKey]);
    });
    updateListSelection(type);
  });
  $(config.rowsId).addEventListener("change", (event) => {
    const input = event.target.closest(`input[data-${config.dataKey.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`);
    if (!input) return;
    if (input.checked) selectedIds.add(input.dataset[config.dataKey]);
    else selectedIds.delete(input.dataset[config.dataKey]);
    updateListSelection(type);
  });
  updateListSelection(type);
}

const routePermission = {
  contacts: "crm.contact.view",
  leads: "crm.lead.view",
  "legacy-customers": "customer.view",
  "legacy-leads": "lead.view",
  accounts: "account.view",
  roles: "roles.view",
  audit: "audit.view",
};

function routeBase(route) {
  return route.split("/")[0] || "contacts";
}

function routeAllowed(route) {
  return can(routePermission[routeBase(route)]);
}

function defaultRoute() {
  return ["contacts", "leads", "legacy-customers", "legacy-leads", "accounts", "roles", "audit"].find(routeAllowed) || "contacts";
}

async function renderRoute(route = location.hash.slice(1)) {
  const normalized = route || defaultRoute();
  if (!routeAllowed(normalized)) {
    const fallback = defaultRoute();
    if (normalized !== fallback) return navigate(fallback);
  }
  const [base, id] = normalized.split("/");
  const viewId = id && base === "contacts" ? "crmContactDetailView"
    : id && base === "leads" ? "crmLeadDetailView"
      : ({ contacts: "crmContactsView", leads: "crmLeadsView", "legacy-customers": "listView", "legacy-leads": "leadView", accounts: "accountManagementView", roles: "roleManagementView", audit: "auditLogView" })[base];
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-active", view.id === viewId));
  document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === base));
  $("breadcrumbText").textContent = id && base === "contacts" ? "联系人详情"
    : id && base === "leads" ? "Lead 详情"
      : ({ contacts: "客户联系人", leads: "Leads", "legacy-customers": "Legacy 会员", "legacy-leads": "Legacy 线索", accounts: "账户管理", roles: "角色与权限", audit: "审计日志" })[base] || "客户联系人";
  try {
    if (base === "contacts" && id) await openCrmContact(id);
    else if (base === "contacts") await loadCrmContacts(1);
    else if (base === "leads" && id) await openCrmLead(id);
    else if (base === "leads") await loadCrmLeads(1);
    else if (base === "legacy-customers") await loadCustomers();
    else if (base === "legacy-leads") await loadLeads();
    else if (base === "accounts") await loadAccounts();
    else if (base === "roles") await loadRoles();
    else if (base === "audit") await loadAudit();
  } catch {
    // Each view owns its contextual error state.
  }
}

function navigate(route) {
  const current = location.hash.slice(1);
  if (current === route) return renderRoute(route);
  location.hash = route;
  return Promise.resolve();
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
  updateListSelection("customers");
  try {
    const result = await api(`/api/v1/customers?${memberQueryParams()}`); state.customers = result.data;
    const total = result.meta.total;
    $("memberMetricTotal").textContent = result.metrics.memberTotal; $("memberMetricDual").textContent = result.metrics.dualBrandMembers;
    $("memberMetricMarketing").textContent = `${result.metrics.marketingCoverage.percentage}%`;
    $("resultCount").textContent = `${total} 条结果`; $("tableSummary").textContent = `显示 ${result.data.length ? 1 : 0}–${result.data.length}，共 ${total} 位会员`; if ($("memberNavCount")) $("memberNavCount").textContent = total; $("memberRows").closest(".table-panel").querySelector(".pagination").hidden = result.meta.pageCount <= 1;
    $("emptyState").hidden = result.data.length > 0;
    $("memberRows").innerHTML = result.data.map((customer) => `<tr data-customer-id="${customer.id}"><td class="select-column"><input type="checkbox" data-select-customer="${customer.id}" aria-label="选择 ${esc(customer.displayName)}"${state.selectedCustomerIds.has(customer.id) ? " checked" : ""}></td><td><div class="member-cell"><div class="avatar ${memberAvatarTone(customer)}">${esc(profileInitial(customer))}</div><div class="member-main"><strong>${esc(customer.displayName)}</strong><span>${esc(customer.customerNo)}</span></div></div></td><td><div class="contact-stack"><span>${esc(customer.mobile)}</span></div></td><td><div class="brand-stack">${customer.profiles.map((p) => brandPill(p.brand)).join("")}</div></td><td><div class="interest-stack">${customer.profiles.map((p) => `<div class="interest-line"><span class="mini-brand">${esc(p.brand.shortName)}</span><span>${esc(p.favoriteCollection || "-")}</span></div>`).join("")}</div></td><td><div class="interest-stack">${customer.profiles.map((p) => `<div class="interest-line"><span class="mini-brand">${esc(p.brand.shortName)}</span><span>${p.ownsBrandWatch == null ? "-" : p.ownsBrandWatch ? "是" : "否"}</span></div>`).join("")}</div></td><td><div class="activity-time"><strong>${esc(dt(customer.createdAt))}</strong></div></td><td class="action-cell"><button class="row-action" data-open-customer="${customer.id}" aria-label="查看会员"><svg><use href="#i-chevron"/></svg></button></td></tr>`).join("");
    updateListSelection("customers");
    document.querySelectorAll("[data-open-customer]").forEach((button) => button.addEventListener("click", () => openCustomer(button.dataset.openCustomer)));
  } catch (error) { $("memberRows").innerHTML = `<tr><td colspan="8">${esc(error.message)}</td></tr>`; updateListSelection("customers"); }
}

function leadQueryParams() {
  const fieldMap = { contact: "firstname", topic: "sku", preferred_contact: "preferredContact", source: "source", createdAt: "createdAt" };
  const params = new URLSearchParams({ pageSize: "200" }); const field = $("leadQueryField").value; const value = $("leadKeyword").value.trim();
  if (value) { params.set(field === "ALL" ? "keyword" : "value", value); if (field !== "ALL") params.set("field", fieldMap[field] || field); }
  if ($("leadBrandFilter").value !== "ALL") params.set("brand", $("leadBrandFilter").value); return params;
}
async function loadLeads() {
  $("leadLoadingState").hidden = false; $("leadReadyState").hidden = true; $("leadErrorState").hidden = true;
  $("leadRows").innerHTML = ""; updateListSelection("leads");
  try {
    const result = await api(`/api/v1/leads?${leadQueryParams()}`); state.leads = result.data; const total = result.meta.total;
    $("leadMetricTotal").textContent = result.metrics.leadTotal; $("leadMetricOpen").textContent = result.metrics.pending;
    $("leadMetricSynced").textContent = result.metrics.gatewayAccepted;
    $("leadMetricFailed").textContent = result.metrics.syncExceptions;
    if ($("leadNavCount")) $("leadNavCount").textContent = total; $("leadResultCount").textContent = `${total} 条结果`; $("leadTableSummary").textContent = `显示 ${result.data.length ? 1 : 0}–${result.data.length}，共 ${total} 条线索`; $("leadRows").closest(".table-panel").querySelector(".pagination").hidden = result.meta.pageCount <= 1;
    $("leadRows").innerHTML = result.data.map((lead) => `<tr data-lead-id="${lead.id}"><td class="select-column"><input type="checkbox" data-select-lead="${lead.id}" aria-label="选择 ${esc(lead.leadNo)}"${state.selectedLeadIds.has(lead.id) ? " checked" : ""}></td><td><div class="lead-no"><strong>${esc(lead.leadNo)}</strong><span>${esc(sourceLabel(lead.source))}</span></div></td><td>${brandPill(lead.brand)}</td><td><div class="lead-contact"><strong>${esc(lead.lastname + lead.firstname)}</strong><span>${esc(lead.phone || "-")}</span></div></td><td><div class="lead-topic"><strong>${esc(lead.sku || "-")}</strong></div></td><td><span class="badge badge-neutral">${esc(lead.status === "NEW" ? "新建" : lead.status)}</span></td><td><div class="owner-stack"><strong>${esc(dt(lead.createdAt))}</strong></div></td><td><div class="owner-stack"><strong>${lead.ownerUserId ? esc(lead.ownerUserId) : "未分配"}</strong></div></td><td>${syncPill(lead.syncStatus)}</td><td class="action-cell"><div class="lead-row-actions"><button class="table-action" data-open-lead="${lead.id}">详情</button>${can("lead.sync") && canRequestSync(lead.syncStatus) ? `<button class="table-action${failedSyncStatus(lead.syncStatus) ? " primary" : ""}" data-sync-lead="${lead.id}">${failedSyncStatus(lead.syncStatus) ? "重试同步" : "手动同步"}</button>` : ""}</div></td></tr>`).join("");
    updateListSelection("leads");
    $("leadLoadingState").hidden = true; $("leadReadyState").hidden = result.data.length === 0; $("leadEmptyState").hidden = result.data.length > 0;
    document.querySelectorAll("[data-open-lead]").forEach((button) => button.addEventListener("click", () => openLead(button.dataset.openLead)));
    document.querySelectorAll("[data-sync-lead]").forEach((button) => button.addEventListener("click", () => syncLead(button.dataset.syncLead)));
  } catch (error) { $("leadLoadingState").hidden = true; $("leadErrorState").hidden = false; $("leadReadyState").hidden = true; updateListSelection("leads"); }
}

async function syncLead(id) { try { await api(`/api/v1/leads/${id}/sync`, { method: "POST", body: "{}" }); notify("已加入待同步队列"); await loadLeads(); if (state.currentLead?.id === id) await openLead(id); } catch (error) { notify(error.message); } }
async function openLead(id) {
  try {
    const result = await api(`/api/v1/leads/${id}`); const lead = result.data; state.currentLead = lead;
    $("drawerSyncStatusBadge").textContent = statusLabel(lead.syncStatus); $("drawerSyncStatusBadge").className = `sync-pill ${failedSyncStatus(lead.syncStatus) ? "failed" : lead.syncStatus === "GATEWAY_ACCEPTED" ? "synced" : "not-synced"}`;
    const fields = [["线索编号", lead.leadNo], ["品牌", lead.brand.name], ["来源", sourceLabel(lead.source)], ["关联会员 ID", lead.customer?.customerNo || "-"], ["称谓", salutationZh(lead.salutation)], ["姓氏", lead.lastname], ["名字", lead.firstname], ["Email", lead.email], ["电话号码", lead.phone || "-"], ["国家 / 地区", countryLabel(lead.country)], ["城市", lead.city || "-"], ["通信语言", lead.language], ["首选联系方式", contactChannelLabel(lead.preferredContact)], [`您是否拥有${lead.brand.name.replace(" ", "")}`, yesNoLabel(lead.ownership)], ["产品", lead.sku || "-"], ["营销选择", lead.marketingOptIn ? "已选择" : "未选择"], ["个人数据处理同意", lead.processingConsent ? "已同意" : "未同意"], ["创建人", lead.submissionMode === "ADMIN_MANUAL" ? lead.createdByName || "-" : "-"], ["创建时间", dt(lead.createdAt)]];
    const attempts = lead.syncRecord?.attempts || [];
    $("leadDrawerSections").innerHTML = `<section class="drawer-section"><h3>线索详情</h3><div class="drawer-field-grid">${fields.map(([k, v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("")}</div></section><section class="drawer-section"><h3>同步记录</h3>${attempts.length ? attempts.map((a) => `<div class="activity-item"><strong>${esc(statusLabel(a.httpStatus === 202 ? "GATEWAY_ACCEPTED" : "SYNC_FAILED"))}</strong><span>${esc(dt(a.completedAt))} · HTTP ${esc(a.httpStatus ?? "-")} · ${esc(({ AUTO: "自动提交", ADMIN: "管理员提交", RETRY_JOB: "自动重试" })[a.triggeredBy] || a.triggeredBy || "-")}${a.gatewayRef ? ` · Ref ${esc(a.gatewayRef)}` : ""}${a.errorMessage ? ` · ${esc(a.errorMessage)}` : ""}</span></div>`).join("") : `<div class="empty-copy">暂无同步记录</div>`}</section>${can("lead.sync") && canRequestSync(lead.syncStatus) ? `<div class="drawer-footer"><button class="btn btn-primary" id="drawerSyncBtn">${failedSyncStatus(lead.syncStatus) ? "重试同步" : "手动同步"}</button></div>` : ""}`;
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
    profileGroup("个人信息", [profileField("姓氏", profile.lastName), profileField("名字", profile.firstName), profileField("称谓", salutationZh(profile.salutation)), profileField("出生日期", profile.birthday?.slice(0, 10))]),
    profileGroup("联系方式", [profileField(`${profile.brand.name} Email`, profile.email), profileField("品牌注册手机号", profile.mobile), profileField("首选联系方式", contactChannelLabel(profile.preferredContact))]),
    profileGroup("地址", [profileField("国家 / 地区", countryLabel(profile.country)), profileField("省 / 地区", profile.region), profileField("城市", profile.city), profileField("邮编", profile.postalCode), profileField("联系地址", profile.addressLine, true)], true),
    profileGroup("会员信息", [profileField("品牌会员 ID", profile.brandMemberNo), profileField("注册时间", dt(profile.registeredAt || profile.createdAt)), profileField("注册来源", sourceLabel(profile.registrationSource)), profileField("创建时间", dt(profile.createdAt)), profileField("更新时间", dt(profile.updatedAt)), profileField(`您是否拥有${profile.brand.name}`, profile.ownsBrandWatch == null ? "-" : profile.ownsBrandWatch ? "是" : "否")]),
    profileGroup("偏好", [profileField("通信语言", profile.language), profileField("偏爱的系列", profile.favoriteCollection), profileField("兴趣中心", profile.interestCenter), profileField("希望购买渠道", profile.purchaseChannel)]),
    profileGroup("授权", [profileConsentField("营销选择", consentGranted(profile, "MARKETING_COMMUNICATION")), profileConsentField("个人数据处理同意", consentGranted(profile, "DATA_PROCESSING"))], true),
  ].join("");
  const editAction = can("customer.edit") ? `<div class="brand-profile-detail-footer"><button class="btn btn-small" type="button" data-profile-edit="${esc(profile.brand.code)}"><svg><use href="#i-edit"/></svg>编辑品牌资料</button></div>` : "";
  return `<article class="brand-profile-detail" data-profile-brand="${esc(profile.brand.code)}">${brandVisual(profile)}<div class="brand-profile-detail-body">${groups}</div>${editAction}</article>`;
}
function renderWechatIdentity() {
  const profiles = state.currentCustomer?.profiles || [];
  const visible = state.currentBrandProfile === "ALL" ? profiles : profiles.filter((profile) => profile.brand.code === state.currentBrandProfile);
  const identities = state.currentCustomer?.identities || [];
  const identityValue = (brandId, type) => identities
    .filter((identity) => identity.brandId === brandId && identity.identityType === type)
    .sort((left, right) => Number(Boolean(right.verifiedAt)) - Number(Boolean(left.verifiedAt)))[0];
  const content = $("wechatIdentityContent");
  content.className = `wechat-identity-content${visible.length <= 1 ? " is-single" : ""}`;
  content.innerHTML = visible.length ? visible.map((profile) => {
    const openId = identityValue(profile.brandId, "OPENID");
    const unionId = identityValue(profile.brandId, "UNIONID");
    return `<section class="wechat-identity-group"><h4>${esc(profile.brand.name)}</h4><div class="wechat-identity-fields"><div class="wechat-identity-field"><label>OpenID${openId?.scope ? ` · ${esc(openId.scope)}` : ""}</label><strong>${esc(openId ? `****${openId.value.slice(-6)}` : "未获取")}</strong></div><div class="wechat-identity-field"><label>UnionID</label><strong>${esc(unionId ? `****${unionId.value.slice(-6)}` : "未获取")}</strong></div></div></section>`;
  }).join("") : `<div class="wechat-identity-empty">暂无微信身份信息</div>`;
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
  content.querySelectorAll("[data-profile-edit]").forEach((button) => button.addEventListener("click", () => openProfileEditor(button.dataset.profileEdit)));
  renderWechatIdentity();
}
function renderCustomerTabs(customer) {
  const tabs = [["leads", `线索 ${customer.leads.length}`], ["journey", "客户旅程"], ["notes", `备注 ${customer.notes.length}`], ["activity", "操作记录"]];
  $("customerDetailModuleTabs").innerHTML = tabs.map(([key, label], i) => `<button class="detail-tab${i === 0 ? " is-active" : ""}" data-module="${key}">${label}</button>`).join("");
  $("customerDetailModuleTabs").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => renderCustomerModule(b.dataset.module)));
}
function renderCustomerModule(key) {
  document.querySelectorAll("[data-customer-module-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.customerModulePanel === key));
  $("customerDetailModuleTabs").querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.module === key)); const c = state.currentCustomer; if (!c) return;
  if (key === "leads") {
    $("leadList").innerHTML = c.leads.map((lead) => `<div class="lead-row"><div>${brandPill(lead.brand)}</div><div class="lead-product"><strong>${esc(lead.sku || "-")}</strong></div><div class="lead-meta"><strong>${esc(lead.status === "NEW" ? "新建" : lead.status)}</strong><span>状态</span></div><div class="lead-meta"><strong>${esc(dt(lead.createdAt))}</strong><span>创建时间</span></div><div>${syncPill(lead.syncStatus)}</div><button class="row-action" data-open-lead="${lead.id}" aria-label="查看线索"><svg><use href="#i-chevron"/></svg></button></div>`).join("");
    $("leadList").hidden = c.leads.length === 0; $("leadEmpty").hidden = c.leads.length !== 0;
  }
  if (key === "journey") $("journeyTimeline").innerHTML = c.journeyEvents.map((event) => `<article class="timeline-item"><span class="timeline-dot"></span><div class="timeline-card"><div class="timeline-meta">${event.brand ? brandPill(event.brand) : ""}<time>${esc(dt(event.eventAt))}</time></div><h3>${esc(event.title)}</h3>${event.description ? `<p>${esc(event.description)}</p>` : ""}</div></article>`).join("") || `<div class="empty-copy">暂无客户旅程</div>`;
  if (key === "notes") {
    $("notesList").innerHTML = c.notes.map((note) => `<article class="note-item"><div class="note-head"><span class="mini-avatar">备</span><div class="note-author"><strong>备注</strong><time>${esc(dt(note.createdAt))}</time></div></div><p>${esc(note.body)}</p></article>`).join("") || `<div class="empty-state notes-empty-state"><div><div class="empty-illustration"><svg><use href="#i-note"/></svg></div><h3>暂无备注</h3><p>记录会员偏好、沟通结果或下一步动作。</p><button class="btn btn-primary" type="button" data-empty-add-note>添加备注</button></div></div>`;
    $("notesList").querySelector("[data-empty-add-note]")?.addEventListener("click", () => { $("noteComposer").classList.add("is-open"); $("noteInput").focus(); });
  }
  if (key === "activity") $("activityList").innerHTML = c.journeyEvents.map((event) => `<div class="activity-row"><span class="activity-icon"><svg><use href="#i-clock"/></svg></span><div class="activity-description"><strong>${esc(event.title)}</strong><span>${esc(event.description || "会员操作记录")}</span></div><div class="lead-meta"><strong>${esc(sourceLabel(event.source))}</strong><span>来源</span></div><div class="lead-meta"><strong>${esc(dt(event.eventAt))}</strong><span>时间</span></div></div>`).join("") || `<div class="empty-copy">暂无操作记录</div>`;
  document.querySelectorAll("[data-open-lead]").forEach((button) => button.addEventListener("click", () => openLead(button.dataset.openLead)));
}

async function getForm(brandCode, objectType) {
  const key = `${brandCode}:${objectType}`;
  if (!state.forms.has(key)) {
    const forms = (await api(`/api/v1/forms?brandCode=${brandCode}&objectType=${objectType}`)).data;
    if (!forms?.[0]) throw new Error(`未找到${brandLabel(brandCode)}的有效${objectType === "LEAD" ? "线索" : "会员"}表单配置`);
    state.forms.set(key, forms[0]);
  }
  return state.forms.get(key);
}
function dynamicField(field, prefix) {
  const id = `${prefix}-${field.key}`; const required = field.required ? `<span class="required-mark">*</span>` : ""; const requiredAttr = field.required ? " required" : "";
  if (field.type === "checkbox") return `<label class="full consent-control dynamic-field" data-field-shell="${esc(field.key)}"><input id="${id}" data-field="${field.key}" type="checkbox"${requiredAttr}><span>${esc(field.label)}${required}<small class="field-error" aria-live="polite"></small></span></label>`;
  if (field.key === "country") return `<label class="dynamic-field" data-field-shell="${esc(field.key)}"><span class="field-label">${esc(field.label)}${required}</span><select class="control" id="${id}" data-field="${field.key}"${requiredAttr}><option value="">请选择</option>${COUNTRY_OPTIONS.map((option) => `<option value="${esc(option.value)}">${esc(option.label)}</option>`).join("")}</select><small class="field-error" aria-live="polite"></small></label>`;
  if (["member", "profile"].includes(prefix) && ["province", "city"].includes(field.key)) return `<label class="dynamic-field" data-field-shell="${esc(field.key)}"><span class="field-label">${esc(field.label)}${required}</span><select class="control" id="${id}" data-field="${field.key}"${requiredAttr} disabled><option value="">请先选择${field.key === "province" ? "国家 / 地区" : "省 / 地区"}</option></select><small class="field-error" aria-live="polite"></small></label>`;
  if (field.type === "select") return `<label class="dynamic-field" data-field-shell="${esc(field.key)}"><span class="field-label">${esc(field.label)}${required}</span><select class="control" id="${id}" data-field="${field.key}"${requiredAttr}><option value="">请选择</option>${(field.options || []).map((option) => { const normalized = normalizeFormOption(field.key, option); return `<option value="${esc(normalized.value)}">${esc(normalized.label)}</option>`; }).join("")}</select><small class="field-error" aria-live="polite"></small></label>`;
  const inputType = field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text";
  return `<label class="dynamic-field" data-field-shell="${esc(field.key)}"><span class="field-label">${esc(field.label)}${required}</span><input class="control" id="${id}" data-field="${field.key}" type="${inputType}"${requiredAttr}><small class="field-error" aria-live="polite"></small></label>`;
}
function replaceSelectOptions(select, values, placeholder, selectedValue = "") {
  select.innerHTML = `<option value="">${esc(placeholder)}</option>${values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("")}`;
  select.disabled = values.length === 0;
  select.value = values.includes(selectedValue) ? selectedValue : "";
}
function bindAddressControls(prefix) {
  const country = $(`${prefix}-country`); const province = $(`${prefix}-province`); const city = $(`${prefix}-city`);
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
  return { refreshProvinces };
}
function bindDynamicValidation(container, summary) {
  container.querySelectorAll("[data-field]").forEach((element) => element.addEventListener(element.type === "checkbox" || element.tagName === "SELECT" ? "change" : "input", () => {
    element.closest(".dynamic-field")?.classList.remove("is-invalid");
    const message = element.closest(".dynamic-field")?.querySelector(".field-error");
    if (message) message.textContent = "";
    if (!container.querySelector(".dynamic-field.is-invalid")) { summary.textContent = ""; summary.hidden = true; }
  }));
}
function fillDynamicValues(container, prefix, values) {
  Object.entries(values).forEach(([key, value]) => {
    const element = $(`${prefix}-${key}`);
    if (!element || value == null) return;
    if (element.type === "checkbox") { element.checked = Boolean(value); return; }
    const normalized = String(value);
    element.value = normalized;
    if (element.tagName === "SELECT" && element.value !== normalized) {
      const option = Array.from(element.options).find((item) => item.textContent.trim() === normalized);
      if (option) element.value = option.value;
    }
  });
}
const salutationZh = (value) => ({ Dr: "博士", Mr: "先生", Mrs: "太太", Ms: "女士", "Prefer not to say": "不愿透露" })[value] || value || "";
function leadValuesFromProfile(profile, customer) {
  return {
    email: profile.email || "", salutation: salutationZh(profile.salutation), firstname: profile.firstName || "", lastname: profile.lastName || "",
    phone: profile.mobile || customer.mobile || "", preferredContact: profile.preferredContact || "", country: canonicalCountry(profile.country), city: profile.city || "",
    birthday: profile.birthday?.slice(0, 10) || "", ownsBrandWatch: profile.ownsBrandWatch == null ? "" : profile.ownsBrandWatch ? "Yes" : "No",
    language: profile.language || "", purchaseMethod: profile.purchaseChannel || "",
    marketingOptIn: consentGranted(profile, "MARKETING_COMMUNICATION"), processingConsent: consentGranted(profile, "DATA_PROCESSING"),
  };
}
async function openCreateLead(customerId = null) {
  $("canonicalLeadForm").reset(); clearFieldErrors($("dynamicLeadFields"), $("createLeadErrors"));
  const brands = customerId ? state.currentCustomer.profiles.map((p) => p.brand) : state.brands; $("createLeadBrand").innerHTML = brands.map((b) => `<option value="${b.code}">${esc(b.name)}</option>`).join("");
  $("createLeadType").innerHTML = `<option value="PURCHASE_INTENT">购买意向</option>`; $("createLeadStatus").innerHTML = `<option value="NEW">新建</option>`; $("createLeadOwner").innerHTML = `<option value="">未分配</option>`; $("createLeadSource").innerHTML = `<option value="ADMIN_MANUAL">后台手动提交</option>`;
  $("canonicalLeadForm").dataset.customerId = customerId || ""; await renderLeadFields(); $("leadCreateDialog").showModal();
  $("leadCreateDialog").querySelector(".dialog-body").scrollTop = 0;
}
async function renderLeadFields() {
  const form = await getForm($("createLeadBrand").value, "LEAD"); state.leadForm = form; $("createLeadVersion").value = form.version;
  $("dynamicLeadFields").innerHTML = `<div class="dynamic-form-grid">${form.schemaJson.fields.map((f) => dynamicField(f, "lead")).join("")}</div>`;
  const customerId = $("canonicalLeadForm").dataset.customerId;
  if (customerId && state.currentCustomer?.id === customerId) {
    const profile = state.currentCustomer.profiles.find((item) => item.brand.code === $("createLeadBrand").value);
    if (profile) fillDynamicValues($("dynamicLeadFields"), "lead", leadValuesFromProfile(profile, state.currentCustomer));
  }
  clearFieldErrors($("dynamicLeadFields"), $("createLeadErrors")); bindDynamicValidation($("dynamicLeadFields"), $("createLeadErrors"));
}
async function saveLead(event) {
  event.preventDefault();
  const schemaFields = state.leadForm?.schemaJson?.fields || [];
  if (!validateDynamicFields($("dynamicLeadFields"), schemaFields, $("createLeadErrors"))) return;
  const fields = Object.fromEntries(Array.from($("dynamicLeadFields").querySelectorAll("[data-field]"), (el) => [el.dataset.field, el.type === "checkbox" ? el.checked : el.value]));
  const body = { ...fields, brandCode: $("createLeadBrand").value, leadType: "PURCHASE_INTENT", source: "ADMIN_MANUAL", submissionMode: "ADMIN_MANUAL", formVersion: $("createLeadVersion").value, customerId: $("canonicalLeadForm").dataset.customerId || null };
  try { await api("/api/v1/leads", { method: "POST", body: JSON.stringify(body), headers: { "idempotency-key": crypto.randomUUID() } }); $("leadCreateDialog").close(); notify("线索已创建，当前未同步"); await loadLeads(); if (state.currentCustomer) await openCustomer(state.currentCustomer.id); } catch (error) { showFormError($("createLeadErrors"), error, $("dynamicLeadFields"), "lead", schemaFields); }
}
async function openCreateMember() {
  $("memberRegistrationForm").reset(); $("createMemberErrors").hidden = true;
  $("createMemberBrand").innerHTML = state.brands.map((b) => `<option value="${b.code}">${esc(b.name)}</option>`).join("");
  await renderMemberFields(); $("memberCreateDialog").showModal();
  $("memberCreateDialog").querySelector(".dialog-body").scrollTop = 0;
}
async function renderMemberFields() {
  const form = await getForm($("createMemberBrand").value, "CUSTOMER"); state.memberForm = form;
  $("dynamicMemberRegistrationFields").innerHTML = `<div class="dynamic-form-grid">${form.schemaJson.fields.map((f) => dynamicField(f, "member")).join("")}</div>`;
  bindAddressControls("member"); clearFieldErrors($("dynamicMemberRegistrationFields"), $("createMemberErrors")); bindDynamicValidation($("dynamicMemberRegistrationFields"), $("createMemberErrors"));
}
async function saveMember(event) {
  event.preventDefault();
  const schemaFields = state.memberForm?.schemaJson?.fields || [];
  if (!validateDynamicFields($("dynamicMemberRegistrationFields"), schemaFields, $("createMemberErrors"))) return;
  const fields = Object.fromEntries(Array.from($("dynamicMemberRegistrationFields").querySelectorAll("[data-field]"), (el) => [el.dataset.field, el.type === "checkbox" ? el.checked : el.value]));
  const interestSelect = $("member-interest_center");
  const interestCenter = fields.interest_center ? interestSelect?.selectedOptions?.[0]?.textContent?.trim() || fields.interest_center : null;
  const profile = { brandCode: $("createMemberBrand").value, salutation: fields.salutation, lastName: fields.last_name, firstName: fields.first_name, birthday: fields.birthday || null, email: fields.email || null, country: fields.country || null, region: fields.province || null, city: fields.city || null, postalCode: fields.postal_code || null, addressLine: fields.address_line || null, language: fields.language || null, preferredContact: fields.preferred_contact || null, ownsBrandWatch: yesNoLabel(fields.owns_brand_watch) === "是", interestCenter, favoriteCollection: fields.favorite_collection || null, marketingOptIn: Boolean(fields.marketing_opt_in), processingConsent: Boolean(fields.processing_consent), registrationData: fields };
  const confirmed = await showActionDialog({
    title: "确认创建会员",
    copy: `即将为 ${brandLabel(profile.brandCode)} 创建会员“${profile.lastName}${profile.firstName}”（${fields.mobile}）。请确认信息无误后继续。`,
    confirmLabel: "确认创建",
  });
  if (!confirmed) return;
  const submitButton = $("saveMemberRegistration");
  submitButton.disabled = true;
  submitButton.textContent = "创建中…";
  try {
    await api("/api/v1/customers", { method: "POST", body: JSON.stringify({ mobile: fields.mobile, profile }) });
    $("memberCreateDialog").close(); notify("会员已创建"); await loadCustomers();
  } catch (error) {
    showFormError($("createMemberErrors"), error, $("dynamicMemberRegistrationFields"), "member", schemaFields);
    if (error.code === "DUPLICATE_BRAND_MEMBER") {
      const existingNumber = error.details?.customerNo ? `（会员 ID：${error.details.customerNo}）` : "";
      await showActionDialog({ title: "该品牌会员已存在", copy: `${error.message}${existingNumber}`, confirmLabel: "返回修改", showCancel: false });
      $("member-mobile")?.focus();
    }
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "创建会员";
  }
}

const profileEditExcludedFields = new Set(["processing_consent", "marketing_opt_in"]);
function profileValues(profile) {
  return {
    salutation: salutationZh(profile.salutation), last_name: profile.lastName || "", first_name: profile.firstName || "", mobile: profile.mobile || state.currentCustomer?.mobile || "",
    email: profile.email || "", birthday: profile.birthday?.slice(0, 10) || "", country: canonicalCountry(profile.country), province: profile.region || "", city: profile.city || "",
    postal_code: profile.postalCode || "", address_line: profile.addressLine || "", language: profile.language || "", preferred_contact: profile.preferredContact || "",
    owns_brand_watch: profile.ownsBrandWatch == null ? "" : profile.ownsBrandWatch ? "Yes" : "No", interest_center: profile.interestCenter || "", favorite_collection: profile.favoriteCollection || "",
  };
}
async function openProfileEditor(brandCode) {
  const profile = state.currentCustomer?.profiles.find((item) => item.brand.code === brandCode);
  if (!profile || !can("customer.edit")) return;
  const form = await getForm(brandCode, "CUSTOMER");
  const fields = form.schemaJson.fields.filter((field) => !profileEditExcludedFields.has(field.key));
  state.profileForm = { ...form, schemaJson: { ...form.schemaJson, fields } };
  $("profileEditForm").dataset.customerId = state.currentCustomer.id; $("profileEditForm").dataset.brandCode = brandCode;
  $("profileEditTitle").textContent = `编辑${profile.brand.name}品牌资料`; $("profileEditContext").innerHTML = `<strong>${esc(profile.brand.name)}</strong><span>仅更新当前品牌资料，客户身份保持只读</span>`;
  $("dynamicProfileFields").innerHTML = `<div class="dynamic-form-grid">${fields.map((field) => dynamicField(field, "profile")).join("")}</div>`;
  const address = bindAddressControls("profile"); const values = profileValues(profile);
  fillDynamicValues($("dynamicProfileFields"), "profile", { ...values, province: "", city: "" });
  address?.refreshProvinces(values.province, values.city);
  clearFieldErrors($("dynamicProfileFields"), $("profileEditErrors")); bindDynamicValidation($("dynamicProfileFields"), $("profileEditErrors"));
  $("profileEditDialog").showModal(); $("profileEditDialog").querySelector(".dialog-body").scrollTop = 0;
}
async function saveProfile(event) {
  event.preventDefault();
  const fields = state.profileForm?.schemaJson?.fields || [];
  if (!validateDynamicFields($("dynamicProfileFields"), fields, $("profileEditErrors"))) return;
  const values = Object.fromEntries(Array.from($("dynamicProfileFields").querySelectorAll("[data-field]"), (element) => [element.dataset.field, element.type === "checkbox" ? element.checked : element.value]));
  const interest = $("profile-interest_center");
  const body = {
    salutation: values.salutation || null, lastName: values.last_name, firstName: values.first_name, mobile: values.mobile || null, email: values.email || null,
    birthday: values.birthday || null, country: values.country || null, region: values.province || null, city: values.city || null, postalCode: values.postal_code || null,
    addressLine: values.address_line || null, language: values.language || null, preferredContact: values.preferred_contact || null,
    ownsBrandWatch: values.owns_brand_watch ? yesNoLabel(values.owns_brand_watch) === "是" : null,
    interestCenter: values.interest_center ? interest?.selectedOptions?.[0]?.textContent?.trim() || values.interest_center : null,
    favoriteCollection: values.favorite_collection || null,
  };
  const customerId = $("profileEditForm").dataset.customerId; const brandCode = $("profileEditForm").dataset.brandCode;
  try {
    await api(`/api/v1/customers/${customerId}/profiles/${brandCode}`, { method: "PATCH", body: JSON.stringify(body) });
    $("profileEditDialog").close(); notify("品牌资料已更新"); await openCustomer(customerId); renderBrandProfile(brandCode);
  } catch (error) { showFormError($("profileEditErrors"), error, $("dynamicProfileFields"), "profile", fields); }
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
    const syncPermissionDependencies = (changedParent = null) => {
      Object.entries(permissionDependencies).forEach(([parent, children]) => {
        const parentInput = $("roleDetail").querySelector(`[data-permission-key="${parent}"]`);
        if (!parentInput) return;
        children.forEach((child) => {
          const childInput = $("roleDetail").querySelector(`[data-permission-key="${child}"]`);
          if (!childInput) return;
          if (!parentInput.checked) childInput.checked = false;
          childInput.disabled = readOnly || !parentInput.checked;
        });
        if (changedParent === parent && parentInput.checked) {
          children.forEach((child) => { const childInput = $("roleDetail").querySelector(`[data-permission-key="${child}"]`); if (childInput) childInput.checked = false; });
        }
      });
    };
    Object.keys(permissionDependencies).forEach((parent) => { const input = $("roleDetail").querySelector(`[data-permission-key="${parent}"]`); if (input && !readOnly) input.onchange = () => syncPermissionDependencies(parent); });
    syncPermissionDependencies();
    if ($("saveRolePermissions")) $("saveRolePermissions").onclick = async () => { const permissionKeys = Array.from($("roleDetail").querySelectorAll("[data-permission-key]:checked"), (input) => input.dataset.permissionKey); try { await api(`/api/v1/roles/${role.id}/permissions`, { method: "PATCH", body: JSON.stringify({ permissionKeys }) }); notify("角色权限已保存"); await loadRoles(role.id); } catch (error) { notify(error.message); } };
    $("roleList").querySelectorAll("button").forEach((button) => button.classList.toggle("is-active", button.dataset.roleId === role.id));
  };
  const active = state.roles.find((role) => role.id === preferredRoleId) || state.roles[0]; if (active) render(active);
  $("roleList").querySelectorAll("button").forEach((button) => button.onclick = () => render(state.roles.find((role) => role.id === button.dataset.roleId)));
}
async function loadAudit() { const result = await api("/api/v1/audit-logs?pageSize=200"); $("securityAuditCount").textContent = `${result.meta.total} 条记录`; $("securityAuditRows").innerHTML = result.data.map((a) => `<tr><td>${esc(dt(a.createdAt))}</td><td>${esc(a.actorName)}</td><td>${esc(a.action)}</td><td>${esc(a.module)}</td><td>${esc(`${a.targetType}${a.targetId ? ` · ${a.targetId}` : ""}`)}</td><td><div>${esc(a.details ? JSON.stringify(a.details) : "-")}</div><small>Trace ${esc(a.traceId || a.requestId || "-")} · ${esc(a.userAgent || "-")}</small></td></tr>`).join(""); }

const exportFieldOptions = {
  customers: [["customerNo", "会员 ID"], ["displayName", "姓名"], ["mobile", "手机号"], ["brand", "品牌"], ["email", "品牌 Email"], ["country", "国家"], ["city", "城市"], ["preferredContact", "首选联系渠道"], ["favoriteCollection", "偏爱系列"], ["registeredAt", "注册时间"]],
  leads: [["leadNo", "Lead No"], ["brand", "品牌"], ["source", "来源"], ["firstname", "名字"], ["lastname", "姓氏"], ["email", "Email"], ["phone", "手机号"], ["sku", "产品/主题"], ["syncStatus", "同步状态"], ["createdAt", "创建时间"]],
};
function selectedExportIds(type) {
  return Array.from(type === "customers" ? state.selectedCustomerIds : state.selectedLeadIds);
}
function renderExport() {
  const type = state.exportType; const label = type === "customers" ? "会员" : "线索"; const selectedCount = selectedExportIds(type).length;
  $("exportDialogTitle").textContent = `导出${label}数据`; $("exportDialogSubtitle").textContent = "服务端按权限与品牌范围重新查询";
  $("exportBody").innerHTML = `<div class="upload-stage"><h3>选择导出范围</h3><div class="import-context"><label><span class="field-label">数据范围</span><select class="control" id="exportScope"><option value="CURRENT_FILTER">当前筛选的全部结果</option><option value="SELECTED_IDS"${selectedCount ? "" : " disabled"}>已选择 ${selectedCount} 条</option><option value="ALL">权限范围内全部数据</option></select></label><label><span class="field-label">品牌范围</span><select class="control" id="exportBrand"><option value="">全部可访问品牌</option>${state.brands.map((brand) => `<option value="${esc(brand.code)}">${esc(brand.name)}</option>`).join("")}</select></label></div><h3>导出字段</h3><div class="account-scope-options">${exportFieldOptions[type].map(([key, text]) => `<label><input type="checkbox" data-export-field="${key}" checked><span>${esc(text)}</span></label>`).join("")}</div></div>`;
  $("exportFooter").innerHTML = `<button class="btn" type="button" id="cancelExport">取消</button><span class="spacer"></span><button class="btn btn-primary" type="button" id="confirmExport">生成并下载</button>`;
  $("cancelExport").onclick = () => $("exportDialog").close(); $("confirmExport").onclick = exportData;
}
function openExport(type) { state.exportType = type; renderExport(); $("exportDialog").showModal(); }
async function exportData() {
  const type = state.exportType; const scope = $("exportScope").value; const selectedIds = selectedExportIds(type);
  const query = Object.fromEntries(new URLSearchParams(type === "customers" ? memberQueryParams() : leadQueryParams())); delete query.pageSize;
  const fields = Array.from(document.querySelectorAll("[data-export-field]:checked"), (input) => input.dataset.exportField);
  const body = { scope, fields, ...(scope === "CURRENT_FILTER" ? { filter: query } : {}), ...(scope === "SELECTED_IDS" ? { selectedIds } : {}), ...($("exportBrand").value ? { brandCode: $("exportBrand").value } : {}) };
  try { const result = await api(`/api/v1/exports/${type}`, { method: "POST", body: JSON.stringify(body) }); const link = document.createElement("a"); link.href = appUrl(result.data.downloadUrl); link.download = result.data.fileName; document.body.append(link); link.click(); link.remove(); $("exportDialog").close(); notify(`已导出 ${result.data.rowCount} 条数据`); } catch (error) { notify(error.message); }
}
function importObjectLabel() { return state.importType === "customers" ? "会员" : "线索"; }
function importBrandLabel() { return brandLabel(state.brands.find((brand) => brand.code === state.importBrand)); }
function renderImportSteps() {
  const labels = ["上传数据", "数据检查", "导入完成"];
  $("importSteps").hidden = state.importHistoryMode;
  $("importSteps").innerHTML = labels.map((label, index) => { const step = index + 1; return `<div class="import-step${step === state.importStep ? " is-active" : ""}${step < state.importStep ? " is-complete" : ""}"><strong>${esc(label)}</strong></div>`; }).join("");
}
function renderImportHistory() {
  const rows = state.importHistory.map((job) => `<tr><td>${esc(job.jobNo)}</td><td>${esc(job.fileName)}</td><td>${esc(job.brand?.name || "-")}</td><td>${esc(job.operatorName || "-")}</td><td>${job.totalCount}</td><td>${job.failedCount}</td><td>${esc(dt(job.createdAt))}</td><td><span class="row-status ${job.failedCount ? "warning" : "success"}">${esc(statusLabel(job.status))}</span></td></tr>`).join("");
  $("importBody").innerHTML = `<div class="history-view"><h3>导入记录</h3><p class="section-intro">显示当前账号有权查看的${importObjectLabel()}导入任务。</p>${rows ? `<div class="preview-table-wrap"><table class="history-table"><thead><tr><th>导入编号</th><th>文件</th><th>品牌</th><th>操作人</th><th>处理数量</th><th>失败数量</th><th>时间</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="preview-empty">暂无导入记录</div>`}</div>`;
  $("importFooter").innerHTML = `<button class="btn" type="button" id="backToImport">返回导入</button><span class="spacer"></span><button class="btn" type="button" id="closeImportHistory">关闭</button>`;
  $("backToImport").onclick = () => { state.importHistoryMode = false; renderImport(); };
  $("closeImportHistory").onclick = () => $("importDialog").close();
}
async function loadImportHistory() {
  const objectType = state.importType === "customers" ? "CUSTOMER" : "LEAD";
  try { state.importHistory = (await api(`/api/v1/imports/history?objectType=${objectType}&pageSize=100`)).data; } catch (error) { notify(error.message); state.importHistory = []; }
  renderImport();
}
function renderImportUpload() {
  const leadType = state.importType === "leads" ? `<label><span class="field-label">线索类型</span><select class="control" disabled><option>购买意向</option></select></label>` : "";
  const conflictOptions = state.importType === "customers" ? [["SKIP", "跳过已有资料"], ["FILL_EMPTY", "仅补充空字段"], ["OVERWRITE", "覆盖允许更新字段"]] : [["SKIP", "跳过已有线索"], ["UPDATE_EXISTING", "更新已有线索"]];
  const conflictSelect = `<label><span class="field-label">冲突处理</span><select class="control" id="importConflictStrategy">${conflictOptions.map(([value, label]) => `<option value="${value}"${value === state.importConflictStrategy ? " selected" : ""}>${label}</option>`).join("")}</select></label>`;
  const unmatchedSelect = state.importType === "leads" ? `<label><span class="field-label">未匹配会员</span><select class="control" id="importUnmatchedStrategy"><option value="IMPORT_LEAD_ONLY"${state.importUnmatchedStrategy === "IMPORT_LEAD_ONLY" ? " selected" : ""}>仅导入线索</option><option value="CREATE_MEMBER"${state.importUnmatchedStrategy === "CREATE_MEMBER" ? " selected" : ""}>创建或复用会员</option></select></label>` : "";
  const retryDuplicate = state.importDuplicateFile ? `<button class="btn btn-small" type="button" id="retryDuplicateImport">确认重新上传同一文件</button>` : "";
  return `<div class="upload-stage"><h3>上传${importObjectLabel()}数据</h3><p class="section-intro">选择导入范围与处理策略后上传文件，服务端将先完成数据检查，确认后才写入业务数据。</p><div class="import-context"><label><span class="field-label">导入品牌</span><select class="control" id="importBrand">${state.brands.map((brand) => `<option value="${esc(brand.code)}"${brand.code === state.importBrand ? " selected" : ""}>${esc(brand.name)}</option>`).join("")}</select></label>${leadType}${conflictSelect}${unmatchedSelect}</div>${state.importError ? `<div class="inline-alert error">${esc(state.importError)}${retryDuplicate}</div>` : ""}<div class="upload-card" id="uploadCard"><div><div class="upload-symbol"><svg><use href="#i-upload"/></svg></div><div class="upload-copy"><strong>拖放 XLSX 文件</strong><span>单个文件不超过 10 MB，单次最多 5,000 行</span></div><div class="upload-actions"><button class="btn btn-primary btn-small" type="button" id="chooseImportFile">选择文件</button><button class="text-action" type="button" id="downloadTemplate">下载 ${esc(importBrandLabel())} ${importObjectLabel()}模板</button></div><span class="template-guidance">Excel 模板 · 红色 <b>*</b> 为必填字段 · 手机号按文本格式保存完整数字</span></div></div></div>`;
}
function renderImportProcessing() {
  const job = state.importJob; if (!job) return `<div class="upload-stage"><h3>正在检查数据</h3></div>`;
  const isMember = state.importType === "customers";
  const rows = job.rows.filter((row) => state.importPreflightFilter === "ALL" || (state.importPreflightFilter === "ERROR" && row.status === "ERROR") || (state.importPreflightFilter === "CONFLICT" && ["EXISTING_PROFILE", "EXISTING_LEAD"].includes(row.status)) || (state.importPreflightFilter === "IMPORTABLE" && row.status !== "ERROR" && !["EXISTING_PROFILE", "EXISTING_LEAD"].includes(row.status)));
  const summary = job.preflight; const metrics = isMember ? [["总行数", summary.total], ["可导入", summary.importable], ["新会员", summary.newCustomer], ["新增品牌关系", summary.newBrandProfile], ["冲突", summary.existingProfileConflict], ["错误", summary.error]] : [["总行数", summary.total], ["可导入", summary.importable], ["新线索", summary.newLead], ["匹配会员", summary.matchedMember], ["未匹配会员", summary.unmatchedMember], ["错误", summary.error]];
  const mappingRows = Object.entries(job.mapping).map(([header, item]) => `<tr><td>${esc(header)}</td><td>${esc(item.label)}</td><td><span class="row-status success">已识别</span></td></tr>`).join("");
  const dataRows = rows.map((row) => `<tr><td>${row.rowNumber}</td><td>${esc(row.identity || "-")}</td><td>${esc(row.status)}</td><td>${esc(row.conflictType || "-")}</td><td>${esc([...row.errors, ...row.warnings].map((item) => item.message).join("；") || "通过")}</td></tr>`).join("");
  const strategySummary = `<div class="import-context"><div><span class="field-label">冲突处理</span><strong>${esc(({ SKIP: "跳过已有记录", FILL_EMPTY: "仅补充空字段", OVERWRITE: "覆盖允许更新字段", UPDATE_EXISTING: "更新已有线索" })[state.importConflictStrategy])}</strong></div>${isMember ? "" : `<div><span class="field-label">未匹配会员</span><strong>${state.importUnmatchedStrategy === "CREATE_MEMBER" ? "创建或复用会员" : "仅导入线索"}</strong></div>`}</div>`;
  return `<div class="history-view"><h3>数据检查</h3><p class="section-intro">服务端已完成字段映射、必填校验、去重和会员匹配；确认后才会写入业务数据。</p><div class="result-stats">${metrics.map(([label, value]) => `<div class="result-stat"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>${strategySummary}<h3>字段映射</h3><div class="preview-table-wrap"><table class="history-table"><thead><tr><th>文件字段</th><th>CRM 字段</th><th>状态</th></tr></thead><tbody>${mappingRows}</tbody></table></div><div class="segmented" id="preflightFilters">${[["ALL", "全部"], ["IMPORTABLE", "可导入"], ["CONFLICT", "冲突"], ["ERROR", "错误"]].map(([value, label]) => `<button type="button" data-preflight-filter="${value}" class="${state.importPreflightFilter === value ? "is-active" : ""}">${label}</button>`).join("")}</div><div class="preview-table-wrap"><table class="history-table"><thead><tr><th>原始行号</th><th>业务标识</th><th>预检结果</th><th>冲突类型</th><th>说明</th></tr></thead><tbody>${dataRows || `<tr><td colspan="5">该筛选下暂无数据</td></tr>`}</tbody></table></div></div>`;
}
function renderImportResult() {
  const result = state.importResult;
  const summary = `共处理 ${result.totalCount} 条，成功 ${result.successCount} 条${result.failedCount ? `，失败 ${result.failedCount} 条` : ""}${result.skippedCount ? `，跳过 ${result.skippedCount} 条` : ""}。`;
  return `<div class="result-body"><div class="result-hero"><div class="result-icon"><svg><use href="#i-check"/></svg></div><div><h3>${result.status === "FAILED" ? "导入失败" : "导入完成"}</h3><p>${esc(summary)}</p></div></div><div class="result-stats"><div class="result-stat"><span>处理总数</span><strong>${result.totalCount}</strong></div><div class="result-stat"><span>成功</span><strong>${result.successCount}</strong></div><div class="result-stat"><span>失败</span><strong>${result.failedCount}</strong></div><div class="result-stat"><span>跳过</span><strong>${result.skippedCount}</strong></div></div>${result.failureFilePath ? `<p><a class="text-action" href="${appUrl(`/api/v1/imports/${result.id}/failures`)}">下载失败明细 CSV</a></p>` : ""}</div>`;
}
function bindImportUploadActions() {
  if ($("importBrand")) $("importBrand").onchange = (event) => { state.importBrand = event.target.value; state.importError = ""; renderImport(); };
  if ($("importConflictStrategy")) $("importConflictStrategy").onchange = (event) => { state.importConflictStrategy = event.target.value; };
  if ($("importUnmatchedStrategy")) $("importUnmatchedStrategy").onchange = (event) => { state.importUnmatchedStrategy = event.target.value; };
  if ($("retryDuplicateImport")) $("retryDuplicateImport").onclick = () => uploadImport(state.importDuplicateFile, true);
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
    $("importFooter").innerHTML = `<button class="btn" type="button" id="cancelImportExecute">取消</button><span class="spacer"></span><button class="btn btn-primary" type="button" id="executeImport">确认导入</button>`;
    document.querySelectorAll("[data-preflight-filter]").forEach((button) => button.onclick = () => { state.importPreflightFilter = button.dataset.preflightFilter; renderImport(); });
    $("cancelImportExecute").onclick = () => $("importDialog").close(); $("executeImport").onclick = executePreparedImport;
  } else {
    $("importFooter").innerHTML = `<button class="btn" type="button" id="newImportJob">继续导入</button><span class="spacer"></span><button class="btn btn-primary" type="button" id="finishImport">返回${importObjectLabel()}列表</button>`;
    $("newImportJob").onclick = () => { state.importStep = 1; state.importJob = null; state.importResult = null; state.importFileName = ""; state.importError = ""; renderImport(); };
    $("finishImport").onclick = () => { $("importDialog").close(); state.importType === "customers" ? loadCustomers() : loadLeads(); };
  }
}
function openImport(type) {
  state.importType = type; state.importBrand = state.brands[0]?.code; state.importStep = 1; state.importJob = null; state.importResult = null; state.importFileName = ""; state.importError = ""; state.importing = false; state.importHistoryMode = false; state.importPreflightFilter = "ALL"; state.importConflictStrategy = "SKIP"; state.importUnmatchedStrategy = "IMPORT_LEAD_ONLY"; state.importDuplicateFile = null;
  renderImport(); $("importDialog").showModal(); $("importDialogTitle").focus({ preventScroll: true });
}
async function uploadImport(file, allowDuplicate = false) {
  if (state.importing) return;
  if (!file.name.toLowerCase().endsWith(".xlsx")) { state.importError = "请上传 .xlsx 文件"; return renderImport(); }
  if (file.size > 10 * 1024 * 1024) { state.importError = "单个文件不能超过 10 MB"; return renderImport(); }
  state.importing = true; state.importFileName = file.name; state.importError = ""; state.importDuplicateFile = null;
  const data = new FormData(); data.append("file", file);
  try {
    const query = new URLSearchParams({ brandCode: state.importBrand, conflictStrategy: state.importConflictStrategy });
    if (state.importType === "leads") query.set("unmatchedStrategy", state.importUnmatchedStrategy);
    if (allowDuplicate) query.set("allowDuplicate", "true");
    const result = await api(`/api/v1/imports/${state.importType}?${query}`, { method: "POST", body: data });
    state.importJob = result.data; state.importStep = 2;
  } catch (error) { state.importStep = 1; state.importError = error.message; if (error.code === "IMPORT_FILE_DUPLICATE") state.importDuplicateFile = file; notify(error.message); }
  finally { state.importing = false; renderImport(); }
}
async function executePreparedImport() {
  if (!state.importJob || state.importing) return; state.importing = true; const button = $("executeImport"); if (button) { button.disabled = true; button.textContent = "正在导入"; }
  const body = { conflictStrategy: state.importConflictStrategy, ...(state.importType === "leads" ? { unmatchedStrategy: state.importUnmatchedStrategy } : {}) };
  try { const response = await api(`/api/v1/imports/${state.importJob.id}/execute`, { method: "POST", body: JSON.stringify(body) }); state.importResult = { ...response.data.job, ...response.data.result }; state.importStep = 3; }
  catch (error) { state.importError = error.message; notify(error.message); }
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

function closePersonalSettings() {
  $("personalSettingsDrawer").classList.remove("is-open");
  $("personalSettingsDrawer").setAttribute("aria-hidden", "true");
}
function openChangePassword() {
  closePersonalSettings();
  closeAccountMenu();
  $("changePasswordForm").reset();
  $("changePasswordError").hidden = true;
  updateStrength("changePasswordStrength", "");
  $("changePasswordDialog").showModal();
  setTimeout(() => $("currentPasswordInput").focus(), 30);
}
function openPersonalSettings() {
  const scope = state.me.allBrands ? "全部品牌" : state.brands.map((brand) => brand.name).join("、") || "-";
  $("personalSettingsBody").innerHTML = `<section class="security-form-section"><h3>账号信息</h3><div class="security-form-grid"><div class="readonly-field"><span>姓名</span><strong>${esc(state.me.name)}</strong></div><div class="readonly-field"><span>登录账号</span><strong>${esc(state.me.loginAccount)}</strong></div><div class="readonly-field"><span>角色</span><strong>${esc(state.me.role.name)}</strong></div><div class="readonly-field"><span>品牌范围</span><strong>${esc(scope)}</strong></div></div></section><section class="security-form-section"><h3>安全</h3><div class="password-summary"><div class="password-summary-copy"><strong>••••••••••••</strong><span>密码不会在页面中显示</span></div><button class="btn" type="button" id="personalChangePasswordBtn">修改密码</button></div></section>`;
  closeAccountMenu();
  $("personalSettingsDrawer").classList.add("is-open");
  $("personalSettingsDrawer").setAttribute("aria-hidden", "false");
  $("personalChangePasswordBtn").onclick = openChangePassword;
}

function bindEvents() {
  $("loginForm").addEventListener("submit", async (event) => { event.preventDefault(); $("loginError").hidden = true; try { const result = await api("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ loginAccount: $("loginAccountInput").value, password: $("loginPasswordInput").value }) }); state.me = result.data; await afterAuth(); } catch (error) { showError($("loginError"), error); } });
  $("forcePasswordForm").addEventListener("submit", async (event) => { event.preventDefault(); $("forcePasswordError").hidden = true; const password = $("forcedNewPasswordInput").value; const confirm = $("forcedConfirmPasswordInput").value; try { await api("/api/v1/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: $("loginPasswordInput").value, newPassword: password, confirmPassword: confirm }) }); state.me.mustChangePassword = false; hideForcePassword(); notify("密码已更新"); await afterAuth(); } catch (error) { showError($("forcePasswordError"), error); } });
  $("backToList").onclick = () => navigate("legacy-customers"); $("searchMembers").onclick = loadCustomers; $("resetMemberFilters").onclick = () => { $("memberSearch").value = ""; $("memberBrandFilter").value = "ALL"; loadCustomers(); }; $("emptyReset").onclick = $("resetMemberFilters").onclick; $("searchLeads").onclick = loadLeads; $("resetLeadFilters").onclick = () => { $("leadKeyword").value = ""; $("leadBrandFilter").value = "ALL"; loadLeads(); }; $("emptyLeadReset").onclick = $("resetLeadFilters").onclick; $("reloadLeads").onclick = $("retryLeadLoad").onclick = loadLeads;
  $("newMemberBtn").onclick = openCreateMember; $("closeMemberCreate").onclick = () => $("memberCreateDialog").close(); $("cancelMemberCreate").onclick = () => $("memberCreateDialog").close(); $("createMemberBrand").onchange = renderMemberFields; $("memberRegistrationForm").onsubmit = saveMember;
  $("openLeadCreate").onclick = () => openCreateLead(); $("newLeadBtn").onclick = () => openCreateLead(state.currentCustomer?.id); $("panelNewLead").onclick = () => openCreateLead(state.currentCustomer?.id); $("closeLeadCreate").onclick = () => $("leadCreateDialog").close(); $("cancelLeadCreate").onclick = () => $("leadCreateDialog").close(); $("createLeadBrand").onchange = renderLeadFields; $("canonicalLeadForm").onsubmit = saveLead; $("closeLeadDrawer").onclick = () => $("leadDrawer").classList.remove("is-open");
  $("closeProfileEdit").onclick = $("cancelProfileEdit").onclick = () => $("profileEditDialog").close(); $("profileEditForm").onsubmit = saveProfile;
  $("memberExportBtn").onclick = () => openExport("customers"); $("leadExportBtn").onclick = () => openExport("leads"); $("memberImportBtn").onclick = () => openImport("customers"); $("leadImportBtn").onclick = () => openImport("leads"); $("closeImportDialog").onclick = () => $("importDialog").close(); $("importHistoryBtn").onclick = () => { state.importHistoryMode = !state.importHistoryMode; state.importHistoryMode ? loadImportHistory() : renderImport(); }; $("importFileInput").onchange = (event) => event.target.files[0] && uploadImport(event.target.files[0]);
  $("closeExportDialog").onclick = () => $("exportDialog").close();
  $("addAccountBtn").onclick = () => openAccountDrawer(); $("closeAccountDrawer").onclick = $("cancelAccountDrawer").onclick = closeAccountDrawer; $("accountRoleInput").onchange = updateAccountScopeState; $("accountForm").onsubmit = saveAccount;
  $("addNoteBtn").onclick = () => $("noteComposer").classList.add("is-open"); $("cancelNote").onclick = () => $("noteComposer").classList.remove("is-open"); $("saveNote").onclick = async () => { if (!$("noteInput").value.trim()) return; await api(`/api/v1/customers/${state.currentCustomer.id}/notes`, { method: "POST", body: JSON.stringify({ body: $("noteInput").value }) }); $("noteInput").value = ""; await openCustomer(state.currentCustomer.id); renderCustomerModule("notes"); };
  $("accountMenuTrigger").onclick = () => setAccountMenuOpen($("accountMenu").hidden); $("logoutMenuItem").onclick = async () => { await api("/api/v1/auth/logout", { method: "POST", body: "{}" }); state.me = null; showLogin(); };
  $("personalSettingsMenuItem").onclick = openPersonalSettings;
  $("closePersonalSettings").onclick = $("closePersonalSettingsFooter").onclick = closePersonalSettings; $("changePasswordMenuItem").onclick = openChangePassword; $("closeChangePassword").onclick = $("cancelChangePassword").onclick = () => $("changePasswordDialog").close();
  $("changePasswordForm").onsubmit = async (event) => { event.preventDefault(); try { await api("/api/v1/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: $("currentPasswordInput").value, newPassword: $("newPasswordInput").value, confirmPassword: $("confirmPasswordInput").value }) }); $("changePasswordDialog").close(); notify("密码已更新"); } catch (error) { showError($("changePasswordError"), error); } };
  $("forgotPasswordBtn").onclick = () => $("forgotPasswordDialog").showModal(); $("closeForgotPassword").onclick = $("ackForgotPassword").onclick = () => $("forgotPasswordDialog").close();
  $("newPasswordInput").addEventListener("input", (event) => updateStrength("changePasswordStrength", event.target.value));
  $("forcedNewPasswordInput").addEventListener("input", (event) => updateStrength("forcePasswordStrength", event.target.value));
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".account-area")) closeAccountMenu();
    const toggle = event.target.closest("[data-password-toggle]");
    if (toggle) { const input = $(toggle.dataset.passwordToggle); input.type = input.type === "password" ? "text" : "password"; toggle.textContent = input.type === "password" ? "显示" : "隐藏"; }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("accountMenu").hidden) { closeAccountMenu(); $("accountMenuTrigger").focus(); }
  });
  window.addEventListener("hashchange", () => { if (state.me && !state.me.mustChangePassword) renderRoute(); });
  window.addEventListener("crm:unauthenticated", () => showLogin());
  window.addEventListener("crm:password-required", () => showForcePassword());
  document.querySelector("[data-go-list]")?.addEventListener("click", () => navigate(defaultRoute()));
}

async function afterAuth() {
  hideLogin(); if (state.me.mustChangePassword) { renderIdentity(); return showForcePassword(); }
  state.brands = can("customer.view") || can("lead.view") ? (await api("/api/v1/brands")).data : [];
  if (can("crm.contact.view") || can("crm.lead.view")) {
    try {
      state.crmUsers = (await api("/api/v1/crm/users")).data;
    } catch (error) {
      state.crmUsers = [{ id: state.me.id, name: state.me.name, loginAccount: state.me.loginAccount, status: "ACTIVE" }];
      notify(`负责人目录加载失败：${error.message}`);
    }
  } else {
    state.crmUsers = [];
  }
  state.roles = []; state.permissions = [];
  renderIdentity(); renderNavigation(); renderBrandFilters(); applyPermissionVisibility();
  syncContactUsers(); syncLeadUsers(); applyCrmPermissions();
  if (can("crm.contact.view")) api("/api/v1/crm/contacts?page=1&pageSize=1").then((result) => setCrmNavCount("contacts", result.meta.total)).catch(() => {});
  if (can("crm.lead.view")) api("/api/v1/crm/leads?page=1&pageSize=1").then((result) => setCrmNavCount("leads", result.meta.total)).catch(() => {});
  if (can("customer.view")) api("/api/v1/customers?pageSize=1").then((result) => { if ($("memberNavCount")) $("memberNavCount").textContent = result.meta.total; }).catch(() => {});
  if (can("lead.view")) api("/api/v1/leads?pageSize=1").then((result) => { if ($("leadNavCount")) $("leadNavCount").textContent = result.meta.total; }).catch(() => {});
  const requested = location.hash.slice(1);
  navigate(routeAllowed(requested) ? requested : defaultRoute());
}
async function init() {
  initializeSidebar();
  bindListSelection("customers");
  bindListSelection("leads");
  const crmContext = {
    state,
    can,
    navigate,
    notify,
    getUsers: () => state.crmUsers,
    currentUserId: () => state.me?.id || "",
    applyCrmPermissions,
    setNavCount: setCrmNavCount,
    openLeadForm: (...args) => openCrmLeadForm(...args),
    openImport: openCrmImport,
    openExport: openCrmExport,
    reload: (objectType) => objectType === "CONTACT" ? loadCrmContacts(1) : loadCrmLeads(1),
  };
  initializeCrmJobs(crmContext);
  initializeFollowups(crmContext);
  initializeContacts(crmContext);
  initializeLeads(crmContext);
  bindEvents();
  try { state.me = (await api("/api/v1/auth/me")).data; await afterAuth(); } catch (error) { if (error.status !== 401) notify(error.message); showLogin(); }
}
init();
