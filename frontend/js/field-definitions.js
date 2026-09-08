"use strict";

import { esc, localDateTimeToIso, toDateTimeInput } from "./api.js";

export const CONTACT_STAGES = [
  { value: "INITIAL", label: "初筛" },
  { value: "ONE_TO_ONE", label: "一对一" },
  { value: "SOLUTION", label: "方案" },
  { value: "CONVENTION", label: "展会" },
];

export const LEAD_STATUSES = [
  { value: "NEW", label: "新建" },
  { value: "QUALIFIED", label: "已验证" },
  { value: "SOLUTION", label: "方案" },
  { value: "QUOTATION", label: "报价" },
  { value: "WON", label: "成交" },
  { value: "LOST", label: "丢失" },
];

export const LEAD_PRIORITIES = [
  { value: "LOW", label: "低" },
  { value: "MEDIUM", label: "中" },
  { value: "HIGH", label: "高" },
  { value: "URGENT", label: "紧急" },
];

export const FOLLOWUP_TYPES = [
  { value: "GENERAL", label: "一般沟通" },
  { value: "MEETING", label: "会议" },
  { value: "CALL", label: "电话" },
  { value: "EMAIL", label: "电子邮件" },
  { value: "WECHAT", label: "微信" },
  { value: "OTHER", label: "其他" },
];

export const CONTACT_INDUSTRY_OPTIONS = ["甲方品牌"].map((value) => ({ value, label: value }));
export const CONTACT_SOURCE_OPTIONS = ["展会-其他"].map((value) => ({ value, label: value }));
export const LEAD_SOURCE_OPTIONS = ["Kiviman"].map((value) => ({ value, label: value }));
export const PROJECT_DOMAIN_OPTIONS = ["其他"].map((value) => ({ value, label: value }));
export const PROJECT_TYPE_OPTIONS = [];
export const TECHNOLOGY_TYPE_OPTIONS = ["Kivicube Engine"].map((value) => ({ value, label: value }));
export const PRODUCT_TYPE_OPTIONS = ["Real-time engagement"].map((value) => ({ value, label: value }));
export const PRODUCT_NAME_OPTIONS = ["Object recognition"].map((value) => ({ value, label: value }));
export const FOLLOW_MODE_OPTIONS = [];

const field = (key, label, section, type = "text", options = {}) => ({ key, label, section, type, tab: options.tab || section, ...options });

export const CONTACT_FIELDS = [
  field("contactName", "联系人姓名", "person", "text", { tab: "basic", required: true, maxLength: 160 }),
  field("title", "职位", "person", "text", { tab: "basic", maxLength: 160 }),
  field("department", "部门", "person", "text", { tab: "basic", maxLength: 160 }),
  field("email", "Email", "person", "email", { tab: "basic", maxLength: 191 }),
  field("phone", "电话", "person", "tel", { tab: "basic", maxLength: 64 }),
  field("wechat", "微信", "person", "text", { tab: "basic", maxLength: 191 }),
  field("linkedin", "LinkedIn", "person", "url", { tab: "basic", maxLength: 500 }),
  field("companyShortName", "公司简称", "company", "text", { tab: "basic", maxLength: 120 }),
  field("companyName", "公司完整名称", "company", "text", { tab: "basic", maxLength: 240, wide: true }),
  field("industry", "行业", "company", "custom-select", { tab: "basic", maxLength: 160, options: CONTACT_INDUSTRY_OPTIONS }),
  field("website", "网站", "company", "url", { tab: "basic", maxLength: 500 }),
  field("country", "国家", "region", "text", { tab: "basic", maxLength: 120 }),
  field("region", "区域", "region", "text", { tab: "basic", maxLength: 120 }),
  field("city", "城市", "region", "text", { tab: "basic", maxLength: 120 }),
  field("source", "来源", "crm", "custom-select", { tab: "crm", maxLength: 160, options: CONTACT_SOURCE_OPTIONS }),
  field("stage", "触达阶段", "crm", "select", { tab: "crm", required: true, options: CONTACT_STAGES }),
  field("ownerUserId", "跟进人员", "crm", "user", { tab: "crm" }),
  field("followupAttention", "跟进注意", "crm", "textarea", { tab: "crm", maxLength: 16_000, wide: true }),
  field("initialContext", "初始信息", "crm", "textarea", { tab: "crm", maxLength: 16_000, wide: true }),
  field("remark", "备注", "notes", "textarea", { tab: "notes", maxLength: 16_000, wide: true }),
];

export const LEAD_FIELDS = [
  field("requirementSummary", "项目需求简述", "basic", "text", { required: true, maxLength: 200, wide: true }),
  field("status", "商机阶段", "basic", "select", { required: true, options: LEAD_STATUSES }),
  field("priority", "商机优先级", "basic", "select", { required: true, options: LEAD_PRIORITIES }),
  field("leadSource", "客户来源", "basic", "custom-select", { maxLength: 160, options: LEAD_SOURCE_OPTIONS }),
  field("salesOwnerUserId", "商机负责人", "basic", "user", { required: true }),
  field("requirementDetail", "需求整理 / 详细需求", "requirement", "textarea", { maxLength: 16_000, wide: true }),
  field("imageRequirementNote", "图片需求说明", "requirement", "textarea", { maxLength: 16_000, wide: true }),
  field("projectDomain", "项目领域", "requirement", "custom-select", { maxLength: 160, options: PROJECT_DOMAIN_OPTIONS }),
  field("projectType", "项目类型", "requirement", "custom-select", { maxLength: 160, options: PROJECT_TYPE_OPTIONS }),
  field("technologyType", "技术类型", "requirement", "multi-select", { maxLength: 4_000, options: TECHNOLOGY_TYPE_OPTIONS }),
  field("productType", "产品类型", "requirement", "custom-select", { maxLength: 160, options: PRODUCT_TYPE_OPTIONS }),
  field("productName", "产品名称", "requirement", "custom-select", { maxLength: 240, options: PRODUCT_NAME_OPTIONS }),
  field("resourceRequirement", "资源需求", "requirement", "textarea", { maxLength: 16_000, wide: true }),
  field("solution", "方案说明", "commercial", "textarea", { maxLength: 16_000, wide: true }),
  field("quotationNote", "报价说明", "commercial", "textarea", { maxLength: 16_000, wide: true }),
  field("estimatedQuote", "预计报价", "commercial", "number", { min: 0, step: "0.01" }),
  field("currency", "币种", "commercial", "select", { options: ["CNY", "USD", "EUR", "JPY"].map((value) => ({ value, label: value })) }),
  field("followupOwnerUserId", "商机跟进负责人", "team", "user"),
  field("participantUserIds", "商机协作成员", "team", "multi-user"),
  field("followMode", "跟单模式", "team", "custom-select", { maxLength: 160, options: FOLLOW_MODE_OPTIONS }),
  field("collaborationGroups", "对接群", "team", "multi-text", { maxLength: 8_000, wide: true }),
  field("remark", "内部备注", "team", "textarea", { maxLength: 16_000, wide: true }),
  field("wonAt", "成交日期", "milestones", "datetime-local"),
  field("deliveryFollowupAt", "交付跟进日期", "milestones", "datetime-local"),
  field("contractRenewalAt", "合同续约日期", "milestones", "datetime-local"),
  field("paymentReceivedAt", "收款日期", "milestones", "datetime-local"),
];

export const stageLabel = (value) => CONTACT_STAGES.find((item) => item.value === value)?.label || (value ? "其他阶段" : "-");
export const leadStatusLabel = (value) => LEAD_STATUSES.find((item) => item.value === value)?.label || (value ? "其他阶段" : "-");
export const leadPriorityLabel = (value) => LEAD_PRIORITIES.find((item) => item.value === value)?.label || (value ? "其他优先级" : "-");
export const followupTypeLabel = (value) => FOLLOWUP_TYPES.find((item) => item.value === value)?.label || (value ? "其他方式" : "-");

function optionsMarkup(options, value) {
  return options.map((item) => `<option value="${esc(item.value)}"${String(value ?? "") === item.value ? " selected" : ""}>${esc(item.label)}</option>`).join("");
}

function controlMarkup(definition, value, users) {
  const common = `name="${esc(definition.key)}"${definition.required ? " required" : ""}${definition.maxLength ? ` maxlength="${definition.maxLength}"` : ""}`;
  if (definition.type === "textarea") return `<textarea ${common}>${esc(value ?? "")}</textarea>`;
  if (definition.type === "multi-text") return `<textarea ${common} placeholder="每行填写一项">${esc(value ?? "")}</textarea>`;
  if (definition.type === "select") return `<select ${common}><option value="">请选择</option>${optionsMarkup(definition.options || [], value)}</select>`;
  if (definition.type === "custom-select") return `<input ${common} type="text" list="crm-options-${esc(definition.key)}" value="${esc(value ?? "")}" placeholder="可选择或直接输入"><datalist id="crm-options-${esc(definition.key)}">${optionsMarkup(definition.options || [], value)}</datalist>`;
  if (definition.type === "user") return `<select ${common}><option value="">未分配</option>${users.map((user) => `<option value="${esc(user.id)}"${user.id === value ? " selected" : ""}>${esc(user.name)}</option>`).join("")}</select>`;
  if (definition.type === "multi-user") {
    const selected = new Set(Array.isArray(value) ? value : []);
    return `<select ${common} multiple size="${Math.min(5, Math.max(3, users.length))}">${users.map((user) => `<option value="${esc(user.id)}"${selected.has(user.id) ? " selected" : ""}>${esc(user.name)}</option>`).join("")}</select><small class="crm-field-hint">按住 Command / Ctrl 可多选</small>`;
  }
  if (definition.type === "multi-select") {
    const selected = new Set(String(value ?? "").split("\n").map((item) => item.trim()).filter(Boolean));
    const options = definition.options || [];
    const custom = [...selected].filter((item) => !options.some((option) => option.value === item));
    return `<select ${common} multiple size="${Math.min(5, Math.max(3, options.length))}">${options.map((item) => `<option value="${esc(item.value)}"${selected.has(item.value) ? " selected" : ""}>${esc(item.label)}</option>`).join("")}</select><textarea name="${esc(definition.key)}Custom" maxlength="${definition.maxLength || 4000}" placeholder="其他值，每行一项">${esc(custom.join("\n"))}</textarea>`;
  }
  const renderedValue = definition.type === "datetime-local" ? toDateTimeInput(value) : value ?? "";
  return `<input ${common} type="${esc(definition.type)}" value="${esc(renderedValue)}"${definition.min !== undefined ? ` min="${definition.min}"` : ""}${definition.step ? ` step="${definition.step}"` : ""}>`;
}

export function renderFormSections(definitions, values, users, sectionLabels) {
  return Object.entries(sectionLabels).map(([section, label]) => {
    const fields = definitions.filter((item) => item.section === section);
    if (!fields.length) return "";
    return `<section class="crm-form-section" data-form-section="${esc(section)}"><header><h3>${esc(label)}</h3></header><div class="crm-form-grid">${fields.map((definition) => `<label class="crm-field${definition.wide ? " crm-field-wide" : ""}"><span>${esc(definition.label)}${definition.required ? '<b aria-hidden="true">*</b>' : ""}</span>${controlMarkup(definition, values?.[definition.key], users)}<small class="crm-field-error" data-field-error="${esc(definition.key)}"></small></label>`).join("")}</div></section>`;
  }).join("");
}

export function renderFormTabs(definitions, values, users, tabs) {
  return `<nav class="crm-form-tabs" aria-label="表单分区">${tabs.map((tab, index) => `<button class="crm-form-tab${index === 0 ? " is-active" : ""}" type="button" data-form-tab="${esc(tab.key)}">${esc(tab.label)}<span class="crm-form-tab-error" hidden>0</span></button>`).join("")}</nav><div class="crm-form-tab-panels">${tabs.map((tab, index) => `<section class="crm-form-tab-panel${index === 0 ? " is-active" : ""}" data-form-tab-panel="${esc(tab.key)}"><div class="crm-form-grid">${definitions.filter((item) => item.tab === tab.key).map((definition) => `<label class="crm-field${definition.wide ? " crm-field-wide" : ""}" data-field-shell="${esc(definition.key)}"><span>${esc(definition.label)}${definition.required ? '<b aria-hidden="true">*</b>' : ""}</span>${controlMarkup(definition, values?.[definition.key], users)}<small class="crm-field-error" data-field-error="${esc(definition.key)}"></small></label>`).join("")}</div></section>`).join("")}</div>`;
}

export function bindFormTabs(form) {
  form.querySelectorAll("[data-form-tab]").forEach((button) => button.addEventListener("click", () => {
    form.querySelectorAll("[data-form-tab]").forEach((item) => item.classList.toggle("is-active", item === button));
    form.querySelectorAll("[data-form-tab-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.formTabPanel === button.dataset.formTab));
  }));
}

export function formPayload(form, definitions) {
  const data = new FormData(form);
  return Object.fromEntries(definitions.map((definition) => {
    if (definition.type === "multi-user") return [definition.key, data.getAll(definition.key).map((item) => String(item)).filter(Boolean)];
    if (definition.type === "multi-select") {
      const selected = data.getAll(definition.key).map((item) => String(item).trim()).filter(Boolean);
      const custom = String(data.get(`${definition.key}Custom`) ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
      const values = [...new Set([...selected, ...custom])];
      return [definition.key, values.length ? values.join("\n") : null];
    }
    const raw = String(data.get(definition.key) ?? "").trim();
    if (definition.type === "datetime-local") return [definition.key, raw ? localDateTimeToIso(raw) : null];
    if (!raw) return [definition.key, definition.required ? raw : null];
    if (definition.key === "currency") return [definition.key, raw.toUpperCase()];
    return [definition.key, raw];
  }));
}

function isUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export function validateContactPayload(payload) {
  const errors = {};
  if (!String(payload.contactName || "").trim()) errors.contactName = "请输入客户联系人";
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) errors.email = "请输入有效的电子邮箱地址";
  if (!isUrl(payload.website)) errors.website = "请输入以 http:// 或 https:// 开头的 URL";
  if (!isUrl(payload.linkedin)) errors.linkedin = "请输入以 http:// 或 https:// 开头的 URL";
  return errors;
}

export function validateLeadPayload(payload, requireContact = true) {
  const errors = {};
  if (requireContact && !payload.contactId) errors.contactId = "请先选择客户联系人";
  if (!payload.salesOwnerUserId) errors.salesOwnerUserId = "请选择销售对接人";
  const summary = String(payload.requirementSummary || "").trim();
  if (!summary) errors.requirementSummary = "请输入项目需求简述";
  else if (summary.length > 200) errors.requirementSummary = "项目需求简述不能超过 200 个字符";
  if (payload.estimatedQuote !== null && payload.estimatedQuote !== "" && payload.estimatedQuote !== undefined) {
    if (!/^\d+(?:\.\d+)?$/.test(String(payload.estimatedQuote)) || Number(payload.estimatedQuote) < 0) errors.estimatedQuote = "预计报价不能为负数";
    if (!payload.currency) errors.currency = "填写预计报价时必须选择币种";
  }
  if (payload.currency && !/^[A-Z]{3}$/.test(payload.currency)) errors.currency = "币种必须为三位大写字母";
  return errors;
}

export function applyFieldErrors(form, errors) {
  form.querySelectorAll(".crm-field.is-invalid").forEach((field) => field.classList.remove("is-invalid"));
  form.querySelectorAll(".crm-field-error").forEach((node) => { node.textContent = ""; });
  for (const [key, message] of Object.entries(errors)) {
    const input = form.elements.namedItem(key);
    const fieldShell = input?.closest(".crm-field");
    fieldShell?.classList.add("is-invalid");
    const errorNode = fieldShell?.querySelector(".crm-field-error");
    if (errorNode) errorNode.textContent = message;
  }
  form.querySelectorAll("[data-form-tab]").forEach((tab) => {
    const panel = form.querySelector(`[data-form-tab-panel="${tab.dataset.formTab}"]`);
    const count = panel?.querySelectorAll(".crm-field.is-invalid").length || 0;
    const badge = tab.querySelector(".crm-form-tab-error");
    if (badge) { badge.textContent = String(count); badge.hidden = count === 0; }
  });
  const firstInvalid = form.querySelector("[data-form-tab-panel] .crm-field.is-invalid");
  const firstPanel = firstInvalid?.closest("[data-form-tab-panel]");
  if (firstPanel && !firstPanel.classList.contains("is-active")) form.querySelector(`[data-form-tab="${firstPanel.dataset.formTabPanel}"]`)?.click();
  return Object.keys(errors).length === 0;
}
