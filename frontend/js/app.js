"use strict";

import { $, crmApi, esc, formatLocalDateTime } from "./api.js";
import { initializeContacts, loadContacts, openContact, syncContactUsers } from "./contacts.js";
import { initializeFollowups } from "./followups.js";
import { initializeCrmJobs, openCrmExport, openCrmImport } from "./crm-jobs.js";
import { initializeLeads, loadLeads, openLead, openLeadForm, syncLeadUsers } from "./leads.js";

const state = {
  me: null,
  crmUsers: [],
  users: [],
  roles: [],
  permissions: [],
  activeRoleId: null,
  currentCrmContact: null,
  currentCrmLead: null,
};

const can = (permission) => Boolean(state.me?.permissions?.includes(permission));
const statusLabel = (status) => ({ ACTIVE: "启用", DISABLED: "禁用", COMPLETED: "已完成", COMPLETED_WITH_ERRORS: "部分完成", FAILED: "失败" })[status] || status || "-";
const actionLabel = (action) => ({
  LOGIN: "登录", LOGOUT: "退出登录", CHANGE_PASSWORD: "修改密码", PASSWORD_FORCE_CHANGE: "首次修改密码",
  CREATE_CONTACT: "创建联系人", UPDATE_CONTACT: "编辑联系人", DELETE_CONTACT: "删除联系人", CREATE_CONTACT_FOLLOWUP: "新增联系人跟进",
  CREATE_CRM_LEAD: "创建线索", UPDATE_CRM_LEAD: "编辑线索", DELETE_CRM_LEAD: "删除线索", DELETE_LEAD: "删除线索", CREATE_LEAD_FOLLOWUP: "新增线索跟进",
  UPLOAD_LEAD_ATTACHMENT: "上传线索附件", DELETE_LEAD_ATTACHMENT: "删除线索附件",
  IMPORT_UPLOAD: "上传导入文件", IMPORT_PREFLIGHT: "导入预检", IMPORT_EXECUTE: "执行导入",
  EXPORT_CREATE: "创建导出", EXPORT_DOWNLOAD: "下载导出文件", CREATE_USER: "创建账号", UPDATE_USER: "编辑账号",
  ENABLE_USER: "启用账号", DISABLE_USER: "禁用账号", RESET_PASSWORD: "重置密码", UPDATE_ROLE_PERMISSIONS: "修改角色权限",
})[action] || action;
const moduleLabel = (module) => ({ crm: "客户与线索", crm_import: "数据导入", crm_export: "数据导出", account: "账户", role: "角色权限", audit: "审计", auth: "登录安全" })[module] || module;
const roleLabel = (role) => ({ SUPER_ADMIN: "超级管理员", SALES: "销售", VIEWER: "只读用户" })[role] || role;
const targetLabel = (target) => ({ CONTACT: "客户联系人", CONTACT_FOLLOWUP: "联系人跟进", CRM_LEAD: "线索", LEAD_FOLLOWUP: "线索跟进", USER: "账号", ROLE: "角色", SESSION: "会话", IMPORT_JOB: "导入任务", EXPORT_JOB: "导出任务" })[String(target || "").toUpperCase()] || target || "-";

function notify(message) {
  $("toastText").textContent = message;
  $("toast").classList.add("is-visible");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => $("toast").classList.remove("is-visible"), 2400);
}

function showError(node, error) {
  node.textContent = error?.message || "操作失败，请稍后重试。";
  node.hidden = false;
}

function applyCrmPermissions() {
  document.querySelectorAll("[data-crm-permission]").forEach((element) => {
    element.hidden = !can(element.dataset.crmPermission);
  });
}

function setNavCount(route, count) {
  const node = document.querySelector(`[data-nav-count="${route}"]`);
  if (node) node.textContent = count > 999 ? "999+" : String(count);
}

const context = {
  state,
  can,
  notify,
  confirm: requestConfirmation,
  navigate,
  setNavCount,
  applyCrmPermissions,
  currentUserId: () => state.me?.id || "",
  getUsers: () => state.crmUsers,
  openLeadForm,
  openImport: openCrmImport,
  openExport: openCrmExport,
  reload: (objectType) => objectType === "CONTACT" ? loadContacts(1) : loadLeads(1),
};

initializeContacts(context);
initializeLeads(context);
initializeFollowups(context);
initializeCrmJobs(context);

function showLogin() {
  $("loginOverlay").hidden = false;
  $("loginError").hidden = true;
  $("loginPasswordInput").value = "";
  $("loginPasswordInput").type = "password";
  setTimeout(() => $("loginAccountInput").focus(), 20);
}

function hideLogin() {
  $("loginOverlay").hidden = true;
}

function showPasswordDialog(required = false) {
  $("changePasswordDialog").dataset.required = String(required);
  $("changePasswordTitle").textContent = required ? "首次登录，请设置新密码" : "修改密码";
  $("closeChangePassword").hidden = required;
  $("cancelChangePassword").hidden = required;
  $("changePasswordForm").reset();
  $("changePasswordError").hidden = true;
  updatePasswordStrength("");
  $("changePasswordDialog").showModal();
  setTimeout(() => $("currentPasswordInput").focus(), 20);
}

function updateIdentity() {
  $("adminName").textContent = state.me.name;
  $("adminRole").textContent = state.me.role.name;
  $("adminAvatar").textContent = state.me.name.trim().slice(0, 1).toUpperCase();
  $("accountMenuName").textContent = state.me.name;
  $("accountMenuRole").textContent = state.me.role.name;
}

function passwordAssessment(value) {
  const password = String(value || "");
  if (!password) return { level: "", label: "-", width: 0 };
  const obvious = ["123456789012", "password1234", "aaaaaaaaaaaa", "qwerty123456"].includes(password.toLowerCase()) || /^\d+$/.test(password) || /^(.)\1{11,}$/.test(password);
  if (password.length < 12 || obvious) return { level: "weak", label: "弱", width: 28 };
  const variety = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  if (password.length >= 16 || variety >= 3) return { level: "strong", label: "强", width: 100 };
  return { level: "medium", label: "中", width: 62 };
}

function updatePasswordStrength(value) {
  const assessment = passwordAssessment(value);
  const container = $("changePasswordStrength");
  container.className = `password-strength${assessment.level === "medium" ? " is-medium" : assessment.level === "strong" ? " is-strong" : ""}`;
  container.querySelector(".password-strength-fill").style.width = `${assessment.width}%`;
  container.querySelector(".password-strength-label").textContent = `密码强度：${assessment.label}`;
}

function setSecurityDrawer(id, open) {
  const drawer = $(id);
  drawer.classList.toggle("is-open", open);
  drawer.setAttribute("aria-hidden", String(!open));
}

function openPersonalSettings() {
  $("personalSettingsBody").innerHTML = `<section class="security-form-section"><h3>账号信息</h3><div class="security-form-grid"><div class="readonly-field"><span>姓名</span><strong>${esc(state.me.name)}</strong></div><div class="readonly-field"><span>登录账号</span><strong>${esc(state.me.loginAccount)}</strong></div><div class="readonly-field"><span>角色</span><strong>${esc(state.me.role.name)}</strong></div><div class="readonly-field"><span>账号状态</span><strong>${esc(statusLabel(state.me.status || "ACTIVE"))}</strong></div></div></section><section class="security-form-section"><h3>账号安全</h3><div class="password-summary"><div class="password-summary-copy"><strong>************</strong><span>密码不会在页面中显示</span></div><button class="btn" type="button" id="personalChangePassword">修改密码</button></div></section>`;
  $("accountMenu").hidden = true;
  $("accountMenuTrigger").setAttribute("aria-expanded", "false");
  setSecurityDrawer("personalSettingsDrawer", true);
  $("personalChangePassword").addEventListener("click", () => {
    setSecurityDrawer("personalSettingsDrawer", false);
    showPasswordDialog(false);
  });
}

let confirmationResolver = null;
function requestConfirmation(title, message, confirmText = "确认") {
  if (confirmationResolver) confirmationResolver(false);
  $("confirmationTitle").textContent = title;
  $("confirmationMessage").textContent = message;
  $("confirmAction").textContent = confirmText;
  $("confirmationDialog").showModal();
  return new Promise((resolve) => { confirmationResolver = resolve; });
}

function resolveConfirmation(confirmed) {
  if ($("confirmationDialog").open) $("confirmationDialog").close();
  const resolver = confirmationResolver;
  confirmationResolver = null;
  resolver?.(confirmed);
}

async function loadDirectories() {
  const tasks = [];
  if (can("crm.contact.view") || can("crm.lead.view")) {
    tasks.push(crmApi("/api/v1/crm/users").then((result) => { state.crmUsers = result.data; }));
  }
  if (can("account.view")) tasks.push(crmApi("/api/v1/users").then((result) => { state.users = result.data; }));
  if (can("roles.view")) {
    tasks.push(crmApi("/api/v1/roles").then((result) => { state.roles = result.data; }));
    tasks.push(crmApi("/api/v1/permissions").then((result) => { state.permissions = result.data; }));
  }
  await Promise.all(tasks);
  syncContactUsers();
  syncLeadUsers();
}

function allowedDefaultRoute() {
  if (can("crm.contact.view")) return "contacts";
  if (can("crm.lead.view")) return "leads";
  if (can("account.view")) return "accounts";
  if (can("roles.view")) return "roles";
  return "audit";
}

async function enterApplication(me = null) {
  state.me = me || (await crmApi("/api/v1/auth/me")).data;
  if (state.me.mustChangePassword) {
    hideLogin();
    showPasswordDialog(true);
    return;
  }
  hideLogin();
  updateIdentity();
  await loadDirectories();
  const navigationCounts = await Promise.all([
    can("crm.contact.view") ? crmApi("/api/v1/crm/contacts?page=1&pageSize=1").catch(() => null) : null,
    can("crm.lead.view") ? crmApi("/api/v1/crm/leads?page=1&pageSize=1").catch(() => null) : null,
  ]);
  if (navigationCounts[0]) setNavCount("contacts", navigationCounts[0].meta.total);
  if (navigationCounts[1]) setNavCount("leads", navigationCounts[1].meta.total);
  applyCrmPermissions();
  await route();
}

async function submitLogin(event) {
  event.preventDefault();
  const errorNode = $("loginError");
  errorNode.hidden = true;
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const result = await crmApi("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ loginAccount: $("loginAccountInput").value.trim(), password: $("loginPasswordInput").value }),
    });
    await enterApplication(result.data);
  } catch (error) {
    showError(errorNode, error);
  } finally {
    button.disabled = false;
  }
}

async function submitPassword(event) {
  event.preventDefault();
  const required = $("changePasswordDialog").dataset.required === "true";
  const errorNode = $("changePasswordError");
  errorNode.hidden = true;
  const currentPassword = $("currentPasswordInput").value;
  const newPassword = $("newPasswordInput").value;
  const confirmPassword = $("confirmPasswordInput").value;
  if (newPassword !== confirmPassword) {
    errorNode.textContent = "两次输入的新密码不一致。";
    errorNode.hidden = false;
    return;
  }
  try {
    await crmApi("/api/v1/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
    $("changePasswordDialog").close();
    notify("密码已更新");
    if (required) await enterApplication();
  } catch (error) {
    showError(errorNode, error);
  }
}

async function logout() {
  try { await crmApi("/api/v1/auth/logout", { method: "POST", body: "{}" }); } catch {}
  state.me = null;
  $("accountMenu").hidden = true;
  $("accountMenuTrigger").setAttribute("aria-expanded", "false");
  showLogin();
}

function currentPath() {
  return location.hash.replace(/^#\/?/, "") || allowedDefaultRoute();
}

function navigate(path) {
  const normalized = path.replace(/^\/?/, "");
  if (currentPath() === normalized) return route();
  location.hash = normalized;
}

const views = {
  leads: "crmLeadsView",
  contacts: "crmContactsView",
  accounts: "accountsView",
  roles: "rolesView",
  audit: "auditView",
};

async function route() {
  if (!state.me || state.me.mustChangePassword) return;
  const [section, id] = currentPath().split("/");
  const routePermissions = { leads: "crm.lead.view", contacts: "crm.contact.view", accounts: "account.view", roles: "roles.view", audit: "audit.view" };
  if (!routePermissions[section] || !can(routePermissions[section])) {
    navigate(allowedDefaultRoute());
    return;
  }
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("is-active"));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.route === section));
  $(id ? (section === "leads" ? "crmLeadDetailView" : "crmContactDetailView") : views[section]).classList.add("is-active");
  const labels = { leads: "线索", contacts: "客户联系人", accounts: "账户管理", roles: "角色与权限", audit: "审计日志" };
  $("breadcrumbCurrent").textContent = labels[section];
  try {
    if (section === "leads") await (id ? openLead(id) : loadLeads());
    if (section === "contacts") await (id ? openContact(id) : loadContacts());
    if (section === "accounts") await renderAccounts();
    if (section === "roles") renderRoles();
    if (section === "audit") await renderAudit();
  } catch {}
}

async function renderAccounts() {
  state.users = (await crmApi("/api/v1/users")).data;
  $("accountsView").innerHTML = `<div class="page system-page"><header class="page-heading"><div><span class="eyebrow">系统管理</span><h1>账户管理</h1><p>管理内部账号、角色与登录状态。</p></div><button class="btn btn-primary" id="newAccount" data-crm-permission="account.create"><svg><use href="#i-plus"/></svg>新建账号</button></header><section class="content-card"><div class="crm-table-scroll"><table class="system-table account-table"><thead><tr><th>姓名</th><th>登录账号</th><th>角色</th><th>状态</th><th>最近登录</th><th class="action-cell">操作</th></tr></thead><tbody>${state.users.map((user) => `<tr><td><strong>${esc(user.name)}</strong></td><td>${esc(user.loginAccount)}</td><td>${esc(user.role.name)}</td><td><span class="status-badge${user.status === "ACTIVE" ? "" : " disabled"}">${statusLabel(user.status)}</span></td><td>${esc(formatLocalDateTime(user.lastLoginAt))}</td><td class="action-cell"><div class="table-actions"><button class="btn btn-small" data-edit-user="${esc(user.id)}" data-crm-permission="account.edit">编辑</button><button class="btn btn-small" data-toggle-user="${esc(user.id)}" data-crm-permission="account.disable">${user.status === "ACTIVE" ? "禁用" : "启用"}</button><button class="btn btn-small" data-reset-user="${esc(user.id)}" data-crm-permission="account.reset">重置密码</button></div></td></tr>`).join("") || '<tr><td colspan="6">暂无账号</td></tr>'}</tbody></table></div></section></div>`;
  $("newAccount")?.addEventListener("click", () => openAccountForm());
  document.querySelectorAll("[data-edit-user]").forEach((button) => button.addEventListener("click", () => openAccountForm(state.users.find((user) => user.id === button.dataset.editUser))));
  document.querySelectorAll("[data-toggle-user]").forEach((button) => button.addEventListener("click", () => toggleUser(button.dataset.toggleUser)));
  document.querySelectorAll("[data-reset-user]").forEach((button) => button.addEventListener("click", () => resetUserPassword(button.dataset.resetUser)));
  applyCrmPermissions();
}

function openAccountForm(user = null) {
  $("accountDialogTitle").textContent = user ? "编辑账号" : "新建账号";
  $("accountForm").dataset.userId = user?.id || "";
  $("accountNameInput").value = user?.name || "";
  $("accountLoginInput").value = user?.loginAccount || "";
  $("accountRoleInput").innerHTML = state.roles.map((role) => `<option value="${esc(role.id)}"${user?.roleId === role.id ? " selected" : ""}>${esc(role.name)}</option>`).join("");
  $("accountStatusInput").value = user?.status || "ACTIVE";
  $("accountFormError").hidden = true;
  setSecurityDrawer("accountDialog", true);
  setTimeout(() => $("accountNameInput").focus(), 20);
}

async function saveAccount(event) {
  event.preventDefault();
  const id = event.currentTarget.dataset.userId;
  const payload = { name: $("accountNameInput").value.trim(), loginAccount: $("accountLoginInput").value.trim(), roleId: $("accountRoleInput").value, status: $("accountStatusInput").value };
  try {
    await crmApi(id ? `/api/v1/users/${id}` : "/api/v1/users", { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) });
    setSecurityDrawer("accountDialog", false);
    notify(id ? "账号已更新" : "账号已创建，初始密码由系统管理员提供");
    await loadDirectories();
    await renderAccounts();
  } catch (error) { showError($("accountFormError"), error); }
}

async function toggleUser(id) {
  const user = state.users.find((item) => item.id === id);
  if (!user) return;
  const verb = user.status === "ACTIVE" ? "禁用" : "启用";
  if (!await requestConfirmation(`${verb}账号`, `确认${verb}账号“${user.name}”？`, verb)) return;
  await crmApi(`/api/v1/users/${id}/${user.status === "ACTIVE" ? "disable" : "enable"}`, { method: "POST", body: "{}" });
  notify("账号状态已更新");
  await renderAccounts();
}

async function resetUserPassword(id) {
  const user = state.users.find((item) => item.id === id);
  if (!user || !await requestConfirmation("重置密码", `确认重置“${user.name}”的密码？该用户下次登录时必须设置新密码。`, "重置密码")) return;
  await crmApi(`/api/v1/users/${id}/reset-password`, { method: "POST", body: "{}" });
  notify("密码已重置，用户下次登录必须修改密码");
}

function renderRoles() {
  const grouped = state.permissions.reduce((groups, permission) => {
    (groups[permission.module] ||= []).push(permission);
    return groups;
  }, {});
  const selected = state.roles.find((role) => role.id === state.activeRoleId) || state.roles[0];
  state.activeRoleId = selected?.id || null;
  const rolePermissions = new Set((selected?.permissions || []).map((item) => item.permission.key));
  const detail = selected ? `<section class="content-card role-detail" data-role-card="${esc(selected.id)}"><header class="role-detail-header"><div><h2>${esc(selected.name)}</h2><p>${esc(selected.description || "管理该角色可以访问的系统功能。")}</p></div><span class="spacer"></span>${selected.system ? '<span class="role-system-note">系统角色，权限固定</span>' : `<button class="btn btn-primary btn-small" data-save-role="${esc(selected.id)}" data-crm-permission="roles.configure">保存权限</button>`}</header><div class="role-detail-body">${Object.entries(grouped).map(([module, permissions]) => `<section class="permission-section"><h3>${esc(moduleLabel(module))}</h3>${permissions.map((permission) => `<div class="permission-row"><div class="permission-copy"><strong>${esc(permission.name)}</strong><span>允许此角色使用该功能</span></div><label class="permission-switch"><input type="checkbox" value="${esc(permission.key)}"${rolePermissions.has(permission.key) ? " checked" : ""}${selected.system || !can("roles.configure") ? " disabled" : ""}><span></span></label></div>`).join("")}</section>`).join("")}</div></section>` : '<section class="content-card role-detail"><div class="role-detail-body">暂无角色</div></section>';
  $("rolesView").innerHTML = `<div class="page system-page"><header class="page-heading"><div><span class="eyebrow">系统管理</span><h1>角色与权限</h1><p>按角色配置 CRM 功能访问范围。</p></div></header><div class="role-layout"><aside class="content-card role-list"><header class="role-list-header"><strong>角色列表</strong></header>${state.roles.map((role) => `<button class="role-list-button${role.id === selected?.id ? " is-active" : ""}" type="button" data-select-role="${esc(role.id)}"><strong>${esc(role.name)}</strong><span>${esc(roleLabel(role.key))}${role.description ? ` · ${esc(role.description)}` : ""}</span></button>`).join("")}</aside>${detail}</div></div>`;
  document.querySelectorAll("[data-select-role]").forEach((button) => button.addEventListener("click", () => { state.activeRoleId = button.dataset.selectRole; renderRoles(); }));
  document.querySelectorAll("[data-save-role]").forEach((button) => button.addEventListener("click", () => saveRole(button.dataset.saveRole)));
  applyCrmPermissions();
}

async function saveRole(roleId) {
  const card = document.querySelector(`[data-role-card="${CSS.escape(roleId)}"]`);
  const permissionKeys = [...card.querySelectorAll("input:checked")].map((input) => input.value);
  await crmApi(`/api/v1/roles/${roleId}/permissions`, { method: "PATCH", body: JSON.stringify({ permissionKeys }) });
  notify("角色权限已保存");
  await loadDirectories();
  renderRoles();
}

async function renderAudit() {
  const params = new URLSearchParams({ page: "1", pageSize: "100" });
  if ($("auditModuleFilter")?.value) params.set("module", $("auditModuleFilter").value);
  if ($("auditActionFilter")?.value.trim()) params.set("action", $("auditActionFilter").value.trim());
  const result = await crmApi(`/api/v1/audit-logs?${params}`);
  $("auditView").innerHTML = `<div class="page system-page"><header class="page-heading"><div><span class="eyebrow">系统管理</span><h1>审计日志</h1><p>查看关键业务和安全操作记录。</p></div></header><section class="filter-bar"><label><span class="field-label">模块</span><select class="control" id="auditModuleFilter"><option value="">全部模块</option><option value="crm">客户与线索</option><option value="crm_import">数据导入</option><option value="crm_export">数据导出</option><option value="account">账户</option><option value="role">角色权限</option><option value="auth">登录安全</option></select></label><label><span class="field-label">操作</span><input class="control" id="auditActionFilter" placeholder="输入操作类型"></label><button class="btn btn-primary" id="auditSearch" type="button"><svg><use href="#i-search"/></svg>查询</button></section><section class="content-card"><div class="crm-table-scroll"><table class="system-table audit-table"><thead><tr><th>时间</th><th>操作人</th><th>模块</th><th>操作</th><th>对象</th><th>请求编号</th></tr></thead><tbody>${result.data.map((row) => `<tr><td>${esc(formatLocalDateTime(row.createdAt))}</td><td><strong>${esc(row.actorName)}</strong></td><td>${esc(moduleLabel(row.module))}</td><td>${esc(actionLabel(row.action))}</td><td><span class="audit-detail">${esc(targetLabel(row.targetType))}${row.targetId ? `<span class="secondary">${esc(row.targetId)}</span>` : ""}</span></td><td>${esc(row.requestId || "-")}</td></tr>`).join("") || '<tr><td colspan="6">暂无审计记录</td></tr>'}</tbody></table></div></section></div>`;
  $("auditModuleFilter").value = params.get("module") || "";
  $("auditActionFilter").value = params.get("action") || "";
  $("auditSearch").addEventListener("click", renderAudit);
}

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.route)));
$("brandLockup").addEventListener("click", () => navigate(allowedDefaultRoute()));
$("sidebarToggle").addEventListener("click", () => {
  document.body.classList.add("is-sidebar-transitioning");
  document.body.classList.toggle("is-sidebar-collapsed");
  const collapsed = document.body.classList.contains("is-sidebar-collapsed");
  $("sidebarToggle").setAttribute("aria-expanded", String(!collapsed));
  localStorage.setItem("kivisense.crm.sidebar.collapsed", String(collapsed));
  setTimeout(() => document.body.classList.remove("is-sidebar-transitioning"), 240);
});
if (localStorage.getItem("kivisense.crm.sidebar.collapsed") === "true") {
  document.body.classList.add("is-sidebar-collapsed");
  $("sidebarToggle").setAttribute("aria-expanded", "false");
}
$("accountMenuTrigger").addEventListener("click", () => {
  $("accountMenu").hidden = !$("accountMenu").hidden;
  $("accountMenuTrigger").setAttribute("aria-expanded", String(!$("accountMenu").hidden));
});
$("personalSettingsAction").addEventListener("click", openPersonalSettings);
$("changePasswordAction").addEventListener("click", () => { $("accountMenu").hidden = true; $("accountMenuTrigger").setAttribute("aria-expanded", "false"); showPasswordDialog(false); });
$("logoutAction").addEventListener("click", logout);
$("loginForm").addEventListener("submit", submitLogin);
$("changePasswordForm").addEventListener("submit", submitPassword);
$("closeChangePassword").addEventListener("click", () => $("changePasswordDialog").close());
$("cancelChangePassword").addEventListener("click", () => $("changePasswordDialog").close());
$("changePasswordDialog").addEventListener("cancel", (event) => {
  if ($("changePasswordDialog").dataset.required === "true") event.preventDefault();
});
$("newPasswordInput").addEventListener("input", (event) => updatePasswordStrength(event.target.value));
$("accountForm").addEventListener("submit", saveAccount);
$("closeAccountDialog").addEventListener("click", () => setSecurityDrawer("accountDialog", false));
$("cancelAccountDialog").addEventListener("click", () => setSecurityDrawer("accountDialog", false));
$("closeAccountBackdrop").addEventListener("click", () => setSecurityDrawer("accountDialog", false));
$("closePersonalSettings").addEventListener("click", () => setSecurityDrawer("personalSettingsDrawer", false));
$("closePersonalSettingsFooter").addEventListener("click", () => setSecurityDrawer("personalSettingsDrawer", false));
$("closePersonalSettingsBackdrop").addEventListener("click", () => setSecurityDrawer("personalSettingsDrawer", false));
$("forgotPasswordAction").addEventListener("click", () => $("forgotPasswordDialog").showModal());
$("closeForgotPassword").addEventListener("click", () => $("forgotPasswordDialog").close());
$("ackForgotPassword").addEventListener("click", () => $("forgotPasswordDialog").close());
$("closeConfirmation").addEventListener("click", () => resolveConfirmation(false));
$("cancelConfirmation").addEventListener("click", () => resolveConfirmation(false));
$("confirmAction").addEventListener("click", () => resolveConfirmation(true));
$("confirmationDialog").addEventListener("cancel", (event) => { event.preventDefault(); resolveConfirmation(false); });
window.addEventListener("hashchange", route);
window.addEventListener("crm:unauthenticated", showLogin);
window.addEventListener("crm:password-required", () => showPasswordDialog(true));
document.addEventListener("click", (event) => {
  if (!event.target.closest("#accountMenu") && !event.target.closest("#accountMenuTrigger")) {
    $("accountMenu").hidden = true;
    $("accountMenuTrigger").setAttribute("aria-expanded", "false");
  }
  const passwordToggle = event.target.closest("[data-password-toggle]");
  if (passwordToggle) {
    const input = $(passwordToggle.dataset.passwordToggle);
    input.type = input.type === "password" ? "text" : "password";
    passwordToggle.textContent = input.type === "password" ? "显示" : "隐藏";
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!$("accountMenu").hidden) {
    $("accountMenu").hidden = true;
    $("accountMenuTrigger").setAttribute("aria-expanded", "false");
    $("accountMenuTrigger").focus();
  }
  setSecurityDrawer("accountDialog", false);
  setSecurityDrawer("personalSettingsDrawer", false);
});

try {
  await enterApplication();
} catch {
  showLogin();
}
