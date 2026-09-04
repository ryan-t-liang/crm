"use strict";

import { $, appUrl, crmApi, dateRangeForPreset, displayValue, esc, formatLocalDateTime, friendlyError, renderErrorMarkup, setButtonBusy } from "./api.js";
import { applyFieldErrors, CONTACT_FIELDS, CONTACT_STAGES, formPayload, leadPriorityLabel, leadStatusLabel, renderFormSections, stageLabel, validateContactPayload } from "./field-definitions.js";
import { openFollowup, renderTimelineMarkup } from "./followups.js";

let context;
const listState = { page: 1, pageSize: 20, pageCount: 1, total: 0 };
const relatedState = { page: 1, pageSize: 8, pageCount: 1, total: 0 };
let editingContact = null;
let pendingContactAttachments = [];
let removedContactAttachmentIds = new Set();
let existingContactAttachments = [];
let formContactId = null;
const contactAttachmentExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "mp4", "webm", "mov", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"]);
const contactAttachmentMaxBytes = 50 * 1024 * 1024;

export function buildContactQuery(filters, page = 1, now = new Date()) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(filters.pageSize || 20), orderBy: "updatedAt_desc" });
  for (const key of ["keyword", "stage", "ownerUserId"]) {
    if (filters[key]) params.set(key, String(filters[key]).trim());
  }
  for (const [key, value] of Object.entries(dateRangeForPreset(filters.nextFollowup, now))) params.set(key, value);
  return params;
}

export function initializeContacts(options) {
  context = options;
  $("crmContactsView").innerHTML = `<div class="page crm-page">
    <div class="page-heading"><div><h1>客户联系人</h1></div><div class="heading-actions crm-page-actions"><button class="btn btn-quiet" id="crmExportContacts" type="button" data-crm-permission="crm.contact.export"><svg><use href="#i-download"/></svg>导出</button><button class="btn" id="crmImportContacts" type="button" data-crm-permission="crm.contact.import"><svg><use href="#i-upload"/></svg>批量导入</button><button class="btn btn-primary" id="crmNewContact" type="button" data-crm-permission="crm.contact.create"><svg><use href="#i-plus"/></svg>新增联系人</button></div></div>
    <div class="metrics member-metrics" aria-label="联系人指标"><article class="metric-card"><div class="metric-label">联系人总数</div><div class="metric-value" id="crmContactMetricTotal">0</div></article><article class="metric-card"><div class="metric-label">已分配负责人</div><div class="metric-value" id="crmContactMetricAssigned">0</div></article><article class="metric-card"><div class="metric-label">待分配负责人</div><div class="metric-value" id="crmContactMetricUnassigned">0</div></article></div>
    <section class="panel filter-panel crm-query-panel" aria-label="联系人筛选"><div class="query-toolbar">
      <label class="query-content"><span class="field-label">查询内容</span><span class="search-field"><svg><use href="#i-search"/></svg><input id="crmContactKeyword" type="search" placeholder="搜索联系人、公司、Email 或 Phone"></span></label>
      <label class="query-field"><span class="field-label">触达阶段</span><select class="control" id="crmContactStage"><option value="">全部阶段</option>${CONTACT_STAGES.map((item) => `<option value="${item.value}">${esc(item.label)}</option>`).join("")}</select></label>
      <label class="query-field"><span class="field-label">负责人</span><select class="control" id="crmContactOwner"><option value="">全部负责人</option></select></label>
      <label class="query-field"><span class="field-label">下次跟进</span><select class="control" id="crmContactNext"><option value="">全部跟进日期</option><option value="overdue">已逾期</option><option value="today">今天</option><option value="next7">未来 7 天</option></select></label>
      <div class="query-actions"><button class="btn" id="crmResetContacts" type="button">重置</button><button class="btn btn-primary" id="crmSearchContacts" type="button"><svg><use href="#i-search"/></svg>查询</button></div>
    </div></section>
    <section class="panel table-panel crm-table-section" aria-labelledby="crmContactTableTitle">
      <div class="table-toolbar"><div class="table-title"><strong id="crmContactTableTitle">联系人目录</strong><span id="crmContactResultCount">0 条结果</span></div><span class="spacer"></span></div>
      <div id="crmContactListState" class="crm-list-state"></div>
      <div class="crm-table-scroll" id="crmContactTableWrap">
        <table class="crm-data-table crm-contact-table"><thead><tr><th>客户联系人</th><th>公司</th><th>职位</th><th>触达阶段</th><th>负责人</th><th>下次跟进</th><th>线索数量</th><th>更新时间</th><th>操作</th></tr></thead><tbody id="crmContactRows"></tbody></table>
      </div>
      <div class="empty-state" id="crmContactEmpty" hidden><div><div class="empty-illustration"><svg><use href="#i-users"/></svg></div><h3>暂无客户联系人</h3><p>创建第一个联系人后，即可关联线索并记录跟进。</p><button class="btn btn-primary" id="crmEmptyNewContact" type="button" data-crm-permission="crm.contact.create"><svg><use href="#i-plus"/></svg>新增联系人</button></div></div>
      <footer class="table-footer" id="crmContactPagination"><span id="crmContactPageSummary">共 0 条</span><div class="pagination"><button class="page-button" id="crmContactPrev" type="button" aria-label="上一页">‹</button><button class="page-button is-active" id="crmContactPageNumber" type="button" disabled>1 / 1</button><button class="page-button" id="crmContactNextPage" type="button" aria-label="下一页">›</button></div></footer>
    </section>
  </div>`;

  $("crmContactDetailView").innerHTML = '<div class="crm-detail-loading"><span class="crm-skeleton crm-skeleton-title"></span><span class="crm-skeleton crm-skeleton-line"></span></div>';
  document.body.insertAdjacentHTML("beforeend", `<dialog class="lead-create-dialog crm-form-dialog" id="crmContactDrawer">
    <form id="crmContactForm" novalidate><div class="dialog-header"><div><h2 id="crmContactFormTitle">新增联系人</h2></div><span class="spacer"></span><button class="dialog-close" type="button" data-close-contact-form aria-label="关闭"><svg><use href="#i-x"/></svg></button></div>
      <div class="dialog-body"><div class="canonical-form-grid" id="crmContactFormFields"></div><div class="crm-form-message" id="crmContactFormError" role="alert" hidden></div></div>
      <div class="dialog-footer"><button class="btn" type="button" data-close-contact-form>取消</button><span class="spacer"></span><button class="btn btn-primary" id="crmSaveContact" type="submit">保存联系人</button></div>
    </form>
  </dialog>`);

  $("crmNewContact").addEventListener("click", () => openContactForm());
  $("crmImportContacts").addEventListener("click", () => context.openImport("CONTACT"));
  $("crmExportContacts").addEventListener("click", () => context.openExport("CONTACT"));
  $("crmEmptyNewContact").addEventListener("click", () => openContactForm());
  $("crmSearchContacts").addEventListener("click", () => loadContacts(1));
  $("crmContactKeyword").addEventListener("keydown", (event) => { if (event.key === "Enter") loadContacts(1); });
  $("crmContactStage").addEventListener("change", () => loadContacts(1));
  $("crmContactOwner").addEventListener("change", () => loadContacts(1));
  $("crmContactNext").addEventListener("change", () => loadContacts(1));
  $("crmResetContacts").addEventListener("click", () => {
    $("crmContactKeyword").value = "";
    $("crmContactStage").value = "";
    $("crmContactOwner").value = "";
    $("crmContactNext").value = "";
    loadContacts(1);
  });
  $("crmContactPrev").addEventListener("click", () => loadContacts(Math.max(1, listState.page - 1)));
  $("crmContactNextPage").addEventListener("click", () => loadContacts(Math.min(listState.pageCount, listState.page + 1)));
  document.querySelectorAll("[data-close-contact-form]").forEach((button) => button.addEventListener("click", closeContactForm));
  $("crmContactForm").addEventListener("submit", saveContact);
}

export function syncContactUsers() {
  if (!$("crmContactOwner")) return;
  const value = $("crmContactOwner").value;
  $("crmContactOwner").innerHTML = `<option value="">全部负责人</option>${context.getUsers().map((user) => `<option value="${esc(user.id)}">${esc(user.name)}</option>`).join("")}`;
  $("crmContactOwner").value = value;
}

function currentFilters() {
  return {
    keyword: $("crmContactKeyword").value.trim(),
    stage: $("crmContactStage").value,
    ownerUserId: $("crmContactOwner").value,
    nextFollowup: $("crmContactNext").value,
    pageSize: listState.pageSize,
  };
}

function setContactListLoading() {
  $("crmContactListState").innerHTML = "";
  $("crmContactEmpty").hidden = true;
  $("crmContactTableWrap").hidden = false;
  $("crmContactRows").innerHTML = Array.from({ length: 6 }, () => '<tr class="crm-skeleton-row"><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td></tr>').join("");
  $("crmContactTableWrap").setAttribute("aria-busy", "true");
}

export async function loadContacts(page = listState.page) {
  setContactListLoading();
  const params = buildContactQuery(currentFilters(), page);
  try {
    const result = await crmApi(`/api/v1/crm/contacts?${params}`);
    listState.page = result.meta.page;
    listState.pageCount = Math.max(1, result.meta.pageCount);
    listState.total = result.meta.total;
    renderContactRows(result.data);
    renderContactPagination();
    context.setNavCount("contacts", result.meta.total);
    return result;
  } catch (error) {
    $("crmContactRows").innerHTML = "";
    $("crmContactTableWrap").hidden = true;
    $("crmContactPagination").hidden = true;
    $("crmContactListState").innerHTML = renderErrorMarkup(error, "crmRetryContacts");
    $("crmRetryContacts")?.addEventListener("click", () => loadContacts(page));
    throw error;
  } finally {
    $("crmContactTableWrap").removeAttribute("aria-busy");
  }
}

function renderContactRows(rows) {
  $("crmContactResultCount").textContent = `${listState.total} 条结果`;
  $("crmContactMetricTotal").textContent = String(listState.total);
  $("crmContactMetricAssigned").textContent = String(rows.filter((contact) => contact.owner).length);
  $("crmContactMetricUnassigned").textContent = String(rows.filter((contact) => !contact.owner).length);
  $("crmContactRows").innerHTML = rows.map((contact) => `<tr data-crm-contact-id="${esc(contact.id)}" tabindex="0">
    <td><div class="member-cell"><span class="avatar">${esc(contact.contactName.trim().slice(0, 1).toUpperCase() || "客")}</span><span class="member-main"><strong>${esc(contact.contactName)}</strong><span>${esc(contact.email || contact.phone || "-")}</span></span></div></td>
    <td><strong>${esc(contact.companyShortName || contact.companyName || "-")}</strong><small>${esc(contact.companyShortName && contact.companyName ? contact.companyName : "")}</small></td>
    <td>${esc(displayValue(contact.title))}</td>
    <td><span class="crm-badge crm-stage-${esc(contact.stage.toLowerCase())}">${esc(stageLabel(contact.stage))}</span></td>
    <td>${esc(contact.owner?.name || "-")}</td>
    <td>${esc(formatLocalDateTime(contact.nextFollowupAt))}</td>
    <td><strong>${esc(contact.relatedLeadCount)}</strong></td>
    <td>${esc(formatLocalDateTime(contact.updatedAt))}</td>
    <td><button class="crm-row-action is-danger" type="button" data-delete-contact="${esc(contact.id)}" data-contact-name="${esc(contact.contactName)}" data-related-leads="${esc(contact.relatedLeadCount)}" data-crm-permission="crm.contact.delete" aria-label="删除联系人 ${esc(contact.contactName)}"><svg><use href="#i-trash"/></svg>删除</button></td>
  </tr>`).join("");
  $("crmContactTableWrap").hidden = rows.length === 0;
  $("crmContactEmpty").hidden = rows.length > 0;
  $("crmContactPagination").hidden = rows.length === 0;
  $("crmContactListState").innerHTML = "";
  $("crmContactRows").querySelectorAll("[data-crm-contact-id]").forEach((row) => {
    const open = () => context.navigate(`contacts/${row.dataset.crmContactId}`);
    row.addEventListener("click", (event) => { if (!event.target.closest("button")) open(); });
    row.addEventListener("keydown", (event) => { if (!["BUTTON", "A"].includes(event.target.tagName) && ["Enter", " "].includes(event.key)) open(); });
  });
  $("crmContactRows").querySelectorAll("[data-delete-contact]").forEach((button) => button.addEventListener("click", () => deleteContact(button)));
  context.applyCrmPermissions();
}

async function deleteContact(button) {
  const relatedLeadCount = Number(button.dataset.relatedLeads || 0);
  const name = button.dataset.contactName || "该联系人";
  if (relatedLeadCount > 0) {
    context.notify(`“${name}”仍关联 ${relatedLeadCount} 条线索，请先删除关联线索`);
    return;
  }
  if (!await context.confirm("删除联系人", `确认删除联系人“${name}”？联系人跟进记录也会一并删除，此操作无法撤销。`, "确认删除")) return;
  setButtonBusy(button, true, "删除中");
  try {
    await crmApi(`/api/v1/crm/contacts/${button.dataset.deleteContact}`, { method: "DELETE" });
    context.notify("联系人已删除");
    await loadContacts(listState.page > 1 && listState.total % listState.pageSize === 1 ? listState.page - 1 : listState.page);
  } catch (error) {
    const copy = friendlyError(error);
    context.notify(`${copy.title}：${copy.message}`);
    setButtonBusy(button, false);
  }
}

function renderContactPagination() {
  $("crmContactPageSummary").textContent = `共 ${listState.total} 条`;
  $("crmContactPageNumber").textContent = `${listState.page} / ${listState.pageCount}`;
  $("crmContactPrev").disabled = listState.page <= 1;
  $("crmContactNextPage").disabled = listState.page >= listState.pageCount;
}

function identityField(label, value, wide = false) {
  return `<div class="customer-identity-item${wide ? " wide" : ""}"><label>${esc(label)}</label><strong>${esc(displayValue(value))}</strong></div>`;
}

function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined) return "大小未知";
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function contactAttachmentUrl(contactId, attachmentId) {
  return appUrl(`/api/v1/crm/contacts/${encodeURIComponent(contactId)}/attachments/${encodeURIComponent(attachmentId)}/download`);
}

function contactAttachmentDetailMarkup(contact) {
  const attachments = (contact.attachments || []).filter((item) => item.fieldKey === "meetingMinutesFiles");
  if (!attachments.length) return '<div class="crm-attachment-empty"><svg><use href="#i-paperclip"/></svg><span>暂无 Meeting Minutes 文件</span></div>';
  return `<div class="crm-detail-attachments">${attachments.map((attachment) => {
    const url = contactAttachmentUrl(contact.id, attachment.id);
    const preview = attachment.kind === "IMAGE"
      ? `<img src="${esc(url)}" alt="${esc(attachment.originalName)}" loading="lazy">`
      : attachment.kind === "VIDEO"
        ? `<video src="${esc(url)}" controls preload="metadata"></video>`
        : '<svg><use href="#i-file"/></svg>';
    return `<article class="crm-detail-attachment"><span class="crm-detail-attachment-preview">${preview}</span><span><strong>${esc(attachment.originalName)}</strong><small>${esc(formatFileSize(attachment.fileSize))} · ${esc(attachment.uploadedBy?.name || "-")} · ${esc(formatLocalDateTime(attachment.createdAt))}</small></span><a class="btn btn-small" href="${esc(url)}" target="_blank" rel="noopener">查看</a><a class="btn btn-small" href="${esc(url)}" download>下载</a></article>`;
  }).join("")}</div>`;
}

function renderContactInformation(contact) {
  return [
    identityField("客户联系人", contact.contactName), identityField("职位", contact.title), identityField("部门", contact.department),
    identityField("Email", contact.email), identityField("Phone", contact.phone), identityField("微信", contact.wechat), identityField("LinkedIn", contact.linkedin, true),
  ].join("");
}

function renderCompanyInformation(contact) {
  return [
    identityField("公司简称", contact.companyShortName), identityField("公司完整名称", contact.companyName), identityField("行业", contact.industry),
    identityField("Website", contact.website), identityField("国家", contact.country), identityField("区域", contact.region), identityField("城市", contact.city),
    identityField("来源", contact.source), identityField("跟进人员", contact.owner?.name), identityField("触达阶段", stageLabel(contact.stage)),
    identityField("下次跟进", formatLocalDateTime(contact.nextFollowupAt)), identityField("跟进注意", contact.followupAttention, true), identityField("初始信息", contact.initialContext, true),
  ].join("");
}

function renderContactSystemInformation(contact) {
  return [
    identityField("创建人", contact.createdBy?.name),
    identityField("创建时间", formatLocalDateTime(contact.createdAt)),
    identityField("最后编辑时间", formatLocalDateTime(contact.updatedAt), true),
  ].join("");
}

function renderRelatedLeads(items) {
  if (!items.length) return '<div class="empty-state crm-compact-empty"><div><div class="empty-illustration"><svg><use href="#i-lead"/></svg></div><h3>暂无关联线索</h3></div></div>';
  return items.map((lead) => `<button class="lead-row" type="button" data-related-lead="${esc(lead.id)}">
    <span class="lead-product"><strong>${esc(lead.requirementSummary)}</strong><span>${esc(formatLocalDateTime(lead.updatedAt))}</span></span>
    <span class="crm-badge crm-status-${esc(lead.status.toLowerCase())}">${esc(leadStatusLabel(lead.status))}</span>
    <span class="crm-badge crm-priority-${esc(lead.priority.toLowerCase())}">${esc(leadPriorityLabel(lead.priority))}</span>
    <span class="lead-meta"><strong>${esc(lead.salesOwner?.name || "-")}</strong><span>负责人</span></span>
    <span class="lead-meta"><strong>${esc(formatLocalDateTime(lead.nextFollowupAt))}</strong><span>下次跟进</span></span>
    <svg class="crm-forward-icon"><use href="#i-chevron"/></svg>
  </button>`).join("");
}

function renderContactNote(contact) {
  if (!contact.remark) return '<div class="empty-state crm-compact-empty"><div><div class="empty-illustration"><svg><use href="#i-file"/></svg></div><h3>暂无备注</h3></div></div>';
  return `<div class="notes-list"><article class="note-item"><div class="note-head"><span class="mini-avatar">${esc((contact.createdBy?.name || "系").slice(0, 1))}</span><span class="note-author"><strong>${esc(contact.createdBy?.name || "系统记录")}</strong><time>${esc(formatLocalDateTime(contact.updatedAt))}</time></span></div><p>${esc(contact.remark)}</p></article></div>`;
}

const contactAuditLabel = (action) => ({ CREATE_CONTACT: "创建联系人", UPDATE_CONTACT: "编辑联系人", CREATE_CONTACT_FOLLOWUP: "新增联系人跟进", CREATE_CRM_LEAD: "创建关联线索" })[action] || action;

function renderContactAudit(items, contact, allowed) {
  if (!allowed) return '<div class="empty-state crm-compact-empty"><div><div class="empty-illustration"><svg><use href="#i-lock"/></svg></div><h3>当前角色无权查看操作记录</h3></div></div>';
  if (!items.length) return `<div class="empty-state crm-compact-empty"><div><div class="empty-illustration"><svg><use href="#i-file"/></svg></div><h3>暂无操作记录</h3><p>联系人创建于 ${esc(formatLocalDateTime(contact.createdAt))}</p></div></div>`;
  return `<div class="activity-list">${items.map((item) => {
    const actor = context.getUsers().find((user) => user.id === item.actorUserId);
    return `<article class="activity-row"><span class="activity-icon"><svg><use href="#i-file"/></svg></span><span><strong>${esc(contactAuditLabel(item.action))}</strong><small>${esc(item.targetType || "contact")}</small></span><span>${esc(actor?.name || item.actorUserId || "系统")}</span><time>${esc(formatLocalDateTime(item.createdAt))}</time></article>`;
  }).join("")}</div>`;
}

function bindDetailTabs(container) {
  container.querySelectorAll("[data-detail-tab]").forEach((button) => button.addEventListener("click", () => {
    container.querySelectorAll("[data-detail-tab]").forEach((item) => item.classList.toggle("is-active", item === button));
    container.querySelectorAll("[data-detail-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.detailPanel === button.dataset.detailTab));
  }));
}

export async function openContact(id) {
  const container = $("crmContactDetailView");
  if (context.state.currentCrmContact?.id !== id) relatedState.page = 1;
  container.innerHTML = '<div class="crm-detail-loading"><span class="crm-skeleton crm-skeleton-title"></span><span class="crm-skeleton crm-skeleton-line"></span><span class="crm-skeleton crm-skeleton-block"></span></div>';
  try {
    const [detailResult, followupResult, relatedResult, auditResult] = await Promise.all([
      crmApi(`/api/v1/crm/contacts/${id}`),
      context.can("crm.contact_followup.view") ? crmApi(`/api/v1/crm/contacts/${id}/followups?page=1&pageSize=50`) : Promise.resolve({ data: [], meta: { total: 0 } }),
      context.can("crm.lead.view") ? crmApi(`/api/v1/crm/contacts/${id}/leads?page=${relatedState.page}&pageSize=${relatedState.pageSize}`) : Promise.resolve({ data: [], meta: { total: 0, pageCount: 0 } }),
      context.can("audit.view") ? crmApi("/api/v1/audit-logs?page=1&pageSize=100").catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    ]);
    const contact = detailResult.data;
    const auditItems = auditResult.data.filter((item) => item.targetId === contact.id || item.details?.contactId === contact.id);
    context.state.currentCrmContact = contact;
    relatedState.total = relatedResult.meta.total;
    relatedState.pageCount = Math.max(1, relatedResult.meta.pageCount || 1);
    container.innerHTML = `<div class="crm-record v1-detail">
      <header class="detail-top"><button class="back-button" id="crmBackToContacts" type="button" aria-label="返回联系人列表"><svg><use href="#i-arrow"/></svg></button><div class="detail-identity"><div class="detail-avatar">${esc(contact.contactName.trim().slice(0, 1).toUpperCase() || "客")}</div><div><div class="detail-name-line"><h1>${esc(contact.contactName)}</h1><span class="crm-badge crm-stage-${esc(contact.stage.toLowerCase())}">${esc(stageLabel(contact.stage))}</span></div><div class="detail-contact-row"><span>${esc(contact.companyShortName || contact.companyName || "-")}</span><span>${esc(contact.title || "-")}</span><span>${esc(contact.email || contact.phone || "-")}</span></div></div></div><div class="detail-top-actions"><button class="btn btn-primary" id="crmContactNewLead" type="button" data-crm-permission="crm.lead.create"><svg><use href="#i-plus"/></svg>新增线索</button><button class="btn" id="crmEditContact" type="button" data-crm-permission="crm.contact.edit"><svg><use href="#i-edit"/></svg>编辑联系人</button></div></header>
      <div class="detail-grid"><aside class="detail-column detail-side"><article class="content-card customer-identity-card"><div class="content-card-header"><svg class="icon"><use href="#i-user"/></svg><h3>联系人资料</h3></div><div class="customer-identity-grid">${renderContactInformation(contact)}</div></article><article class="content-card customer-identity-card"><div class="content-card-header"><svg class="icon"><use href="#i-file"/></svg><h3>客户资料</h3></div><div class="customer-identity-grid">${renderCompanyInformation(contact)}</div><div class="crm-inline-attachment-section"><div class="subgroup-title">Meeting Minutes 文件</div>${contactAttachmentDetailMarkup(contact)}</div></article><article class="content-card customer-identity-card crm-system-card"><div class="content-card-header"><svg class="icon"><use href="#i-file"/></svg><h3>系统信息</h3></div><div class="customer-identity-grid">${renderContactSystemInformation(contact)}</div></article></aside>
      <section class="detail-column operations-main"><nav class="detail-tabs" aria-label="联系人详情业务模块"><button class="detail-tab is-active" type="button" data-detail-tab="leads">线索 ${relatedResult.meta.total}</button><button class="detail-tab" type="button" data-detail-tab="followups">跟进记录 ${followupResult.meta.total}</button><button class="detail-tab" type="button" data-detail-tab="notes">备注 ${contact.remark ? 1 : 0}</button><button class="detail-tab" type="button" data-detail-tab="activity">操作记录</button></nav>
        <div class="tab-panel is-active" data-detail-panel="leads"><section class="content-card"><div class="list-card-header"><div><h2>线索</h2></div><span class="spacer"></span><button class="btn btn-primary btn-small" id="crmPanelNewLead" type="button" data-crm-permission="crm.lead.create"><svg><use href="#i-plus"/></svg>新增线索</button></div><div class="lead-list">${renderRelatedLeads(relatedResult.data)}</div>${relatedResult.meta.total > relatedState.pageSize ? `<footer class="crm-related-pagination"><button class="btn btn-small" id="crmRelatedPrev" type="button"${relatedState.page <= 1 ? " disabled" : ""}>上一页</button><span>${relatedState.page} / ${relatedState.pageCount}</span><button class="btn btn-small" id="crmRelatedNext" type="button"${relatedState.page >= relatedState.pageCount ? " disabled" : ""}>下一页</button></footer>` : ""}</section></div>
        <div class="tab-panel" data-detail-panel="followups"><section class="content-card"><div class="list-card-header"><div><h2>跟进记录</h2></div><span class="spacer"></span><button class="btn btn-primary btn-small" id="crmAddContactFollowup" type="button" data-crm-permission="crm.contact_followup.create"><svg><use href="#i-plus"/></svg>新增跟进</button></div><div class="timeline">${renderTimelineMarkup(followupResult.data, "contact")}</div></section></div>
        <div class="tab-panel" data-detail-panel="notes"><section class="content-card"><div class="list-card-header"><div><h2>备注</h2></div></div>${renderContactNote(contact)}</section></div>
        <div class="tab-panel" data-detail-panel="activity"><section class="content-card"><div class="list-card-header"><div><h2>操作记录</h2></div></div>${renderContactAudit(auditItems, contact, context.can("audit.view"))}</section></div>
      </section></div>
    </div>`;
    $("crmBackToContacts").addEventListener("click", () => context.navigate("contacts"));
    $("crmEditContact").addEventListener("click", () => openContactForm(contact));
    $("crmAddContactFollowup").addEventListener("click", () => openFollowup({ kind: "contact", id: contact.id, title: `${contact.contactName} · 新增跟进`, onSaved: () => openContact(contact.id) }));
    $("crmContactNewLead").addEventListener("click", () => context.openLeadForm(contact));
    $("crmPanelNewLead").addEventListener("click", () => context.openLeadForm(contact));
    container.querySelectorAll("[data-related-lead]").forEach((row) => row.addEventListener("click", () => context.navigate(`leads/${row.dataset.relatedLead}`)));
    $("crmRelatedPrev")?.addEventListener("click", () => { relatedState.page -= 1; openContact(contact.id); });
    $("crmRelatedNext")?.addEventListener("click", () => { relatedState.page += 1; openContact(contact.id); });
    bindDetailTabs(container);
    context.applyCrmPermissions();
    return contact;
  } catch (error) {
    container.innerHTML = `<div class="crm-detail-error">${renderErrorMarkup(error, "crmRetryContactDetail")}<button class="btn" id="crmErrorBackContacts" type="button"><svg><use href="#i-arrow"/></svg>返回联系人</button></div>`;
    $("crmRetryContactDetail")?.addEventListener("click", () => openContact(id));
    $("crmErrorBackContacts")?.addEventListener("click", () => context.navigate("contacts"));
    throw error;
  }
}

function contactAttachmentEditorMarkup() {
  const canEdit = context.can("crm.contact.edit");
  return `<section class="crm-form-section crm-attachment-section" id="crmContactAttachmentSection"><header><h3>Meeting Minutes 文件</h3><span>选填 · 最多 20 个</span></header><p class="crm-attachment-guidance">支持 PDF、Office、TXT、常规图片和视频。单个文件不超过 50 MB。</p>${canEdit ? '<label class="crm-attachment-dropzone" id="crmContactAttachmentDropzone"><input id="crmContactAttachmentInput" type="file" multiple accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"><svg><use href="#i-paperclip"/></svg><span><strong>选择文件</strong><small>或将文件拖放到这里</small></span></label>' : '<div class="crm-attachment-disabled">当前角色无权修改附件</div>'}<div class="crm-attachment-list" id="crmContactAttachmentList"></div><div class="crm-attachment-error" id="crmContactAttachmentError" role="alert" hidden></div></section>`;
}

function showContactAttachmentError(message = "") {
  const node = $("crmContactAttachmentError");
  if (!node) return;
  node.textContent = message;
  node.hidden = !message;
}

function renderContactAttachmentEditor() {
  const list = $("crmContactAttachmentList");
  if (!list) return;
  const existing = existingContactAttachments.filter((attachment) => !removedContactAttachmentIds.has(attachment.id));
  const rows = [
    ...existing.map((attachment) => `<div class="crm-attachment-row"><span class="crm-attachment-type"><svg><use href="#i-file"/></svg></span><span><strong>${esc(attachment.originalName)}</strong><small>${esc(attachment.uploadedBy?.name || "已上传")} · ${esc(formatFileSize(attachment.fileSize))} · ${esc(formatLocalDateTime(attachment.createdAt))}</small></span>${formContactId ? `<a class="crm-attachment-open" href="${esc(contactAttachmentUrl(formContactId, attachment.id))}" target="_blank" rel="noopener">查看</a>` : ""}<button class="crm-attachment-remove" type="button" data-remove-contact-existing="${esc(attachment.id)}" aria-label="移除附件 ${esc(attachment.originalName)}"><svg><use href="#i-trash"/></svg></button></div>`),
    ...pendingContactAttachments.map((file, index) => `<div class="crm-attachment-row is-pending"><span class="crm-attachment-type"><svg><use href="#i-paperclip"/></svg></span><span><strong>${esc(file.name)}</strong><small>待上传 · ${esc(formatFileSize(file.size))}</small></span><span class="crm-attachment-pending">待保存</span><button class="crm-attachment-remove" type="button" data-remove-contact-pending="${index}" aria-label="移除待上传附件 ${esc(file.name)}"><svg><use href="#i-x"/></svg></button></div>`),
  ];
  list.innerHTML = rows.length ? rows.join("") : '<div class="crm-attachment-empty"><svg><use href="#i-paperclip"/></svg><span>尚未添加文件</span></div>';
  list.querySelectorAll("[data-remove-contact-existing]").forEach((button) => button.addEventListener("click", () => {
    removedContactAttachmentIds.add(button.dataset.removeContactExisting);
    renderContactAttachmentEditor();
  }));
  list.querySelectorAll("[data-remove-contact-pending]").forEach((button) => button.addEventListener("click", () => {
    pendingContactAttachments.splice(Number(button.dataset.removeContactPending), 1);
    renderContactAttachmentEditor();
  }));
}

function addContactAttachmentFiles(files) {
  showContactAttachmentError();
  const rejected = [];
  for (const file of Array.from(files || [])) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!contactAttachmentExtensions.has(extension)) rejected.push(`${file.name}：格式不支持`);
    else if (file.size <= 0) rejected.push(`${file.name}：文件为空`);
    else if (file.size > contactAttachmentMaxBytes) rejected.push(`${file.name}：超过 50 MB`);
    else if (existingContactAttachments.length - removedContactAttachmentIds.size + pendingContactAttachments.length >= 20) rejected.push(`${file.name}：已达到 20 个文件上限`);
    else if (!pendingContactAttachments.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) pendingContactAttachments.push(file);
  }
  renderContactAttachmentEditor();
  if (rejected.length) showContactAttachmentError(rejected.join("；"));
  const input = $("crmContactAttachmentInput");
  if (input) input.value = "";
}

function bindContactAttachmentEditor() {
  $("crmContactAttachmentInput")?.addEventListener("change", (event) => addContactAttachmentFiles(event.target.files));
  const dropzone = $("crmContactAttachmentDropzone");
  if (!dropzone) return;
  for (const eventName of ["dragenter", "dragover"]) dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.add("is-dragging"); });
  for (const eventName of ["dragleave", "drop"]) dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.remove("is-dragging"); });
  dropzone.addEventListener("drop", (event) => addContactAttachmentFiles(event.dataTransfer.files));
}

async function syncContactAttachments(contactId) {
  const failures = [];
  for (const attachmentId of [...removedContactAttachmentIds]) {
    const attachment = existingContactAttachments.find((item) => item.id === attachmentId);
    try {
      await crmApi(`/api/v1/crm/contacts/${contactId}/attachments/${attachmentId}`, { method: "DELETE" });
      existingContactAttachments = existingContactAttachments.filter((item) => item.id !== attachmentId);
      removedContactAttachmentIds.delete(attachmentId);
    } catch (error) { failures.push(`${attachment?.originalName || "附件"}：${friendlyError(error).message}`); }
  }
  for (const file of [...pendingContactAttachments]) {
    const body = new FormData();
    body.append("file", file, file.name);
    try {
      const result = await crmApi(`/api/v1/crm/contacts/${contactId}/attachments/meetingMinutesFiles`, { method: "POST", body });
      existingContactAttachments.push(result.data);
      pendingContactAttachments = pendingContactAttachments.filter((item) => item !== file);
    } catch (error) { failures.push(`${file.name}：${friendlyError(error).message}`); }
  }
  renderContactAttachmentEditor();
  return failures;
}

export function openContactForm(contact = null) {
  editingContact = contact;
  pendingContactAttachments = [];
  removedContactAttachmentIds = new Set();
  existingContactAttachments = [...(contact?.attachments || []).filter((item) => item.fieldKey === "meetingMinutesFiles")];
  formContactId = contact?.id || null;
  $("crmContactFormTitle").textContent = contact ? "编辑联系人" : "新增联系人";
  $("crmContactFormFields").innerHTML = renderFormSections(CONTACT_FIELDS, contact || { stage: "INITIAL", ownerUserId: context.currentUserId() }, context.getUsers(), {
    person: "联系人信息",
    company: "公司信息",
    region: "地区信息",
    crm: "CRM 信息",
  });
  $("crmContactFormFields").insertAdjacentHTML("beforeend", contactAttachmentEditorMarkup());
  bindContactAttachmentEditor();
  renderContactAttachmentEditor();
  $("crmContactFormError").hidden = true;
  $("crmContactDrawer").showModal();
  setTimeout(() => $("crmContactForm").elements.contactName.focus(), 30);
}

function closeContactForm() {
  if ($("crmContactDrawer")?.open) $("crmContactDrawer").close();
  editingContact = null;
  pendingContactAttachments = [];
  removedContactAttachmentIds = new Set();
  existingContactAttachments = [];
  formContactId = null;
}

async function saveContact(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const wasEditing = Boolean(editingContact);
  const contactId = editingContact?.id;
  const payload = formPayload(form, CONTACT_FIELDS);
  const errors = validateContactPayload(payload);
  const errorNode = $("crmContactFormError");
  if (!applyFieldErrors(form, errors)) {
    errorNode.textContent = "请检查标记的联系人字段。";
    errorNode.hidden = false;
    form.querySelector(".is-invalid input, .is-invalid select, .is-invalid textarea")?.focus();
    return;
  }
  errorNode.hidden = true;
  const saveButton = $("crmSaveContact");
  setButtonBusy(saveButton, true);
  try {
    const result = await crmApi(wasEditing ? `/api/v1/crm/contacts/${contactId}` : "/api/v1/crm/contacts", {
      method: wasEditing ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    });
    const id = result.data.id;
    formContactId = id;
    const attachmentFailures = await syncContactAttachments(id);
    if (attachmentFailures.length) {
      editingContact = { ...result.data, id, attachments: existingContactAttachments };
      showContactAttachmentError(`联系人已保存；以下附件未完成，请重试：${attachmentFailures.join("；")}`);
      context.notify("联系人已保存，部分附件需要重试");
      return;
    }
    closeContactForm();
    context.notify(wasEditing ? "联系人已更新" : "联系人已创建");
    await context.navigate(`contacts/${id}`);
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
