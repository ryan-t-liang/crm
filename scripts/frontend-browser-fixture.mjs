import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("../frontend/", import.meta.url));
const fixturePort = Number(process.env.PORT || 8766);
const now = "2026-09-03T09:30:00.000Z";
const crmUsers = [
  { id: "qa-user", name: "交互测试管理员", loginAccount: "qa@example.test", status: "ACTIVE" },
  { id: "sales-user", name: "陈销售", loginAccount: "sales@example.test", status: "ACTIVE" },
];
const initialContacts = [
  {
    id: "contact-naderi",
    contactName: "Naderi",
    title: "Business Development Director",
    department: "Business Development",
    companyShortName: "Dena",
    companyName: "Dena Technologies Co., Ltd.",
    industry: "Consumer Electronics",
    website: "https://dena.example.test",
    email: "naderi@dena.example.test",
    phone: "+98 21 5555 0188",
    wechat: "naderi_dena",
    linkedin: "https://linkedin.com/in/naderi-demo",
    country: "Iran",
    city: "Tehran",
    region: "Middle East",
    source: "Convention",
    stage: "SOLUTION",
    ownerUserId: "qa-user",
    nextFollowupAt: "2026-09-08T02:00:00.000Z",
    followupAttention: "技术会前确认 CAD 文件权限与参会名单。",
    initialContext: "Met at an industry convention and discussed AR product presentation.",
    remark: "Decision maker for digital cooperation.",
    createdByUserId: "qa-user",
    createdAt: "2026-08-21T03:10:00.000Z",
    updatedAt: "2026-09-03T08:40:00.000Z",
    deletedAt: null,
  },
  {
    id: "contact-lina",
    contactName: "Lina Zhou",
    title: "Innovation Manager",
    department: "Innovation Lab",
    companyShortName: "Northstar",
    companyName: "Northstar Retail Group",
    industry: "Retail",
    website: "https://northstar.example.test",
    email: "lina@northstar.example.test",
    phone: null,
    wechat: null,
    linkedin: null,
    country: "China",
    city: "Shanghai",
    region: "East China",
    source: "Referral",
    stage: "ONE_TO_ONE",
    ownerUserId: "sales-user",
    nextFollowupAt: "2026-09-03T04:30:00.000Z",
    followupAttention: "优先通过微信联系。",
    initialContext: "Referred by an existing project partner.",
    remark: null,
    createdByUserId: "sales-user",
    createdAt: "2026-08-29T06:00:00.000Z",
    updatedAt: "2026-09-02T10:20:00.000Z",
    deletedAt: null,
  },
];

const initialLeads = [
  {
    id: "lead-ar-service",
    contactId: "contact-naderi",
    requirementSummary: "AR application and service cooperation for our products",
    requirementDetail: "Build an AR product presentation experience for the new product line.",
    latestProgress: "Product samples and API documentation received.",
    nextAction: "Confirm revised scope and workshop schedule.",
    imageRequirementNote: "Use front-facing product pack shots on a clean background.",
    leadSource: "Kiviman",
    priority: "HIGH",
    status: "SOLUTION",
    estimatedQuote: "63000.50",
    currency: "USD",
    projectDomain: "AR commerce",
    projectType: "Application service",
    technologyType: "Kivicube Engine\nWebAR",
    productType: "Consumer electronics",
    productName: "Dena Vision Series",
    resourceRequirement: "3D assets and product data API access.",
    collaborationGroups: "Dena AR 项目群\nKivisense 交付群",
    followMode: "联合跟单",
    solution: "Browser-based AR viewer with CMS integration.",
    quotationNote: "Includes implementation and one year of support.",
    remark: "Target launch in Q4.",
    salesOwnerUserId: "qa-user",
    followupOwnerUserId: "sales-user",
    nextFollowupAt: "2026-09-08T02:00:00.000Z",
    lastFollowupAt: "2026-09-02T07:30:00.000Z",
    wonAt: null,
    deliveryFollowupAt: "2026-10-02T02:00:00.000Z",
    contractRenewalAt: null,
    paymentReceivedAt: null,
    participantUserIds: ["qa-user", "sales-user"],
    createdByUserId: "qa-user",
    createdAt: "2026-08-22T04:00:00.000Z",
    updatedAt: "2026-09-03T08:45:00.000Z",
    deletedAt: null,
  },
  {
    id: "lead-oem",
    contactId: "contact-naderi",
    requirementSummary: "OEM cooperation for interactive product displays",
    requirementDetail: "Explore embedded visualization capabilities for OEM distribution.",
    latestProgress: "Commercial model under review.",
    nextAction: "Share the OEM commercial model.",
    imageRequirementNote: null,
    leadSource: "Kiviman",
    priority: "MEDIUM",
    status: "QUALIFIED",
    estimatedQuote: null,
    currency: null,
    projectDomain: "OEM",
    projectType: "Cooperation",
    technologyType: null,
    productType: "Display",
    productName: null,
    resourceRequirement: null,
    solution: null,
    quotationNote: null,
    remark: null,
    salesOwnerUserId: "qa-user",
    followupOwnerUserId: "qa-user",
    nextFollowupAt: "2026-09-11T03:00:00.000Z",
    lastFollowupAt: null,
    wonAt: null,
    deliveryFollowupAt: null,
    contractRenewalAt: null,
    paymentReceivedAt: null,
    participantUserIds: ["qa-user"],
    createdByUserId: "qa-user",
    createdAt: "2026-08-30T03:00:00.000Z",
    updatedAt: "2026-09-01T05:00:00.000Z",
    deletedAt: null,
  },
  {
    id: "lead-digital",
    contactId: "contact-lina",
    requirementSummary: "Digital solution for flagship retail experience",
    requirementDetail: "Interactive product storytelling for the Shanghai flagship store.",
    latestProgress: null,
    nextAction: "Customer to confirm budget approval.",
    imageRequirementNote: "Provide Shanghai flagship store references.",
    leadSource: "展会转介",
    priority: "URGENT",
    status: "QUOTATION",
    estimatedQuote: "280000.00",
    currency: "CNY",
    projectDomain: "Retail experience",
    projectType: "Digital installation",
    technologyType: "Realtime 3D",
    productType: "In-store experience",
    productName: null,
    resourceRequirement: null,
    solution: "Interactive display system connected to the product catalog.",
    quotationNote: "Budget split by hardware and content production.",
    remark: null,
    salesOwnerUserId: "sales-user",
    followupOwnerUserId: "sales-user",
    nextFollowupAt: "2026-09-04T07:00:00.000Z",
    lastFollowupAt: "2026-09-02T09:10:00.000Z",
    wonAt: null,
    deliveryFollowupAt: null,
    contractRenewalAt: null,
    paymentReceivedAt: null,
    participantUserIds: ["sales-user"],
    createdByUserId: "sales-user",
    createdAt: "2026-08-31T03:00:00.000Z",
    updatedAt: "2026-09-02T09:15:00.000Z",
    deletedAt: null,
  },
];

const initialContactFollowups = {
  "contact-naderi": [
    { id: "contact-followup-1", contactId: "contact-naderi", occurredAt: "2026-09-02T07:30:00.000Z", type: "MEETING", ownerUserId: "sales-user", content: "Reviewed the AR service scope and confirmed the first product batch.", nextFollowupAt: "2026-09-08T02:00:00.000Z", createdByUserId: "qa-user", createdAt: "2026-09-02T07:45:00.000Z" },
    { id: "contact-followup-2", contactId: "contact-naderi", occurredAt: "2026-08-25T03:00:00.000Z", type: "EMAIL", ownerUserId: "qa-user", content: "Shared capability deck and reference cases.", nextFollowupAt: null, createdByUserId: "qa-user", createdAt: "2026-08-25T03:05:00.000Z" },
  ],
};
const initialLeadFollowups = {
  "lead-ar-service": [
    { id: "lead-followup-1", leadId: "lead-ar-service", occurredAt: "2026-09-02T07:30:00.000Z", type: "CALL", ownerUserId: "sales-user", important: true, content: "Confirmed technical workshop participants and requested CAD source files.", progress: "Workshop scope confirmed.", nextAction: "Customer uploads CAD source files.", nextFollowupAt: "2026-09-08T02:00:00.000Z", createdByUserId: "qa-user", createdAt: "2026-09-02T07:42:00.000Z" },
  ],
};
const initialCrmAttachments = [
  { id: "attachment-requirement", entityType: "LEAD", entityId: "lead-ar-service", fieldKey: "requirementFiles", storageType: "LOCAL", originalName: "AR-需求说明.pdf", mimeType: "application/pdf", kind: "DOCUMENT", fileSize: 428560, createdAt: "2026-09-02T08:00:00.000Z", uploadedBy: crmUsers[0] },
  { id: "attachment-image", entityType: "LEAD", entityId: "lead-ar-service", fieldKey: "requirementImages", storageType: "LOCAL", originalName: "AR-交互参考图.png", mimeType: "image/png", kind: "IMAGE", fileSize: 186240, createdAt: "2026-09-02T08:10:00.000Z", uploadedBy: crmUsers[1] },
  { id: "attachment-proposal", entityType: "LEAD", entityId: "lead-ar-service", fieldKey: "proposalFiles", storageType: "EXTERNAL_URL", originalName: "AR-正式方案.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "DOCUMENT", fileSize: null, externalUrl: "https://example.test/ar-proposal.docx", createdAt: "2026-09-02T08:20:00.000Z", uploadedBy: crmUsers[0] },
  { id: "attachment-quotation", entityType: "LEAD", entityId: "lead-ar-service", fieldKey: "quotationFiles", storageType: "LOCAL", originalName: "AR-报价单.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "DOCUMENT", fileSize: 96540, createdAt: "2026-09-02T08:30:00.000Z", uploadedBy: crmUsers[0] },
  { id: "attachment-minutes", entityType: "CONTACT", entityId: "contact-naderi", fieldKey: "meetingMinutesFiles", storageType: "LOCAL", originalName: "Dena-会议纪要.pdf", mimeType: "application/pdf", kind: "DOCUMENT", fileSize: 118820, createdAt: "2026-09-02T07:50:00.000Z", uploadedBy: crmUsers[0] },
  { id: "attachment-followup", entityType: "LEAD_FOLLOWUP", entityId: "lead-followup-1", fieldKey: "followupAttachments", storageType: "LOCAL", originalName: "CAD-source-checklist.pdf", mimeType: "application/pdf", kind: "DOCUMENT", fileSize: 88220, createdAt: "2026-09-02T07:48:00.000Z", uploadedBy: crmUsers[0] },
];

const clone = (value) => structuredClone(value);
let contacts;
let crmLeads;
let contactFollowups;
let leadFollowups;
let crmAttachments;
let fixtureRole;
let emptyContacts;
let emptyLeads;
let nextId;
let requestLog;
let failNext;
let crmImportJobs;
let crmExportJobs;

function resetFixture() {
  contacts = clone(initialContacts);
  crmLeads = clone(initialLeads);
  contactFollowups = clone(initialContactFollowups);
  leadFollowups = clone(initialLeadFollowups);
  crmAttachments = clone(initialCrmAttachments);
  fixtureRole = "SUPER_ADMIN";
  emptyContacts = false;
  emptyLeads = false;
  nextId = 1;
  requestLog = [];
  failNext = null;
  crmImportJobs = [];
  crmExportJobs = [];
}
resetFixture();

const rolePermissions = {
  VIEWER: ["crm.contact.view", "crm.contact_followup.view", "crm.lead.view", "crm.lead_followup.view"],
  SALES: ["crm.contact.view", "crm.contact.create", "crm.contact.edit", "crm.contact.delete", "crm.contact_followup.view", "crm.contact_followup.create", "crm.lead.view", "crm.lead.create", "crm.lead.edit", "crm.lead.delete", "crm.lead_followup.view", "crm.lead_followup.create"],
  SUPER_ADMIN: [
    "crm.contact.view", "crm.contact.create", "crm.contact.edit", "crm.contact.delete", "crm.contact_followup.view", "crm.contact_followup.create",
    "crm.lead.view", "crm.lead.create", "crm.lead.edit", "crm.lead.delete", "crm.lead_followup.view", "crm.lead_followup.create",
    "crm.contact.import", "crm.contact.export", "crm.lead.import", "crm.lead.export",
    "account.view", "account.create", "account.edit", "account.disable", "account.reset", "roles.view", "roles.configure", "audit.view",
  ],
};

function userSummary(id) {
  return crmUsers.find((user) => user.id === id) || null;
}

function decorateContact(contact) {
  return {
    ...contact,
    owner: userSummary(contact.ownerUserId),
    createdBy: userSummary(contact.createdByUserId),
    relatedLeadCount: crmLeads.filter((lead) => lead.contactId === contact.id && !lead.deletedAt).length,
    attachments: clone(crmAttachments.filter((attachment) => attachment.entityType === "CONTACT" && attachment.entityId === contact.id)),
  };
}

function decorateFollowup(followup) {
  const entityType = followup.contactId ? "CONTACT_FOLLOWUP" : "LEAD_FOLLOWUP";
  return { ...followup, owner: userSummary(followup.ownerUserId), createdBy: userSummary(followup.createdByUserId), attachments: clone(crmAttachments.filter((item) => item.entityType === entityType && item.entityId === followup.id)) };
}

function decorateLead(lead) {
  const attachments = crmAttachments.filter((attachment) => attachment.entityType === "LEAD" && attachment.entityId === lead.id);
  return {
    ...lead,
    contact: decorateContact(contacts.find((contact) => contact.id === lead.contactId)),
    salesOwner: userSummary(lead.salesOwnerUserId),
    followupOwner: userSummary(lead.followupOwnerUserId),
    createdBy: userSummary(lead.createdByUserId),
    participants: (lead.participantUserIds || []).map((userId) => ({ user: userSummary(userId) })).filter((item) => item.user),
    attachments: clone(attachments),
    _count: { followups: (leadFollowups[lead.id] || []).length, participants: (lead.participantUserIds || []).length },
  };
}

function pagination(url, total) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.max(1, Number(url.searchParams.get("pageSize") || 20));
  return { page, pageSize, total, pageCount: Math.ceil(total / pageSize) };
}

function paged(rows, url) {
  const meta = pagination(url, rows.length);
  return { data: rows.slice((meta.page - 1) * meta.pageSize, meta.page * meta.pageSize), meta };
}

function inDateRange(value, url) {
  const from = url.searchParams.get("nextFollowupFrom");
  const to = url.searchParams.get("nextFollowupTo");
  if (!from && !to) return true;
  if (!value) return false;
  const timestamp = Date.parse(value);
  return (!from || timestamp >= Date.parse(from)) && (!to || timestamp <= Date.parse(to));
}

function filteredContacts(url) {
  if (emptyContacts) return [];
  const keyword = (url.searchParams.get("keyword") || "").toLocaleLowerCase();
  return contacts
    .filter((contact) => !contact.deletedAt)
    .filter((contact) => !keyword || [contact.contactName, contact.companyName, contact.companyShortName, contact.email, contact.phone].some((value) => String(value || "").toLocaleLowerCase().includes(keyword)))
    .filter((contact) => !url.searchParams.get("stage") || contact.stage === url.searchParams.get("stage"))
    .filter((contact) => !url.searchParams.get("ownerUserId") || contact.ownerUserId === url.searchParams.get("ownerUserId"))
    .filter((contact) => inDateRange(contact.nextFollowupAt, url))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(decorateContact);
}

function filteredLeads(url) {
  if (emptyLeads) return [];
  const keyword = (url.searchParams.get("keyword") || "").toLocaleLowerCase();
  return crmLeads
    .filter((lead) => !lead.deletedAt && !contacts.find((item) => item.id === lead.contactId)?.deletedAt)
    .filter((lead) => {
      const contact = contacts.find((item) => item.id === lead.contactId);
      return !keyword || [lead.requirementSummary, contact?.contactName, contact?.companyName, contact?.companyShortName].some((value) => String(value || "").toLocaleLowerCase().includes(keyword));
    })
    .filter((lead) => !url.searchParams.get("contactId") || lead.contactId === url.searchParams.get("contactId"))
    .filter((lead) => !url.searchParams.get("status") || lead.status === url.searchParams.get("status"))
    .filter((lead) => !url.searchParams.get("priority") || lead.priority === url.searchParams.get("priority"))
    .filter((lead) => !url.searchParams.get("salesOwnerUserId") || lead.salesOwnerUserId === url.searchParams.get("salesOwnerUserId"))
    .filter((lead) => !url.searchParams.get("followupOwnerUserId") || lead.followupOwnerUserId === url.searchParams.get("followupOwnerUserId"))
    .filter((lead) => inDateRange(lead.nextFollowupAt, url))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(decorateLead);
}

function sendJson(response, payload, statusCode = 200) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

function sendError(response, status, code, message) {
  sendJson(response, { error: { code, message }, traceId: `fixture-${status}` }, status);
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  const buffer = Buffer.concat(chunks);
  if (String(request.headers["content-type"] || "").includes("multipart/form-data")) return { multipart: true, size: buffer.length };
  return JSON.parse(buffer.toString("utf8"));
}

function applyDefaults(input, defaults) {
  return Object.fromEntries(Object.entries({ ...defaults, ...input }).map(([key, value]) => [key, value === "" ? null : value]));
}

function contactJourney(contact) {
  const leads = crmLeads.filter((lead) => lead.contactId === contact.id);
  const events = [{ id: `contact-created-${contact.id}`, occurredAt: contact.createdAt, category: "MILESTONE", type: "CONTACT_CREATED", title: "创建联系人", summary: `建立 ${contact.contactName} 的客户档案`, actor: userSummary(contact.createdByUserId), relatedLead: null, attachments: [] }];
  for (const followup of contactFollowups[contact.id] || []) events.push({ id: `contact-followup-${followup.id}`, occurredAt: followup.occurredAt, category: "INTERACTION", type: "CONTACT_FOLLOWUP", title: "客户互动", summary: followup.content, actor: userSummary(followup.ownerUserId), relatedLead: null, attachments: crmAttachments.filter((item) => item.entityType === "CONTACT_FOLLOWUP" && item.entityId === followup.id) });
  for (const lead of leads) {
    const relatedLead = { id: lead.id, requirementSummary: lead.requirementSummary, deleted: Boolean(lead.deletedAt) };
    events.push({ id: `lead-created-${lead.id}`, occurredAt: lead.createdAt, category: "LEAD", type: "LEAD_CREATED", title: "创建线索", summary: lead.requirementSummary, actor: userSummary(lead.createdByUserId), relatedLead, attachments: crmAttachments.filter((item) => item.entityType === "LEAD" && item.entityId === lead.id) });
    for (const followup of leadFollowups[lead.id] || []) events.push({ id: `lead-followup-${followup.id}`, occurredAt: followup.occurredAt, category: "INTERACTION", type: "LEAD_FOLLOWUP", title: "线索跟进", summary: followup.content, progress: followup.progress, nextAction: followup.nextAction, actor: userSummary(followup.ownerUserId), relatedLead, attachments: crmAttachments.filter((item) => item.entityType === "LEAD_FOLLOWUP" && item.entityId === followup.id) });
  }
  const legacyFiles = crmAttachments.filter((item) => item.entityType === "CONTACT" && item.entityId === contact.id && item.fieldKey === "meetingMinutesFiles");
  if (legacyFiles.length) events.push({ id: `legacy-meeting-${contact.id}`, occurredAt: legacyFiles[0].createdAt, category: "INTERACTION", type: "LEGACY_MEETING_FILES", title: "历史会议资料", summary: "历史会议资料，未关联具体互动", actor: legacyFiles[0].uploadedBy, relatedLead: null, attachments: legacyFiles });
  events.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  const activeLeads = leads.filter((lead) => !lead.deletedAt && !["WON", "LOST"].includes(lead.status));
  const followupDates = [contact.nextFollowupAt, ...activeLeads.map((lead) => lead.nextFollowupAt)].filter(Boolean).sort();
  return { summary: { activeLeadCount: activeLeads.length, wonLeadCount: leads.filter((lead) => !lead.deletedAt && lead.status === "WON").length, recentInteractionAt: events.find((event) => event.category === "INTERACTION")?.occurredAt || null, nextFollowupAt: followupDates[0] || null }, events };
}

async function apiResponse(request, response, url) {
  const method = request.method || "GET";
  const body = ["POST", "PATCH", "PUT"].includes(method) ? await readRequestBody(request) : null;
  requestLog.push({ method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, at: new Date().toISOString() });

  if (url.pathname === "/__fixture/reset" && method === "POST") {
    resetFixture();
    return sendJson(response, { ok: true });
  }
  if (url.pathname === "/__fixture/role" && method === "POST") {
    const role = url.searchParams.get("value");
    if (!rolePermissions[role]) return sendError(response, 400, "VALIDATION_ERROR", "Unknown fixture role");
    fixtureRole = role;
    return sendJson(response, { ok: true, role });
  }
  if (url.pathname === "/__fixture/empty" && method === "POST") {
    if (url.searchParams.has("contacts")) emptyContacts = url.searchParams.get("contacts") === "true";
    if (url.searchParams.has("leads")) emptyLeads = url.searchParams.get("leads") === "true";
    return sendJson(response, { ok: true, emptyContacts, emptyLeads });
  }
  if (url.pathname === "/__fixture/fail-next" && method === "POST") {
    failNext = { path: url.searchParams.get("path") || "", status: Number(url.searchParams.get("status") || 500) };
    return sendJson(response, { ok: true, failNext });
  }
  if (url.pathname === "/__fixture/requests" && method === "GET") return sendJson(response, { data: requestLog });

  if (failNext?.path === url.pathname) {
    const failure = failNext;
    failNext = null;
    const messages = { 401: "登录状态已失效", 403: "当前账户没有此操作权限", 404: "记录不存在", 422: "请求数据校验失败" };
    return sendError(response, failure.status, failure.status === 403 ? "PERMISSION_DENIED" : failure.status === 404 ? "RESOURCE_NOT_FOUND" : "FIXTURE_ERROR", messages[failure.status] || "服务暂时不可用");
  }

  if (url.pathname === "/api/v1/auth/me" && method === "GET") {
    return sendJson(response, { data: { id: "qa-user", name: "交互测试管理员", loginAccount: "qa@example.test", mustChangePassword: false, role: { key: fixtureRole, name: { VIEWER: "只读用户", SALES: "销售人员", SUPER_ADMIN: "超级管理员" }[fixtureRole] }, permissions: rolePermissions[fixtureRole] } });
  }
  if (url.pathname === "/api/v1/crm/users" && method === "GET") return sendJson(response, { data: crmUsers });
  if (url.pathname === "/api/v1/users" && method === "GET") {
    return sendJson(response, { data: crmUsers.map((user, index) => ({ ...user, roleId: index ? "role-sales" : "role-admin", role: index ? { id: "role-sales", key: "SALES", name: "销售人员" } : { id: "role-admin", key: "SUPER_ADMIN", name: "超级管理员" }, lastLoginAt: "2026-09-03T09:00:00.000Z" })) });
  }
  if (url.pathname === "/api/v1/permissions" && method === "GET") {
    return sendJson(response, { data: rolePermissions.SUPER_ADMIN.map((key) => ({ id: `permission-${key}`, key, name: key, module: key.startsWith("account.") ? "account" : key.startsWith("roles.") ? "role" : key.startsWith("audit.") ? "audit" : "crm" })) });
  }
  if (url.pathname === "/api/v1/roles" && method === "GET") {
    return sendJson(response, { data: [
      { id: "role-admin", key: "SUPER_ADMIN", name: "超级管理员", description: "完整管理权限", system: true, permissions: rolePermissions.SUPER_ADMIN.map((key) => ({ permission: { id: `permission-${key}`, key, name: key, module: key.startsWith("account.") ? "account" : key.startsWith("roles.") ? "role" : key.startsWith("audit.") ? "audit" : "crm" } })) },
      { id: "role-sales", key: "SALES", name: "销售人员", description: "联系人和线索业务权限", system: true, permissions: rolePermissions.SALES.map((key) => ({ permission: { id: `permission-${key}`, key, name: key, module: "crm" } })) },
      { id: "role-viewer", key: "VIEWER", name: "只读用户", description: "只读权限", system: true, permissions: rolePermissions.VIEWER.map((key) => ({ permission: { id: `permission-${key}`, key, name: key, module: "crm" } })) },
    ] });
  }
  if (url.pathname === "/api/v1/audit-logs" && method === "GET") {
    return sendJson(response, { data: [
      { id: "audit-contact", actorUserId: "qa-user", actorName: "交互测试管理员", module: "crm", action: "UPDATE_CONTACT", targetType: "contact", targetId: "contact-naderi", requestId: "fixture-contact", details: {}, createdAt: "2026-09-03T08:40:00.000Z" },
      { id: "audit-lead", actorUserId: "sales-user", actorName: "陈销售", module: "crm", action: "UPDATE_CRM_LEAD", targetType: "crm_lead", targetId: "lead-ar-service", requestId: "fixture-lead", details: {}, createdAt: "2026-09-03T08:45:00.000Z" },
    ], meta: { page: 1, pageSize: 100, total: 2, pageCount: 1 } });
  }

  const templateMatch = url.pathname.match(/^\/api\/v1\/crm\/templates\/(contacts|leads)$/);
  if (templateMatch && method === "GET") {
    response.writeHead(200, { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="fixture-${templateMatch[1]}.xlsx"` });
    return response.end(Buffer.from("fixture-xlsx"));
  }

  const crmImportMatch = url.pathname.match(/^\/api\/v1\/crm\/imports\/(contacts|leads)$/);
  if (crmImportMatch && method === "POST") {
    const objectType = crmImportMatch[1] === "contacts" ? "CONTACT" : "CRM_LEAD";
    const primary = objectType === "CONTACT" ? "Naderi / Dena" : "AR application service / contact-naderi";
    const job = {
      id: `crm-import-${nextId++}`, jobNo: `IMP-FIXTURE-${nextId}`, objectType, fileName: `fixture-${crmImportMatch[1]}.xlsx`,
      createdBy: "qa-user", createdAt: new Date().toISOString(), status: "PREFLIGHT_READY", totalCount: 3,
      importableCount: 2, successCount: 0, failedCount: 0,
      preflight: { totalRows: 3, validRows: 1, warningRows: 1, errorRows: 1, importableRows: 2 },
      rows: [
        { rowNumber: 2, identity: primary, status: "VALID", errors: [], warnings: [] },
        { rowNumber: 3, identity: objectType === "CONTACT" ? "Naderi Duplicate / Dena" : "OEM cooperation / contact-naderi", status: "WARNING", errors: [], warnings: [{ code: "POTENTIAL_DUPLICATE", message: "Potential duplicate email: naderi@dena.example.test" }] },
        { rowNumber: 4, identity: objectType === "CONTACT" ? "Missing Name" : "Unknown Contact / missing-contact", status: "ERROR", errors: [{ code: objectType === "CONTACT" ? "REQUIRED" : "CONTACT_NOT_FOUND", message: objectType === "CONTACT" ? "contactName is required" : "Contact ID not found: missing-contact" }], warnings: [] },
      ],
    };
    crmImportJobs.unshift(job);
    return sendJson(response, { data: job }, 201);
  }

  if (url.pathname === "/api/v1/crm/imports" && method === "GET") {
    const objectType = url.searchParams.get("objectType");
    const rows = crmImportJobs.filter((job) => !objectType || job.objectType === objectType).map((job) => ({ ...job, operatorName: "交互测试管理员" }));
    return sendJson(response, { data: rows, meta: { page: 1, pageSize: 100, total: rows.length, pageCount: 1 } });
  }

  const crmImportExecuteMatch = url.pathname.match(/^\/api\/v1\/crm\/imports\/([^/]+)\/execute$/);
  if (crmImportExecuteMatch && method === "POST") {
    const job = crmImportJobs.find((item) => item.id === crmImportExecuteMatch[1]);
    if (!job) return sendError(response, 404, "RESOURCE_NOT_FOUND", "CRM 导入任务不存在");
    Object.assign(job, { status: "COMPLETED_WITH_ERRORS", successCount: 2, failedCount: 1, failureFilePath: `/fixture/${job.id}-failures.csv` });
    return sendJson(response, { data: { job, result: { imported: 2, failed: 1, skipped: 0, warnings: 1 } } });
  }

  const crmImportFailureMatch = url.pathname.match(/^\/api\/v1\/crm\/imports\/([^/]+)\/failures$/);
  if (crmImportFailureMatch && method === "GET") {
    response.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=fixture-failures.csv" });
    return response.end("original_row_number,error_code,error_message\r\n4,PREFLIGHT_ERROR,Contact ID not found");
  }

  const crmExportMatch = url.pathname.match(/^\/api\/v1\/crm\/exports\/(contacts|leads)$/);
  if (crmExportMatch && method === "POST") {
    const objectType = crmExportMatch[1] === "contacts" ? "CONTACT" : "CRM_LEAD";
    const job = { id: `crm-export-${nextId++}`, jobNo: `EXP-FIXTURE-${nextId}`, objectType, status: "COMPLETED", rowCount: objectType === "CONTACT" ? contacts.length : crmLeads.length, fileName: `fixture-${crmExportMatch[1]}.xlsx`, downloadUrl: `/api/v1/crm/exports/crm-export-${nextId - 1}/download`, createdAt: new Date().toISOString() };
    crmExportJobs.unshift(job);
    return sendJson(response, { data: job }, 201);
  }

  const crmExportDownloadMatch = url.pathname.match(/^\/api\/v1\/crm\/exports\/([^/]+)\/download$/);
  if (crmExportDownloadMatch && method === "GET") {
    response.writeHead(200, { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": "attachment; filename=fixture-export.xlsx" });
    return response.end(Buffer.from("fixture-export-xlsx"));
  }

  if (url.pathname === "/api/v1/crm/contacts" && method === "GET") return sendJson(response, paged(filteredContacts(url), url));
  if (url.pathname === "/api/v1/crm/contacts" && method === "POST") {
    if (!body.contactName?.trim()) return sendError(response, 422, "VALIDATION_ERROR", "请求数据校验失败");
    const contact = applyDefaults(body, {
      id: `contact-created-${nextId++}`, stage: "INITIAL", ownerUserId: null, createdByUserId: "qa-user", createdAt: now, updatedAt: now,
    });
    contacts.unshift(contact);
    return sendJson(response, { data: decorateContact(contact) }, 201);
  }

  const contactMatch = url.pathname.match(/^\/api\/v1\/crm\/contacts\/([^/]+)$/);
  if (contactMatch) {
    const contact = contacts.find((item) => item.id === contactMatch[1] && !item.deletedAt);
    if (!contact) return sendError(response, 404, "RESOURCE_NOT_FOUND", "CRM 联系人不存在");
    if (method === "GET") return sendJson(response, { data: decorateContact(contact) });
    if (method === "PATCH") {
      Object.assign(contact, body, { updatedAt: new Date().toISOString() });
      return sendJson(response, { data: decorateContact(contact) });
    }
    if (method === "DELETE") {
      const relatedLeadCount = crmLeads.filter((lead) => lead.contactId === contact.id && !lead.deletedAt).length;
      if (relatedLeadCount) return sendJson(response, { error: { code: "CONTACT_HAS_ACTIVE_LEADS", message: `该联系人仍有 ${relatedLeadCount} 条未删除线索，请先删除这些线索后再删除联系人`, details: { relatedLeadCount } }, traceId: "fixture-409" }, 409);
      contact.deletedAt = new Date().toISOString();
      contact.deletedByUserId = "qa-user";
      return sendJson(response, { data: { id: contact.id } });
    }
  }

  const contactJourneyMatch = url.pathname.match(/^\/api\/v1\/crm\/contacts\/([^/]+)\/journey$/);
  if (contactJourneyMatch && method === "GET") {
    const contact = contacts.find((item) => item.id === contactJourneyMatch[1] && !item.deletedAt);
    if (!contact) return sendError(response, 404, "RESOURCE_NOT_FOUND", "CRM 联系人不存在");
    return sendJson(response, { data: contactJourney(contact) });
  }

  const attachmentMatch = url.pathname.match(/^\/api\/v1\/crm\/(contacts|leads)\/([^/]+)\/attachments\/([^/]+)(\/download)?$/);
  if (attachmentMatch) {
    const [, collection, entityId, fieldOrAttachmentId, downloadSuffix] = attachmentMatch;
    const entityType = collection === "contacts" ? "CONTACT" : "LEAD";
    const lead = entityType === "LEAD" ? crmLeads.find((item) => item.id === entityId) : null;
    const entityExists = entityType === "CONTACT"
      ? contacts.some((item) => item.id === entityId && !item.deletedAt)
      : Boolean(lead && contacts.some((item) => item.id === lead.contactId && !item.deletedAt) && (!lead.deletedAt || (method === "GET" && downloadSuffix)));
    if (!entityExists) return sendError(response, 404, "RESOURCE_NOT_FOUND", entityType === "CONTACT" ? "CRM 联系人不存在" : "CRM Lead 不存在");
    if (method === "POST" && !downloadSuffix) {
      const fieldKey = fieldOrAttachmentId;
      const allowedFields = entityType === "CONTACT"
        ? new Set(["meetingMinutesFiles"])
        : new Set(["requirementFiles", "requirementImages", "proposalFiles", "quotationFiles"]);
      if (!allowedFields.has(fieldKey)) return sendError(response, 422, "VALIDATION_ERROR", "附件字段不存在");
      const image = fieldKey === "requirementImages";
      const attachment = {
        id: `attachment-created-${nextId++}`,
        entityType,
        entityId,
        fieldKey,
        storageType: "LOCAL",
        originalName: image ? "fixture-upload.jpg" : "fixture-upload.txt",
        mimeType: image ? "image/jpeg" : "text/plain",
        kind: image ? "IMAGE" : "DOCUMENT",
        fileSize: body.size || 32,
        createdAt: new Date().toISOString(),
        uploadedBy: crmUsers[0],
      };
      crmAttachments.unshift(attachment);
      return sendJson(response, { data: attachment }, 201);
    }
    const attachment = crmAttachments.find((item) => item.id === fieldOrAttachmentId && item.entityType === entityType && item.entityId === entityId);
    if (!attachment) return sendError(response, 404, "RESOURCE_NOT_FOUND", "附件不存在");
    if (method === "GET" && downloadSuffix) {
      if (attachment.externalUrl) {
        response.writeHead(302, { location: attachment.externalUrl });
        return response.end();
      }
      response.writeHead(200, { "content-type": attachment.mimeType || "application/octet-stream", "content-disposition": `inline; filename="fixture-attachment"; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}` });
      if (attachment.kind === "IMAGE") return response.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
      return response.end(Buffer.from("fixture attachment"));
    }
    if (method === "DELETE") {
      crmAttachments = crmAttachments.filter((item) => item.id !== attachment.id);
      return sendJson(response, { data: { id: attachment.id } });
    }
  }

  const followupAttachmentMatch = url.pathname.match(/^\/api\/v1\/crm\/(contacts|leads)\/([^/]+)\/followups\/([^/]+)\/attachments\/([^/]+)(\/download)?$/);
  if (followupAttachmentMatch) {
    const [, collection, parentId, followupId, fieldOrAttachmentId, downloadSuffix] = followupAttachmentMatch;
    const entityType = collection === "contacts" ? "CONTACT_FOLLOWUP" : "LEAD_FOLLOWUP";
    const followup = collection === "contacts"
      ? (contactFollowups[parentId] || []).find((item) => item.id === followupId)
      : (leadFollowups[parentId] || []).find((item) => item.id === followupId);
    const parentActive = collection === "contacts"
      ? contacts.some((item) => item.id === parentId && !item.deletedAt)
      : crmLeads.some((item) => item.id === parentId && contacts.some((contact) => contact.id === item.contactId && !contact.deletedAt) && (!item.deletedAt || (method === "GET" && downloadSuffix)));
    if (!followup || !parentActive) return sendError(response, 404, "RESOURCE_NOT_FOUND", "跟进记录不存在");
    if (method === "POST" && !downloadSuffix) {
      if (fieldOrAttachmentId !== "followupAttachments") return sendError(response, 422, "VALIDATION_ERROR", "附件字段不存在");
      const attachment = { id: `attachment-created-${nextId++}`, entityType, entityId: followupId, fieldKey: "followupAttachments", storageType: "LOCAL", originalName: "互动附件.txt", mimeType: "text/plain", kind: "DOCUMENT", fileSize: body.size || 32, createdAt: new Date().toISOString(), uploadedBy: crmUsers[0] };
      crmAttachments.unshift(attachment);
      return sendJson(response, { data: attachment }, 201);
    }
    const attachment = crmAttachments.find((item) => item.id === fieldOrAttachmentId && item.entityType === entityType && item.entityId === followupId);
    if (!attachment) return sendError(response, 404, "RESOURCE_NOT_FOUND", "附件不存在");
    if (method === "GET" && downloadSuffix) {
      response.writeHead(200, { "content-type": attachment.mimeType || "application/octet-stream", "content-disposition": `inline; filename="fixture-followup"; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}` });
      return response.end(Buffer.from("fixture followup attachment"));
    }
    if (method === "DELETE") {
      crmAttachments = crmAttachments.filter((item) => item.id !== attachment.id);
      return sendJson(response, { data: { id: attachment.id } });
    }
  }

  const contactFollowupMatch = url.pathname.match(/^\/api\/v1\/crm\/contacts\/([^/]+)\/followups$/);
  if (contactFollowupMatch) {
    const contact = contacts.find((item) => item.id === contactFollowupMatch[1] && !item.deletedAt);
    if (!contact) return sendError(response, 404, "RESOURCE_NOT_FOUND", "CRM 联系人不存在");
    const rows = contactFollowups[contact.id] || [];
    if (method === "GET") return sendJson(response, paged(rows.map(decorateFollowup), url));
    if (method === "POST") {
      const followup = { ...body, id: `contact-followup-created-${nextId++}`, contactId: contact.id, ownerUserId: body.ownerUserId || "qa-user", createdByUserId: "qa-user", createdAt: new Date().toISOString() };
      contactFollowups[contact.id] = [followup, ...rows].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id));
      if (contactFollowups[contact.id][0].id === followup.id && followup.nextFollowupAt) contact.nextFollowupAt = followup.nextFollowupAt;
      return sendJson(response, { data: decorateFollowup(followup) }, 201);
    }
  }

  const relatedLeadMatch = url.pathname.match(/^\/api\/v1\/crm\/contacts\/([^/]+)\/leads$/);
  if (relatedLeadMatch && method === "GET") {
    if (!contacts.some((item) => item.id === relatedLeadMatch[1] && !item.deletedAt)) return sendError(response, 404, "RESOURCE_NOT_FOUND", "CRM 联系人不存在");
    return sendJson(response, paged(filteredLeads(url).filter((lead) => lead.contactId === relatedLeadMatch[1]), url));
  }

  if (url.pathname === "/api/v1/crm/leads" && method === "GET") return sendJson(response, paged(filteredLeads(url), url));
  if (url.pathname === "/api/v1/crm/leads" && method === "POST") {
    if (!contacts.some((contact) => contact.id === body.contactId && !contact.deletedAt)) return sendError(response, 422, "VALIDATION_ERROR", "关联的 CRM 联系人不存在");
    if (!body.requirementSummary?.trim()) return sendError(response, 422, "VALIDATION_ERROR", "请求数据校验失败");
    const lead = applyDefaults(body, {
      id: `lead-created-${nextId++}`, status: "NEW", priority: "MEDIUM", estimatedQuote: null, currency: null,
      salesOwnerUserId: null, followupOwnerUserId: null, nextFollowupAt: null, lastFollowupAt: null,
      participantUserIds: [], wonAt: null, deliveryFollowupAt: null, contractRenewalAt: null, paymentReceivedAt: null,
      createdByUserId: "qa-user", createdAt: now, updatedAt: now, deletedAt: null,
    });
    if (lead.status === "WON" && !lead.wonAt) lead.wonAt = new Date().toISOString();
    crmLeads.unshift(lead);
    return sendJson(response, { data: decorateLead(lead) }, 201);
  }

  const leadMatch = url.pathname.match(/^\/api\/v1\/crm\/leads\/([^/]+)$/);
  if (leadMatch) {
    const lead = crmLeads.find((item) => item.id === leadMatch[1] && !item.deletedAt);
    if (!lead) return sendError(response, 404, "RESOURCE_NOT_FOUND", "CRM Lead 不存在");
    if (method === "GET") return sendJson(response, { data: decorateLead(lead) });
    if (method === "PATCH") {
      const { contactId: _ignoredContactId, ...patch } = body;
      if (lead.status !== "WON" && patch.status === "WON" && !lead.wonAt) patch.wonAt = new Date().toISOString();
      Object.assign(lead, patch, { updatedAt: new Date().toISOString() });
      return sendJson(response, { data: decorateLead(lead) });
    }
    if (method === "DELETE") {
      lead.deletedAt = new Date().toISOString();
      lead.deletedByUserId = "qa-user";
      return sendJson(response, { data: { id: lead.id } });
    }
  }

  const leadFollowupMatch = url.pathname.match(/^\/api\/v1\/crm\/leads\/([^/]+)\/followups$/);
  if (leadFollowupMatch) {
    const lead = crmLeads.find((item) => item.id === leadFollowupMatch[1] && !item.deletedAt);
    if (!lead) return sendError(response, 404, "RESOURCE_NOT_FOUND", "CRM Lead 不存在");
    const rows = leadFollowups[lead.id] || [];
    if (method === "GET") return sendJson(response, paged(rows.map(decorateFollowup), url));
    if (method === "POST") {
      const followup = { ...body, id: `lead-followup-created-${nextId++}`, leadId: lead.id, ownerUserId: body.ownerUserId || "qa-user", important: Boolean(body.important), createdByUserId: "qa-user", createdAt: new Date().toISOString() };
      leadFollowups[lead.id] = [followup, ...rows].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id));
      const latest = leadFollowups[lead.id][0];
      lead.lastFollowupAt = latest.occurredAt;
      if (latest.id === followup.id) {
        if (followup.progress) lead.latestProgress = followup.progress;
        if (followup.nextAction) lead.nextAction = followup.nextAction;
        if (followup.nextFollowupAt) lead.nextFollowupAt = followup.nextFollowupAt;
      }
      lead.updatedAt = new Date().toISOString();
      return sendJson(response, { data: decorateFollowup(followup) }, 201);
    }
  }

  return sendError(response, 404, "RESOURCE_NOT_FOUND", "Fixture route not found");
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/__fixture/")) {
    try {
      return await apiResponse(request, response, url);
    } catch (error) {
      return sendError(response, 500, "FIXTURE_ERROR", error instanceof Error ? error.message : "Fixture failed");
    }
  }

  const relativePath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
  const filePath = normalize(join(frontendRoot, relativePath));
  if (!filePath.startsWith(frontendRoot)) {
    response.writeHead(403);
    return response.end();
  }
  try {
    if (!statSync(filePath).isFile()) throw new Error("not a file");
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
    response.writeHead(200, { "content-type": `${types[extname(filePath)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.listen(fixturePort, "127.0.0.1", () => console.log(`Frontend browser fixture listening on http://127.0.0.1:${fixturePort}`));
