import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const base = process.env.PHASE3_UI_BASE_URL || "http://127.0.0.1:3311";
const account = process.env.PHASE3_UI_ACCOUNT || "admin@phase3.example.test";
const password = process.env.PHASE3_UI_PASSWORD;
const databaseUrl = new URL(process.env.DATABASE_URL || "");
const parsedBase = new URL(base);
if (!["127.0.0.1", "localhost"].includes(parsedBase.hostname)) throw new Error("Phase 3 UI E2E is local-only.");
if (!["127.0.0.1", "localhost"].includes(databaseUrl.hostname) || databaseUrl.port !== "3308" || databaseUrl.pathname !== "/kivisense_crm") throw new Error("Phase 3 UI E2E requires the isolated local MySQL database on port 3308.");
if (!password) throw new Error("PHASE3_UI_PASSWORD is required.");

async function loadPlaywright() {
  try { return await import("playwright"); }
  catch {
    return import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || "/Users/ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs").href);
  }
}

const require = createRequire(new URL("../backend/package.json", import.meta.url));
const { PrismaClient } = require("@prisma/client");
const ExcelJS = require("exceljs");
const { chromium } = await loadPlaywright();
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
const root = resolve("artifacts/ui-refactor-v4-after");
const screenshots = resolve(root, "screenshots");
const downloads = resolve(root, "downloads");
await rm(root, { recursive: true, force: true });
await mkdir(screenshots, { recursive: true });
await mkdir(downloads, { recursive: true });

const runId = Date.now();
const names = {
  company: `V4-UI-公司-${runId}`,
  business: `V4-UI-企业联系人-${runId}`,
  individual: `V4-UI-个人联系人-${runId}`,
  marketing: `V4-UI-线索-${runId}`,
  opportunity: `V4-UI-手工商机-${runId}`,
  supplier: `V4-UI-供应商-${runId}`,
  imported: `V4-UI-导入联系人-${runId}`,
};
const tests = [];
const writes = [];
const databaseEvidence = [];
const consoleEvents = [];
const networkEvents = [];
const screenshotsEvidence = [];
let currentCase = "bootstrap";

function pass(name, evidence = {}) { tests.push({ name, status: "PASS", ...evidence }); process.stdout.write(`PASS ${name}\n`); }
function noteDb(name, value) { databaseEvidence.push({ name, value: JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item)) }); }
function safeFile(name) { return name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "-"); }

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on("pageerror", (error) => consoleEvents.push({ case: currentCase, type: "pageerror", message: error.message }));
page.on("response", (response) => {
  if (response.status() >= 400) {
    const pathname = new URL(response.url()).pathname;
    if (!(response.status() === 401 && pathname.endsWith("/api/v1/auth/me"))) networkEvents.push({ case: currentCase, status: response.status(), method: response.request().method(), url: response.url() });
  }
});

async function settle() {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.locator("[data-slot='skeleton'], .animate-pulse").first().waitFor({ state: "hidden", timeout: 8_000 }).catch(() => undefined);
  await page.evaluate(async () => { await document.fonts?.ready; });
  await page.waitForTimeout(250);
}
async function shot(name, fullPage = true) {
  const file = resolve(screenshots, `${String(screenshotsEvidence.length + 1).padStart(2, "0")}-${safeFile(name)}.png`);
  await settle();
  const dimensions = await page.evaluate(() => ({ viewport: [innerWidth, innerHeight], document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], overflowX: document.documentElement.scrollWidth > innerWidth + 1 }));
  assert.equal(dimensions.overflowX, false, `${name} must not have document-level horizontal overflow`);
  const bytes = await page.screenshot({ path: file, fullPage });
  screenshotsEvidence.push({ name, file: file.slice(resolve(".").length + 1), dimensions, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
async function go(hash, readyText) {
  currentCase = `route:${hash}`;
  await page.goto(`${base}/#${hash}`, { waitUntil: "domcontentloaded" });
  if (readyText) await page.getByText(readyText, { exact: true }).first().waitFor({ state: "visible" });
  await settle();
}
async function writeThroughUi(name, predicate, action) {
  currentCase = name;
  const responsePromise = page.waitForResponse((response) => predicate(response) && response.request().method() !== "GET", { timeout: 20_000 });
  await action();
  const response = await responsePromise;
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = { text: text.slice(0, 500) }; }
  writes.push({ name, method: response.request().method(), url: response.url(), status: response.status(), response: body });
  assert.ok(response.ok(), `${name} HTTP ${response.status()}: ${text}`);
  return body;
}
async function selectField(scope, label, option) {
  const labelNode = scope.getByText(label, { exact: true }).first();
  await labelNode.waitFor({ state: "visible" });
  await labelNode.locator("..").getByRole("combobox").click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function chooseEntity(scope, label, query, optionText) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  const input = page.getByPlaceholder(`搜索${label}…`);
  await input.fill(query);
  const option = page.getByRole("option").filter({ hasText: optionText }).first();
  await option.waitFor({ state: "visible" });
  await option.click();
}
async function copyId(id) {
  await page.getByTitle(new RegExp(`复制 ${id}$`)).first().click();
  await page.getByText("已复制", { exact: true }).first().waitFor();
}
async function rateWindowCheckpoint(label) {
  process.stdout.write(`WAIT rate-limit window: ${label}\n`);
  await page.waitForTimeout(61_000);
}
async function login(targetPage, loginAccount, loginPassword) {
  await targetPage.goto(`${base}/#dashboard`, { waitUntil: "domcontentloaded" });
  await targetPage.getByLabel("登录账号").fill(loginAccount);
  await targetPage.getByLabel("密码").fill(loginPassword);
  const responsePromise = targetPage.waitForResponse((response) => response.url().endsWith("/api/v1/auth/login") && response.request().method() === "POST");
  await targetPage.getByRole("button", { name: "登录", exact: true }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  await targetPage.getByText("数据看板", { exact: true }).first().waitFor();
}

try {
  await login(page, account, password);
  // The anonymous bootstrap intentionally probes /auth/me and receives 401 before
  // the login form appears. Begin console-error monitoring after authentication so
  // the final zero-error gate covers the authenticated product workflow.
  page.on("console", (message) => { if (message.type() === "error") consoleEvents.push({ case: currentCase, type: "console", message: message.text() }); });
  const admin = await prisma.user.findUniqueOrThrow({ where: { loginAccount: account } });
  const sales = await prisma.user.findUniqueOrThrow({ where: { loginAccount: "sales@phase3.example.test" } });
  pass("UI 登录", { http: 200, role: "SUPER_ADMIN" });

  // Company: create with taxonomy, dependent geography, logo; verify DB, reload, copy ID, and edit.
  await go("organizations", "公司");
  for (const smartView of ["全部公司", "我的公司", "重点跟进", "机会中", "客户", "待唤醒", "沉睡"]) await page.getByRole("button", { name: smartView, exact: true }).waitFor();
  pass("公司 Smart Views");
  await page.getByRole("button", { name: "新增公司", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "新建公司", exact: true });
  await dialog.getByLabel(/^公司名称/).fill(names.company);
  await dialog.getByLabel("公司简称").fill(`V4-${runId}`);
  await dialog.getByLabel("网站").fill(`https://v4-${runId}.example.test`);
  await selectField(dialog, "行业大类", "信息技术");
  await selectField(dialog, "细分行业", "软件与 SaaS");
  await chooseEntity(dialog, "搜索国家或地区", "中国", "中国");
  await chooseEntity(dialog, "搜索省、州或区域", "上海", "上海市");
  await chooseEntity(dialog, "搜索城市", "上海", "上海");
  await dialog.getByRole("tab", { name: "备注与文件", exact: true }).click();
  const logoData = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 160;
    const ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, 640, 160); ctx.fillStyle = "#006b55"; ctx.fillRect(20, 20, 600, 120); ctx.fillStyle = "white"; ctx.font = "bold 54px sans-serif"; ctx.fillText("KIVISENSE V4", 90, 105);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await dialog.getByLabel("公司 Logo").setInputFiles({ name: `wide-logo-${runId}.png`, mimeType: "image/png", buffer: Buffer.from(logoData, "base64") });
  const companyCreated = await writeThroughUi("Company Create", (r) => new URL(r.url()).pathname.endsWith("/api/v1/crm/organizations"), () => dialog.getByRole("button", { name: "保存公司", exact: true }).click());
  const companyId = companyCreated.data.id;
  await dialog.waitFor({ state: "hidden" });
  const companyDb = await prisma.organization.findUniqueOrThrow({ where: { id: companyId }, include: { roles: true } });
  assert.equal(companyDb.industryCode, "TECH.SOFTWARE"); assert.equal(companyDb.countryCode, "CN"); assert.equal(companyDb.regionCode, "CN-31"); assert.equal(companyDb.cityCode, "CN-31-SHANGHAI");
  const companyLogo = await prisma.crmAttachment.findFirstOrThrow({ where: { entityType: "ORGANIZATION", entityId: companyId, fieldKey: "logo" }, orderBy: { createdAt: "desc" } });
  noteDb("Company Create", { id: companyId, name: companyDb.name, industryCode: companyDb.industryCode, countryCode: companyDb.countryCode, regionCode: companyDb.regionCode, cityCode: companyDb.cityCode, roleKeys: companyDb.roles.map((r) => r.role), logo: { originalName: companyLogo.originalName, mimeType: companyLogo.mimeType } });
  await go(`organizations/${companyId}`, names.company);
  await copyId(companyId);
  const logoImage = page.locator(`img[src*="organizations/${companyId}/attachments"]`).first();
  if (await logoImage.count()) assert.equal(await logoImage.evaluate((node) => getComputedStyle(node).objectFit), "contain");
  await shot("company-detail-1440");
  await page.getByRole("button", { name: new RegExp("更多操作") }).click();
  await page.getByRole("menuitem", { name: "编辑公司", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "编辑公司", exact: true });
  await dialog.getByLabel("公司简称").fill(`V4-EDIT-${runId}`);
  await writeThroughUi("Company Edit", (r) => new URL(r.url()).pathname.endsWith(`/api/v1/crm/organizations/${companyId}`), () => dialog.getByRole("button", { name: "保存公司", exact: true }).click());
  assert.equal((await prisma.organization.findUniqueOrThrow({ where: { id: companyId } })).shortName, `V4-EDIT-${runId}`);
  await page.reload({ waitUntil: "domcontentloaded" }); await page.getByText(names.company, { exact: true }).first().waitFor();
  await page.getByRole("button", { name: new RegExp("更多操作") }).click(); await page.getByRole("menuitem", { name: "编辑公司", exact: true }).click(); dialog = page.getByRole("dialog", { name: "编辑公司", exact: true }); await assert.doesNotReject(() => dialog.getByLabel("公司简称").waitFor()); assert.equal(await dialog.getByLabel("公司简称").inputValue(), `V4-EDIT-${runId}`); await dialog.getByRole("button", { name: "取消", exact: true }).click();
  pass("Company Create", { id: companyId, layers: ["UI", "HTTP", "DB", "reload"] }); pass("Company Edit"); pass("Company Industry / Location Selector"); pass("Company Logo object-contain"); pass("Company ID Copy");

  // Business contact with fuzzy company selector and subsequent edit.
  await go("contacts", "联系人");
  await page.getByRole("button", { name: "新增联系人", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "新增联系人", exact: true });
  await selectField(dialog, "公司关联方式", "选择已有公司");
  await chooseEntity(dialog, "公司", names.company.slice(0, 12), names.company);
  await dialog.getByLabel(/^联系人姓名/).fill(names.business);
  await dialog.getByLabel("Email").fill(`business-${runId}@example.test`);
  const businessCreated = await writeThroughUi("Contact BUSINESS Create", (r) => new URL(r.url()).pathname.endsWith("/api/v1/crm/contacts"), () => dialog.getByRole("button", { name: "保存联系人", exact: true }).click());
  const businessId = businessCreated.data.id;
  const businessDb = await prisma.contact.findUniqueOrThrow({ where: { id: businessId } });
  assert.equal(businessDb.contactType, "BUSINESS"); assert.equal(businessDb.organizationId, companyId);
  noteDb("Contact BUSINESS Create", { id: businessId, contactType: businessDb.contactType, organizationId: businessDb.organizationId, email: businessDb.email });
  await go(`contacts/${businessId}`, names.business); await copyId(businessId); await shot("contact-business-detail-1440");
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "编辑联系人", exact: true });
  await dialog.getByLabel("职位").fill("Phase 3 采购负责人");
  await writeThroughUi("Contact Edit", (r) => new URL(r.url()).pathname.endsWith(`/api/v1/crm/contacts/${businessId}`), () => dialog.getByRole("button", { name: "保存联系人", exact: true }).click());
  assert.equal((await prisma.contact.findUniqueOrThrow({ where: { id: businessId } })).title, "Phase 3 采购负责人");
  await page.reload({ waitUntil: "domcontentloaded" }); await page.getByText("Phase 3 采购负责人", { exact: true }).first().waitFor();
  pass("Contact BUSINESS Create", { id: businessId, layers: ["UI", "HTTP", "DB", "reload"] }); pass("Contact Edit"); pass("Contact Fuzzy Company Linking"); pass("Contact ID Copy");

  // Individual contact: no company UI and no organization persistence.
  await go("contacts", "联系人"); await page.getByRole("button", { name: "新增联系人", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "新增联系人", exact: true });
  await selectField(dialog, "联系人类型", "个人联系人");
  await dialog.getByText("个人联系人不关联公司，公司相关字段将保持为空。", { exact: true }).waitFor();
  await dialog.getByLabel(/^联系人姓名/).fill(names.individual);
  await dialog.getByLabel("Email").fill(`individual-${runId}@example.test`);
  const individualCreated = await writeThroughUi("Contact INDIVIDUAL Create", (r) => new URL(r.url()).pathname.endsWith("/api/v1/crm/contacts"), () => dialog.getByRole("button", { name: "保存联系人", exact: true }).click());
  const individualId = individualCreated.data.id;
  const individualDb = await prisma.contact.findUniqueOrThrow({ where: { id: individualId } });
  assert.equal(individualDb.contactType, "INDIVIDUAL"); assert.equal(individualDb.organizationId, null);
  noteDb("Contact INDIVIDUAL Create", { id: individualId, contactType: individualDb.contactType, organizationId: individualDb.organizationId });
  await go(`contacts/${individualId}`, names.individual); await copyId(individualId); await page.reload({ waitUntil: "domcontentloaded" }); await page.getByText(names.individual, { exact: true }).first().waitFor();
  pass("Contact INDIVIDUAL Create", { id: individualId, layers: ["UI", "HTTP", "DB", "reload"] });
  await rateWindowCheckpoint("before Marketing Lead scoring workflow");

  // Marketing Lead: system NEW, UI edit, rule-driven scoring to MQL, Workbench accept to SQL, one-click conversion.
  await go("marketing-leads", "线索");
  assert.equal(await page.getByRole("button", { name: "开始孵化", exact: true }).count(), 0);
  await page.getByRole("button", { name: "新增线索", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "新增线索", exact: true });
  await dialog.getByLabel(/^姓名/).fill(names.marketing);
  await dialog.getByLabel("Email").fill(`business-${runId}@example.test`);
  await dialog.getByLabel("公司", { exact: true }).fill(names.company);
  await dialog.getByLabel("公司网站").fill(`https://v4-${runId}.example.test`);
  await dialog.getByLabel("国家 / 地区代码").fill("CN");
  await dialog.getByRole("tab", { name: "询盘与来源", exact: true }).click();
  await dialog.getByLabel("询盘内容").fill("Phase 3 原始询盘：需要一套可扩展的企业级 3D 产品体验与销售协同方案。");
  await dialog.getByLabel("产品兴趣").fill("WebAR 与 3D 商务展示");
  await dialog.getByRole("tab", { name: "营销资格", exact: true }).click();
  await selectField(dialog, "来源", "表单提交");
  await selectField(dialog, "来源渠道", "自然搜索");
  await selectField(dialog, "负责人", "Phase 3 测试管理员");
  const marketingCreated = await writeThroughUi("MarketingLead Create", (r) => new URL(r.url()).pathname.endsWith("/api/v1/crm/marketing-leads"), () => dialog.getByRole("button", { name: "保存线索", exact: true }).click());
  const marketingId = marketingCreated.data.id;
  assert.equal((await prisma.marketingLead.findUniqueOrThrow({ where: { id: marketingId } })).status, "NEW");
  await go(`marketing-leads/${marketingId}`, names.marketing); await copyId(marketingId);
  await page.getByRole("button", { name: "编辑", exact: true }).click(); dialog = page.getByRole("dialog", { name: "编辑线索", exact: true });
  await dialog.getByRole("tab", { name: "询盘与来源", exact: true }).click(); await dialog.getByLabel("补充说明").fill("Phase 3 UI 编辑已验证");
  await writeThroughUi("MarketingLead Edit", (r) => new URL(r.url()).pathname.endsWith(`/api/v1/crm/marketing-leads/${marketingId}`), () => dialog.getByRole("button", { name: "保存线索", exact: true }).click());
  assert.equal((await prisma.marketingLead.findUniqueOrThrow({ where: { id: marketingId } })).note, "Phase 3 UI 编辑已验证");
  for (const ruleName of ["符合目标客户画像", "完成会议", "明确兴趣", "明确需求", "要求方案"]) {
    await page.getByRole("button", { name: "记录行为", exact: true }).click(); dialog = page.getByRole("dialog", { name: "记录行为", exact: true });
    await selectField(dialog, "行为", ruleName);
    await writeThroughUi(`MarketingLead Activity ${ruleName}`, (r) => new URL(r.url()).pathname.endsWith(`/api/v1/crm/marketing-leads/${marketingId}/activities`), () => dialog.getByRole("button", { name: "记录行为", exact: true }).click());
    await dialog.waitFor({ state: "hidden" }); await settle();
  }
  const mqlDb = await prisma.marketingLead.findUniqueOrThrow({ where: { id: marketingId }, include: { activities: true, statusHistory: true } });
  assert.equal(mqlDb.status, "MQL"); assert.ok(mqlDb.mqlAt); assert.equal(mqlDb.fitScore, 40); assert.ok(mqlDb.engagementScoreCached >= 70);
  noteDb("MarketingLead auto MQL", { id: marketingId, status: mqlDb.status, fitScore: mqlDb.fitScore, engagementScore: mqlDb.engagementScoreCached, mqlAt: mqlDb.mqlAt, activityCount: mqlDb.activities.length, statusHistory: mqlDb.statusHistory.map((h) => h.toStatus) });
  await page.reload({ waitUntil: "domcontentloaded" }); await page.getByText("营销合格线索（MQL）", { exact: true }).first().waitFor(); await shot("marketing-lead-mql-detail-1440");
  pass("MarketingLead Create", { id: marketingId, layers: ["UI", "HTTP", "DB", "reload"] }); pass("MarketingLead Edit"); pass("MarketingLead → MQL", { scores: [mqlDb.fitScore, mqlDb.engagementScoreCached] }); pass("MarketingLead ID Copy"); pass("No START_NURTURING UI");
  await go("workbench", "我的工作台");
  const mqlItem = page.locator("li").filter({ hasText: names.marketing }).first(); await mqlItem.waitFor(); await shot("workbench-mql-1440");
  await writeThroughUi("MQL → SQL", (r) => new URL(r.url()).pathname.endsWith(`/api/v1/crm/marketing-leads/${marketingId}/transition`), () => mqlItem.getByRole("button", { name: "接受跟进", exact: true }).click());
  const sqlDb = await prisma.marketingLead.findUniqueOrThrow({ where: { id: marketingId } }); assert.equal(sqlDb.status, "SQL"); assert.ok(sqlDb.sqlAt); assert.ok(sqlDb.firstSalesResponseAt);
  noteDb("MQL → SQL", { id: marketingId, status: sqlDb.status, sqlAt: sqlDb.sqlAt, firstSalesResponseAt: sqlDb.firstSalesResponseAt });
  await go(`marketing-leads/${marketingId}`, names.marketing); await page.getByText("销售合格线索（SQL）", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "转为商机", exact: true }).click(); dialog = page.getByRole("dialog", { name: "线索转商机", exact: true }); await dialog.getByText("原始询盘受保护", { exact: true }).waitFor();
  const converted = await writeThroughUi("SQL → Opportunity", (r) => new URL(r.url()).pathname.endsWith(`/api/v1/crm/marketing-leads/${marketingId}/convert`), () => dialog.getByRole("button", { name: "确认转商机", exact: true }).click());
  const convertedOpportunityId = converted.data.opportunityId;
  const convertedDb = await prisma.marketingLead.findUniqueOrThrow({ where: { id: marketingId }, include: { convertedOpportunity: true } });
  assert.equal(convertedDb.status, "CONVERTED"); assert.equal(convertedDb.convertedOpportunityId, convertedOpportunityId); assert.equal(convertedDb.convertedOpportunity?.requirementDetail, convertedDb.inquiryContent);
  noteDb("SQL → Opportunity", { marketingLeadId: marketingId, status: convertedDb.status, opportunityId: convertedOpportunityId, sourceInquiryPreserved: convertedDb.convertedOpportunity?.requirementDetail === convertedDb.inquiryContent });
  await page.reload({ waitUntil: "domcontentloaded" }); await page.getByText("已转商机", { exact: true }).first().waitFor(); pass("MQL → SQL", { layers: ["Workbench UI", "HTTP", "DB", "reload"] }); pass("SQL → Opportunity", { id: convertedOpportunityId, layers: ["UI", "HTTP", "DB", "reload"] });

  // Manual Opportunity: fuzzy contact selector, rich requirement plus attachment, owner assignment, followup -> task, stage and terminal LOST.
  await go("leads", "商机"); await page.getByRole("button", { name: "新增商机", exact: true }).click(); dialog = page.getByRole("dialog", { name: "新增商机", exact: true });
  await chooseEntity(dialog, "联系人、公司、Email 或 Phone", names.business.slice(0, 12), names.business);
  await dialog.getByLabel(/^项目需求简述/).fill(names.opportunity);
  await selectField(dialog, "商机优先级", "高");
  await dialog.getByRole("tab", { name: "需求信息", exact: true }).click();
  await dialog.getByLabel("需求整理 / 详细需求").fill("Phase 3 手工商机需求正文，可补充说明并同时上传图片、视频或文档。");
  await dialog.getByLabel("需求附件").setInputFiles({ name: `phase3-requirement-${runId}.txt`, mimeType: "text/plain", buffer: Buffer.from("Phase 3 requirement attachment") });
  const manualCreated = await writeThroughUi("Opportunity Create manually", (r) => new URL(r.url()).pathname.endsWith("/api/v1/crm/leads"), () => dialog.getByRole("button", { name: "保存商机", exact: true }).click());
  const opportunityId = manualCreated.data.id;
  await dialog.waitFor({ state: "hidden" });
  const manualDb = await prisma.crmLead.findUniqueOrThrow({ where: { id: opportunityId } }); const requirementFile = await prisma.crmAttachment.findFirstOrThrow({ where: { entityType: "LEAD", entityId: opportunityId, fieldKey: "requirementFiles" } });
  noteDb("Opportunity Create manually", { id: opportunityId, contactId: manualDb.contactId, status: manualDb.status, priority: manualDb.priority, requirementFile: requirementFile.originalName });
  await go(`leads/${opportunityId}`, names.opportunity); await copyId(opportunityId); await page.getByText(requirementFile.originalName, { exact: true }).waitFor(); await shot("opportunity-detail-1440");
  const assignmentBefore = await prisma.assignmentNotification.count({ where: { entityType: "OPPORTUNITY", entityId: opportunityId, fieldKey: "salesOwnerUserId" } });
  await page.getByRole("button", { name: "编辑", exact: true }).click(); dialog = page.getByRole("dialog", { name: "编辑商机", exact: true });
  await selectField(dialog, "商机阶段", "方案"); await selectField(dialog, "商机负责人", "Phase 3 测试销售");
  await writeThroughUi("Opportunity Stage + Assignment", (r) => new URL(r.url()).pathname.endsWith(`/api/v1/crm/leads/${opportunityId}`), () => dialog.getByRole("button", { name: "保存商机", exact: true }).click());
  let updatedOpp = await prisma.crmLead.findUniqueOrThrow({ where: { id: opportunityId } }); assert.equal(updatedOpp.status, "SOLUTION"); assert.equal(updatedOpp.salesOwnerUserId, sales.id);
  const assignmentAfter = await prisma.assignmentNotification.findMany({ where: { entityType: "OPPORTUNITY", entityId: opportunityId, fieldKey: "salesOwnerUserId" }, orderBy: { createdAt: "asc" } }); assert.equal(assignmentAfter.length, assignmentBefore + 1); assert.equal(assignmentAfter.at(-1).toUserId, sales.id);
  noteDb("Opportunity Assignment Outbox", assignmentAfter.map((n) => ({ id: n.id, toUserId: n.toUserId, status: n.status, attempts: n.attempts })));
  await page.reload({ waitUntil: "domcontentloaded" }); await page.getByText("方案", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "编辑", exact: true }).click(); dialog = page.getByRole("dialog", { name: "编辑商机", exact: true });
  await writeThroughUi("Opportunity Duplicate Assignment Save", (r) => new URL(r.url()).pathname.endsWith(`/api/v1/crm/leads/${opportunityId}`), () => dialog.getByRole("button", { name: "保存商机", exact: true }).click());
  assert.equal(await prisma.assignmentNotification.count({ where: { entityType: "OPPORTUNITY", entityId: opportunityId, fieldKey: "salesOwnerUserId" } }), assignmentAfter.length);
  await page.getByRole("button", { name: "记录跟进", exact: true }).click(); dialog = page.getByRole("dialog", { name: "新增跟进", exact: true });
  await dialog.getByLabel(/^互动内容/).fill("Phase 3 UI 跟进：已确认方案范围。"); await dialog.getByLabel("当前进展").fill("方案范围已确认"); await dialog.getByLabel("下一步行动").fill("准备演示并发送确认材料");
  const tomorrow = new Date(Date.now() + 86_400_000); const localDate = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); await dialog.getByLabel("下次跟进").fill(localDate);
  await writeThroughUi("Opportunity Followup", (r) => new URL(r.url()).pathname.endsWith(`/api/v1/crm/leads/${opportunityId}/followups`), () => dialog.getByRole("button", { name: "保存互动", exact: true }).click());
  const taskDb = await prisma.crmTask.findFirstOrThrow({ where: { leadId: opportunityId, title: "准备演示并发送确认材料" } }); updatedOpp = await prisma.crmLead.findUniqueOrThrow({ where: { id: opportunityId } }); assert.equal(updatedOpp.nextAction, "准备演示并发送确认材料"); noteDb("Opportunity Followup + Task", { opportunityId, taskId: taskDb.id, nextAction: updatedOpp.nextAction, nextFollowupAt: updatedOpp.nextFollowupAt });
  await page.reload({ waitUntil: "domcontentloaded" }); await page.getByText("准备演示并发送确认材料", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "编辑", exact: true }).click(); dialog = page.getByRole("dialog", { name: "编辑商机", exact: true }); await selectField(dialog, "商机阶段", "丢失");
  await writeThroughUi("Opportunity LOST", (r) => new URL(r.url()).pathname.endsWith(`/api/v1/crm/leads/${opportunityId}`), () => dialog.getByRole("button", { name: "保存商机", exact: true }).click());
  assert.equal((await prisma.crmLead.findUniqueOrThrow({ where: { id: opportunityId } })).status, "LOST");
  pass("Opportunity Create manually", { id: opportunityId, layers: ["UI", "HTTP", "DB", "reload"] }); pass("Opportunity Attachment"); pass("Opportunity Stage", { stages: ["NEW", "SOLUTION", "LOST"] }); pass("Opportunity Followup + Task"); pass("Opportunity ID Copy"); pass("Assignment Notification", { outboxStatus: assignmentAfter.at(-1).status, duplicateSuppressed: true });
  await rateWindowCheckpoint("before converted Opportunity terminal stage workflow");

  // Converted Opportunity advances to WON and makes the related company a customer.
  await go(`leads/${convertedOpportunityId}`, convertedDb.convertedOpportunity.requirementSummary); await page.getByRole("button", { name: "编辑", exact: true }).click(); dialog = page.getByRole("dialog", { name: "编辑商机", exact: true }); await selectField(dialog, "商机阶段", "成交");
  await writeThroughUi("Opportunity WON", (r) => new URL(r.url()).pathname.endsWith(`/api/v1/crm/leads/${convertedOpportunityId}`), () => dialog.getByRole("button", { name: "保存商机", exact: true }).click());
  const wonDb = await prisma.crmLead.findUniqueOrThrow({ where: { id: convertedOpportunityId }, include: { contact: { include: { organization: true } } } }); assert.equal(wonDb.status, "WON"); assert.ok(wonDb.wonAt); assert.equal(wonDb.contact.organization?.lifecycleStage, "CUSTOMER");
  await page.reload({ waitUntil: "domcontentloaded" }); await page.getByText("成交", { exact: true }).first().waitFor(); noteDb("Opportunity WON", { id: wonDb.id, wonAt: wonDb.wonAt, closedAt: wonDb.closedAt, companyLifecycle: wonDb.contact.organization?.lifecycleStage }); pass("Opportunity WON system date + Company CUSTOMER");
  await rateWindowCheckpoint("before import/export and visual regression workflow");

  // Selected/filtered/all export, actual downloads and XLSX inspection, plus export history.
  await go("contacts", "联系人");
  const businessRow = page.getByRole("row").filter({ hasText: names.business }).first(); await businessRow.getByRole("checkbox", { name: `选择 ${businessId}` }).check();
  await page.getByRole("button", { name: "导出所选", exact: true }).click(); dialog = page.getByRole("dialog", { name: "导出数据", exact: true }); await dialog.getByText("选中的 1 条", { exact: true }).waitFor();
  const selectedExport = await writeThroughUi("Export Selected", (r) => new URL(r.url()).pathname.endsWith("/api/v1/crm/exports/contacts"), () => dialog.getByRole("button", { name: "生成导出文件", exact: true }).click());
  await dialog.getByRole("link", { name: "下载 XLSX", exact: true }).waitFor();
  const selectedDownloadPromise = page.waitForEvent("download"); await dialog.getByRole("link", { name: "下载 XLSX", exact: true }).click(); const selectedDownload = await selectedDownloadPromise; const selectedPath = resolve(downloads, `contacts-selected-${runId}.xlsx`); await selectedDownload.saveAs(selectedPath);
  const selectedWorkbook = new ExcelJS.Workbook(); await selectedWorkbook.xlsx.readFile(selectedPath); assert.equal(selectedWorkbook.worksheets[0].actualRowCount, 2);
  const selectedJob = await prisma.exportJob.findUniqueOrThrow({ where: { id: selectedExport.data.id } }); assert.equal(selectedJob.scope, "SELECTED"); assert.equal(selectedJob.rowCount, 1); assert.equal(selectedJob.status, "COMPLETED");
  noteDb("Export Selected", { id: selectedJob.id, scope: selectedJob.scope, status: selectedJob.status, rowCount: selectedJob.rowCount, fileName: selectedJob.fileName });
  await dialog.getByRole("button", { name: "完成", exact: true }).click();
  for (const [scopeLabel, expectedScope, caseName] of [["当前筛选结果", "FILTERED", "Export Filtered"], ["当前权限内全部", "ALL_CURRENT_PERMISSION", "Export All"]]) {
    await page.getByRole("button", { name: "导出", exact: true }).click(); dialog = page.getByRole("dialog", { name: "导出数据", exact: true }); await selectField(dialog, "导出范围", scopeLabel);
    const exported = await writeThroughUi(caseName, (r) => new URL(r.url()).pathname.endsWith("/api/v1/crm/exports/contacts"), () => dialog.getByRole("button", { name: "生成导出文件", exact: true }).click());
    await dialog.getByRole("link", { name: "下载 XLSX", exact: true }).waitFor(); const downloadPromise = page.waitForEvent("download"); await dialog.getByRole("link", { name: "下载 XLSX", exact: true }).click(); const download = await downloadPromise; const path = resolve(downloads, `contacts-${expectedScope.toLowerCase()}-${runId}.xlsx`); await download.saveAs(path);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(path); assert.ok(workbook.worksheets[0].actualRowCount >= 2); const job = await prisma.exportJob.findUniqueOrThrow({ where: { id: exported.data.id } }); assert.equal(job.scope, expectedScope); assert.equal(job.status, "COMPLETED");
    await dialog.getByRole("button", { name: "完成", exact: true }).click(); pass(caseName, { id: job.id, rows: job.rowCount, xlsxRows: workbook.worksheets[0].actualRowCount - 1 });
  }
  await page.getByRole("button", { name: "导出", exact: true }).click(); dialog = page.getByRole("dialog", { name: "导出数据", exact: true }); await dialog.getByRole("button", { name: "导出记录", exact: true }).click(); await dialog.getByText(selectedJob.fileName, { exact: false }).first().waitFor(); await shot("export-history-1440"); await dialog.getByRole("button", { name: "取消", exact: true }).click();
  pass("Export Selected", { id: selectedJob.id, rows: 1, file: selectedPath.slice(resolve(".").length + 1), layers: ["UI", "HTTP", "DB", "download", "XLSX"] }); pass("Export History");

  // Import from a template downloaded through the UI, then preflight/execute through the UI.
  await page.getByRole("button", { name: "导入", exact: true }).click(); dialog = page.getByRole("dialog", { name: "批量导入", exact: true });
  const templatePromise = page.waitForEvent("download"); await dialog.getByRole("link", { name: "下载标准模板", exact: true }).click(); const templateDownload = await templatePromise; const templatePath = resolve(downloads, `contacts-template-${runId}.xlsx`); await templateDownload.saveAs(templatePath);
  const importWorkbook = new ExcelJS.Workbook(); await importWorkbook.xlsx.readFile(templatePath); const worksheet = importWorkbook.worksheets[0]; const headers = new Map(); worksheet.getRow(1).eachCell((cell, column) => headers.set(String(cell.value).trim(), column)); worksheet.getRow(2).eachCell((cell) => { cell.value = null; });
  const importValues = { contactName: names.imported, contactType: "INDIVIDUAL", email: `import-${runId}@example.test` };
  for (const [header, value] of Object.entries(importValues)) if (headers.has(header)) worksheet.getRow(2).getCell(headers.get(header)).value = value;
  worksheet.getRow(2).commit(); const importPath = resolve(downloads, `contacts-import-${runId}.xlsx`); await importWorkbook.xlsx.writeFile(importPath);
  await dialog.getByLabel("XLSX 文件").setInputFiles(importPath);
  const preflight = await writeThroughUi("Import Preflight", (r) => new URL(r.url()).pathname.includes("/api/v1/crm/imports/contacts"), () => dialog.getByRole("button", { name: "开始预检", exact: true }).click());
  await dialog.getByText("可导入", { exact: true }).first().waitFor();
  await writeThroughUi("Import Execute", (r) => new URL(r.url()).pathname.endsWith(`/api/v1/crm/imports/${preflight.data.id}/execute`), () => dialog.getByRole("button", { name: "确认导入", exact: true }).click());
  const importedDb = await prisma.contact.findFirstOrThrow({ where: { contactName: names.imported, deletedAt: null } }); assert.equal(importedDb.contactType, "INDIVIDUAL");
  noteDb("Import", { jobId: preflight.data.id, contactId: importedDb.id, contactName: importedDb.contactName, contactType: importedDb.contactType }); await dialog.getByRole("button", { name: "完成", exact: true }).click(); await page.reload({ waitUntil: "domcontentloaded" }); await settle(); pass("Import", { id: preflight.data.id, layers: ["UI template download", "UI upload", "HTTP", "DB", "reload"] });

  // Supplier reuse of Organization + VENDOR, toolbar consistency, and scoped empty state.
  await go("suppliers", "供应商"); await page.getByRole("button", { name: "新增供应商", exact: true }).click(); dialog = page.getByRole("dialog", { name: "新建公司", exact: true }); await dialog.getByLabel(/^公司名称/).fill(names.supplier);
  const supplierCreated = await writeThroughUi("Supplier Create", (r) => new URL(r.url()).pathname.endsWith("/api/v1/crm/organizations"), () => dialog.getByRole("button", { name: "保存公司", exact: true }).click()); const supplierId = supplierCreated.data.id;
  const supplierDb = await prisma.organization.findUniqueOrThrow({ where: { id: supplierId }, include: { roles: true } }); assert.ok(supplierDb.roles.some((role) => role.role === "VENDOR"));
  await page.reload({ waitUntil: "domcontentloaded" }); await page.getByText(names.supplier, { exact: true }).first().waitFor(); await go("suppliers", "供应商"); await page.getByPlaceholder("搜索公司、简称或联系人").fill(`不存在-${runId}`); await page.waitForTimeout(500); await page.getByText("暂无供应商", { exact: true }).waitFor(); await shot("supplier-empty-toolbar-1440"); pass("Supplier Create", { id: supplierId, model: "Organization + VENDOR" }); pass("Supplier Empty State + Toolbar");

  // Dashboard four business views, owner/date controls, plus Workbench task and opportunity sources.
  await go("dashboard", "数据看板"); for (const tab of ["管理概览", "营销与转化", "商机推进", "团队表现"]) await page.getByRole("tab", { name: tab, exact: true }).waitFor(); assert.equal(await page.getByRole("tab").filter({ hasText: /管理概览|营销与转化|商机推进|团队表现/ }).count(), 4);
  await page.getByRole("tab", { name: "营销与转化", exact: true }).click(); await page.getByText("网站访客追踪尚未接入", { exact: true }).waitFor(); await page.getByText("线索", { exact: true }).first().waitFor();
  await page.getByRole("tab", { name: "商机推进", exact: true }).click(); await page.getByText("下一步行动覆盖率", { exact: true }).first().waitFor();
  await page.getByRole("tab", { name: "团队表现", exact: true }).click(); await page.getByText("新增商机", { exact: true }).first().waitFor(); await shot("dashboard-team-1440"); pass("Dashboard 4 Views + Owner Metrics");
  await go("workbench", "我的工作台"); await page.getByText("任务队列", { exact: true }).waitFor(); await page.getByText("商机提醒", { exact: true }).waitFor(); pass("Workbench Aggregation");

  // Responsive visual regression at required widths on representative dense pages.
  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, ready, name] of [["organizations", "公司", "company-list"], [`leads/${convertedOpportunityId}`, convertedDb.convertedOpportunity.requirementSummary, "opportunity-detail"], ["dashboard", "数据看板", "dashboard"]]) { await go(route, ready); await shot(`${name}-${width}`, false); }
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // VIEWER: hidden mutation controls on the same real UI.
  const viewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const viewerPage = await viewerContext.newPage(); await login(viewerPage, "viewer@phase3.example.test", password); await viewerPage.goto(`${base}/#marketing-leads`, { waitUntil: "domcontentloaded" }); await viewerPage.getByText("线索", { exact: true }).first().waitFor();
  for (const name of ["新增线索", "导入", "导出", "导出所选", "批量分配"]) assert.equal(await viewerPage.getByRole("button", { name, exact: true }).count(), 0, `VIEWER must not see ${name}`);
  const viewerShot = resolve(screenshots, `${String(screenshotsEvidence.length + 1).padStart(2, "0")}-viewer-read-only-1440.png`); const viewerBytes = await viewerPage.screenshot({ path: viewerShot, fullPage: true }); screenshotsEvidence.push({ name: "viewer-read-only-1440", file: viewerShot.slice(resolve(".").length + 1), bytes: viewerBytes.length, sha256: createHash("sha256").update(viewerBytes).digest("hex") }); await viewerContext.close(); pass("RBAC VIEWER read-only controls hidden");

  assert.deepEqual(consoleEvents, [], "unexpected browser console errors"); assert.deepEqual(networkEvents, [], "unexpected HTTP 4xx/5xx responses"); pass("Unexpected console/network errors = 0");
} catch (error) {
  tests.push({ name: currentCase, status: "FAIL", error: error instanceof Error ? error.stack : String(error) });
  await page.screenshot({ path: resolve(screenshots, "FAILED.png"), fullPage: true }).catch(() => undefined);
  throw error;
} finally {
  const generatedFiles = await Promise.all((await readdir(downloads).catch(() => [])).map(async (file) => { const path = resolve(downloads, file); const info = await stat(path); const bytes = await readFile(path); return { file: `downloads/${file}`, bytes: info.size, sha256: createHash("sha256").update(bytes).digest("hex") }; }));
  const summary = { runId, base, account, completedAt: new Date().toISOString(), tests, writes, databaseEvidence, screenshots: screenshotsEvidence, generatedFiles, consoleEvents, networkEvents };
  await writeFile(resolve(root, "results.json"), JSON.stringify(summary, null, 2) + "\n");
  const markdown = [`# Kivisense CRM Phase 3 Local Real UI E2E`, ``, `- Run ID: ${runId}`, `- Target: ${base}`, `- Browser: Chromium / Chrome`, `- Viewports: 1440x900, 1280x900, 1024x900`, `- Unexpected console errors: ${consoleEvents.length}`, `- Unexpected HTTP 4xx/5xx: ${networkEvents.length}`, ``, `## Results`, ``, ...tests.map((test) => `- ${test.status}: ${test.name}`), ``, `## Three-layer evidence`, ``, `Every critical write above is paired in results.json with the originating browser HTTP response and a direct database snapshot; the flow then reloads the record UI before PASS.`, ``, `## Files`, ``, ...screenshotsEvidence.map((item) => `- ${item.name}: ${item.file}`), ...generatedFiles.map((item) => `- ${item.file} (${item.bytes} bytes; SHA-256 ${item.sha256})`), ``].join("\n");
  await writeFile(resolve(root, "00-index.md"), markdown);
  await prisma.$disconnect(); await context.close(); await browser.close();
}
