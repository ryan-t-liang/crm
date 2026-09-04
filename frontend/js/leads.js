"use strict";

import { $, appUrl, crmApi, dateRangeForPreset, displayValue, esc, formatLocalDateTime, friendlyError, renderErrorMarkup, setButtonBusy } from "./api.js";
import { applyFieldErrors, formPayload, LEAD_FIELDS, LEAD_PRIORITIES, LEAD_STATUSES, leadPriorityLabel, leadStatusLabel, renderFormSections, validateLeadPayload } from "./field-definitions.js";
import { openFollowup, renderTimelineMarkup } from "./followups.js";

let context;
let selectedContact = null;
let editingLead = null;
let lockedContact = false;
let contactSearchTimer;
let contactSearchSequence = 0;
let contactMatches = [];
let activeContactIndex = -1;
let pendingAttachments = [];
let removedAttachmentIds = new Set();
let existingAttachments = [];
let formLeadId = null;
const listState = { page: 1, pageSize: 20, pageCount: 1, total: 0 };
const attachmentExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "mp4", "webm", "mov", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"]);
const imageExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const videoExtensions = new Set(["mp4", "webm", "mov"]);
const maxAttachmentBytes = 50 * 1024 * 1024;
const leadAttachmentFields = [
  { key: "requirementFiles", label: "需求 / 签署文件", accept: ".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt", kinds: ["IMAGE", "VIDEO", "DOCUMENT"] },
  { key: "requirementImages", label: "图片需求", accept: ".jpg,.jpeg,.png,.gif,.webp", kinds: ["IMAGE"] },
  { key: "proposalFiles", label: "正式方案文件", accept: ".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt", kinds: ["IMAGE", "VIDEO", "DOCUMENT"] },
  { key: "quotationFiles", label: "报价单", accept: ".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt", kinds: ["IMAGE", "DOCUMENT"] },
];

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
  $("crmLeadsView").innerHTML = `<div class="page crm-page">
    <div class="page-heading"><div><h1>线索</h1></div><div class="heading-actions crm-page-actions"><button class="btn btn-quiet" id="crmExportLeads" type="button" data-crm-permission="crm.lead.export"><svg><use href="#i-download"/></svg>导出</button><button class="btn" id="crmImportLeads" type="button" data-crm-permission="crm.lead.import"><svg><use href="#i-upload"/></svg>批量导入</button><button class="btn btn-primary" id="crmNewLead" type="button" data-crm-permission="crm.lead.create"><svg><use href="#i-plus"/></svg>新增线索</button></div></div>
    <div class="metrics lead-metrics" aria-label="线索指标"><article class="metric-card"><div class="metric-label">线索总数</div><div class="metric-value" id="crmLeadMetricTotal">0</div></article><article class="metric-card"><div class="metric-label">本页进行中</div><div class="metric-value" id="crmLeadMetricActive">0</div></article><article class="metric-card"><div class="metric-label">本页高优先级</div><div class="metric-value" id="crmLeadMetricPriority">0</div></article><article class="metric-card"><div class="metric-label">本页待跟进</div><div class="metric-value" id="crmLeadMetricFollowup">0</div></article></div>
    <section class="panel filter-panel crm-query-panel" aria-label="线索筛选"><div class="query-toolbar">
      <label class="query-content"><span class="field-label">查询内容</span><span class="search-field"><svg><use href="#i-search"/></svg><input id="crmLeadKeyword" type="search" placeholder="搜索项目需求、联系人或公司"></span></label>
      <label class="query-field"><span class="field-label">状态</span><select class="control" id="crmLeadStatus"><option value="">全部状态</option>${LEAD_STATUSES.map((item) => `<option value="${item.value}">${esc(item.label)}</option>`).join("")}</select></label>
      <label class="query-field"><span class="field-label">优先级</span><select class="control" id="crmLeadPriority"><option value="">全部优先级</option>${LEAD_PRIORITIES.map((item) => `<option value="${item.value}">${esc(item.label)}</option>`).join("")}</select></label>
      <label class="query-field"><span class="field-label">销售负责人</span><select class="control" id="crmLeadSalesOwner"><option value="">全部销售负责人</option></select></label>
      <label class="query-field crm-secondary-filter"><span class="field-label">跟进负责人</span><select class="control" id="crmLeadFollowupOwner"><option value="">全部跟进负责人</option></select></label>
      <label class="query-field crm-secondary-filter"><span class="field-label">下次跟进</span><select class="control" id="crmLeadNext"><option value="">全部跟进日期</option><option value="overdue">已逾期</option><option value="today">今天</option><option value="next7">未来 7 天</option></select></label>
      <div class="query-actions"><button class="btn" id="crmResetLeads" type="button">重置</button><button class="btn btn-primary" id="crmSearchLeads" type="button"><svg><use href="#i-search"/></svg>查询</button></div>
    </div></section>
    <section class="panel table-panel crm-table-section" aria-labelledby="crmLeadTableTitle">
      <div class="table-toolbar"><div class="table-title"><strong id="crmLeadTableTitle">线索目录</strong><span id="crmLeadResultCount">0 条结果</span></div><span class="spacer"></span></div>
      <div id="crmLeadListState" class="crm-list-state"></div>
      <div class="crm-table-scroll" id="crmLeadTableWrap"><table class="crm-data-table crm-lead-table"><thead><tr><th>项目需求简述</th><th>客户联系人 / 公司</th><th>状态</th><th>优先级</th><th>销售负责人</th><th>跟进负责人</th><th>下次跟进</th><th>更新时间</th><th>操作</th></tr></thead><tbody id="crmLeadRows"></tbody></table></div>
      <div class="empty-state" id="crmLeadEmpty" hidden><div><div class="empty-illustration"><svg><use href="#i-lead"/></svg></div><h3>暂无线索</h3><p>创建线索后，可集中维护需求、负责人和跟进记录。</p><button class="btn btn-primary" id="crmEmptyNewLead" type="button" data-crm-permission="crm.lead.create"><svg><use href="#i-plus"/></svg>新增线索</button></div></div>
      <footer class="table-footer" id="crmLeadPagination"><span id="crmLeadPageSummary">共 0 条</span><div class="pagination"><button class="page-button" id="crmLeadPrev" type="button" aria-label="上一页">‹</button><button class="page-button is-active" id="crmLeadPageNumber" type="button" disabled>1 / 1</button><button class="page-button" id="crmLeadNextPage" type="button" aria-label="下一页">›</button></div></footer>
    </section>
  </div>`;
  $("crmLeadDetailView").innerHTML = '<div class="crm-detail-loading"><span class="crm-skeleton crm-skeleton-title"></span><span class="crm-skeleton crm-skeleton-line"></span></div>';
  document.body.insertAdjacentHTML("beforeend", `<dialog class="lead-create-dialog crm-form-dialog" id="crmLeadDrawer">
    <form id="crmLeadForm" novalidate>
      <div class="dialog-header"><div><h2 id="crmLeadFormTitle">新增线索</h2></div><span class="spacer"></span><button class="dialog-close" type="button" data-close-lead-form aria-label="关闭"><svg><use href="#i-x"/></svg></button></div>
      <div class="dialog-body"><div class="canonical-form-grid">
        <section class="crm-contact-picker crm-form-section" id="crmLeadContactPicker"><header><h3>关联联系人</h3><span>必选</span></header><div class="crm-contact-combobox"><label class="search-field"><svg><use href="#i-search"/></svg><input id="crmLeadContactKeyword" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="crmLeadContactOptions" autocomplete="off" placeholder="输入姓名、公司、Email 或 Phone"></label><div class="crm-contact-options" id="crmLeadContactOptions" role="listbox" hidden></div></div><p class="crm-picker-hint">输入关键词后，从匹配结果中选择一个联系人。</p></section>
        <div id="crmSelectedContact"></div>
        <div id="crmLeadFormFields"></div>
        <div class="crm-form-message" id="crmLeadFormError" role="alert" hidden></div>
      </div></div>
      <div class="dialog-footer"><button class="btn" type="button" data-close-lead-form>取消</button><span class="spacer"></span><button class="btn btn-primary" id="crmSaveLead" type="submit">保存线索</button></div>
    </form>
  </dialog>`);

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
  $("crmLeadContactKeyword").addEventListener("focus", () => searchContacts($("crmLeadContactKeyword").value));
  $("crmLeadContactKeyword").addEventListener("keydown", handleContactPickerKeydown);
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("#crmLeadContactPicker")) closeContactDropdown();
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
  $("crmLeadRows").innerHTML = Array.from({ length: 6 }, () => '<tr class="crm-skeleton-row"><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td></tr>').join("");
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
  $("crmLeadResultCount").textContent = `${listState.total} 条结果`;
  $("crmLeadMetricTotal").textContent = String(listState.total);
  $("crmLeadMetricActive").textContent = String(rows.filter((lead) => !["WON", "LOST"].includes(lead.status)).length);
  $("crmLeadMetricPriority").textContent = String(rows.filter((lead) => ["HIGH", "URGENT"].includes(lead.priority)).length);
  $("crmLeadMetricFollowup").textContent = String(rows.filter((lead) => lead.nextFollowupAt).length);
  $("crmLeadRows").innerHTML = rows.map((lead) => `<tr data-crm-lead-id="${esc(lead.id)}" tabindex="0">
    <td><strong>${esc(lead.requirementSummary)}</strong><small>${esc(lead.projectType || lead.projectDomain || "-")}</small></td>
    <td><strong>${esc(lead.contact.contactName)}</strong><small>${esc(lead.contact.companyShortName || lead.contact.companyName || "-")}</small></td>
    <td><span class="crm-badge crm-status-${esc(lead.status.toLowerCase())}">${esc(leadStatusLabel(lead.status))}</span></td>
    <td><span class="crm-badge crm-priority-${esc(lead.priority.toLowerCase())}">${esc(leadPriorityLabel(lead.priority))}</span></td>
    <td>${esc(lead.salesOwner?.name || "-")}</td><td>${esc(lead.followupOwner?.name || "-")}</td>
    <td>${esc(formatLocalDateTime(lead.nextFollowupAt))}</td><td>${esc(formatLocalDateTime(lead.updatedAt))}</td>
    <td><button class="crm-row-action is-danger" type="button" data-delete-lead="${esc(lead.id)}" data-lead-summary="${esc(lead.requirementSummary)}" data-crm-permission="crm.lead.delete" aria-label="删除线索 ${esc(lead.requirementSummary)}"><svg><use href="#i-trash"/></svg>删除</button></td>
  </tr>`).join("");
  $("crmLeadTableWrap").hidden = rows.length === 0;
  $("crmLeadEmpty").hidden = rows.length > 0;
  $("crmLeadPagination").hidden = rows.length === 0;
  $("crmLeadListState").innerHTML = "";
  $("crmLeadRows").querySelectorAll("[data-crm-lead-id]").forEach((row) => {
    const open = () => context.navigate(`leads/${row.dataset.crmLeadId}`);
    row.addEventListener("click", (event) => { if (!event.target.closest("button")) open(); });
    row.addEventListener("keydown", (event) => { if (!["BUTTON", "A"].includes(event.target.tagName) && ["Enter", " "].includes(event.key)) open(); });
  });
  $("crmLeadRows").querySelectorAll("[data-delete-lead]").forEach((button) => button.addEventListener("click", () => deleteLead(button)));
  context.applyCrmPermissions();
}

async function deleteLead(button) {
  const summary = button.dataset.leadSummary || "该线索";
  if (!await context.confirm("删除线索", `确认删除线索“${summary}”？跟进记录和附件也会一并删除，此操作无法撤销。`, "确认删除")) return;
  setButtonBusy(button, true, "删除中");
  try {
    await crmApi(`/api/v1/crm/leads/${button.dataset.deleteLead}`, { method: "DELETE" });
    context.notify("线索已删除");
    await loadLeads(listState.page > 1 && listState.total % listState.pageSize === 1 ? listState.page - 1 : listState.page);
  } catch (error) {
    const copy = friendlyError(error);
    context.notify(`${copy.title}：${copy.message}`);
    setButtonBusy(button, false);
  }
}

function renderLeadPagination() {
  $("crmLeadPageSummary").textContent = `共 ${listState.total} 条`;
  $("crmLeadPageNumber").textContent = `${listState.page} / ${listState.pageCount}`;
  $("crmLeadPrev").disabled = listState.page <= 1;
  $("crmLeadNextPage").disabled = listState.page >= listState.pageCount;
}

function identityField(label, value, wide = false) {
  return `<div class="customer-identity-item${wide ? " wide" : ""}"><label>${esc(label)}</label><strong>${esc(displayValue(value))}</strong></div>`;
}

function fieldTile(label, value, wide = false) {
  return `<div class="field-tile${wide ? " wide" : ""}"><label>${esc(label)}</label><strong>${esc(displayValue(value))}</strong></div>`;
}

function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined) return "大小未知";
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function attachmentIcon(kind) {
  return kind === "IMAGE" ? "i-image" : kind === "VIDEO" ? "i-video" : "i-file";
}

function attachmentUrl(leadId, attachmentId) {
  return appUrl(`/api/v1/crm/leads/${encodeURIComponent(leadId)}/attachments/${encodeURIComponent(attachmentId)}/download`);
}

function attachmentDetailMarkup(lead, fieldKey, emptyLabel) {
  const attachments = (lead.attachments || []).filter((attachment) => attachment.fieldKey === fieldKey);
  if (!attachments.length) return `<div class="crm-attachment-empty"><svg><use href="#i-paperclip"/></svg><span>${esc(emptyLabel)}</span></div>`;
  return `<div class="crm-detail-attachments">${attachments.map((attachment) => {
    const url = attachmentUrl(lead.id, attachment.id);
    const preview = attachment.kind === "IMAGE"
      ? `<img src="${esc(url)}" alt="${esc(attachment.originalName)}" loading="lazy">`
      : attachment.kind === "VIDEO"
        ? `<video src="${esc(url)}" controls preload="metadata"></video>`
        : `<svg><use href="#${attachmentIcon(attachment.kind)}"/></svg>`;
    return `<article class="crm-detail-attachment"><span class="crm-detail-attachment-preview">${preview}</span><span><strong>${esc(attachment.originalName)}</strong><small>${esc(formatFileSize(attachment.fileSize))} · ${esc(attachment.uploadedBy?.name || "-")} · ${esc(formatLocalDateTime(attachment.createdAt))}</small></span><a class="btn btn-small" href="${esc(url)}" target="_blank" rel="noopener">查看</a><a class="btn btn-small" href="${esc(url)}" download>下载</a></article>`;
  }).join("")}</div>`;
}

function overviewMarkup(lead) {
  return [
    identityField("线索阶段", leadStatusLabel(lead.status)), identityField("优先级", leadPriorityLabel(lead.priority)),
    identityField("销售对接人", lead.salesOwner?.name), identityField("跟进对接人", lead.followupOwner?.name),
    identityField("Leads 参与人员", (lead.participants || []).map((item) => item.user?.name).filter(Boolean).join("、"), true),
    identityField("跟单模式", lead.followMode), identityField("对接群", lead.collaborationGroups, true),
    identityField("下次跟进", formatLocalDateTime(lead.nextFollowupAt)), identityField("最近沟通", formatLocalDateTime(lead.lastFollowupAt)),
    identityField("预计报价", quoteDisplay(lead)), identityField("成交日期", formatLocalDateTime(lead.wonAt)),
    identityField("交付跟进日期", formatLocalDateTime(lead.deliveryFollowupAt)), identityField("合同续约日期", formatLocalDateTime(lead.contractRenewalAt)),
    identityField("收款日期", formatLocalDateTime(lead.paymentReceivedAt), true),
  ].join("");
}

function contactMarkup(contact) {
  return [
    identityField("客户联系人", contact.contactName), identityField("公司", contact.companyShortName || contact.companyName),
    identityField("职位", contact.title), identityField("Email", contact.email), identityField("Phone", contact.phone), identityField("微信", contact.wechat, true),
  ].join("");
}

function requirementMarkup(lead) {
  return `<div class="field-groups"><section><div class="subgroup-title">A. 需求内容</div><div class="field-grid">${fieldTile("项目需求简述", lead.requirementSummary, true)}${fieldTile("需求整理", lead.requirementDetail, true)}${fieldTile("客户来源", lead.leadSource, true)}</div><div class="crm-inline-attachment-section"><h4>需求 / 签署文件</h4>${attachmentDetailMarkup(lead, "requirementFiles", "暂无需求 / 签署文件")}</div><div class="crm-inline-attachment-section"><h4>图片需求</h4>${attachmentDetailMarkup(lead, "requirementImages", "暂无图片需求")}</div></section><section><div class="subgroup-title">B. 项目分类</div><div class="field-grid">${fieldTile("项目领域", lead.projectDomain)}${fieldTile("项目类型", lead.projectType)}${fieldTile("技术类型", lead.technologyType)}${fieldTile("产品类型", lead.productType)}${fieldTile("产品名称", lead.productName)}${fieldTile("资源需求", lead.resourceRequirement, true)}</div></section><section><div class="subgroup-title">C. 方案与商务</div><div class="crm-inline-attachment-section"><h4>正式方案文件</h4>${attachmentDetailMarkup(lead, "proposalFiles", "暂无正式方案文件")}</div><div class="field-grid">${fieldTile("方案说明", lead.solution, true)}${fieldTile("最新进度", lead.latestProgress, true)}${fieldTile("预计报价", quoteDisplay(lead), true)}</div><div class="crm-inline-attachment-section"><h4>报价单</h4>${attachmentDetailMarkup(lead, "quotationFiles", "暂无报价单")}</div></section></div>`;
}

function leadSystemInformationMarkup(lead) {
  return [identityField("创建人", lead.createdBy?.name), identityField("创建时间", formatLocalDateTime(lead.createdAt)), identityField("最后编辑时间", formatLocalDateTime(lead.updatedAt), true)].join("");
}

function renderLeadNote(lead) {
  if (!lead.remark) return '<div class="empty-state crm-compact-empty"><div><div class="empty-illustration"><svg><use href="#i-file"/></svg></div><h3>暂无备注</h3></div></div>';
  return `<div class="notes-list"><article class="note-item"><div class="note-head"><span class="mini-avatar">${esc((lead.createdBy?.name || "系").slice(0, 1))}</span><span class="note-author"><strong>${esc(lead.createdBy?.name || "系统记录")}</strong><time>${esc(formatLocalDateTime(lead.updatedAt))}</time></span></div><p>${esc(lead.remark)}</p></article></div>`;
}

const leadAuditLabel = (action) => ({ CREATE_CRM_LEAD: "创建线索", UPDATE_CRM_LEAD: "编辑线索", DELETE_CRM_LEAD: "删除线索", CREATE_LEAD_FOLLOWUP: "新增线索跟进", UPLOAD_ATTACHMENT: "上传附件", DELETE_ATTACHMENT: "删除附件", DOWNLOAD_ATTACHMENT: "下载附件" })[action] || action;

function renderLeadAudit(items, lead, allowed) {
  if (!allowed) return '<div class="empty-state crm-compact-empty"><div><div class="empty-illustration"><svg><use href="#i-lock"/></svg></div><h3>当前角色无权查看操作记录</h3></div></div>';
  if (!items.length) return `<div class="empty-state crm-compact-empty"><div><div class="empty-illustration"><svg><use href="#i-file"/></svg></div><h3>暂无操作记录</h3><p>线索创建于 ${esc(formatLocalDateTime(lead.createdAt))}</p></div></div>`;
  return `<div class="activity-list">${items.map((item) => {
    const actor = context.getUsers().find((user) => user.id === item.actorUserId);
    return `<article class="activity-row"><span class="activity-icon"><svg><use href="#i-file"/></svg></span><span><strong>${esc(leadAuditLabel(item.action))}</strong><small>${esc(item.targetType || "crm_lead")}</small></span><span>${esc(actor?.name || item.actorUserId || "系统")}</span><time>${esc(formatLocalDateTime(item.createdAt))}</time></article>`;
  }).join("")}</div>`;
}

function bindDetailTabs(container) {
  container.querySelectorAll("[data-detail-tab]").forEach((button) => button.addEventListener("click", () => {
    container.querySelectorAll("[data-detail-tab]").forEach((item) => item.classList.toggle("is-active", item === button));
    container.querySelectorAll("[data-detail-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.detailPanel === button.dataset.detailTab));
  }));
}

export async function openLead(id) {
  const container = $("crmLeadDetailView");
  container.innerHTML = '<div class="crm-detail-loading"><span class="crm-skeleton crm-skeleton-title"></span><span class="crm-skeleton crm-skeleton-line"></span><span class="crm-skeleton crm-skeleton-block"></span></div>';
  try {
    const [detailResult, followupResult, auditResult] = await Promise.all([
      crmApi(`/api/v1/crm/leads/${id}`),
      context.can("crm.lead_followup.view") ? crmApi(`/api/v1/crm/leads/${id}/followups?page=1&pageSize=50`) : Promise.resolve({ data: [], meta: { total: 0 } }),
      context.can("audit.view") ? crmApi("/api/v1/audit-logs?page=1&pageSize=100").catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    ]);
    const lead = detailResult.data;
    const auditItems = auditResult.data.filter((item) => item.targetId === lead.id || item.details?.leadId === lead.id);
    context.state.currentCrmLead = lead;
    container.innerHTML = `<div class="crm-record v1-detail">
      <header class="detail-top"><button class="back-button" id="crmBackToLeads" type="button" aria-label="返回线索列表"><svg><use href="#i-arrow"/></svg></button><div class="detail-identity"><div class="detail-avatar">${esc(lead.contact.contactName.trim().slice(0, 1).toUpperCase() || "线")}</div><div><div class="detail-name-line"><h1>${esc(lead.requirementSummary)}</h1><span class="crm-badge crm-status-${esc(lead.status.toLowerCase())}">${esc(leadStatusLabel(lead.status))}</span><span class="crm-badge crm-priority-${esc(lead.priority.toLowerCase())}">${esc(leadPriorityLabel(lead.priority))}</span></div><div class="detail-contact-row"><span>${esc(lead.contact.contactName)}</span><span>${esc(lead.contact.companyShortName || lead.contact.companyName || "-")}</span></div></div></div><div class="detail-top-actions"><button class="btn" id="crmEditLead" type="button" data-crm-permission="crm.lead.edit"><svg><use href="#i-edit"/></svg>编辑线索</button><button class="btn btn-primary" id="crmAddLeadFollowup" type="button" data-crm-permission="crm.lead_followup.create"><svg><use href="#i-plus"/></svg>新增跟进</button></div></header>
      <div class="detail-grid"><aside class="detail-column detail-side"><article class="content-card customer-identity-card"><div class="content-card-header"><svg class="icon"><use href="#i-lead"/></svg><h3>线索概览</h3></div><div class="customer-identity-grid">${overviewMarkup(lead)}</div></article><article class="content-card customer-identity-card"><div class="content-card-header"><svg class="icon"><use href="#i-user"/></svg><h3>关联联系人</h3><span class="spacer"></span><button class="btn btn-small" id="crmViewLeadContact" type="button">查看联系人</button></div><div class="customer-identity-grid">${contactMarkup(lead.contact)}</div></article><article class="content-card customer-identity-card crm-system-card"><div class="content-card-header"><svg class="icon"><use href="#i-file"/></svg><h3>系统信息</h3></div><div class="customer-identity-grid">${leadSystemInformationMarkup(lead)}</div></article></aside>
      <section class="detail-column operations-main"><nav class="detail-tabs" aria-label="线索详情业务模块"><button class="detail-tab is-active" type="button" data-detail-tab="requirement">需求信息</button><button class="detail-tab" type="button" data-detail-tab="followups">跟进记录 ${followupResult.meta.total}</button><button class="detail-tab" type="button" data-detail-tab="notes">备注 ${lead.remark ? 1 : 0}</button><button class="detail-tab" type="button" data-detail-tab="activity">操作记录</button></nav>
        <div class="tab-panel is-active" data-detail-panel="requirement"><section class="content-card"><div class="list-card-header"><div><h2>需求信息</h2></div></div>${requirementMarkup(lead)}</section></div>
        <div class="tab-panel" data-detail-panel="followups"><section class="content-card"><div class="list-card-header"><div><h2>跟进记录</h2></div><span class="spacer"></span><button class="btn btn-primary btn-small" id="crmPanelAddLeadFollowup" type="button" data-crm-permission="crm.lead_followup.create"><svg><use href="#i-plus"/></svg>新增跟进</button></div><div class="timeline">${renderTimelineMarkup(followupResult.data, "lead")}</div></section></div>
        <div class="tab-panel" data-detail-panel="notes"><section class="content-card"><div class="list-card-header"><div><h2>备注</h2></div></div>${renderLeadNote(lead)}</section></div>
        <div class="tab-panel" data-detail-panel="activity"><section class="content-card"><div class="list-card-header"><div><h2>操作记录</h2></div></div>${renderLeadAudit(auditItems, lead, context.can("audit.view"))}</section></div>
      </section></div>
    </div>`;
    $("crmBackToLeads").addEventListener("click", () => context.navigate("leads"));
    $("crmEditLead").addEventListener("click", () => openLeadForm(lead.contact, lead));
    $("crmAddLeadFollowup").addEventListener("click", () => openFollowup({ kind: "lead", id: lead.id, title: "新增线索跟进", onSaved: () => openLead(lead.id) }));
    $("crmPanelAddLeadFollowup").addEventListener("click", () => openFollowup({ kind: "lead", id: lead.id, title: "新增线索跟进", onSaved: () => openLead(lead.id) }));
    $("crmViewLeadContact").addEventListener("click", () => context.navigate(`contacts/${lead.contact.id}`));
    bindDetailTabs(container);
    context.applyCrmPermissions();
    return lead;
  } catch (error) {
    container.innerHTML = `<div class="crm-detail-error">${renderErrorMarkup(error, "crmRetryLeadDetail")}<button class="btn" id="crmErrorBackLeads" type="button"><svg><use href="#i-arrow"/></svg>返回线索</button></div>`;
    $("crmRetryLeadDetail")?.addEventListener("click", () => openLead(id));
    $("crmErrorBackLeads")?.addEventListener("click", () => context.navigate("leads"));
    throw error;
  }
}

function selectedContactCardMarkup(contact, changeable) {
  if (!contact) return "";
  return `<div class="crm-selected-contact-card"><span class="crm-selected-contact-avatar">${esc(contact.contactName.trim().slice(0, 1).toUpperCase() || "客")}</span><span class="crm-selected-contact-copy"><small>已关联联系人</small><strong>${esc(contact.contactName)}</strong><span>${esc(contact.companyShortName || contact.companyName || "未填写公司")} · ${esc(contact.email || contact.phone || "未填写联系方式")}</span></span><span class="crm-selected-contact-state"><svg><use href="#i-check"/></svg>已选择</span>${changeable ? '<button class="btn btn-small" id="crmChangeLeadContact" type="button">更换</button>' : '<span class="crm-lock-label"><svg><use href="#i-lock"/></svg>不可变更</span>'}</div>`;
}

function renderSelectedContact() {
  $("crmSelectedContact").innerHTML = selectedContactCardMarkup(selectedContact, !lockedContact && !editingLead);
  $("crmChangeLeadContact")?.addEventListener("click", () => {
    selectedContact = null;
    $("crmSelectedContact").innerHTML = "";
    $("crmLeadContactPicker").hidden = false;
    $("crmLeadContactKeyword").focus();
  });
}

function attachmentKindForFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(extension)) return "IMAGE";
  if (["mp4", "webm", "mov"].includes(extension)) return "VIDEO";
  return "DOCUMENT";
}

function attachmentEditorMarkup() {
  const canEdit = context.can("crm.lead.edit");
  return `<section class="crm-form-section crm-attachment-section" id="crmLeadAttachmentSection"><header><h3>附件字段</h3><span>每个字段最多 20 个</span></header><p class="crm-attachment-guidance">每个文件会保存到明确的业务字段。支持图片、视频和文档，单个文件不超过 50 MB。</p><div class="crm-attachment-field-grid">${leadAttachmentFields.map((field) => `<section class="crm-attachment-field" data-attachment-field="${esc(field.key)}"><h4>${esc(field.label)}</h4>${canEdit ? `<label class="crm-attachment-dropzone" data-attachment-dropzone="${esc(field.key)}"><input id="crmLeadAttachmentInput-${esc(field.key)}" data-attachment-input="${esc(field.key)}" type="file" multiple accept="${esc(field.accept)}"><svg><use href="#i-paperclip"/></svg><span><strong>选择文件</strong><small>或拖放到这里</small></span></label>` : '<div class="crm-attachment-disabled">当前角色无权修改附件</div>'}<div class="crm-attachment-list" data-attachment-list="${esc(field.key)}"></div></section>`).join("")}</div><div class="crm-attachment-error" id="crmLeadAttachmentError" role="alert" hidden></div></section>`;
}

function showAttachmentError(message = "") {
  const node = $("crmLeadAttachmentError");
  if (!node) return;
  node.textContent = message;
  node.hidden = !message;
}

function renderAttachmentEditor() {
  for (const field of leadAttachmentFields) {
    const list = document.querySelector(`[data-attachment-list="${field.key}"]`);
    if (!list) continue;
    const existing = existingAttachments.filter((attachment) => attachment.fieldKey === field.key && !removedAttachmentIds.has(attachment.id));
    const pending = pendingAttachments.map((item, index) => ({ ...item, index })).filter((item) => item.fieldKey === field.key);
    const rows = [
      ...existing.map((attachment) => `<div class="crm-attachment-row"><span class="crm-attachment-type"><svg><use href="#${attachmentIcon(attachment.kind)}"/></svg></span><span><strong>${esc(attachment.originalName)}</strong><small>${esc(attachment.uploadedBy?.name || "已上传")} · ${esc(formatFileSize(attachment.fileSize))} · ${esc(formatLocalDateTime(attachment.createdAt))}</small></span>${formLeadId ? `<a class="crm-attachment-open" href="${esc(attachmentUrl(formLeadId, attachment.id))}" target="_blank" rel="noopener">查看</a>` : ""}<button class="crm-attachment-remove" type="button" data-remove-existing="${esc(attachment.id)}" aria-label="移除附件 ${esc(attachment.originalName)}"><svg><use href="#i-trash"/></svg></button></div>`),
      ...pending.map((item) => `<div class="crm-attachment-row is-pending"><span class="crm-attachment-type"><svg><use href="#${attachmentIcon(attachmentKindForFile(item.file))}"/></svg></span><span><strong>${esc(item.file.name)}</strong><small>待上传 · ${esc(formatFileSize(item.file.size))}</small></span><span class="crm-attachment-pending">待保存</span><button class="crm-attachment-remove" type="button" data-remove-pending="${item.index}" aria-label="移除待上传附件 ${esc(item.file.name)}"><svg><use href="#i-x"/></svg></button></div>`),
    ];
    list.innerHTML = rows.length ? rows.join("") : '<div class="crm-attachment-empty"><svg><use href="#i-paperclip"/></svg><span>尚未添加文件</span></div>';
  }
  document.querySelectorAll("[data-remove-existing]").forEach((button) => button.addEventListener("click", () => { removedAttachmentIds.add(button.dataset.removeExisting); renderAttachmentEditor(); }));
  document.querySelectorAll("[data-remove-pending]").forEach((button) => button.addEventListener("click", () => { pendingAttachments.splice(Number(button.dataset.removePending), 1); renderAttachmentEditor(); }));
}

function addAttachmentFiles(fieldKey, files) {
  showAttachmentError();
  const rejected = [];
  const field = leadAttachmentFields.find((item) => item.key === fieldKey);
  if (!field) return;
  for (const file of Array.from(files || [])) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const kind = imageExtensions.has(extension) ? "IMAGE" : videoExtensions.has(extension) ? "VIDEO" : "DOCUMENT";
    if (!attachmentExtensions.has(extension) || !field.kinds.includes(kind)) rejected.push(`${file.name}：格式不适用于${field.label}`);
    else if (file.size <= 0) rejected.push(`${file.name}：文件为空`);
    else if (file.size > maxAttachmentBytes) rejected.push(`${file.name}：超过 50 MB`);
    else if (existingAttachments.filter((item) => item.fieldKey === fieldKey && !removedAttachmentIds.has(item.id)).length + pendingAttachments.filter((item) => item.fieldKey === fieldKey).length >= 20) rejected.push(`${file.name}：该字段已达到 20 个文件上限`);
    else if (!pendingAttachments.some((item) => item.fieldKey === fieldKey && item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) pendingAttachments.push({ fieldKey, file });
  }
  renderAttachmentEditor();
  if (rejected.length) showAttachmentError(rejected.join("；"));
  const input = $(`crmLeadAttachmentInput-${fieldKey}`);
  if (input) input.value = "";
}

function bindAttachmentEditor() {
  document.querySelectorAll("[data-attachment-input]").forEach((input) => input.addEventListener("change", (event) => addAttachmentFiles(input.dataset.attachmentInput, event.target.files)));
  document.querySelectorAll("[data-attachment-dropzone]").forEach((dropzone) => {
    for (const eventName of ["dragenter", "dragover"]) dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.add("is-dragging"); });
    for (const eventName of ["dragleave", "drop"]) dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.remove("is-dragging"); });
    dropzone.addEventListener("drop", (event) => addAttachmentFiles(dropzone.dataset.attachmentDropzone, event.dataTransfer.files));
  });
}

export async function openLeadForm(contact = null, lead = null) {
  editingLead = lead;
  selectedContact = contact || lead?.contact || null;
  lockedContact = Boolean(contact || lead);
  pendingAttachments = [];
  removedAttachmentIds = new Set();
  existingAttachments = [...(lead?.attachments || [])];
  formLeadId = lead?.id || null;
  $("crmLeadFormTitle").textContent = lead ? "编辑线索" : "新增线索";
  $("crmLeadContactKeyword").value = "";
  $("crmLeadContactPicker").hidden = Boolean(selectedContact);
  closeContactDropdown();
  renderSelectedContact();
  const formValues = lead
    ? { ...lead, participantUserIds: (lead.participants || []).map((item) => item.user?.id).filter(Boolean) }
    : { priority: "MEDIUM", status: "NEW", currency: "CNY", salesOwnerUserId: context.currentUserId(), followupOwnerUserId: context.currentUserId(), participantUserIds: [] };
  $("crmLeadFormFields").innerHTML = renderFormSections(LEAD_FIELDS, formValues, context.getUsers(), {
    overview: "线索概览",
    requirement: "需求内容",
    classification: "项目分类",
    commercial: "方案与商务",
    remark: "备注",
  });
  $("crmLeadFormFields").insertAdjacentHTML("beforeend", attachmentEditorMarkup());
  bindAttachmentEditor();
  renderAttachmentEditor();
  $("crmLeadFormError").hidden = true;
  $("crmLeadDrawer").showModal();
  setTimeout(() => (selectedContact ? $("crmLeadForm").elements.requirementSummary : $("crmLeadContactKeyword")).focus(), 30);
}

function openContactDropdown() {
  $("crmLeadContactOptions").hidden = false;
  $("crmLeadContactKeyword").setAttribute("aria-expanded", "true");
}

function closeContactDropdown() {
  if (!$("crmLeadContactOptions")) return;
  $("crmLeadContactOptions").hidden = true;
  $("crmLeadContactKeyword").setAttribute("aria-expanded", "false");
  activeContactIndex = -1;
}

function updateActiveContact(index) {
  if (!contactMatches.length) return;
  activeContactIndex = (index + contactMatches.length) % contactMatches.length;
  $("crmLeadContactOptions").querySelectorAll("[data-picker-contact]").forEach((option, optionIndex) => {
    option.classList.toggle("is-active", optionIndex === activeContactIndex);
    option.setAttribute("aria-selected", String(optionIndex === activeContactIndex));
    if (optionIndex === activeContactIndex) option.scrollIntoView({ block: "nearest" });
  });
}

function handleContactPickerKeydown(event) {
  if (event.key === "Escape") {
    closeContactDropdown();
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
  if ($("crmLeadContactOptions").hidden) {
    event.preventDefault();
    searchContacts($("crmLeadContactKeyword").value);
    if (event.key === "Enter") return;
  }
  event.preventDefault();
  if (event.key === "ArrowDown") updateActiveContact(activeContactIndex + 1);
  if (event.key === "ArrowUp") updateActiveContact(activeContactIndex - 1);
  if (event.key === "Enter" && activeContactIndex >= 0) selectContact(contactMatches[activeContactIndex]);
}

async function searchContacts(keyword) {
  const sequence = ++contactSearchSequence;
  const params = new URLSearchParams({ page: "1", pageSize: "10", orderBy: "updatedAt_desc" });
  if (keyword.trim()) params.set("keyword", keyword.trim());
  openContactDropdown();
  $("crmLeadContactOptions").innerHTML = '<div class="crm-inline-loading">正在搜索联系人…</div>';
  try {
    const result = await crmApi(`/api/v1/crm/contacts?${params}`);
    if (sequence !== contactSearchSequence) return;
    contactMatches = result.data;
    activeContactIndex = -1;
    $("crmLeadContactOptions").innerHTML = result.data.length ? result.data.map((contact, index) => `<button class="crm-contact-option" type="button" role="option" aria-selected="false" data-picker-contact="${esc(contact.id)}" data-picker-index="${index}"><span class="crm-contact-option-avatar">${esc(contact.contactName.trim().slice(0, 1).toUpperCase() || "客")}</span><span><strong>${esc(contact.contactName)}</strong><small>${esc(contact.companyShortName || contact.companyName || "未填写公司")}</small></span><span>${esc(contact.email || contact.phone || "未填写联系方式")}</span><svg><use href="#i-chevron"/></svg></button>`).join("") : '<div class="crm-inline-empty">没有匹配的客户联系人，请调整关键词</div>';
    $("crmLeadContactOptions").querySelectorAll("[data-picker-contact]").forEach((button) => button.addEventListener("click", () => selectContact(contactMatches[Number(button.dataset.pickerIndex)])));
  } catch (error) {
    if (sequence !== contactSearchSequence) return;
    const copy = friendlyError(error);
    $("crmLeadContactOptions").innerHTML = `<div class="crm-inline-empty">${esc(copy.message)}</div>`;
  }
}

function selectContact(contact) {
  if (!contact) return;
  selectedContact = contact;
  lockedContact = false;
  closeContactDropdown();
  $("crmLeadContactPicker").hidden = true;
  renderSelectedContact();
  $("crmLeadForm").elements.requirementSummary.focus();
}

function closeLeadForm() {
  if ($("crmLeadDrawer")?.open) $("crmLeadDrawer").close();
  clearTimeout(contactSearchTimer);
  contactSearchSequence += 1;
  editingLead = null;
  selectedContact = null;
  lockedContact = false;
  pendingAttachments = [];
  removedAttachmentIds = new Set();
  existingAttachments = [];
  formLeadId = null;
  closeContactDropdown();
}

async function syncLeadAttachments(leadId) {
  const failures = [];
  for (const attachmentId of [...removedAttachmentIds]) {
    const attachment = existingAttachments.find((item) => item.id === attachmentId);
    try {
      await crmApi(`/api/v1/crm/leads/${leadId}/attachments/${attachmentId}`, { method: "DELETE" });
      existingAttachments = existingAttachments.filter((item) => item.id !== attachmentId);
      removedAttachmentIds.delete(attachmentId);
    } catch (error) {
      failures.push(`${attachment?.originalName || "附件"}：${friendlyError(error).message}`);
    }
  }
  for (const item of [...pendingAttachments]) {
    const body = new FormData();
    body.append("file", item.file, item.file.name);
    try {
      const result = await crmApi(`/api/v1/crm/leads/${leadId}/attachments/${item.fieldKey}`, { method: "POST", body });
      existingAttachments.push(result.data);
      pendingAttachments = pendingAttachments.filter((pending) => pending !== item);
    } catch (error) {
      failures.push(`${item.file.name}：${friendlyError(error).message}`);
    }
  }
  renderAttachmentEditor();
  return failures;
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
  showAttachmentError();
  const saveButton = $("crmSaveLead");
  setButtonBusy(saveButton, true);
  try {
    const result = await crmApi(wasEditing ? `/api/v1/crm/leads/${leadId}` : "/api/v1/crm/leads", { method: wasEditing ? "PATCH" : "POST", body: JSON.stringify(payload) });
    const id = result.data.id;
    formLeadId = id;
    const attachmentFailures = await syncLeadAttachments(id);
    if (attachmentFailures.length) {
      editingLead = { ...result.data, id, contact: selectedContact, attachments: existingAttachments };
      lockedContact = true;
      $("crmLeadFormTitle").textContent = "编辑线索";
      renderSelectedContact();
      showAttachmentError(`线索已保存；以下附件未完成，请重试：${attachmentFailures.join("；")}`);
      context.notify("线索已保存，部分附件需要重试");
      return;
    }
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
