import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("../frontend/", import.meta.url));
const now = "2026-09-03T09:30:00.000Z";
const crmUsers = [
  { id: "qa-user", name: "交互测试管理员", loginAccount: "qa@example.test", status: "ACTIVE" },
  { id: "sales-user", name: "陈销售", loginAccount: "sales@example.test", status: "ACTIVE" },
];
const brands = [
  { id: "brand-un", code: "UN", name: "UN 雅典表", shortName: "UN", themeConfig: {} },
  { id: "brand-gp", code: "GP", name: "GP 芝柏表", shortName: "GP", themeConfig: {} },
];
const legacyCustomers = [
  { id: "customer-1", customerNo: "SW00000001", displayName: "测试会员一", mobile: "+8613800000001", createdAt: "2026-09-02T08:00:00.000Z", profiles: [{ brand: brands[0], favoriteCollection: "FREAK", ownsBrandWatch: true }] },
  { id: "customer-2", customerNo: "SW00000002", displayName: "测试会员二", mobile: "+8613800000002", createdAt: "2026-09-02T09:00:00.000Z", profiles: [{ brand: brands[1], favoriteCollection: "Laureato", ownsBrandWatch: false }] },
];
const legacyLeads = [
  { id: "legacy-lead-1", leadNo: "PI-UN-TEST-001", source: "ADMIN_MANUAL", brand: brands[0], lastname: "测", firstname: "试一", phone: "+8613800000001", sku: "TEST-UN", status: "NEW", syncStatus: "NOT_SYNCED", createdAt: "2026-09-02T08:00:00.000Z", ownerUserId: null },
  { id: "legacy-lead-2", leadNo: "PI-GP-TEST-002", source: "ADMIN_MANUAL", brand: brands[1], lastname: "测", firstname: "试二", phone: "+8613800000002", sku: "TEST-GP", status: "NEW", syncStatus: "NOT_SYNCED", createdAt: "2026-09-02T09:00:00.000Z", ownerUserId: null },
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
    initialContext: "Met at an industry convention and discussed AR product presentation.",
    remark: "Decision maker for digital cooperation.",
    createdByUserId: "qa-user",
    createdAt: "2026-08-21T03:10:00.000Z",
    updatedAt: "2026-09-03T08:40:00.000Z",
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
    initialContext: "Referred by an existing project partner.",
    remark: null,
    createdByUserId: "sales-user",
    createdAt: "2026-08-29T06:00:00.000Z",
    updatedAt: "2026-09-02T10:20:00.000Z",
  },
];

const initialLeads = [
  {
    id: "lead-ar-service",
    contactId: "contact-naderi",
    requirementSummary: "AR application and service cooperation for our products",
    requirementDetail: "Build an AR product presentation experience for the new product line.",
    latestProgress: "Product samples and API documentation received.",
    priority: "HIGH",
    status: "SOLUTION",
    estimatedQuote: "63000.50",
    currency: "USD",
    projectDomain: "AR commerce",
    projectType: "Application service",
    technologyType: "WebAR",
    productType: "Consumer electronics",
    productName: "Dena Vision Series",
    resourceRequirement: "3D assets and product data API access.",
    solution: "Browser-based AR viewer with CMS integration.",
    remark: "Target launch in Q4.",
    salesOwnerUserId: "qa-user",
    followupOwnerUserId: "sales-user",
    nextFollowupAt: "2026-09-08T02:00:00.000Z",
    lastFollowupAt: "2026-09-02T07:30:00.000Z",
    createdByUserId: "qa-user",
    createdAt: "2026-08-22T04:00:00.000Z",
    updatedAt: "2026-09-03T08:45:00.000Z",
  },
  {
    id: "lead-oem",
    contactId: "contact-naderi",
    requirementSummary: "OEM cooperation for interactive product displays",
    requirementDetail: "Explore embedded visualization capabilities for OEM distribution.",
    latestProgress: "Commercial model under review.",
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
    remark: null,
    salesOwnerUserId: "qa-user",
    followupOwnerUserId: "qa-user",
    nextFollowupAt: "2026-09-11T03:00:00.000Z",
    lastFollowupAt: null,
    createdByUserId: "qa-user",
    createdAt: "2026-08-30T03:00:00.000Z",
    updatedAt: "2026-09-01T05:00:00.000Z",
  },
  {
    id: "lead-digital",
    contactId: "contact-lina",
    requirementSummary: "Digital solution for flagship retail experience",
    requirementDetail: "Interactive product storytelling for the Shanghai flagship store.",
    latestProgress: null,
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
    remark: null,
    salesOwnerUserId: "sales-user",
    followupOwnerUserId: "sales-user",
    nextFollowupAt: "2026-09-04T07:00:00.000Z",
    lastFollowupAt: "2026-09-02T09:10:00.000Z",
    createdByUserId: "sales-user",
    createdAt: "2026-08-31T03:00:00.000Z",
    updatedAt: "2026-09-02T09:15:00.000Z",
  },
];

const initialContactFollowups = {
  "contact-naderi": [
    { id: "contact-followup-1", occurredAt: "2026-09-02T07:30:00.000Z", type: "MEETING", ownerUserId: "sales-user", content: "Reviewed the AR service scope and confirmed the first product batch.", createdByUserId: "qa-user", createdAt: "2026-09-02T07:45:00.000Z" },
    { id: "contact-followup-2", occurredAt: "2026-08-25T03:00:00.000Z", type: "EMAIL", ownerUserId: "qa-user", content: "Shared capability deck and reference cases.", createdByUserId: "qa-user", createdAt: "2026-08-25T03:05:00.000Z" },
  ],
};
const initialLeadFollowups = {
  "lead-ar-service": [
    { id: "lead-followup-1", occurredAt: "2026-09-02T07:30:00.000Z", type: "CALL", ownerUserId: "sales-user", important: true, content: "Confirmed technical workshop participants and requested CAD source files.", createdByUserId: "qa-user", createdAt: "2026-09-02T07:42:00.000Z" },
  ],
};

const clone = (value) => structuredClone(value);
let contacts;
let crmLeads;
let contactFollowups;
let leadFollowups;
let fixtureRole;
let emptyContacts;
let emptyLeads;
let nextId;
let requestLog;
let failNext;

function resetFixture() {
  contacts = clone(initialContacts);
  crmLeads = clone(initialLeads);
  contactFollowups = clone(initialContactFollowups);
  leadFollowups = clone(initialLeadFollowups);
  fixtureRole = "SUPER_ADMIN";
  emptyContacts = false;
  emptyLeads = false;
  nextId = 1;
  requestLog = [];
  failNext = null;
}
resetFixture();

const rolePermissions = {
  VIEWER: ["crm.contact.view", "crm.contact_followup.view", "crm.lead.view", "crm.lead_followup.view"],
  SALES: ["crm.contact.view", "crm.contact.create", "crm.contact.edit", "crm.contact_followup.view", "crm.contact_followup.create", "crm.lead.view", "crm.lead.create", "crm.lead.edit", "crm.lead_followup.view", "crm.lead_followup.create"],
  SUPER_ADMIN: [
    "crm.contact.view", "crm.contact.create", "crm.contact.edit", "crm.contact_followup.view", "crm.contact_followup.create",
    "crm.lead.view", "crm.lead.create", "crm.lead.edit", "crm.lead_followup.view", "crm.lead_followup.create",
    "customer.view", "customer.create", "customer.edit", "customer.import", "customer.export",
    "lead.view", "lead.create", "lead.edit", "lead.import", "lead.export",
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
    relatedLeadCount: crmLeads.filter((lead) => lead.contactId === contact.id).length,
  };
}

function decorateFollowup(followup) {
  return { ...followup, owner: userSummary(followup.ownerUserId), createdBy: userSummary(followup.createdByUserId) };
}

function decorateLead(lead) {
  return {
    ...lead,
    contact: decorateContact(contacts.find((contact) => contact.id === lead.contactId)),
    salesOwner: userSummary(lead.salesOwnerUserId),
    followupOwner: userSummary(lead.followupOwnerUserId),
    createdBy: userSummary(lead.createdByUserId),
    _count: { followups: (leadFollowups[lead.id] || []).length },
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

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function applyDefaults(input, defaults) {
  return Object.fromEntries(Object.entries({ ...defaults, ...input }).map(([key, value]) => [key, value === "" ? null : value]));
}

async function apiResponse(request, response, url) {
  const method = request.method || "GET";
  const body = ["POST", "PATCH", "PUT"].includes(method) ? await readJson(request) : null;
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
    return sendJson(response, { data: { id: "qa-user", name: "交互测试管理员", loginAccount: "qa@example.test", mustChangePassword: false, allBrands: fixtureRole === "SUPER_ADMIN", role: { key: fixtureRole, name: { VIEWER: "只读用户", SALES: "销售", SUPER_ADMIN: "超级管理员" }[fixtureRole] }, permissions: rolePermissions[fixtureRole] } });
  }
  if (url.pathname === "/api/v1/brands" && method === "GET") return sendJson(response, { data: brands });
  if (url.pathname === "/api/v1/crm/users" && method === "GET") return sendJson(response, { data: crmUsers });

  if (url.pathname === "/api/v1/customers" && method === "GET") return sendJson(response, { ...paged(legacyCustomers, url), metrics: { memberTotal: legacyCustomers.length, dualBrandMembers: 0, marketingCoverage: { percentage: 0 } } });
  if (url.pathname === "/api/v1/leads" && method === "GET") return sendJson(response, { ...paged(legacyLeads, url), metrics: { leadTotal: legacyLeads.length, pending: 0, gatewayAccepted: 0, syncExceptions: 0, statuses: {} } });

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
    const contact = contacts.find((item) => item.id === contactMatch[1]);
    if (!contact) return sendError(response, 404, "RESOURCE_NOT_FOUND", "CRM 联系人不存在");
    if (method === "GET") return sendJson(response, { data: decorateContact(contact) });
    if (method === "PATCH") {
      Object.assign(contact, body, { updatedAt: new Date().toISOString() });
      return sendJson(response, { data: decorateContact(contact) });
    }
  }

  const contactFollowupMatch = url.pathname.match(/^\/api\/v1\/crm\/contacts\/([^/]+)\/followups$/);
  if (contactFollowupMatch) {
    const contact = contacts.find((item) => item.id === contactFollowupMatch[1]);
    if (!contact) return sendError(response, 404, "RESOURCE_NOT_FOUND", "CRM 联系人不存在");
    const rows = contactFollowups[contact.id] || [];
    if (method === "GET") return sendJson(response, paged(rows.map(decorateFollowup), url));
    if (method === "POST") {
      const followup = { ...body, id: `contact-followup-created-${nextId++}`, ownerUserId: body.ownerUserId || "qa-user", createdByUserId: "qa-user", createdAt: new Date().toISOString() };
      contactFollowups[contact.id] = [followup, ...rows].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id));
      return sendJson(response, { data: decorateFollowup(followup) }, 201);
    }
  }

  const relatedLeadMatch = url.pathname.match(/^\/api\/v1\/crm\/contacts\/([^/]+)\/leads$/);
  if (relatedLeadMatch && method === "GET") {
    if (!contacts.some((item) => item.id === relatedLeadMatch[1])) return sendError(response, 404, "RESOURCE_NOT_FOUND", "CRM 联系人不存在");
    return sendJson(response, paged(filteredLeads(url).filter((lead) => lead.contactId === relatedLeadMatch[1]), url));
  }

  if (url.pathname === "/api/v1/crm/leads" && method === "GET") return sendJson(response, paged(filteredLeads(url), url));
  if (url.pathname === "/api/v1/crm/leads" && method === "POST") {
    if (!contacts.some((contact) => contact.id === body.contactId)) return sendError(response, 422, "VALIDATION_ERROR", "关联的 CRM 联系人不存在");
    if (!body.requirementSummary?.trim()) return sendError(response, 422, "VALIDATION_ERROR", "请求数据校验失败");
    const lead = applyDefaults(body, {
      id: `lead-created-${nextId++}`, status: "NEW", priority: "MEDIUM", estimatedQuote: null, currency: null,
      salesOwnerUserId: null, followupOwnerUserId: null, nextFollowupAt: null, lastFollowupAt: null,
      createdByUserId: "qa-user", createdAt: now, updatedAt: now,
    });
    crmLeads.unshift(lead);
    return sendJson(response, { data: decorateLead(lead) }, 201);
  }

  const leadMatch = url.pathname.match(/^\/api\/v1\/crm\/leads\/([^/]+)$/);
  if (leadMatch) {
    const lead = crmLeads.find((item) => item.id === leadMatch[1]);
    if (!lead) return sendError(response, 404, "RESOURCE_NOT_FOUND", "CRM Lead 不存在");
    if (method === "GET") return sendJson(response, { data: decorateLead(lead) });
    if (method === "PATCH") {
      const { contactId: _ignoredContactId, ...patch } = body;
      Object.assign(lead, patch, { updatedAt: new Date().toISOString() });
      return sendJson(response, { data: decorateLead(lead) });
    }
  }

  const leadFollowupMatch = url.pathname.match(/^\/api\/v1\/crm\/leads\/([^/]+)\/followups$/);
  if (leadFollowupMatch) {
    const lead = crmLeads.find((item) => item.id === leadFollowupMatch[1]);
    if (!lead) return sendError(response, 404, "RESOURCE_NOT_FOUND", "CRM Lead 不存在");
    const rows = leadFollowups[lead.id] || [];
    if (method === "GET") return sendJson(response, paged(rows.map(decorateFollowup), url));
    if (method === "POST") {
      const followup = { ...body, id: `lead-followup-created-${nextId++}`, ownerUserId: body.ownerUserId || "qa-user", important: Boolean(body.important), createdByUserId: "qa-user", createdAt: new Date().toISOString() };
      leadFollowups[lead.id] = [followup, ...rows].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id));
      if (!lead.lastFollowupAt || followup.occurredAt > lead.lastFollowupAt) lead.lastFollowupAt = followup.occurredAt;
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

server.listen(8766, "127.0.0.1", () => console.log("Frontend browser fixture listening on http://127.0.0.1:8766"));
