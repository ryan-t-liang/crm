const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3310";
const loginAccount = process.env.QA_LOGIN_ACCOUNT;
const password = process.env.QA_LOGIN_PASSWORD;
const runKey = process.env.QA_RUN_KEY || String(Date.now());

if (!loginAccount || !password) throw new Error("QA_LOGIN_ACCOUNT and QA_LOGIN_PASSWORD are required");

let cookie = "";
async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...(options.headers || {}),
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${path}: ${result.error?.code || "ERROR"} ${result.error?.message || ""}`);
  return { response, result };
}

const login = await api("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ loginAccount, password }) });
cookie = (login.response.headers.getSetCookie?.()[0] || login.response.headers.get("set-cookie") || "").split(";", 1)[0];
if (!cookie) throw new Error("Login did not return a session cookie");
const me = (await api("/api/v1/auth/me")).result.data;

const iso = (offsetDays, hour = 10) => {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};
const createOrganization = async (suffix, input) => (await api("/api/v1/crm/organizations", {
  method: "POST",
  body: JSON.stringify({ name: `${input.name} ${runKey}`, shortName: input.shortName, roles: input.roles, lifecycleStage: input.lifecycleStage || "TARGET", ownerUserId: me.id, fitScore: input.fitScore, fitReason: input.fitReason, industry: input.industry || "Consumer Technology", country: "中国", region: "华东", city: suffix === "vendor" ? "苏州" : "上海", website: `https://${suffix}-${runKey}.example.test` }),
})).result.data;
const createContact = async (organization, name, email) => (await api("/api/v1/crm/contacts", {
  method: "POST",
  body: JSON.stringify({ organizationId: organization.id, contactName: name, title: "业务负责人", department: "Business Development", email, stage: "ONE_TO_ONE", ownerUserId: me.id, source: "Browser QA" }),
})).result.data;
const createTask = async (input) => (await api("/api/v1/crm/tasks", { method: "POST", body: JSON.stringify({ ownerUserId: me.id, priority: "NORMAL", ...input }) })).result.data;

const priority = await createOrganization("priority", { name: "星河科技", shortName: "星河", roles: ["PROSPECT", "PARTNER"], fitScore: 92, fitReason: "行业、规模与技术路线高度匹配，存在明确的长期合作机会。" });
const dormant = await createOrganization("dormant", { name: "远航智能", shortName: "远航", roles: ["PROSPECT"], fitScore: 86, fitReason: "高 Fit，但近两个月没有有效互动，需要优先唤醒。" });
const nurture = await createOrganization("nurture", { name: "晨光消费电子", shortName: "晨光", roles: ["PROSPECT"], fitScore: 68, fitReason: "需求成立，等待下一财年预算窗口。" });
const customer = await createOrganization("customer", { name: "北辰品牌集团", shortName: "北辰", roles: ["CUSTOMER"], lifecycleStage: "CUSTOMER", fitScore: 78, fitReason: "已有成交项目，可继续拓展跨品牌合作。" });
const vendor = await createOrganization("vendor", { name: "景深数字制作", shortName: "景深", roles: ["VENDOR", "PARTNER"], fitScore: 55, fitReason: "交付稳定，可作为 3D 内容供应商。" });

const priorityContact = await createContact(priority, "林睿", `lin-${runKey}@example.test`);
const dormantContact = await createContact(dormant, "周宁", `zhou-${runKey}@example.test`);
const nurtureContact = await createContact(nurture, "王琪", `wang-${runKey}@example.test`);
const customerContact = await createContact(customer, "陈悦", `chen-${runKey}@example.test`);
await createContact(vendor, "赵景", `zhao-${runKey}@example.test`);

const lead = (await api("/api/v1/crm/leads", { method: "POST", body: JSON.stringify({ contactId: priorityContact.id, requirementSummary: "WebAR 产品展示与内容运营", requirementDetail: "需要支持多款产品的浏览器端 AR 展示，并形成长期内容运营机制。", priority: "HIGH", status: "SOLUTION", salesOwnerUserId: me.id, followupOwnerUserId: me.id, participantUserIds: [me.id], leadSource: "Convention", projectDomain: "AR Commerce", projectType: "Application Service" }) })).result.data;
await api(`/api/v1/crm/leads/${lead.id}/followups`, { method: "POST", body: JSON.stringify({ occurredAt: iso(-2), type: "MEETING", content: "已完成业务与技术方案评审，客户希望下周确认实施范围。", progress: "方案评审完成", nextAction: "确认一期实施范围", nextFollowupAt: iso(1), ownerUserId: me.id, important: true }) });

const wonLead = (await api("/api/v1/crm/leads", { method: "POST", body: JSON.stringify({ contactId: customerContact.id, requirementSummary: "产品数字化展示一期", priority: "MEDIUM", status: "QUOTATION", salesOwnerUserId: me.id, followupOwnerUserId: me.id }) })).result.data;
await api(`/api/v1/crm/leads/${wonLead.id}`, { method: "PATCH", body: JSON.stringify({ status: "WON" }) });

await api(`/api/v1/crm/contacts/${nurtureContact.id}/followups`, { method: "POST", body: JSON.stringify({ occurredAt: iso(-35), type: "CALL", content: "客户确认项目延后到下一预算周期。", ownerUserId: me.id }) });
await api(`/api/v1/crm/organizations/${nurture.id}/nurtures`, { method: "POST", body: JSON.stringify({ ownerUserId: me.id, reason: "等待下一财年预算", objective: "在预算启动前完成技术方案预沟通", cadenceDays: 14, nextTouchAt: iso(5), touchTopic: "确认预算和内部决策节奏" }) });

const overdue = await createTask({ organizationId: dormant.id, contactId: dormantContact.id, title: "重新确认远航智能项目优先级", description: "高 Fit 客户已沉睡，需要确认今年是否重新启动。", priority: "HIGH", dueAt: iso(-2) });
await createTask({ organizationId: priority.id, contactId: priorityContact.id, leadId: lead.id, title: "准备一期范围确认材料", description: "结合方案评审结果整理范围边界。", priority: "HIGH", dueAt: iso(0, 16) });
const completed = await createTask({ organizationId: customer.id, contactId: customerContact.id, title: "回访一期交付满意度", dueAt: iso(-3) });
await api(`/api/v1/crm/tasks/${completed.id}/complete`, { method: "POST", body: "{}" });

console.log(JSON.stringify({ runKey, userId: me.id, priorityOrganizationId: priority.id, dormantOrganizationId: dormant.id, nurtureOrganizationId: nurture.id, vendorOrganizationId: vendor.id, priorityContactId: priorityContact.id, leadId: lead.id, overdueTaskId: overdue.id }, null, 2));
