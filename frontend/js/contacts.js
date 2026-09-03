"use strict";

import { $, crmApi, dateRangeForPreset, displayValue, esc, formatLocalDateTime, friendlyError, renderErrorMarkup, setButtonBusy } from "./api.js";
import { applyFieldErrors, CONTACT_FIELDS, CONTACT_STAGES, formPayload, leadPriorityLabel, leadStatusLabel, renderFormSections, stageLabel, validateContactPayload } from "./field-definitions.js";
import { openFollowup, renderTimelineMarkup } from "./followups.js";

let context;
const listState = { page: 1, pageSize: 20, pageCount: 1, total: 0 };
const relatedState = { page: 1, pageSize: 8, pageCount: 1, total: 0 };
let editingContact = null;

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
  $("crmContactsView").innerHTML = `<div class="crm-page">
    <header class="crm-page-header"><div><span class="crm-eyebrow">CONTACTS</span><h1>客户联系人</h1></div><button class="btn btn-primary" id="crmNewContact" type="button" data-crm-permission="crm.contact.create"><svg><use href="#i-plus"/></svg>New Contact</button></header>
    <section class="crm-filter-bar" aria-label="联系人筛选">
      <label class="crm-search"><svg><use href="#i-search"/></svg><input id="crmContactKeyword" type="search" placeholder="搜索联系人、公司、Email 或手机号"></label>
      <label><span class="sr-only">触达阶段</span><select id="crmContactStage"><option value="">全部阶段</option>${CONTACT_STAGES.map((item) => `<option value="${item.value}">${esc(item.label)}</option>`).join("")}</select></label>
      <label><span class="sr-only">负责人</span><select id="crmContactOwner"><option value="">全部负责人</option></select></label>
      <label><span class="sr-only">下次跟进</span><select id="crmContactNext"><option value="">全部跟进日期</option><option value="overdue">已逾期</option><option value="today">今天</option><option value="next7">未来 7 天</option></select></label>
      <button class="crm-icon-button" id="crmSearchContacts" type="button" title="查询" aria-label="查询联系人"><svg><use href="#i-search"/></svg></button>
      <button class="btn btn-quiet btn-small" id="crmResetContacts" type="button">重置</button>
    </section>
    <section class="crm-table-section" aria-labelledby="crmContactTableTitle">
      <header><div><h2 id="crmContactTableTitle">联系人目录</h2><span id="crmContactResultCount">0 条</span></div></header>
      <div id="crmContactListState" class="crm-list-state"></div>
      <div class="crm-table-scroll" id="crmContactTableWrap">
        <table class="crm-data-table crm-contact-table"><thead><tr><th>客户联系人</th><th>公司</th><th>职位</th><th>触达阶段</th><th>负责人</th><th>下次跟进</th><th>Leads</th><th>更新时间</th></tr></thead><tbody id="crmContactRows"></tbody></table>
      </div>
      <div class="crm-empty" id="crmContactEmpty" hidden><svg><use href="#i-users"/></svg><h3>暂无客户联系人</h3><p>创建第一个 Contact 后，即可关联 Leads 并记录跟进。</p><button class="btn btn-primary" id="crmEmptyNewContact" type="button" data-crm-permission="crm.contact.create"><svg><use href="#i-plus"/></svg>New Contact</button></div>
      <footer class="crm-pagination" id="crmContactPagination"><span id="crmContactPageSummary">共 0 条</span><div><button class="crm-icon-button" id="crmContactPrev" type="button" title="上一页" aria-label="上一页"><svg><use href="#i-arrow"/></svg></button><span id="crmContactPageNumber">1 / 1</span><button class="crm-icon-button crm-next-button" id="crmContactNextPage" type="button" title="下一页" aria-label="下一页"><svg><use href="#i-arrow"/></svg></button></div></footer>
    </section>
  </div>`;

  $("crmContactDetailView").innerHTML = '<div class="crm-detail-loading"><span class="crm-skeleton crm-skeleton-title"></span><span class="crm-skeleton crm-skeleton-line"></span></div>';
  document.body.insertAdjacentHTML("beforeend", `<aside class="crm-drawer" id="crmContactDrawer" aria-hidden="true">
    <button class="crm-drawer-backdrop" type="button" data-close-contact-form aria-label="关闭联系人表单"></button>
    <form class="crm-drawer-panel" id="crmContactForm" novalidate>
      <header class="crm-drawer-header"><div><span class="crm-eyebrow">CONTACT</span><h2 id="crmContactFormTitle">New Contact</h2></div><button class="crm-icon-button" type="button" data-close-contact-form aria-label="关闭"><svg><use href="#i-x"/></svg></button></header>
      <div class="crm-drawer-body"><div id="crmContactFormFields"></div><div class="crm-form-message" id="crmContactFormError" role="alert" hidden></div></div>
      <footer class="crm-drawer-footer"><button class="btn" type="button" data-close-contact-form>取消</button><button class="btn btn-primary" id="crmSaveContact" type="submit">保存联系人</button></footer>
    </form>
  </aside>`);

  $("crmNewContact").addEventListener("click", () => openContactForm());
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
  $("crmContactRows").innerHTML = Array.from({ length: 6 }, () => '<tr class="crm-skeleton-row"><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td></tr>').join("");
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
  $("crmContactResultCount").textContent = `${listState.total} 条`;
  $("crmContactRows").innerHTML = rows.map((contact) => `<tr data-crm-contact-id="${esc(contact.id)}" tabindex="0">
    <td><strong>${esc(contact.contactName)}</strong><small>${esc(contact.email || contact.phone || "-")}</small></td>
    <td><strong>${esc(contact.companyShortName || contact.companyName || "-")}</strong><small>${esc(contact.companyShortName && contact.companyName ? contact.companyName : "")}</small></td>
    <td>${esc(displayValue(contact.title))}</td>
    <td><span class="crm-badge crm-stage-${esc(contact.stage.toLowerCase())}">${esc(stageLabel(contact.stage))}</span></td>
    <td>${esc(contact.owner?.name || "-")}</td>
    <td>${esc(formatLocalDateTime(contact.nextFollowupAt))}</td>
    <td><strong>${esc(contact.relatedLeadCount)}</strong></td>
    <td>${esc(formatLocalDateTime(contact.updatedAt))}</td>
  </tr>`).join("");
  $("crmContactTableWrap").hidden = rows.length === 0;
  $("crmContactEmpty").hidden = rows.length > 0;
  $("crmContactPagination").hidden = rows.length === 0;
  $("crmContactListState").innerHTML = "";
  $("crmContactRows").querySelectorAll("[data-crm-contact-id]").forEach((row) => {
    const open = () => context.navigate(`contacts/${row.dataset.crmContactId}`);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) open(); });
  });
  context.applyCrmPermissions();
}

function renderContactPagination() {
  $("crmContactPageSummary").textContent = `共 ${listState.total} 条`;
  $("crmContactPageNumber").textContent = `${listState.page} / ${listState.pageCount}`;
  $("crmContactPrev").disabled = listState.page <= 1;
  $("crmContactNextPage").disabled = listState.page >= listState.pageCount;
}

function detailField(label, value, wide = false) {
  return `<div class="crm-description${wide ? " crm-description-wide" : ""}"><span>${esc(label)}</span><strong>${esc(displayValue(value))}</strong></div>`;
}

function renderContactInformation(contact) {
  return [
    detailField("客户联系人", contact.contactName), detailField("职位", contact.title), detailField("部门", contact.department),
    detailField("公司简称", contact.companyShortName), detailField("公司完整名称", contact.companyName), detailField("行业", contact.industry),
    detailField("Email", contact.email), detailField("Phone", contact.phone), detailField("微信", contact.wechat),
    detailField("Website", contact.website), detailField("LinkedIn", contact.linkedin), detailField("国家", contact.country),
    detailField("城市", contact.city), detailField("区域", contact.region), detailField("来源", contact.source),
    detailField("下一次跟进", formatLocalDateTime(contact.nextFollowupAt)), detailField("初始信息", contact.initialContext, true), detailField("备注", contact.remark, true),
  ].join("");
}

function renderRelatedLeads(items) {
  if (!items.length) return '<div class="crm-inline-empty">暂无关联 Leads</div>';
  return items.map((lead) => `<button class="crm-related-row" type="button" data-related-lead="${esc(lead.id)}">
    <span><strong>${esc(lead.requirementSummary)}</strong><small>${esc(formatLocalDateTime(lead.updatedAt))}</small></span>
    <span class="crm-badge crm-status-${esc(lead.status.toLowerCase())}">${esc(leadStatusLabel(lead.status))}</span>
    <span class="crm-badge crm-priority-${esc(lead.priority.toLowerCase())}">${esc(leadPriorityLabel(lead.priority))}</span>
    <span>${esc(lead.salesOwner?.name || "-")}</span><span>${esc(lead.followupOwner?.name || "-")}</span><span>${esc(formatLocalDateTime(lead.nextFollowupAt))}</span>
  </button>`).join("");
}

export async function openContact(id) {
  const container = $("crmContactDetailView");
  if (context.state.currentCrmContact?.id !== id) relatedState.page = 1;
  container.innerHTML = '<div class="crm-detail-loading"><span class="crm-skeleton crm-skeleton-title"></span><span class="crm-skeleton crm-skeleton-line"></span><span class="crm-skeleton crm-skeleton-block"></span></div>';
  try {
    const [detailResult, followupResult, relatedResult] = await Promise.all([
      crmApi(`/api/v1/crm/contacts/${id}`),
      context.can("crm.contact_followup.view") ? crmApi(`/api/v1/crm/contacts/${id}/followups?page=1&pageSize=50`) : Promise.resolve({ data: [], meta: { total: 0 } }),
      context.can("crm.lead.view") ? crmApi(`/api/v1/crm/contacts/${id}/leads?page=${relatedState.page}&pageSize=${relatedState.pageSize}`) : Promise.resolve({ data: [], meta: { total: 0, pageCount: 0 } }),
    ]);
    const contact = detailResult.data;
    context.state.currentCrmContact = contact;
    relatedState.total = relatedResult.meta.total;
    relatedState.pageCount = Math.max(1, relatedResult.meta.pageCount || 1);
    container.innerHTML = `<div class="crm-record">
      <header class="crm-record-header"><button class="crm-icon-button" id="crmBackToContacts" type="button" title="返回联系人" aria-label="返回联系人"><svg><use href="#i-arrow"/></svg></button><div class="crm-record-title"><span class="crm-eyebrow">CONTACT</span><h1>${esc(contact.contactName)}</h1><p>${esc([contact.companyShortName || contact.companyName, contact.title, contact.email || contact.phone].filter(Boolean).join(" · ") || "-")}</p></div><span class="crm-badge crm-stage-${esc(contact.stage.toLowerCase())}">${esc(stageLabel(contact.stage))}</span><div class="crm-record-actions"><span class="crm-owner-chip"><svg><use href="#i-user"/></svg>${esc(contact.owner?.name || "未分配")}</span><button class="btn" id="crmEditContact" type="button" data-crm-permission="crm.contact.edit"><svg><use href="#i-edit"/></svg>编辑</button></div></header>
      <section class="crm-record-band"><header><div><span class="crm-section-index">C</span><h2>Contact</h2></div></header><div class="crm-description-grid">${renderContactInformation(contact)}</div></section>
      <section class="crm-record-band"><header><div><span class="crm-section-index">F</span><h2>Followup</h2><small>${followupResult.meta.total} 条记录</small></div><button class="btn btn-small" id="crmAddContactFollowup" type="button" data-crm-permission="crm.contact_followup.create"><svg><use href="#i-plus"/></svg>Add Followup</button></header><div class="crm-timeline">${renderTimelineMarkup(followupResult.data, "contact")}</div></section>
      <section class="crm-record-band"><header><div><span class="crm-section-index">A</span><h2>Related Leads</h2><small>${contact.relatedLeadCount} 条关联</small></div><button class="btn btn-small" id="crmContactNewLead" type="button" data-crm-permission="crm.lead.create"><svg><use href="#i-plus"/></svg>New Lead</button></header><div class="crm-related-list">${renderRelatedLeads(relatedResult.data)}</div>${relatedResult.meta.total > relatedState.pageSize ? `<footer class="crm-related-pagination"><button class="btn btn-small" id="crmRelatedPrev" type="button"${relatedState.page <= 1 ? " disabled" : ""}>上一页</button><span>${relatedState.page} / ${relatedState.pageCount}</span><button class="btn btn-small" id="crmRelatedNext" type="button"${relatedState.page >= relatedState.pageCount ? " disabled" : ""}>下一页</button></footer>` : ""}</section>
    </div>`;
    $("crmBackToContacts").addEventListener("click", () => context.navigate("contacts"));
    $("crmEditContact").addEventListener("click", () => openContactForm(contact));
    $("crmAddContactFollowup").addEventListener("click", () => openFollowup({ kind: "contact", id: contact.id, title: `${contact.contactName} · 新增跟进`, onSaved: () => openContact(contact.id) }));
    $("crmContactNewLead").addEventListener("click", () => context.openLeadForm(contact));
    container.querySelectorAll("[data-related-lead]").forEach((row) => row.addEventListener("click", () => context.navigate(`leads/${row.dataset.relatedLead}`)));
    $("crmRelatedPrev")?.addEventListener("click", () => { relatedState.page -= 1; openContact(contact.id); });
    $("crmRelatedNext")?.addEventListener("click", () => { relatedState.page += 1; openContact(contact.id); });
    context.applyCrmPermissions();
    return contact;
  } catch (error) {
    container.innerHTML = `<div class="crm-detail-error">${renderErrorMarkup(error, "crmRetryContactDetail")}<button class="btn" id="crmErrorBackContacts" type="button"><svg><use href="#i-arrow"/></svg>返回 Contacts</button></div>`;
    $("crmRetryContactDetail")?.addEventListener("click", () => openContact(id));
    $("crmErrorBackContacts")?.addEventListener("click", () => context.navigate("contacts"));
    throw error;
  }
}

export function openContactForm(contact = null) {
  editingContact = contact;
  $("crmContactFormTitle").textContent = contact ? "编辑联系人" : "New Contact";
  $("crmContactFormFields").innerHTML = renderFormSections(CONTACT_FIELDS, contact || { stage: "INITIAL", ownerUserId: context.currentUserId() }, context.getUsers(), {
    basic: "基础信息",
    company: "公司信息",
    contact: "联系方式",
    crm: "CRM 信息",
  });
  $("crmContactFormError").hidden = true;
  $("crmContactDrawer").classList.add("is-open");
  $("crmContactDrawer").setAttribute("aria-hidden", "false");
  setTimeout(() => $("crmContactForm").elements.contactName.focus(), 30);
}

function closeContactForm() {
  $("crmContactDrawer")?.classList.remove("is-open");
  $("crmContactDrawer")?.setAttribute("aria-hidden", "true");
  editingContact = null;
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
