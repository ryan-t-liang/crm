"use strict";

import { $, appUrl, crmApi, esc, formatLocalDateTime, friendlyError, localDateTimeToIso, setButtonBusy, toDateTimeInput } from "./api.js";
import { openFollowup } from "./followups.js";

let context;
let organizationCallback = null;
let organizationEditing = null;
let organizationLogo = null;
let organizationPresetRole = "PROSPECT";
let taskTarget = null;
let nurtureOrganization = null;
let organizationFilters = {};
let operationsTab = "priority";

const roleLabels = { PROSPECT: "潜在客户", CUSTOMER: "客户", VENDOR: "供应商", PARTNER: "合作伙伴" };
const lifecycleLabels = { TARGET: "目标", CONTACTED: "已触达", NURTURING: "孵化中", OPPORTUNITY: "机会中", CUSTOMER: "客户", DISQUALIFIED: "不合格" };
const levelLabels = { HIGH: "高", MEDIUM: "中", LOW: "低" };
const engagementStateLabels = { ACTIVE: "活跃", COOLING: "降温", DORMANT: "沉睡" };
const taskStatusLabels = { OPEN: "待完成", DONE: "已完成", CANCELED: "已取消" };
const nowIso = () => new Date().toISOString();

function userOptions(selected = "") {
  return `<option value="">未分配</option>${context.getUsers().map((user) => `<option value="${esc(user.id)}"${user.id === selected ? " selected" : ""}>${esc(user.name)}</option>`).join("")}`;
}

function badge(value, label = value) {
  return `<span class="crm-badge ops-badge ops-${esc(String(value || "").toLowerCase())}">${esc(label || "-")}</span>`;
}

function logoMarkup(organization, size = "normal") {
  const initial = (organization.shortName || organization.name || "公").trim().slice(0, 2).toUpperCase();
  return organization.logo
    ? `<img class="organization-logo ${esc(size)}" src="${esc(appUrl(`/api/v1/crm/organizations/${encodeURIComponent(organization.id)}/attachments/${encodeURIComponent(organization.logo.id)}/download`))}" alt="${esc(organization.name)} Logo">`
    : `<span class="organization-logo-fallback ${esc(size)}">${esc(initial)}</span>`;
}

function valueOrDash(value) { return value === null || value === undefined || value === "" ? "-" : value; }

function renderOrganizationActions(organization) {
  return `<div class="table-actions"><button class="btn btn-small" data-org-task="${esc(organization.id)}">创建任务</button><button class="btn btn-small" data-org-nurture="${esc(organization.id)}" data-crm-permission="crm.organization.nurture.manage">开始孵化</button><button class="btn btn-small" data-view-org="${esc(organization.id)}">查看</button></div>`;
}

export function initializeCustomerOperations(options) {
  context = options;
  if ($("crmOrganizationDialog")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <dialog class="lead-create-dialog crm-form-dialog ops-dialog" id="crmOrganizationDialog"><form id="crmOrganizationForm" novalidate>
      <div class="dialog-header"><div><h2 id="crmOrganizationFormTitle">新建公司</h2><p>Organization 是客户与供应商统一主档</p></div><span class="spacer"></span><button class="dialog-close" type="button" data-close-organization aria-label="关闭"><svg><use href="#i-x"/></svg></button></div>
      <div class="dialog-body"><div class="crm-form-tabs"><button class="crm-form-tab is-active" type="button">公司资料</button></div><div class="crm-form-grid">
        <label class="crm-field crm-field-wide"><span>公司名称<b>*</b></span><input name="name" maxlength="240" required></label>
        <label class="crm-field"><span>公司简称</span><input name="shortName" maxlength="120"></label><label class="crm-field"><span>网站</span><input name="website" type="url" maxlength="500" placeholder="https://"></label>
        <label class="crm-field"><span>行业</span><input name="industry" maxlength="160"></label><label class="crm-field"><span>负责人</span><select name="ownerUserId"></select></label>
        <label class="crm-field"><span>国家</span><input name="country" maxlength="120"></label><label class="crm-field"><span>区域</span><input name="region" maxlength="120"></label><label class="crm-field"><span>城市</span><input name="city" maxlength="120"></label>
        <fieldset class="crm-field crm-field-wide ops-role-field"><legend>公司角色</legend>${Object.entries(roleLabels).map(([key, label]) => `<label><input type="checkbox" name="roles" value="${key}"><span>${label}</span></label>`).join("")}</fieldset>
        <label class="crm-field"><span>生命周期</span><select name="lifecycleStage">${Object.entries(lifecycleLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</select></label>
        <label class="crm-field"><span>Fit Score（0–100）</span><input name="fitScore" type="number" min="0" max="100" step="1"></label>
        <label class="crm-field crm-field-wide"><span>Fit Reason</span><textarea name="fitReason" maxlength="16000"></textarea></label>
        <label class="crm-field crm-field-wide"><span>备注</span><textarea name="note" maxlength="16000"></textarea></label>
        <label class="crm-field crm-field-wide"><span>公司 Logo</span><input id="crmOrganizationLogo" type="file" accept=".jpg,.jpeg,.png,.gif,.webp"><small class="crm-field-hint">仅图片；公司详情、列表与联系人选择器会显示</small></label>
      </div><div class="crm-form-message" id="crmOrganizationFormError" hidden></div></div>
      <div class="dialog-footer"><button class="btn" type="button" data-close-organization>取消</button><span class="spacer"></span><button class="btn btn-primary" id="crmSaveOrganization" type="submit">保存公司</button></div>
    </form></dialog>
    <dialog class="security-modal ops-small-dialog" id="crmTaskDialog"><form id="crmTaskForm"><div class="dialog-header"><div><h2>创建下一步任务</h2><p id="crmTaskTargetLabel"></p></div><button class="dialog-close" type="button" data-close-task><svg><use href="#i-x"/></svg></button></div><div class="dialog-body crm-form-grid">
      <label class="crm-field crm-field-wide"><span>任务标题<b>*</b></span><input name="title" maxlength="300" required></label><label class="crm-field crm-field-wide"><span>说明</span><textarea name="description" maxlength="16000"></textarea></label>
      <label class="crm-field"><span>负责人<b>*</b></span><select name="ownerUserId" required></select></label><label class="crm-field"><span>优先级</span><select name="priority"><option value="NORMAL">普通</option><option value="HIGH">高</option></select></label><label class="crm-field crm-field-wide"><span>到期时间<b>*</b></span><input name="dueAt" type="datetime-local" required></label><div class="crm-form-message" id="crmTaskFormError" hidden></div>
    </div><div class="dialog-footer"><button class="btn" type="button" data-close-task>取消</button><span class="spacer"></span><button class="btn btn-primary" id="crmSaveTask">保存任务</button></div></form></dialog>
    <dialog class="security-modal ops-small-dialog" id="crmNurtureDialog"><form id="crmNurtureForm"><div class="dialog-header"><div><h2>开始孵化</h2><p id="crmNurtureTargetLabel"></p></div><button class="dialog-close" type="button" data-close-nurture><svg><use href="#i-x"/></svg></button></div><div class="dialog-body crm-form-grid">
      <label class="crm-field"><span>负责人<b>*</b></span><select name="ownerUserId" required></select></label><label class="crm-field"><span>触达节奏（天）<b>*</b></span><input name="cadenceDays" type="number" min="1" max="365" value="14" required></label>
      <label class="crm-field crm-field-wide"><span>为什么孵化 / 等待什么<b>*</b></span><textarea name="reason" required maxlength="16000"></textarea></label><label class="crm-field crm-field-wide"><span>孵化目标<b>*</b></span><textarea name="objective" required maxlength="16000"></textarea></label>
      <label class="crm-field"><span>下次触达<b>*</b></span><input name="nextTouchAt" type="datetime-local" required></label><label class="crm-field"><span>触达主题<b>*</b></span><input name="touchTopic" maxlength="300" required></label><div class="crm-form-message" id="crmNurtureFormError" hidden></div>
    </div><div class="dialog-footer"><button class="btn" type="button" data-close-nurture>取消</button><span class="spacer"></span><button class="btn btn-primary" id="crmSaveNurture">保存孵化计划</button></div></form></dialog>`);
  document.querySelectorAll("[data-close-organization]").forEach((button) => button.addEventListener("click", closeOrganizationForm));
  document.querySelectorAll("[data-close-task]").forEach((button) => button.addEventListener("click", () => $("crmTaskDialog").close()));
  document.querySelectorAll("[data-close-nurture]").forEach((button) => button.addEventListener("click", () => $("crmNurtureDialog").close()));
  $("crmOrganizationForm").addEventListener("submit", saveOrganization);
  $("crmTaskForm").addEventListener("submit", saveTask);
  $("crmNurtureForm").addEventListener("submit", saveNurture);
  $("crmOrganizationLogo").addEventListener("change", (event) => { organizationLogo = event.target.files?.[0] || null; });
}

export function openOrganizationQuickCreate(onSelected, defaults = {}) {
  organizationCallback = onSelected || null;
  openOrganizationForm(null, defaults.role || "PROSPECT", true, defaults);
}

function openOrganizationForm(organization = null, role = "PROSPECT", quick = false, defaults = {}) {
  organizationEditing = organization;
  organizationPresetRole = role;
  organizationLogo = null;
  const form = $("crmOrganizationForm");
  form.reset();
  form.dataset.quick = String(quick);
  $("crmOrganizationFormTitle").textContent = organization ? "编辑公司" : quick ? "快速新建公司" : role === "VENDOR" ? "新建供应商" : "新建公司";
  const values = organization || { lifecycleStage: "TARGET", fitScore: 0, ownerUserId: context.currentUserId(), ...defaults };
  ["name", "shortName", "website", "industry", "country", "region", "city", "fitScore", "fitReason", "note"].forEach((key) => { form.elements[key].value = values[key] ?? ""; });
  form.elements.lifecycleStage.value = values.lifecycleStage || "TARGET";
  form.elements.ownerUserId.innerHTML = userOptions(values.ownerUserId || context.currentUserId());
  const selectedRoles = new Set(organization?.roleKeys || organization?.roles?.map((item) => item.role) || [role]);
  form.querySelectorAll("input[name=roles]").forEach((input) => { input.checked = selectedRoles.has(input.value); });
  $("crmOrganizationFormError").hidden = true;
  $("crmOrganizationDialog").showModal();
  setTimeout(() => form.elements.name.focus(), 20);
}

function closeOrganizationForm() {
  if ($("crmOrganizationDialog").open) $("crmOrganizationDialog").close();
  organizationEditing = null;
  organizationLogo = null;
  organizationCallback = null;
}

async function persistOrganization(payload, confirmDuplicate = false) {
  const editing = organizationEditing;
  return crmApi(editing ? `/api/v1/crm/organizations/${editing.id}` : "/api/v1/crm/organizations", { method: editing ? "PATCH" : "POST", body: JSON.stringify(editing ? payload : { ...payload, confirmDuplicate }) });
}

async function saveOrganization(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const roles = [...form.querySelectorAll("input[name=roles]:checked")].map((item) => item.value);
  const payload = Object.fromEntries(["name", "shortName", "website", "industry", "country", "region", "city", "ownerUserId", "lifecycleStage", "fitReason", "note"].map((key) => [key, String(form.elements[key].value || "").trim() || null]));
  payload.roles = roles.length ? roles : [organizationPresetRole];
  payload.fitScore = Number(form.elements.fitScore.value || 0);
  const errorNode = $("crmOrganizationFormError");
  errorNode.hidden = true;
  if (!payload.name || !roles.length) { errorNode.textContent = "请填写公司名称并至少选择一个公司角色。"; errorNode.hidden = false; return; }
  const button = $("crmSaveOrganization");
  setButtonBusy(button, true);
  try {
    let result;
    try { result = await persistOrganization(payload); }
    catch (error) {
      if (error.code !== "ORGANIZATION_DUPLICATE_WARNING") throw error;
      const candidates = error.details?.candidates?.map((item) => item.name).join("、") || "已有公司";
      if (!await context.confirm("可能存在重复公司", `发现可能重复的公司：${candidates}。建议选择已有公司；如确认不是同一主体，可继续创建。`, "仍然创建")) return;
      result = await persistOrganization(payload, true);
    }
    if (organizationLogo) {
      const upload = new FormData(); upload.append("file", organizationLogo, organizationLogo.name);
      await crmApi(`/api/v1/crm/organizations/${result.data.id}/attachments/logo`, { method: "POST", body: upload });
    }
    const callback = organizationCallback;
    $("crmOrganizationDialog").close();
    organizationEditing = null; organizationLogo = null; organizationCallback = null;
    context.notify("公司已保存");
    if (callback) await callback(result.data);
    else if (location.hash.includes("vendors")) await loadVendors();
    else await context.navigate(`organizations/${result.data.id}`);
  } catch (error) { const copy = friendlyError(error); errorNode.textContent = `${copy.title}：${copy.message}`; errorNode.hidden = false; }
  finally { setButtonBusy(button, false); }
}

function organizationQuery(filters = organizationFilters) {
  const params = new URLSearchParams({ page: "1", pageSize: "100" });
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  return params;
}

function renderOrganizationTable(rows, vendor = false) {
  if (!rows.length) return `<div class="empty-state"><div><div class="empty-illustration"><svg><use href="#i-file"/></svg></div><h3>${vendor ? "暂无供应商" : "暂无公司"}</h3><p>创建统一公司主档后，可关联联系人、线索、任务与客户旅程。</p></div></div>`;
  return `<div class="crm-table-scroll"><table class="crm-data-table organization-table"><thead><tr><th>Logo</th><th>公司</th>${vendor ? "" : "<th>角色</th><th>生命周期</th><th>Fit</th><th>Engagement</th>"}<th>负责人</th><th>联系人</th>${vendor ? "<th>网站 / 区域</th>" : "<th>活跃线索</th>"}<th>最近互动</th><th>下一动作</th><th>操作</th></tr></thead><tbody>${rows.map((organization) => `<tr data-view-org="${esc(organization.id)}"><td>${logoMarkup(organization, "small")}</td><td><strong>${esc(organization.name)}</strong><small>${esc(valueOrDash(organization.shortName))}</small></td>${vendor ? "" : `<td>${organization.roleKeys.map((role) => badge(role, roleLabels[role])).join(" ")}</td><td>${badge(organization.lifecycleStage, lifecycleLabels[organization.lifecycleStage])}</td><td><strong>${esc(organization.fitScore)}</strong> ${badge(organization.fitLevel, levelLabels[organization.fitLevel])}</td><td><strong>${esc(organization.engagementScore)}</strong> ${badge(organization.engagementState, engagementStateLabels[organization.engagementState])}</td>`}<td>${esc(valueOrDash(organization.owner?.name))}</td><td>${esc(organization.contactCount)}</td>${vendor ? `<td><strong>${esc(valueOrDash(organization.website))}</strong><small>${esc([organization.country, organization.region, organization.city].filter(Boolean).join(" · ") || "-")}</small></td>` : `<td>${esc(organization.activeLeadCount)}</td>`}<td>${esc(formatLocalDateTime(organization.lastInteractionAt))}</td><td>${esc(formatLocalDateTime(organization.nextActionAt))}</td><td>${renderOrganizationActions(organization)}</td></tr>`).join("")}</tbody></table></div>`;
}

function bindOrganizationRows(container, rows) {
  container.querySelectorAll("[data-view-org]").forEach((node) => node.addEventListener("click", (event) => { if (!event.target.closest("button") || event.currentTarget.tagName === "BUTTON") context.navigate(`organizations/${node.dataset.viewOrg}`); }));
  container.querySelectorAll("[data-org-task]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); const org = rows.find((item) => item.id === button.dataset.orgTask); openTaskForm({ organizationId: org.id, label: org.name, ownerUserId: org.owner?.id }); }));
  container.querySelectorAll("[data-org-nurture]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); const org = rows.find((item) => item.id === button.dataset.orgNurture); openNurtureForm(org); }));
  context.applyCrmPermissions();
}

export async function loadOrganizations() {
  const view = $("organizationsView");
  view.innerHTML = `<div class="page ops-page"><header class="page-heading"><div><span class="eyebrow">Customer Assets</span><h1>公司</h1><p>客户、供应商与合作伙伴共用同一 Organization 主档。</p></div><div class="page-actions"><button class="btn" id="crmExportOrganizations" data-crm-permission="crm.organization.export"><svg><use href="#i-download"/></svg>导出</button><button class="btn" id="crmImportOrganizations" data-crm-permission="crm.organization.import"><svg><use href="#i-upload"/></svg>批量导入</button><button class="btn btn-primary" id="crmNewOrganization" data-crm-permission="crm.organization.create"><svg><use href="#i-plus"/></svg>新建公司</button></div></header><section class="panel filter-panel ops-filter"><input class="control" id="orgKeyword" placeholder="搜索公司、简称、网站或联系人"><select class="control" id="orgRole"><option value="">全部角色</option>${Object.entries(roleLabels).map(([key,label]) => `<option value="${key}">${label}</option>`).join("")}</select><select class="control" id="orgLifecycle"><option value="">全部生命周期</option>${Object.entries(lifecycleLabels).map(([key,label]) => `<option value="${key}">${label}</option>`).join("")}</select><select class="control" id="orgFit"><option value="">全部 Fit</option><option value="HIGH">高</option><option value="MEDIUM">中</option><option value="LOW">低</option></select><select class="control" id="orgEngagement"><option value="">全部 Engagement</option><option value="HIGH">高</option><option value="MEDIUM">中</option><option value="LOW">低</option></select><select class="control" id="orgState"><option value="">全部活跃状态</option><option value="ACTIVE">活跃</option><option value="COOLING">降温</option><option value="DORMANT">沉睡</option></select><button class="btn btn-primary" id="orgSearch">查询</button></section><section class="content-card" id="organizationListContent"><div class="crm-detail-loading"><span class="crm-skeleton crm-skeleton-block"></span></div></section></div>`;
  const mapping = { orgKeyword: "keyword", orgRole: "role", orgLifecycle: "lifecycleStage", orgFit: "fitLevel", orgEngagement: "engagementLevel", orgState: "engagementState" };
  Object.entries(mapping).forEach(([id,key]) => { $(id).value = organizationFilters[key] || ""; });
  const refresh = async () => { Object.entries(mapping).forEach(([id,key]) => { organizationFilters[key] = $(id).value.trim(); }); await loadOrganizations(); };
  $("orgSearch").addEventListener("click", refresh); $("orgKeyword").addEventListener("keydown", (event) => { if (event.key === "Enter") refresh(); });
  $("crmNewOrganization")?.addEventListener("click", () => openOrganizationForm());
  $("crmImportOrganizations")?.addEventListener("click", () => context.openImport("ORGANIZATION"));
  $("crmExportOrganizations")?.addEventListener("click", () => context.openExport("ORGANIZATION"));
  try {
    const result = await crmApi(`/api/v1/crm/organizations?${organizationQuery()}`);
    context.state.organizations = result.data; context.setNavCount("organizations", result.meta.total);
    $("organizationListContent").innerHTML = `<div class="list-card-header"><div><h2>公司目录</h2><p>${result.meta.total} 条结果</p></div></div>${renderOrganizationTable(result.data)}`;
    bindOrganizationRows($("organizationListContent"), result.data);
  } catch (error) { $("organizationListContent").innerHTML = `<div class="crm-state crm-state-error">${esc(error.message)}</div>`; }
  context.applyCrmPermissions();
}

export async function loadVendors() {
  const view = $("vendorsView");
  view.innerHTML = `<div class="page ops-page"><header class="page-heading"><div><span class="eyebrow">Organization View · VENDOR</span><h1>供应商</h1><p>供应商是带 VENDOR 角色的公司，不创建重复主档。</p></div><button class="btn btn-primary" id="crmNewVendor" data-crm-permission="crm.organization.create"><svg><use href="#i-plus"/></svg>新建供应商</button></header><section class="content-card" id="vendorListContent"><div class="crm-detail-loading"><span class="crm-skeleton crm-skeleton-block"></span></div></section></div>`;
  $("crmNewVendor")?.addEventListener("click", () => openOrganizationForm(null, "VENDOR"));
  const result = await crmApi("/api/v1/crm/organizations?page=1&pageSize=100&role=VENDOR");
  $("vendorListContent").innerHTML = `<div class="list-card-header"><div><h2>供应商目录</h2><p>${result.meta.total} 家</p></div></div>${renderOrganizationTable(result.data, true)}`;
  bindOrganizationRows($("vendorListContent"), result.data); context.applyCrmPermissions();
}

function detailTab(key, label, active = false) { return `<button class="detail-tab${active ? " is-active" : ""}" data-org-tab="${key}">${label}</button>`; }
function detailPanel(key, content, active = false) { return `<div class="tab-panel${active ? " is-active" : ""}" data-org-panel="${key}"><section class="content-card">${content}</section></div>`; }

export async function openOrganization(id) {
  const view = $("organizationDetailView"); view.innerHTML = `<div class="crm-detail-loading"><span class="crm-skeleton crm-skeleton-block"></span></div>`;
  const [result, journeyResult, auditResult] = await Promise.all([crmApi(`/api/v1/crm/organizations/${id}`), crmApi(`/api/v1/crm/organizations/${id}/journey`), context.can("audit.view") ? crmApi("/api/v1/audit-logs?page=1&pageSize=100") : Promise.resolve({ data: [] })]);
  const organization = result.data; const journey = journeyResult.data;
  const orgAudits = auditResult.data.filter((item) => item.targetId === id || item.details?.organizationId === id);
  view.innerHTML = `<div class="crm-record v1-detail organization-detail"><header class="detail-top"><button class="back-button" id="backOrganizations"><svg><use href="#i-arrow"/></svg></button><div class="detail-identity">${logoMarkup(organization, "large")}<div><div class="detail-name-line"><h1>${esc(organization.name)}</h1>${organization.roleKeys.map((role) => badge(role, roleLabels[role])).join(" ")}</div><div class="detail-contact-row"><span>${esc(valueOrDash(organization.shortName))}</span><span>${esc(valueOrDash(organization.industry))}</span><span>${esc(valueOrDash(organization.owner?.name))}</span></div></div></div><div class="detail-top-actions"><button class="btn btn-primary" id="orgAddTask" data-crm-permission="crm.task.create"><svg><use href="#i-plus"/></svg>创建任务</button><button class="btn" id="orgStartNurture" data-crm-permission="crm.organization.nurture.manage">开始孵化</button><button class="btn" id="orgEdit" data-crm-permission="crm.organization.edit"><svg><use href="#i-edit"/></svg>编辑</button><button class="btn" id="orgDelete" data-crm-permission="crm.organization.delete"><svg><use href="#i-trash"/></svg>删除</button></div></header>
    <div class="customer-360-summary"><div><span>联系人</span><strong>${organization.contactCount}</strong></div><div><span>活跃线索</span><strong>${organization.activeLeadCount}</strong></div><div><span>最近互动</span><strong>${esc(formatLocalDateTime(organization.lastInteractionAt))}</strong></div><div><span>下一动作</span><strong>${esc(formatLocalDateTime(organization.nextActionAt))}</strong></div></div>
    <div class="detail-grid"><aside class="detail-column detail-side"><article class="content-card score-card"><div class="content-card-header"><h3>客户价值与活跃度</h3></div><div class="score-pair"><div><span>Fit</span><strong>${organization.fitScore}</strong>${badge(organization.fitLevel, levelLabels[organization.fitLevel])}</div><div><span>Engagement</span><strong>${organization.engagementScore}</strong>${badge(organization.engagementLevel, levelLabels[organization.engagementLevel])}</div></div><p class="score-reason">${esc(valueOrDash(organization.fitReason))}</p><div class="score-breakdown">${organization.engagementBreakdown.map((item) => `<span><b>${esc(item.label)}</b><em>${item.points > 0 ? "+" : ""}${esc(item.points)}</em></span>`).join("")}</div></article><article class="content-card customer-identity-card"><div class="content-card-header"><h3>公司资料</h3></div><div class="customer-identity-grid"><div><label>生命周期</label><strong>${esc(lifecycleLabels[organization.lifecycleStage])}</strong></div><div><label>活跃状态</label><strong>${esc(engagementStateLabels[organization.engagementState])}</strong></div><div><label>网站</label><strong>${esc(valueOrDash(organization.website))}</strong></div><div><label>地区</label><strong>${esc([organization.country, organization.region, organization.city].filter(Boolean).join(" · ") || "-")}</strong></div></div></article></aside>
    <section class="detail-column operations-main"><nav class="detail-tabs">${detailTab("overview","概览",true)}${detailTab("contacts",`联系人 ${organization.contacts.length}`)}${detailTab("leads",`线索 ${organization.leads.length}`)}${detailTab("journey","客户旅程")}${detailTab("tasks",`任务 ${organization.tasks.length}`)}${detailTab("files",`文件 ${organization.files.length}`)}${detailTab("notes","备注")}${detailTab("audit","审计")}</nav>
      ${detailPanel("overview",`<div class="list-card-header"><div><h2>公司概览</h2><p>${esc(valueOrDash(organization.note))}</p></div></div><div class="ops-summary-grid"><article><span>联系人覆盖</span><strong>${organization.contactCount}</strong></article><article><span>成交线索</span><strong>${organization.wonLeadCount}</strong></article><article><span>沉睡天数</span><strong>${esc(valueOrDash(organization.dormantDays))}</strong></article><article><span>下一任务</span><strong>${esc(organization.nextTask?.title || "-")}</strong></article></div>`,true)}
      ${detailPanel("contacts",`<div class="list-card-header"><h2>联系人</h2></div><div class="ops-record-list">${organization.contacts.map((item) => `<button data-contact-link="${item.id}"><strong>${esc(item.contactName)}</strong><span>${esc(item.title || item.email || "-")}</span><em>${item._count.leads} 条线索</em></button>`).join("") || "暂无联系人"}</div>`)}
      ${detailPanel("leads",`<div class="list-card-header"><h2>线索</h2></div><div class="ops-record-list">${organization.leads.map((item) => `<button data-lead-link="${item.id}"><strong>${esc(item.requirementSummary)}</strong><span>${esc(item.contact.contactName)}</span>${badge(item.status,item.status)}</button>`).join("") || "暂无线索"}</div>`)}
      ${detailPanel("journey",`<div class="list-card-header"><h2>Company Journey</h2></div><div class="journey-list">${journey.events.map((event) => `<article class="journey-event"><span class="journey-dot"></span><div class="journey-card"><header>${badge(event.type,event.title)}<time>${esc(formatLocalDateTime(event.occurredAt))}</time></header><p>${esc(event.summary)}</p></div></article>`).join("")}</div>`)}
      ${detailPanel("tasks",`<div class="list-card-header"><h2>任务</h2></div>${renderTaskCards(organization.tasks)}`)}
      ${detailPanel("files",`<div class="list-card-header"><h2>公司文件</h2><label class="btn btn-small" data-crm-permission="crm.organization.edit">上传文件<input id="orgFileInput" type="file" hidden></label></div><div class="ops-files">${organization.files.map((item) => `<a href="${esc(appUrl(`/api/v1/crm/organizations/${id}/attachments/${item.id}/download`))}" target="_blank"><svg><use href="#i-paperclip"/></svg>${esc(item.originalName)}</a>`).join("") || "暂无文件"}</div>`)}
      ${detailPanel("notes",`<div class="list-card-header"><h2>备注</h2></div><p class="ops-long-copy">${esc(valueOrDash(organization.note))}</p>`)}
      ${detailPanel("audit",`<div class="list-card-header"><h2>系统历史</h2></div><div class="activity-list">${orgAudits.map((item) => `<article class="activity-row"><span class="activity-icon"><svg><use href="#i-file"/></svg></span><strong>${esc(item.action)}</strong><span>${esc(item.actorName)}</span><time>${esc(formatLocalDateTime(item.createdAt))}</time></article>`).join("") || "暂无可见审计记录"}</div>`)}
    </section></div></div>`;
  $("backOrganizations").addEventListener("click", () => context.navigate("organizations"));
  $("orgEdit")?.addEventListener("click", () => openOrganizationForm(organization));
  $("orgAddTask")?.addEventListener("click", () => openTaskForm({ organizationId: id, label: organization.name, ownerUserId: organization.owner?.id }));
  $("orgStartNurture")?.addEventListener("click", () => openNurtureForm(organization));
  $("orgDelete")?.addEventListener("click", async () => { if (!await context.confirm("删除公司", `确认删除“${organization.name}”？存在联系人或活跃线索时系统会阻止删除。`, "确认删除")) return; try { await crmApi(`/api/v1/crm/organizations/${id}`, { method: "DELETE" }); context.notify("公司已删除"); context.navigate("organizations"); } catch (error) { context.notify(error.message); } });
  view.querySelectorAll("[data-org-tab]").forEach((button) => button.addEventListener("click", () => { view.querySelectorAll("[data-org-tab]").forEach((item) => item.classList.toggle("is-active", item === button)); view.querySelectorAll("[data-org-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.orgPanel === button.dataset.orgTab)); }));
  view.querySelectorAll("[data-contact-link]").forEach((button) => button.addEventListener("click", () => context.navigate(`contacts/${button.dataset.contactLink}`)));
  view.querySelectorAll("[data-lead-link]").forEach((button) => button.addEventListener("click", () => context.navigate(`leads/${button.dataset.leadLink}`)));
  $("orgFileInput")?.addEventListener("change", async (event) => { const file = event.target.files?.[0]; if (!file) return; const body = new FormData(); body.append("file", file, file.name); try { await crmApi(`/api/v1/crm/organizations/${id}/attachments/files`, { method: "POST", body }); context.notify("文件已上传"); openOrganization(id); } catch (error) { context.notify(error.message); } });
  bindTaskActions(view, organization.tasks); context.applyCrmPermissions();
}

function renderTaskCards(tasks) {
  return `<div class="task-queue">${tasks.map((task) => `<article class="task-card ${task.status === "OPEN" && new Date(task.dueAt) < new Date() ? "is-overdue" : ""}"><header><span>${badge(task.status, taskStatusLabels[task.status])}${task.priority === "HIGH" ? badge("HIGH","高优先") : ""}</span><time>${esc(formatLocalDateTime(task.dueAt))}</time></header><h3>${esc(task.title)}</h3><p>${esc(task.description || task.organization?.name || task.contact?.contactName || "-")}</p><footer><span>${esc(task.owner?.name || "-")}</span>${task.status === "OPEN" ? `<button class="btn btn-small" data-task-followup="${task.id}">新增跟进</button><button class="btn btn-small" data-task-postpone="${task.id}">顺延 1 天</button><button class="btn btn-primary btn-small" data-task-complete="${task.id}">完成</button>` : ""}</footer></article>`).join("") || `<div class="empty-state crm-compact-empty"><div><h3>暂无任务</h3></div></div>`}</div>`;
}

function bindTaskActions(container, tasks, refresh = null) {
  container.querySelectorAll("[data-task-complete]").forEach((button) => button.addEventListener("click", async () => { await crmApi(`/api/v1/crm/tasks/${button.dataset.taskComplete}/complete`, { method: "POST", body: "{}" }); context.notify("任务已完成"); await (refresh?.() || loadWorkbench()); }));
  container.querySelectorAll("[data-task-postpone]").forEach((button) => button.addEventListener("click", async () => { const task = tasks.find((item) => item.id === button.dataset.taskPostpone); const due = new Date(task.dueAt); due.setDate(due.getDate() + 1); await crmApi(`/api/v1/crm/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ dueAt: due.toISOString() }) }); context.notify("任务已顺延 1 天"); await (refresh?.() || loadWorkbench()); }));
  container.querySelectorAll("[data-task-followup]").forEach((button) => button.addEventListener("click", () => { const task = tasks.find((item) => item.id === button.dataset.taskFollowup); if (task.leadId) openFollowup({ kind: "lead", id: task.leadId, title: `${task.title} · 跟进`, currentTaskId: task.id, onSaved: refresh || loadWorkbench }); else if (task.contactId) openFollowup({ kind: "contact", id: task.contactId, title: `${task.title} · 互动`, currentTaskId: task.id, onSaved: refresh || loadWorkbench }); else context.notify("公司级任务请先选择联系人后记录互动"); }));
}

function openTaskForm(target) {
  taskTarget = target; const form = $("crmTaskForm"); form.reset();
  form.elements.ownerUserId.innerHTML = userOptions(target.ownerUserId || context.currentUserId()); form.elements.ownerUserId.value = target.ownerUserId || context.currentUserId();
  form.elements.dueAt.value = toDateTimeInput(new Date(Date.now() + 86_400_000)); $("crmTaskTargetLabel").textContent = target.label || "下一步行动"; $("crmTaskFormError").hidden = true; $("crmTaskDialog").showModal();
}

async function saveTask(event) {
  event.preventDefault(); if (!taskTarget) return; const form = event.currentTarget; const data = new FormData(form);
  const payload = { organizationId: taskTarget.organizationId || null, contactId: taskTarget.contactId || null, leadId: taskTarget.leadId || null, title: String(data.get("title") || "").trim(), description: String(data.get("description") || "").trim() || null, ownerUserId: String(data.get("ownerUserId") || ""), priority: String(data.get("priority") || "NORMAL"), dueAt: localDateTimeToIso(String(data.get("dueAt") || "")), source: "MANUAL" };
  try { await crmApi("/api/v1/crm/tasks", { method: "POST", body: JSON.stringify(payload) }); $("crmTaskDialog").close(); context.notify("任务已创建"); if (location.hash.includes("workbench")) loadWorkbench(); else if (taskTarget.organizationId) openOrganization(taskTarget.organizationId); } catch (error) { $("crmTaskFormError").textContent = error.message; $("crmTaskFormError").hidden = false; }
}

function openNurtureForm(organization) {
  nurtureOrganization = organization; const form = $("crmNurtureForm"); form.reset(); form.elements.ownerUserId.innerHTML = userOptions(organization.owner?.id || context.currentUserId()); form.elements.ownerUserId.value = organization.owner?.id || context.currentUserId(); form.elements.cadenceDays.value = "14"; form.elements.nextTouchAt.value = toDateTimeInput(new Date(Date.now() + 14 * 86_400_000)); $("crmNurtureTargetLabel").textContent = organization.name; $("crmNurtureFormError").hidden = true; $("crmNurtureDialog").showModal();
}

async function saveNurture(event) {
  event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
  const payload = { ownerUserId: String(data.get("ownerUserId") || ""), reason: String(data.get("reason") || "").trim(), objective: String(data.get("objective") || "").trim(), cadenceDays: Number(data.get("cadenceDays")), nextTouchAt: localDateTimeToIso(String(data.get("nextTouchAt") || "")), touchTopic: String(data.get("touchTopic") || "").trim() };
  try { await crmApi(`/api/v1/crm/organizations/${nurtureOrganization.id}/nurtures`, { method: "POST", body: JSON.stringify(payload) }); $("crmNurtureDialog").close(); context.notify("孵化计划与下一触达任务已创建"); if (location.hash.includes("operations")) loadCustomerOperations(); else openOrganization(nurtureOrganization.id); } catch (error) { $("crmNurtureFormError").textContent = error.message; $("crmNurtureFormError").hidden = false; }
}

export async function loadWorkbench() {
  const view = $("workbenchView"); view.innerHTML = `<div class="page ops-page"><header class="page-heading"><div><span class="eyebrow">Daily Execution</span><h1>我的工作台</h1><p>今天要联系谁、为什么联系、下一步做什么。</p></div><button class="btn btn-primary" id="newStandaloneTask"><svg><use href="#i-plus"/></svg>创建任务</button></header><section class="content-card"><div class="crm-detail-loading"><span class="crm-skeleton crm-skeleton-block"></span></div></section></div>`;
  const result = await crmApi("/api/v1/crm/tasks?page=1&pageSize=200&status=OPEN"); const tasks = result.data; const now = new Date(); const endToday = new Date(); endToday.setHours(23,59,59,999); const next7 = new Date(now.getTime() + 7 * 86_400_000);
  view.querySelector(".content-card").innerHTML = `<div class="workbench-metrics"><article><span>已逾期</span><strong>${tasks.filter((task) => new Date(task.dueAt) < now).length}</strong></article><article><span>今天</span><strong>${tasks.filter((task) => new Date(task.dueAt) >= now && new Date(task.dueAt) <= endToday).length}</strong></article><article><span>未来 7 天</span><strong>${tasks.filter((task) => new Date(task.dueAt) > endToday && new Date(task.dueAt) <= next7).length}</strong></article><article><span>高优先</span><strong>${tasks.filter((task) => task.priority === "HIGH").length}</strong></article></div><div class="list-card-header"><div><h2>Task Queue</h2><p>逾期优先，其次按到期时间与优先级</p></div></div>${renderTaskCards(tasks)}`;
  bindTaskActions(view, tasks, loadWorkbench); $("newStandaloneTask").addEventListener("click", () => context.notify("请从公司、联系人或线索创建任务，以保证任务有关联对象"));
}

export async function loadCustomerOperations() {
  const view = $("customerOperationsView"); view.innerHTML = `<div class="page ops-page"><header class="page-heading"><div><span class="eyebrow">Customer Operations</span><h1>客户运营</h1><p>从评分进入重点跟进、孵化与唤醒，并直接执行下一步。</p></div></header><nav class="detail-tabs ops-main-tabs"><button data-ops-tab="priority">重点跟进</button><button data-ops-tab="nurture">孵化池</button><button data-ops-tab="reactivation">待唤醒</button><button data-ops-tab="dormant">沉睡客户</button></nav><section class="content-card" id="operationsContent"><div class="crm-detail-loading"><span class="crm-skeleton crm-skeleton-block"></span></div></section></div>`;
  view.querySelectorAll("[data-ops-tab]").forEach((button) => { button.classList.toggle("is-active", button.dataset.opsTab === operationsTab); button.addEventListener("click", () => { operationsTab = button.dataset.opsTab; loadCustomerOperations(); }); });
  const [orgResult, nurtureResult] = await Promise.all([crmApi("/api/v1/crm/organizations?page=1&pageSize=100"), crmApi("/api/v1/crm/nurtures")]); const organizations = orgResult.data; const nurtures = nurtureResult.data;
  if (operationsTab === "nurture") {
    $("operationsContent").innerHTML = `<div class="list-card-header"><div><h2>孵化池</h2><p>每个计划都有原因、目标、节奏、负责人、下一触达与主题</p></div></div><div class="nurture-grid">${nurtures.map((item) => `<article class="nurture-card"><header>${badge(item.status,item.status)}<time>${esc(formatLocalDateTime(item.nextTouchAt))}</time></header><h3>${esc(item.organization.name)}</h3><dl><div><dt>为什么</dt><dd>${esc(item.reason)}</dd></div><div><dt>目标</dt><dd>${esc(item.objective)}</dd></div><div><dt>下次主题</dt><dd>${esc(item.touchTopic)}</dd></div><div><dt>负责人 / 节奏</dt><dd>${esc(item.owner.name)} · ${item.cadenceDays} 天</dd></div></dl><footer>${item.status === "ACTIVE" ? `<button class="btn btn-small" data-nurture-pause="${item.id}">暂停</button><button class="btn btn-primary btn-small" data-nurture-complete="${item.id}">完成</button>` : `<button class="btn btn-small" data-nurture-resume="${item.id}">恢复</button>`}<button class="btn btn-small" data-view-org="${item.organizationId}">查看公司</button></footer></article>`).join("") || "暂无孵化计划"}</div>`;
    $("operationsContent").querySelectorAll("[data-nurture-pause],[data-nurture-complete],[data-nurture-resume]").forEach((button) => button.addEventListener("click", async () => { const id = button.dataset.nurturePause || button.dataset.nurtureComplete || button.dataset.nurtureResume; const status = button.dataset.nurturePause ? "PAUSED" : button.dataset.nurtureComplete ? "COMPLETED" : "ACTIVE"; await crmApi(`/api/v1/crm/nurtures/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); loadCustomerOperations(); }));
    $("operationsContent").querySelectorAll("[data-view-org]").forEach((button) => button.addEventListener("click", () => context.navigate(`organizations/${button.dataset.viewOrg}`)));
    return;
  }
  const rows = operationsTab === "priority" ? organizations.filter((item) => item.fitLevel === "HIGH" && item.engagementLevel === "HIGH") : organizations.filter((item) => item.engagementState === "DORMANT" && (operationsTab === "dormant" || item.fitScore >= 70));
  const title = operationsTab === "priority" ? "重点跟进" : operationsTab === "reactivation" ? "待唤醒" : "沉睡客户";
  $("operationsContent").innerHTML = `<div class="list-card-header"><div><h2>${title}</h2><p>${operationsTab === "priority" ? "高 Fit + 高 Engagement，优先推进" : "基于互动时间动态计算，不保存永久沉睡标记"}</p></div></div>${renderOrganizationTable(rows)}`;
  bindOrganizationRows($("operationsContent"), rows);
}

function analyticsQuery(days = 30) { const to = new Date(); const from = new Date(to.getTime() - days * 86_400_000); return new URLSearchParams({ from: from.toISOString(), to: to.toISOString() }); }

export async function loadDashboard() {
  const view = $("dashboardView"); const management = context.can("crm.dashboard.management.view");
  view.innerHTML = `<div class="page ops-page dashboard-page"><header class="page-heading"><div><span class="eyebrow">Management Overview</span><h1>Dashboard</h1><p>用非金额指标判断客户资产、机会推进与团队执行是否健康。</p></div><div class="dashboard-filters"><select class="control" id="dashboardPeriod"><option value="7">近 7 天</option><option value="30" selected>近 30 天</option><option value="90">近 90 天</option></select>${management ? `<select class="control" id="dashboardOwner"><option value="">全部负责人</option>${context.getUsers().map((user) => `<option value="${user.id}">${esc(user.name)}</option>`).join("")}</select>` : ""}<select class="control" id="dashboardRole"><option value="">潜客 + 客户</option><option value="PROSPECT">潜在客户</option><option value="CUSTOMER">客户</option></select></div></header><div id="dashboardContent"><div class="crm-detail-loading"><span class="crm-skeleton crm-skeleton-block"></span></div></div></div>`;
  const refresh = async () => { const params = analyticsQuery(Number($("dashboardPeriod").value)); if (management && $("dashboardOwner").value) params.set("ownerUserId", $("dashboardOwner").value); if ($("dashboardRole").value) params.set("organizationRole", $("dashboardRole").value); const [analyticsResult,matrixResult,teamResult] = await Promise.all([crmApi(`/api/v1/crm/analytics/${management ? "management" : "self"}?${params}`), crmApi(`/api/v1/crm/analytics/fit-engagement-matrix?${params}`), management ? crmApi(`/api/v1/crm/analytics/team?${params}`) : Promise.resolve({ data: { rows: [] } })]); renderDashboard(analyticsResult.data,matrixResult.data,teamResult.data); };
  $("dashboardPeriod").addEventListener("change", refresh); $("dashboardOwner")?.addEventListener("change", refresh); $("dashboardRole").addEventListener("change", refresh); await refresh();
}

function renderDashboard(data, matrix, team) {
  const kpiDefs = [["activeOrganizations","活跃公司"],["activeLeads","活跃线索"],["newLeads","新增线索"],["reactivationCandidates","待唤醒公司"],["overdueTasks","逾期任务"],["staleLeads","停滞线索"]];
  const maxPipeline = Math.max(1,...data.pipeline.map((item) => item.count));
  $("dashboardContent").innerHTML = `<section class="dashboard-kpis">${kpiDefs.map(([key,label]) => `<article class="metric-card"><span>${label}</span><strong>${data.kpis[key]}</strong></article>`).join("")}</section><section class="dashboard-grid"><article class="content-card"><div class="list-card-header"><div><h2>Fit × Engagement</h2><p>点击矩阵进入相应公司筛选</p></div></div><div class="fit-matrix">${matrix.cells.map((cell) => `<button data-matrix-fit="${cell.fitLevel}" data-matrix-engagement="${cell.engagementLevel}" class="matrix-${cell.key.toLowerCase()}"><span>${esc(cell.label)}</span><strong>${cell.count}</strong><small>公司</small></button>`).join("")}</div></article><article class="content-card"><div class="list-card-header"><div><h2>Pipeline</h2><p>当前活跃阶段；Won/Lost 为所选期间关闭数量</p></div></div><div class="pipeline-bars">${data.pipeline.map((item) => `<div><span>${esc(item.status)}</span><i><b style="width:${item.count / maxPipeline * 100}%"></b></i><strong>${item.count}</strong></div>`).join("")}</div></article><article class="content-card"><div class="list-card-header"><h2>执行健康</h2></div><div class="ops-summary-grid compact"><article><span>Win Rate</span><strong>${data.execution.winRate.percent}%</strong><small>${data.execution.winRate.numerator}/${data.execution.winRate.denominator}</small></article><article><span>平均销售周期</span><strong>${data.execution.averageSalesCycleDays} 天</strong></article><article><span>下一动作覆盖</span><strong>${data.execution.nextActionCoverage.percent}%</strong></article><article><span>任务完成率</span><strong>${data.execution.followupCompletion.percent}%</strong></article><article><span>客户覆盖率</span><strong>${data.execution.customerCoverage.percent}%</strong></article><article><span>孵化转线索</span><strong>${data.execution.nurtureConversion.percent}%</strong></article><article><span>唤醒公司</span><strong>${data.execution.reactivation.count}</strong></article><article><span>高 Fit 未触达</span><strong>${data.execution.highFitUntouched}</strong></article></div></article><article class="content-card"><div class="list-card-header"><h2>Lifecycle Distribution</h2></div><div class="pipeline-bars">${data.lifecycle.map((item) => `<div><span>${esc(lifecycleLabels[item.stage])}</span><i><b style="width:${item.count / Math.max(1,...data.lifecycle.map((row) => row.count)) * 100}%"></b></i><strong>${item.count}</strong></div>`).join("")}</div></article></section>${team.rows.length ? `<section class="content-card team-table-card"><div class="list-card-header"><div><h2>Team Execution</h2><p>按人员查看任务、互动、活跃与停滞；不含金额排名</p></div></div><div class="crm-table-scroll"><table class="crm-data-table"><thead><tr><th>成员</th><th>Open</th><th>Done</th><th>Overdue</th><th>On-time</th><th>互动</th><th>Active Leads</th><th>Stale</th><th>有下一动作</th></tr></thead><tbody>${team.rows.map((row) => `<tr><td><strong>${esc(row.user.name)}</strong></td><td>${row.openTasks}</td><td>${row.doneTasks}</td><td>${row.overdueTasks}</td><td>${row.onTimeCompletionPercent}%</td><td>${row.interactions}</td><td>${row.activeLeads}</td><td>${row.staleLeads}</td><td>${row.leadsWithNextActionPercent}%</td></tr>`).join("")}</tbody></table></div></section>` : ""}`;
  $("dashboardContent").querySelectorAll("[data-matrix-fit]").forEach((button) => button.addEventListener("click", () => { organizationFilters = { fitLevel: button.dataset.matrixFit, engagementLevel: button.dataset.matrixEngagement }; context.navigate("organizations"); }));
}
