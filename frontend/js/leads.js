"use strict";

import { $, crmApi, dateRangeForPreset, displayValue, esc, formatLocalDateTime, friendlyError, renderErrorMarkup, setButtonBusy } from "./api.js";
import { applyFieldErrors, formPayload, LEAD_FIELDS, LEAD_PRIORITIES, LEAD_STATUSES, leadPriorityLabel, leadStatusLabel, renderFormSections, validateLeadPayload } from "./field-definitions.js";
import { openFollowup, renderTimelineMarkup } from "./followups.js";

let context;
let selectedContact = null;
let editingLead = null;
let lockedContact = false;
let contactSearchTimer;
const listState = { page: 1, pageSize: 20, pageCount: 1, total: 0 };

export function buildLeadQuery(filters, page = 1, now = new Date()) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(filters.pageSize || 20), orderBy: "updatedAt_desc" });
  for (const key of ["keyword", "contactId", "status", "priority", "salesOwnerUserId", "followupOwnerUserId"]) {
    if (filters[key]) params.set(key, String(filters[key]).trim());
  }
  for (const [key, value] of Object.entries(dateRangeForPreset(filters.nextFollowup, now))) params.set(key, value);
  return params;
}

export function quoteDisplay(lead) {
  if (lead.estimatedQuote === null || lead.estimatedQuote === undefined || lead.estimatedQuote === "") return "-";
  return `${lead.currency || ""} ${String(lead.estimatedQuote)}`.trim();
}

export function readonlyContactMarkup(contact, compact = false) {
  if (!contact) return "";
  return `<div class="crm-readonly-contact${compact ? " is-compact" : ""}"><header><div><span>所属客户联系人 · 只读</span><strong>${esc(contact.contactName)}</strong></div><span class="crm-lock-label"><svg><use href="#i-lock"/></svg>系统自动关联</span></header><div class="crm-readonly-grid"><div><span>公司</span><strong>${esc(contact.companyShortName || contact.companyName || "-")}</strong></div><div><span>职位</span><strong>${esc(contact.title || "-")}</strong></div><div><span>电子邮箱</span><strong>${esc(contact.email || "-")}</strong></div><div><span>电话</span><strong>${esc(contact.phone || "-")}</strong></div><div><span>行业</span><strong>${esc(contact.industry || "-")}</strong></div><div><span>国家 / 城市</span><strong>${esc([contact.country, contact.city].filter(Boolean).join(" / ") || "-")}</strong></div></div></div>`;
}

export function initializeLeads(options) {
  context = options;
  $("crmLeadsView").innerHTML = `<div class="crm-page">
    <header class="crm-page-header"><div><span class="crm-eyebrow">需求管理</span><h1>线索</h1></div><div class="crm-page-actions"><button class="btn btn-quiet" id="crmImportLeads" type="button" data-crm-permission="crm.lead.import"><svg><use href="#i-upload"/></svg>导入</button><button class="btn btn-quiet" id="crmExportLeads" type="button" data-crm-permission="crm.lead.export"><svg><use href="#i-download"/></svg>导出</button><button class="btn btn-primary" id="crmNewLead" type="button" data-crm-permission="crm.lead.create"><svg><use href="#i-plus"/></svg>新建线索</button></div></header>
    <section class="crm-filter-bar crm-lead-filters" aria-label="线索筛选">
      <label class="crm-search"><svg><use href="#i-search"/></svg><input id="crmLeadKeyword" type="search" placeholder="搜索项目需求、联系人或公司"></label>
      <label><span class="sr-only">状态</span><select id="crmLeadStatus"><option value="">全部状态</option>${LEAD_STATUSES.map((item) => `<option value="${item.value}">${esc(item.label)}</option>`).join("")}</select></label>
      <label><span class="sr-only">优先级</span><select id="crmLeadPriority"><option value="">全部优先级</option>${LEAD_PRIORITIES.map((item) => `<option value="${item.value}">${esc(item.label)}</option>`).join("")}</select></label>
      <label><span class="sr-only">销售负责人</span><select id="crmLeadSalesOwner"><option value="">全部销售负责人</option></select></label>
      <label><span class="sr-only">跟进负责人</span><select id="crmLeadFollowupOwner"><option value="">全部跟进负责人</option></select></label>
      <label><span class="sr-only">下次跟进</span><select id="crmLeadNext"><option value="">全部跟进日期</option><option value="overdue">已逾期</option><option value="today">今天</option><option value="next7">未来 7 天</option></select></label>
      <button class="crm-icon-button" id="crmSearchLeads" type="button" title="查询" aria-label="查询线索"><svg><use href="#i-search"/></svg></button>
      <button class="btn btn-quiet btn-small" id="crmResetLeads" type="button">重置</button>
    </section>
    <section class="crm-table-section" aria-labelledby="crmLeadTableTitle">
      <header><div><h2 id="crmLeadTableTitle">线索目录</h2><span id="crmLeadResultCount">0 条</span></div></header>
      <div id="crmLeadListState" class="crm-list-state"></div>
      <div class="crm-table-scroll" id="crmLeadTableWrap"><table class="crm-data-table crm-lead-table"><thead><tr><th>项目需求简述</th><th>客户联系人 / 公司</th><th>状态</th><th>优先级</th><th>销售负责人</th><th>跟进负责人</th><th>下次跟进</th><th>最近跟进</th><th>预计报价</th><th>更新时间</th></tr></thead><tbody id="crmLeadRows"></tbody></table></div>
      <div class="crm-empty" id="crmLeadEmpty" hidden><svg><use href="#i-lead"/></svg><h3>暂无线索</h3><p>创建线索后，可集中维护需求、负责人和跟进记录。</p><button class="btn btn-primary" id="crmEmptyNewLead" type="button" data-crm-permission="crm.lead.create"><svg><use href="#i-plus"/></svg>新建线索</button></div>
      <footer class="crm-pagination" id="crmLeadPagination"><span id="crmLeadPageSummary">共 0 条</span><div><button class="crm-icon-button" id="crmLeadPrev" type="button" title="上一页" aria-label="上一页"><svg><use href="#i-arrow"/></svg></button><span id="crmLeadPageNumber">1 / 1</span><button class="crm-icon-button crm-next-button" id="crmLeadNextPage" type="button" title="下一页" aria-label="下一页"><svg><use href="#i-arrow"/></svg></button></div></footer>
    </section>
  </div>`;
  $("crmLeadDetailView").innerHTML = '<div class="crm-detail-loading"><span class="crm-skeleton crm-skeleton-title"></span><span class="crm-skeleton crm-skeleton-line"></span></div>';
  document.body.insertAdjacentHTML("beforeend", `<aside class="crm-drawer" id="crmLeadDrawer" aria-hidden="true">
    <button class="crm-drawer-backdrop" type="button" data-close-lead-form aria-label="关闭线索表单"></button>
    <form class="crm-drawer-panel" id="crmLeadForm" novalidate>
      <header class="crm-drawer-header"><div><span class="crm-eyebrow">线索</span><h2 id="crmLeadFormTitle">新建线索</h2></div><button class="crm-icon-button" type="button" data-close-lead-form aria-label="关闭"><svg><use href="#i-x"/></svg></button></header>
      <div class="crm-drawer-body">
        <section class="crm-contact-picker" id="crmLeadContactPicker"><header><h3>选择客户联系人</h3><span>必选</span></header><label class="crm-search"><svg><use href="#i-search"/></svg><input id="crmLeadContactKeyword" type="search" placeholder="搜索联系人、公司、电子邮箱或电话"></label><div class="crm-contact-options" id="crmLeadContactOptions"></div></section>
        <div id="crmSelectedContact"></div>
        <div id="crmLeadFormFields"></div>
        <div class="crm-form-message" id="crmLeadFormError" role="alert" hidden></div>
      </div>
      <footer class="crm-drawer-footer"><button class="btn" type="button" data-close-lead-form>取消</button><button class="btn btn-primary" id="crmSaveLead" type="submit">保存线索</button></footer>
    </form>
  </aside>`);

  $("crmNewLead").addEventListener("click", () => openLeadForm());
  $("crmImportLeads").addEventListener("click", () => context.openImport("CRM_LEAD"));
  $("crmExportLeads").addEventListener("click", () => context.openExport("CRM_LEAD"));
  $("crmEmptyNewLead").addEventListener("click", () => openLeadForm());
  $("crmSearchLeads").addEventListener("click", () => loadLeads(1));
  $("crmLeadKeyword").addEventListener("keydown", (event) => { if (event.key === "Enter") loadLeads(1); });
  for (const id of ["crmLeadStatus", "crmLeadPriority", "crmLeadSalesOwner", "crmLeadFollowupOwner", "crmLeadNext"]) $(id).addEventListener("change", () => loadLeads(1));
  $("crmResetLeads").addEventListener("click", () => {
    for (const id of ["crmLeadKeyword", "crmLeadStatus", "crmLeadPriority", "crmLeadSalesOwner", "crmLeadFollowupOwner", "crmLeadNext"]) $(id).value = "";
    loadLeads(1);
  });
  $("crmLeadPrev").addEventListener("click", () => loadLeads(Math.max(1, listState.page - 1)));
  $("crmLeadNextPage").addEventListener("click", () => loadLeads(Math.min(listState.pageCount, listState.page + 1)));
  $("crmLeadContactKeyword").addEventListener("input", () => {
    clearTimeout(contactSearchTimer);
    contactSearchTimer = setTimeout(() => searchContacts($("crmLeadContactKeyword").value), 220);
  });
  document.querySelectorAll("[data-close-lead-form]").forEach((button) => button.addEventListener("click", closeLeadForm));
  $("crmLeadForm").addEventListener("submit", saveLead);
}

export function syncLeadUsers() {
  for (const id of ["crmLeadSalesOwner", "crmLeadFollowupOwner"]) {
    if (!$(id)) continue;
    const value = $(id).value;
    const label = id === "crmLeadSalesOwner" ? "全部销售负责人" : "全部跟进负责人";
    $(id).innerHTML = `<option value="">${label}</option>${context.getUsers().map((user) => `<option value="${esc(user.id)}">${esc(user.name)}</option>`).join("")}`;
    $(id).value = value;
  }
}

function currentFilters() {
  return {
    keyword: $("crmLeadKeyword").value.trim(), status: $("crmLeadStatus").value, priority: $("crmLeadPriority").value,
    salesOwnerUserId: $("crmLeadSalesOwner").value, followupOwnerUserId: $("crmLeadFollowupOwner").value,
    nextFollowup: $("crmLeadNext").value, pageSize: listState.pageSize,
  };
}

function setLeadListLoading() {
  $("crmLeadListState").innerHTML = "";
  $("crmLeadEmpty").hidden = true;
  $("crmLeadTableWrap").hidden = false;
  $("crmLeadRows").innerHTML = Array.from({ length: 6 }, () => '<tr class="crm-skeleton-row"><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td></tr>').join("");
  $("crmLeadTableWrap").setAttribute("aria-busy", "true");
}

export async function loadLeads(page = listState.page) {
  setLeadListLoading();
  const params = buildLeadQuery(currentFilters(), page);
  try {
    const result = await crmApi(`/api/v1/crm/leads?${params}`);
    Object.assign(listState, { page: result.meta.page, pageCount: Math.max(1, result.meta.pageCount), total: result.meta.total });
    renderLeadRows(result.data);
    renderLeadPagination();
    context.setNavCount("leads", result.meta.total);
    return result;
  } catch (error) {
    $("crmLeadRows").innerHTML = "";
    $("crmLeadTableWrap").hidden = true;
    $("crmLeadPagination").hidden = true;
    $("crmLeadListState").innerHTML = renderErrorMarkup(error, "crmRetryLeads");
    $("crmRetryLeads")?.addEventListener("click", () => loadLeads(page));
    throw error;
  } finally {
    $("crmLeadTableWrap").removeAttribute("aria-busy");
  }
}

function renderLeadRows(rows) {
  $("crmLeadResultCount").textContent = `${listState.total} 条`;
  $("crmLeadRows").innerHTML = rows.map((lead) => `<tr data-crm-lead-id="${esc(lead.id)}" tabindex="0">
    <td><strong>${esc(lead.requirementSummary)}</strong><small>${esc(lead.projectType || lead.projectDomain || "-")}</small></td>
    <td><strong>${esc(lead.contact.contactName)}</strong><small>${esc(lead.contact.companyShortName || lead.contact.companyName || "-")}</small></td>
    <td><span class="crm-badge crm-status-${esc(lead.status.toLowerCase())}">${esc(leadStatusLabel(lead.status))}</span></td>
    <td><span class="crm-badge crm-priority-${esc(lead.priority.toLowerCase())}">${esc(leadPriorityLabel(lead.priority))}</span></td>
    <td>${esc(lead.salesOwner?.name || "-")}</td><td>${esc(lead.followupOwner?.name || "-")}</td>
    <td>${esc(formatLocalDateTime(lead.nextFollowupAt))}</td><td>${esc(formatLocalDateTime(lead.lastFollowupAt))}</td><td>${esc(quoteDisplay(lead))}</td><td>${esc(formatLocalDateTime(lead.updatedAt))}</td>
  </tr>`).join("");
  $("crmLeadTableWrap").hidden = rows.length === 0;
  $("crmLeadEmpty").hidden = rows.length > 0;
  $("crmLeadPagination").hidden = rows.length === 0;
  $("crmLeadListState").innerHTML = "";
  $("crmLeadRows").querySelectorAll("[data-crm-lead-id]").forEach((row) => {
    const open = () => context.navigate(`leads/${row.dataset.crmLeadId}`);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) open(); });
  });
  context.applyCrmPermissions();
}

function renderLeadPagination() {
  $("crmLeadPageSummary").textContent = `共 ${listState.total} 条`;
  $("crmLeadPageNumber").textContent = `${listState.page} / ${listState.pageCount}`;
  $("crmLeadPrev").disabled = listState.page <= 1;
  $("crmLeadNextPage").disabled = listState.page >= listState.pageCount;
}

function detailField(label, value, wide = false) {
  return `<div class="crm-description${wide ? " crm-description-wide" : ""}"><span>${esc(label)}</span><strong>${esc(displayValue(value))}</strong></div>`;
}

function requirementMarkup(lead) {
  return [
    detailField("项目需求简述", lead.requirementSummary, true), detailField("需求整理 / 详细需求", lead.requirementDetail, true),
    detailField("最近进展", lead.latestProgress, true), detailField("预计报价", quoteDisplay(lead)), detailField("项目领域", lead.projectDomain),
    detailField("项目类型", lead.projectType), detailField("技术类型", lead.technologyType), detailField("产品类型", lead.productType),
    detailField("产品名称", lead.productName), detailField("资源需求", lead.resourceRequirement, true), detailField("方案", lead.solution, true), detailField("备注", lead.remark, true),
  ].join("");
}

function followupSettingsMarkup(lead) {
  return [
    detailField("销售负责人", lead.salesOwner?.name), detailField("跟进负责人", lead.followupOwner?.name),
    detailField("下一次跟进", formatLocalDateTime(lead.nextFollowupAt)), detailField("最近一次跟进", formatLocalDateTime(lead.lastFollowupAt)),
  ].join("");
}

export async function openLead(id) {
  const container = $("crmLeadDetailView");
  container.innerHTML = '<div class="crm-detail-loading"><span class="crm-skeleton crm-skeleton-title"></span><span class="crm-skeleton crm-skeleton-line"></span><span class="crm-skeleton crm-skeleton-block"></span></div>';
  try {
    const [detailResult, followupResult] = await Promise.all([
      crmApi(`/api/v1/crm/leads/${id}`),
      context.can("crm.lead_followup.view") ? crmApi(`/api/v1/crm/leads/${id}/followups?page=1&pageSize=50`) : Promise.resolve({ data: [], meta: { total: 0 } }),
    ]);
    const lead = detailResult.data;
    context.state.currentCrmLead = lead;
    container.innerHTML = `<div class="crm-record">
      <header class="crm-record-header"><button class="crm-icon-button" id="crmBackToLeads" type="button" title="返回线索" aria-label="返回线索"><svg><use href="#i-arrow"/></svg></button><div class="crm-record-title"><span class="crm-eyebrow">线索</span><h1>${esc(lead.requirementSummary)}</h1><p>${esc(lead.contact.contactName)} · ${esc(lead.contact.companyShortName || lead.contact.companyName || "-")}</p></div><span class="crm-badge crm-status-${esc(lead.status.toLowerCase())}">${esc(leadStatusLabel(lead.status))}</span><span class="crm-badge crm-priority-${esc(lead.priority.toLowerCase())}">${esc(leadPriorityLabel(lead.priority))}</span><div class="crm-record-actions"><button class="btn" id="crmEditLead" type="button" data-crm-permission="crm.lead.edit"><svg><use href="#i-edit"/></svg>编辑线索</button></div></header>
      <section class="crm-record-band"><header><div><h2>需求信息</h2></div></header><div class="crm-description-grid">${requirementMarkup(lead)}</div></section>
      <section class="crm-record-band"><header><div><h2>跟进信息</h2><small>${followupResult.meta.total} 条记录</small></div><button class="btn btn-small" id="crmAddLeadFollowup" type="button" data-crm-permission="crm.lead_followup.create"><svg><use href="#i-plus"/></svg>新增跟进</button></header><div class="crm-description-grid crm-followup-settings">${followupSettingsMarkup(lead)}</div><div class="crm-timeline">${renderTimelineMarkup(followupResult.data, "lead")}</div></section>
      <section class="crm-record-band"><header><div><h2>所属客户联系人</h2><small>自动关联字段 · 只读</small></div><button class="btn btn-small" id="crmViewLeadContact" type="button">查看联系人<svg class="crm-forward-icon"><use href="#i-chevron"/></svg></button></header>${readonlyContactMarkup(lead.contact, true)}</section>
    </div>`;
    $("crmBackToLeads").addEventListener("click", () => context.navigate("leads"));
    $("crmEditLead").addEventListener("click", () => openLeadForm(lead.contact, lead));
    $("crmAddLeadFollowup").addEventListener("click", () => openFollowup({ kind: "lead", id: lead.id, title: "新增线索跟进", onSaved: () => openLead(lead.id) }));
    $("crmViewLeadContact").addEventListener("click", () => context.navigate(`contacts/${lead.contact.id}`));
    context.applyCrmPermissions();
    return lead;
  } catch (error) {
    container.innerHTML = `<div class="crm-detail-error">${renderErrorMarkup(error, "crmRetryLeadDetail")}<button class="btn" id="crmErrorBackLeads" type="button"><svg><use href="#i-arrow"/></svg>返回线索</button></div>`;
    $("crmRetryLeadDetail")?.addEventListener("click", () => openLead(id));
    $("crmErrorBackLeads")?.addEventListener("click", () => context.navigate("leads"));
    throw error;
  }
}

export async function openLeadForm(contact = null, lead = null) {
  editingLead = lead;
  selectedContact = contact || lead?.contact || null;
  lockedContact = Boolean(contact || lead);
  $("crmLeadFormTitle").textContent = lead ? "编辑线索" : "新建线索";
  $("crmLeadContactKeyword").value = "";
  $("crmLeadContactPicker").hidden = Boolean(selectedContact);
  $("crmSelectedContact").innerHTML = selectedContact ? readonlyContactMarkup(selectedContact) : "";
  $("crmLeadFormFields").innerHTML = renderFormSections(LEAD_FIELDS, lead || { priority: "MEDIUM", status: "NEW", currency: "CNY", salesOwnerUserId: context.currentUserId(), followupOwnerUserId: context.currentUserId() }, context.getUsers(), {
    requirement: "需求信息",
    project: "项目与报价",
    solution: "需求与方案",
    followup: "跟进设置",
  });
  $("crmLeadFormError").hidden = true;
  $("crmLeadDrawer").classList.add("is-open");
  $("crmLeadDrawer").setAttribute("aria-hidden", "false");
  if (!selectedContact) await searchContacts("");
  setTimeout(() => (selectedContact ? $("crmLeadForm").elements.requirementSummary : $("crmLeadContactKeyword")).focus(), 30);
}

async function searchContacts(keyword) {
  const params = new URLSearchParams({ page: "1", pageSize: "20", orderBy: "updatedAt_desc" });
  if (keyword.trim()) params.set("keyword", keyword.trim());
  $("crmLeadContactOptions").innerHTML = '<div class="crm-inline-loading">正在加载联系人…</div>';
  try {
    const result = await crmApi(`/api/v1/crm/contacts?${params}`);
    $("crmLeadContactOptions").innerHTML = result.data.length ? result.data.map((contact) => `<button class="crm-contact-option" type="button" data-picker-contact="${esc(contact.id)}"><span><strong>${esc(contact.contactName)}</strong><small>${esc(contact.companyShortName || contact.companyName || "-")}</small></span><span>${esc(contact.email || contact.phone || "-")}</span><svg><use href="#i-chevron"/></svg></button>`).join("") : '<div class="crm-inline-empty">没有匹配的客户联系人</div>';
    $("crmLeadContactOptions").querySelectorAll("[data-picker-contact]").forEach((button) => button.addEventListener("click", () => selectContact(result.data.find((item) => item.id === button.dataset.pickerContact))));
  } catch (error) {
    const copy = friendlyError(error);
    $("crmLeadContactOptions").innerHTML = `<div class="crm-inline-empty">${esc(copy.message)}</div>`;
  }
}

function selectContact(contact) {
  selectedContact = contact;
  lockedContact = false;
  $("crmLeadContactPicker").hidden = true;
  $("crmSelectedContact").innerHTML = `${readonlyContactMarkup(contact)}<button class="btn btn-small crm-change-contact" id="crmChangeLeadContact" type="button">更换联系人</button>`;
  $("crmChangeLeadContact").addEventListener("click", async () => {
    if (lockedContact || editingLead) return;
    selectedContact = null;
    $("crmSelectedContact").innerHTML = "";
    $("crmLeadContactPicker").hidden = false;
    await searchContacts($("crmLeadContactKeyword").value);
  });
}

function closeLeadForm() {
  $("crmLeadDrawer")?.classList.remove("is-open");
  $("crmLeadDrawer")?.setAttribute("aria-hidden", "true");
  editingLead = null;
  selectedContact = null;
  lockedContact = false;
}

async function saveLead(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const wasEditing = Boolean(editingLead);
  const leadId = editingLead?.id;
  const payload = formPayload(form, LEAD_FIELDS);
  if (!editingLead) payload.contactId = selectedContact?.id || null;
  const errors = validateLeadPayload(payload, !editingLead);
  const errorNode = $("crmLeadFormError");
  if (!applyFieldErrors(form, errors)) {
    errorNode.textContent = errors.contactId || "请检查标记的线索字段。";
    errorNode.hidden = false;
    form.querySelector(".is-invalid input, .is-invalid select, .is-invalid textarea")?.focus();
    return;
  }
  errorNode.hidden = true;
  const saveButton = $("crmSaveLead");
  setButtonBusy(saveButton, true);
  try {
    const result = await crmApi(wasEditing ? `/api/v1/crm/leads/${leadId}` : "/api/v1/crm/leads", { method: wasEditing ? "PATCH" : "POST", body: JSON.stringify(payload) });
    const id = result.data.id;
    closeLeadForm();
    context.notify(wasEditing ? "线索已更新" : "线索已创建");
    await context.navigate(`leads/${id}`);
  } catch (error) {
    const fieldErrors = Object.fromEntries((error.fieldErrors || []).map((item) => [String(item.field).split(".").pop(), item.message]));
    applyFieldErrors(form, fieldErrors);
    const copy = friendlyError(error);
    errorNode.textContent = `${copy.title}：${copy.message}`;
    errorNode.hidden = false;
  } finally {
    setButtonBusy(saveButton, false);
  }
}
