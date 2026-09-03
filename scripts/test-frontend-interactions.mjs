import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { friendlyError, localDateTimeToIso } from "../frontend/js/api.js";
import { buildContactQuery } from "../frontend/js/contacts.js";
import { LEAD_FIELDS, validateContactPayload, validateLeadPayload } from "../frontend/js/field-definitions.js";
import { renderTimelineMarkup } from "../frontend/js/followups.js";
import { buildLeadQuery, quoteDisplay, readonlyContactMarkup } from "../frontend/js/leads.js";
import { preflightMessage, preflightStatusLabel } from "../frontend/js/crm-jobs.js";

const [appSource, markup, styles, contactSource, leadSource, jobSource, followupSource] = await Promise.all([
  "app.js", "../index.html", "../styles/production.css", "contacts.js", "leads.js", "crm-jobs.js", "followups.js",
].map((file) => readFile(new URL(`../frontend/js/${file}`, import.meta.url), "utf8")));

const navOrder = [...markup.matchAll(/class="nav-item"[^>]*data-route="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(navOrder, ["leads", "contacts", "accounts", "roles", "audit"], "线索必须是左侧第一项，且不得存在旧业务导航");
assert.match(markup, /<html lang="zh-CN">/);
assert.match(markup, /assets\/kivisense-logo\.svg/);
assert.match(styles, /\.app-brand-logo-shell[^{]*\{[^}]*overflow:\s*visible/s, "Logo 容器不得裁剪");
assert.match(styles, /\.app-brand-logo[^{]*\{[^}]*object-fit:\s*contain/s, "Logo 必须按比例完整显示");
assert.doesNotMatch(appSource, /Object\.groupBy/, "前端不得依赖兼容性不足的 Object.groupBy");
assert.match(appSource, /localStorage\.setItem\("kivisense\.crm\.sidebar\.collapsed"/, "侧栏状态必须持久化");

for (const requiredId of [
  "crmLeadsView", "crmLeadDetailView", "crmContactsView", "crmContactDetailView", "accountsView", "rolesView", "auditView",
  "loginOverlay", "loginForm", "loginAccountInput", "loginPasswordInput", "changePasswordDialog", "accountDialog", "toast",
]) assert.match(markup, new RegExp(`id="${requiredId}"`), `缺少前端节点 ${requiredId}`);

for (const legacy of ["Sowind", "sowind", "会员", "旧线索", "Brand Scope", "Gateway", "Legacy"]) {
  assert.doesNotMatch(`${markup}\n${appSource}\n${styles}`, new RegExp(legacy, "i"), `前端仍包含旧业务文本：${legacy}`);
}

const fixedNow = new Date("2026-09-03T04:00:00.000Z");
assert.deepEqual(Object.fromEntries(buildContactQuery({ keyword: "Naderi", stage: "SOLUTION", ownerUserId: "qa-user", nextFollowup: "next7", pageSize: 25 }, 3, fixedNow)), {
  page: "3", pageSize: "25", orderBy: "updatedAt_desc", keyword: "Naderi", stage: "SOLUTION", ownerUserId: "qa-user",
  nextFollowupFrom: "2026-09-03T04:00:00.000Z", nextFollowupTo: "2026-09-10T04:00:00.000Z",
});
assert.deepEqual(Object.fromEntries(buildLeadQuery({ keyword: "AR", status: "SOLUTION", priority: "HIGH", salesOwnerUserId: "qa-user", followupOwnerUserId: "sales-user", nextFollowup: "overdue" }, 2, fixedNow)), {
  page: "2", pageSize: "20", orderBy: "updatedAt_desc", keyword: "AR", status: "SOLUTION", priority: "HIGH",
  salesOwnerUserId: "qa-user", followupOwnerUserId: "sales-user", nextFollowupTo: "2026-09-03T04:00:00.000Z",
});

assert.deepEqual(validateContactPayload({ contactName: "", email: null, phone: null }), { contactName: "请输入客户联系人" });
assert.deepEqual(validateContactPayload({ contactName: "只有姓名", email: null, phone: null }), {});
assert.deepEqual(validateContactPayload({ contactName: "Naderi", email: "invalid", website: "ftp://invalid.test", linkedin: "not-a-url" }), {
  email: "请输入有效的电子邮箱地址", website: "请输入以 http:// 或 https:// 开头的 URL", linkedin: "请输入以 http:// 或 https:// 开头的 URL",
});
assert.equal(localDateTimeToIso("2026-09-03T14:30").endsWith("Z"), true);
assert.equal(localDateTimeToIso("not-a-date"), null);
assert.deepEqual(validateLeadPayload({ contactId: null, requirementSummary: "", estimatedQuote: null, currency: null }), {
  contactId: "请先选择客户联系人", requirementSummary: "请输入项目需求简述",
});
assert.deepEqual(validateLeadPayload({ contactId: "contact-1", requirementSummary: "AR 服务", estimatedQuote: "63000.50", currency: null }), {
  currency: "填写预计报价时必须选择币种",
});
assert.equal(LEAD_FIELDS.some((field) => ["email", "phone", "contactEmail", "contactPhone"].includes(field.key)), false, "线索表单不能重复编辑联系人通讯字段");

const contactSummary = readonlyContactMarkup({
  id: "contact-1", contactName: "Naderi", companyShortName: "Dena", title: "总监", email: "naderi@example.test",
  phone: "+98 21 5555 0188", industry: "电子", country: "伊朗", city: "德黑兰",
});
assert.match(contactSummary, /所属客户联系人/);
assert.match(contactSummary, /系统自动关联/);
assert.doesNotMatch(contactSummary, /<(?:input|select|textarea)\b/, "联系人关联摘要必须只读");

const timeline = renderTimelineMarkup([{
  id: "followup-1", occurredAt: "2026-09-03T04:00:00.000Z", type: "CALL", owner: { name: "陈销售" },
  createdBy: { name: "交互测试管理员" }, content: "已确认技术沟通。", important: true, createdAt: "2026-09-03T04:05:00.000Z",
}], "lead");
assert.match(timeline, /已确认技术沟通/);
assert.match(timeline, /重要/);
assert.doesNotMatch(timeline, /(?:编辑|删除|data-followup-edit|data-followup-delete)/, "跟进时间线只能追加");

assert.equal(quoteDisplay({ estimatedQuote: "63000.50", currency: "USD" }), "USD 63000.50");
assert.equal(quoteDisplay({ estimatedQuote: null, currency: null }), "-");
assert.match(contactSource, /data-crm-permission="crm\.contact\.import"/);
assert.match(contactSource, /data-crm-permission="crm\.contact\.export"/);
assert.match(leadSource, /data-crm-permission="crm\.lead\.import"/);
assert.match(leadSource, /data-crm-permission="crm\.lead\.export"/);
assert.match(jobSource, /确认导入 \$\{state\.job\.preflight\.importableRows\} 条/);
assert.match(jobSource, /下载失败明细/);
assert.match(jobSource, /正在生成导出文件/);
assert.equal(preflightStatusLabel("WARNING"), "需注意");
assert.equal(preflightStatusLabel("ERROR"), "有错误");
assert.equal(preflightMessage({ errors: [], warnings: [{ message: "电子邮箱可能重复" }] }), "电子邮箱可能重复");
assert.equal(preflightMessage({ errors: [], warnings: [] }), "可以导入");
assert.match(followupSource, /沟通记录/);
assert.doesNotMatch(followupSource, />FOLLOWUP</);
assert.deepEqual(friendlyError({ status: 403 }), { title: "没有操作权限", message: "你没有执行此操作的权限。" });
assert.deepEqual(friendlyError({ status: 404 }), { title: "记录不存在", message: "该记录不存在或已无法访问。" });

console.log("frontend interaction contracts: PASS (Kivisense CRM 2.0)");
