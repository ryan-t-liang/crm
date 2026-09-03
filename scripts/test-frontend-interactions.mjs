import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { friendlyError, localDateTimeToIso } from "../frontend/js/api.js";
import { buildContactQuery } from "../frontend/js/contacts.js";
import { LEAD_FIELDS, validateContactPayload, validateLeadPayload } from "../frontend/js/field-definitions.js";
import { renderTimelineMarkup } from "../frontend/js/followups.js";
import { buildLeadQuery, quoteDisplay, readonlyContactMarkup } from "../frontend/js/leads.js";

const source = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
const markup = await readFile(new URL("../frontend/index.html", import.meta.url), "utf8");

// Legacy navigation and list-selection behavior remains available after the CRM routes are added.
assert.match(source, /function initializeSidebar\(\)/, "sidebar initializer must exist");
assert.match(source, /\$\("sidebarToggle"\)\.addEventListener\("click"/, "sidebar toggle must handle clicks");
assert.match(source, /localStorage\.setItem\(SIDEBAR_STORAGE_KEY/, "sidebar state must persist");
assert.match(source, /classList\.add\("is-sidebar-transitioning"\)/, "sidebar text must enter a stable transition state");
assert.match(source, /event\.propertyName === "width"/, "sidebar transition must finish when width animation completes");
assert.match(source, /toggle\.disabled = true/, "sidebar toggle must prevent overlapping animations");
assert.match(source, /if \(collapsed\) closeAccountMenu\(\)/, "collapsing the sidebar must close an open account menu");
assert.match(source, /if \(!event\.target\.closest\("\.account-area"\)\) closeAccountMenu\(\)/, "outside clicks must close the account menu");
assert.match(source, /event\.key === "Escape"/, "Escape must close the account menu");
assert.match(markup, /body\.is-sidebar-collapsed \.nav-count \{ display: none; \}/, "collapsed sidebar must hide navigation counts");
assert.doesNotMatch(markup, /body\.is-sidebar-collapsed \.nav-item:hover::after/, "collapsed sidebar must not render detached hover flags");
assert.match(markup, /body\.is-sidebar-collapsed \.account-menu \{[\s\S]*?position: fixed;[\s\S]*?width: 210px;[\s\S]*?left: calc\(var\(--sidebar-collapsed\) \+ 12px\);/, "collapsed account menu must open as a fixed-width flyout");

for (const type of ["customers", "leads"]) {
  assert.match(source, new RegExp(`bindListSelection\\(\\"${type}\\"\\)`), `${type} list selection must be initialized`);
  assert.match(source, new RegExp(`updateListSelection\\(\\"${type}\\"\\)`), `${type} list selection must refresh after rendering`);
}

assert.match(source, /data-select-customer=/, "member rows must expose selectable customer IDs");
assert.match(source, /data-select-lead=/, "legacy lead rows must expose selectable lead IDs");

// Contact and Lead list filters must serialize to backend pagination and filtering parameters.
const fixedNow = new Date("2026-09-03T04:00:00.000Z");
const contactQuery = buildContactQuery({ keyword: "Naderi", stage: "SOLUTION", ownerUserId: "qa-user", nextFollowup: "next7", pageSize: 25 }, 3, fixedNow);
assert.deepEqual(Object.fromEntries(contactQuery), {
  page: "3",
  pageSize: "25",
  orderBy: "updatedAt_desc",
  keyword: "Naderi",
  stage: "SOLUTION",
  ownerUserId: "qa-user",
  nextFollowupFrom: "2026-09-03T04:00:00.000Z",
  nextFollowupTo: "2026-09-10T04:00:00.000Z",
});

const leadQuery = buildLeadQuery({ keyword: "AR", status: "SOLUTION", priority: "HIGH", salesOwnerUserId: "qa-user", followupOwnerUserId: "sales-user", nextFollowup: "overdue" }, 2, fixedNow);
assert.deepEqual(Object.fromEntries(leadQuery), {
  page: "2",
  pageSize: "20",
  orderBy: "updatedAt_desc",
  keyword: "AR",
  status: "SOLUTION",
  priority: "HIGH",
  salesOwnerUserId: "qa-user",
  followupOwnerUserId: "sales-user",
  nextFollowupTo: "2026-09-03T04:00:00.000Z",
});

// Frontend validation mirrors the frozen API contract without inventing uniqueness rules.
assert.deepEqual(validateContactPayload({ contactName: "", email: null, phone: null }), { contactName: "请输入客户联系人" });
assert.deepEqual(validateContactPayload({ contactName: "Only a name", email: null, phone: null }), {}, "both email and phone may be null");
assert.deepEqual(validateContactPayload({ contactName: "Naderi", email: "invalid", website: "ftp://invalid.test", linkedin: "not-a-url" }), {
  email: "请输入有效的 Email 地址",
  website: "请输入以 http:// 或 https:// 开头的 URL",
  linkedin: "请输入以 http:// 或 https:// 开头的 URL",
});

assert.equal(localDateTimeToIso("2026-09-03T14:30").endsWith("Z"), true, "datetime-local values must become timezone-aware ISO strings");
assert.equal(localDateTimeToIso("not-a-date"), null, "invalid local dates must not be submitted");

assert.deepEqual(validateLeadPayload({ contactId: null, requirementSummary: "", estimatedQuote: null, currency: null }), {
  contactId: "请先选择客户联系人",
  requirementSummary: "请输入项目需求简述",
});
assert.deepEqual(validateLeadPayload({ contactId: "contact-1", requirementSummary: "AR service", estimatedQuote: "63000.50", currency: null }), {
  currency: "填写预计报价时必须选择币种",
});
assert.deepEqual(validateLeadPayload({ contactId: "contact-1", requirementSummary: "AR service", estimatedQuote: "-1", currency: "CNY" }), {
  estimatedQuote: "预计报价不能为负数",
});
assert.equal(LEAD_FIELDS.some((field) => ["email", "phone", "contactEmail", "contactPhone"].includes(field.key)), false, "Lead form metadata must not expose editable Contact communication fields");

const contactSummary = readonlyContactMarkup({
  id: "contact-1",
  contactName: "Naderi",
  companyShortName: "Dena",
  title: "Director",
  email: "naderi@example.test",
  phone: "+98 21 5555 0188",
  industry: "Electronics",
  country: "Iran",
  city: "Tehran",
});
assert.match(contactSummary, /所属 Contact · 只读/);
assert.match(contactSummary, /Automatic Field/);
assert.doesNotMatch(contactSummary, /<(?:input|select|textarea)\b/, "selected Contact summary must be read-only");

const timeline = renderTimelineMarkup([{
  id: "followup-1",
  occurredAt: "2026-09-03T04:00:00.000Z",
  type: "CALL",
  owner: { name: "陈销售" },
  createdBy: { name: "交互测试管理员" },
  content: "Confirmed technical workshop.",
  important: true,
  createdAt: "2026-09-03T04:05:00.000Z",
}], "lead");
assert.match(timeline, /Confirmed technical workshop\./);
assert.match(timeline, /重要/);
assert.doesNotMatch(timeline, /(?:编辑|删除|Edit|Delete|data-followup-edit|data-followup-delete)/i, "append-only timelines must not expose edit or delete actions");

assert.equal(quoteDisplay({ estimatedQuote: "63000.50", currency: "USD" }), "USD 63000.50", "Decimal strings must be displayed without floating-point conversion");
assert.equal(quoteDisplay({ estimatedQuote: null, currency: null }), "-");
assert.deepEqual(friendlyError({ status: 403 }), { title: "没有操作权限", message: "你没有执行此操作的权限。" });
assert.deepEqual(friendlyError({ status: 404 }), { title: "记录不存在", message: "该记录不存在或已无法访问。" });
assert.deepEqual(friendlyError({ status: 422, message: "字段校验失败" }), { title: "提交内容有误", message: "字段校验失败" });

console.log("frontend interaction contracts: PASS (legacy + CRM behavior)");
