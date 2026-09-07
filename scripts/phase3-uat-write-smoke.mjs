import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const base = "https://www.gridworks.cn/crm_kivisense";
const host = "root@101.133.150.129";
const remoteApp = "/srv/kivisense-crm-uat";
const secretText = execFileSync("ssh", ["-o", "BatchMode=yes", host, `cat ${remoteApp}/uat-credentials.env`], { encoding: "utf8" });
const secrets = Object.fromEntries(secretText.split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
  const at = line.indexOf("=");
  return [line.slice(0, at), line.slice(at + 1).replace(/^(['"])(.*)\1$/, "$2")];
}));
for (const key of ["UAT_SUPER_ADMIN_USERNAME", "UAT_SUPER_ADMIN_PASSWORD", "UAT_SALES_USERNAME", "UAT_SALES_PASSWORD"]) {
  if (!secrets[key]) throw new Error(`Missing ${key} in the protected UAT credential file`);
}

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || "/Users/ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs"));
const require = createRequire(new URL("../backend/package.json", import.meta.url));
const ExcelJS = require("exceljs");
const runId = Date.now();
const names = {
  marketing: `UAT-V4-线索-${runId}`,
  company: `UAT-V4-公司-${runId}`,
  opportunity: `UAT-V4-商机-${runId}`,
};
const outRoot = resolve("artifacts/uat-v4");
const out = resolve(outRoot, `run-${runId}`);
await mkdir(out, { recursive: true });

const checks = [];
const writes = [];
const consoleEvents = [];
const networkEvents = [];
const expectedNetwork = [];
const screenshots = [];
const databaseEvidence = [];
let currentCase = "bootstrap";

function pass(name, evidence = {}) {
  checks.push({ name, status: "PASS", ...evidence });
  process.stdout.write(`PASS ${name}\n`);
}

function safeId(value, label) {
  assert.match(value, /^[a-z0-9]{20,32}$/, `${label} must be a CUID`);
  return value;
}

function databaseQuery(sql) {
  return execFileSync("ssh", [
    "-o", "BatchMode=yes", host,
    "docker exec -i sowind-crm-test-mysql-1 sh -c 'MYSQL_PWD=\"$MYSQL_ROOT_PASSWORD\" mysql -uroot -N -B kivisense_crm_uat'",
  ], { input: sql, encoding: "utf8" }).trim();
}

function monitor(page, role) {
  page.on("pageerror", (error) => consoleEvents.push({ case: currentCase, role, type: "pageerror", message: error.message }));
  page.on("console", (message) => { if (message.type() === "error") consoleEvents.push({ case: currentCase, role, type: "console", message: message.text() }); });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const item = { case: currentCase, role, status: response.status(), method: response.request().method(), url: response.url() };
    if (response.status() === 401 && new URL(response.url()).pathname.endsWith("/api/v1/auth/me")) expectedNetwork.push(item);
    else networkEvents.push(item);
  });
}

async function login(context, role, loginAccount, password) {
  const page = await context.newPage();
  await page.goto(`${base}/#dashboard`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("登录账号").fill(loginAccount);
  await page.getByLabel("密码").fill(password);
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/v1/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  await page.getByRole("heading", { name: "数据看板", exact: true }).waitFor();
  monitor(page, role);
  return page;
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.locator("[data-slot='skeleton'], .animate-pulse").first().waitFor({ state: "hidden", timeout: 8_000 }).catch(() => undefined);
  await page.evaluate(async () => { await document.fonts?.ready; });
  await page.waitForTimeout(300);
}

async function go(page, hash, readyText) {
  currentCase = `route:${hash}`;
  await page.goto(`${base}/#${hash}`, { waitUntil: "domcontentloaded" });
  await page.getByText(readyText, { exact: true }).first().waitFor();
  await settle(page);
}

async function shot(page, name) {
  await settle(page);
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.viewport + 1, `${name} has document-level horizontal overflow`);
  const path = resolve(out, `${String(screenshots.length + 1).padStart(2, "0")}-${name}.png`);
  const bytes = await page.screenshot({ path, fullPage: true });
  screenshots.push({ name, file: path.slice(resolve(".").length + 1), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), dimensions });
}

async function selectField(page, scope, label, option) {
  const labelNode = scope.getByText(label, { exact: true }).first();
  await labelNode.waitFor();
  await labelNode.locator("..").getByRole("combobox").click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function writeThroughUi(page, name, predicate, action) {
  currentCase = name;
  const responsePromise = page.waitForResponse((response) => predicate(response) && response.request().method() !== "GET", { timeout: 25_000 });
  await action();
  const response = await responsePromise;
  const responseText = await response.text();
  let body;
  try { body = JSON.parse(responseText); } catch { body = { text: responseText.slice(0, 500) }; }
  writes.push({ name, method: response.request().method(), url: response.url(), status: response.status(), response: body });
  assert.ok(response.ok(), `${name} HTTP ${response.status()}: ${responseText}`);
  return body;
}

async function deleteRow(page, family, readyText, placeholder, name, id, menuLabel = "删除") {
  await go(page, family, readyText);
  const search = page.getByPlaceholder(placeholder);
  await search.fill(name);
  if (family !== "organizations") await search.press("Enter");
  await page.waitForTimeout(700);
  const row = page.getByRole("row").filter({ hasText: name }).first();
  await row.waitFor();
  await row.getByRole("button", { name: `${name}的更多操作`, exact: true }).click();
  await page.getByRole("menuitem", { name: menuLabel, exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.waitFor();
  await writeThroughUi(page, `Cleanup ${readyText}`, (response) => new URL(response.url()).pathname.endsWith(`/${id}`) && response.request().method() === "DELETE", () => dialog.getByRole("button", { name: "确认删除", exact: true }).click());
  await dialog.waitFor({ state: "hidden" });
  await row.waitFor({ state: "hidden" });
}

async function cleanupStaleQaRecords(page) {
  const output = databaseQuery([
    "SELECT 'OPP', id, requirement_summary FROM crm_leads WHERE deleted_at IS NULL AND requirement_summary LIKE 'UAT-V4-商机-%';",
    "SELECT 'ML', id, full_name FROM marketing_leads WHERE deleted_at IS NULL AND full_name LIKE 'UAT-V4-线索-%';",
    "SELECT 'CONTACT', id, contact_name FROM contacts WHERE deleted_at IS NULL AND contact_name LIKE 'UAT-V4-线索-%';",
    "SELECT 'ORG', id, name FROM organizations WHERE deleted_at IS NULL AND name LIKE 'UAT-V4-公司-%';",
  ].join("\n"));
  const rows = output
    ? output.split(/\r?\n/).map((line) => {
        const [type, id, name] = line.split("\t");
        return { type, id: safeId(id, `stale ${type} id`), name };
      })
    : [];
  const config = {
    OPP: ["leads", "商机", "搜索商机、公司", "删除"],
    ML: ["marketing-leads", "线索", "搜索姓名、公司、Email、Phone 或询盘", "删除"],
    CONTACT: ["contacts", "联系人", "搜索联系人、公司、Email 或 Phone", "删除"],
    ORG: ["organizations", "公司", "搜索公司、简称或联系人", "删除公司"],
  };
  for (const type of ["OPP", "ML", "CONTACT", "ORG"]) {
    for (const row of rows.filter((item) => item.type === type)) {
      const [family, readyText, placeholder, menuLabel] = config[type];
      await deleteRow(page, family, readyText, placeholder, row.name, row.id, menuLabel);
    }
  }
  pass("UAT stale QA record cleanup", { deletedRecords: rows.length });
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const salesContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
let adminPage;
let salesPage;

try {
  adminPage = await login(adminContext, "SUPER_ADMIN", secrets.UAT_SUPER_ADMIN_USERNAME, secrets.UAT_SUPER_ADMIN_PASSWORD);
  const usersResponse = await adminContext.request.get(`${base}/api/v1/crm/users`);
  assert.equal(usersResponse.status(), 200);
  const users = (await usersResponse.json()).data;
  const admin = users.find((user) => user.loginAccount === secrets.UAT_SUPER_ADMIN_USERNAME);
  const sales = users.find((user) => user.loginAccount === secrets.UAT_SALES_USERNAME);
  assert.ok(admin && sales, "UAT CRM user directory must contain the protected admin and sales accounts");
  pass("UAT SUPER_ADMIN Login");
  await cleanupStaleQaRecords(adminPage);

  await go(adminPage, "marketing-leads", "线索");
  assert.equal(await adminPage.getByRole("button", { name: "开始孵化", exact: true }).count(), 0);
  await adminPage.getByRole("button", { name: "新增线索", exact: true }).click();
  let dialog = adminPage.getByRole("dialog", { name: "新增线索", exact: true });
  await dialog.getByLabel(/^姓名/).fill(names.marketing);
  await dialog.getByLabel("Email").fill(`uat-v4-${runId}@example.test`);
  await dialog.getByLabel("公司", { exact: true }).fill(names.company);
  await dialog.getByLabel("公司网站").fill(`https://uat-v4-${runId}.example.test`);
  await dialog.getByLabel("国家 / 地区代码").fill("CN");
  await dialog.getByRole("tab", { name: "询盘与来源", exact: true }).click();
  await dialog.getByLabel("询盘内容").fill("UAT Phase 3 controlled write: enterprise 3D product experience requirement.");
  await dialog.getByRole("tab", { name: "营销资格", exact: true }).click();
  await selectField(adminPage, dialog, "来源", "表单提交");
  await selectField(adminPage, dialog, "来源渠道", "自然搜索");
  await selectField(adminPage, dialog, "负责人", admin.name);
  const created = await writeThroughUi(adminPage, "UAT MarketingLead Create", (response) => new URL(response.url()).pathname.endsWith("/api/v1/crm/marketing-leads"), () => dialog.getByRole("button", { name: "保存线索", exact: true }).click());
  const marketingId = safeId(created.data.id, "marketingLeadId");
  await go(adminPage, `marketing-leads/${marketingId}`, names.marketing);
  await adminPage.getByRole("button", { name: "编辑", exact: true }).click();
  dialog = adminPage.getByRole("dialog", { name: "编辑线索", exact: true });
  await dialog.getByRole("tab", { name: "询盘与来源", exact: true }).click();
  await dialog.getByLabel("补充说明").fill("UAT Phase 3 edit verified");
  await dialog.getByRole("tab", { name: "营销资格", exact: true }).click();
  await selectField(adminPage, dialog, "负责人", sales.name);
  await writeThroughUi(adminPage, "UAT MarketingLead Edit + Assign", (response) => new URL(response.url()).pathname.endsWith(`/api/v1/crm/marketing-leads/${marketingId}`), () => dialog.getByRole("button", { name: "保存线索", exact: true }).click());
  await adminPage.reload({ waitUntil: "domcontentloaded" });
  await adminPage.getByText(sales.name, { exact: true }).first().waitFor();
  pass("UAT MarketingLead Create/Edit/Assign", { marketingId, assignedTo: sales.loginAccount });

  for (const ruleName of ["符合目标客户画像", "完成会议", "明确兴趣", "明确需求", "要求方案"]) {
    await adminPage.getByRole("button", { name: "记录行为", exact: true }).click();
    dialog = adminPage.getByRole("dialog", { name: "记录行为", exact: true });
    await selectField(adminPage, dialog, "行为", ruleName);
    await writeThroughUi(adminPage, `UAT Score ${ruleName}`, (response) => new URL(response.url()).pathname.endsWith(`/api/v1/crm/marketing-leads/${marketingId}/activities`), () => dialog.getByRole("button", { name: "记录行为", exact: true }).click());
    await dialog.waitFor({ state: "hidden" });
    await settle(adminPage);
  }
  await adminPage.reload({ waitUntil: "domcontentloaded" });
  await adminPage.getByText("营销合格线索（MQL）", { exact: true }).first().waitFor();
  await shot(adminPage, "marketing-lead-mql-1440");
  pass("UAT MarketingLead → MQL");

  salesPage = await login(salesContext, "SALES", secrets.UAT_SALES_USERNAME, secrets.UAT_SALES_PASSWORD);
  await go(salesPage, "workbench", "我的工作台");
  const mqlItem = salesPage.locator("li").filter({ hasText: names.marketing }).first();
  await mqlItem.waitFor();
  await writeThroughUi(salesPage, "UAT MQL → SQL", (response) => new URL(response.url()).pathname.endsWith(`/api/v1/crm/marketing-leads/${marketingId}/transition`), () => mqlItem.getByRole("button", { name: "接受跟进", exact: true }).click());
  await go(salesPage, `marketing-leads/${marketingId}`, names.marketing);
  await salesPage.getByText("销售合格线索（SQL）", { exact: true }).first().waitFor();
  await salesPage.getByRole("button", { name: "转为商机", exact: true }).click();
  dialog = salesPage.getByRole("dialog", { name: "线索转商机", exact: true });
  await dialog.getByText("原始询盘受保护", { exact: true }).waitFor();
  await dialog.getByLabel("商机名称 / 需求简述").fill(names.opportunity);
  const converted = await writeThroughUi(salesPage, "UAT SQL → Opportunity", (response) => new URL(response.url()).pathname.endsWith(`/api/v1/crm/marketing-leads/${marketingId}/convert`), () => dialog.getByRole("button", { name: "确认转商机", exact: true }).click());
  const opportunityId = safeId(converted.data.opportunityId, "opportunityId");
  const contactId = safeId(converted.data.contactId, "contactId");
  const organizationId = safeId(converted.data.organizationId, "organizationId");
  await salesPage.reload({ waitUntil: "domcontentloaded" });
  await salesPage.getByText("已转商机", { exact: true }).first().waitFor();
  await shot(salesPage, "converted-marketing-lead-1440");
  pass("UAT MQL → SQL");
  pass("UAT SQL → Opportunity", { opportunityId, contactId, organizationId });

  await go(adminPage, "marketing-leads", "线索");
  const search = adminPage.getByPlaceholder("搜索姓名、公司、Email、Phone 或询盘");
  await search.fill(names.marketing);
  await search.press("Enter");
  const exportRow = adminPage.getByRole("row").filter({ hasText: names.marketing }).first();
  await exportRow.waitFor();
  await exportRow.getByRole("checkbox", { name: `选择 ${marketingId}` }).check();
  await adminPage.getByRole("button", { name: "导出所选", exact: true }).click();
  dialog = adminPage.getByRole("dialog", { name: "导出数据", exact: true });
  await dialog.getByText("选中的 1 条", { exact: true }).waitFor();
  const exportResult = await writeThroughUi(adminPage, "UAT Export Selected", (response) => new URL(response.url()).pathname.endsWith("/api/v1/crm/exports/marketing-leads"), () => dialog.getByRole("button", { name: "生成导出文件", exact: true }).click());
  await dialog.getByRole("link", { name: "下载 XLSX", exact: true }).waitFor();
  const downloadPromise = adminPage.waitForEvent("download");
  await dialog.getByRole("link", { name: "下载 XLSX", exact: true }).click();
  const download = await downloadPromise;
  const exportedFileName = download.suggestedFilename();
  const exportPath = resolve(out, `marketing-leads-selected-${runId}.xlsx`);
  await download.saveAs(exportPath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(exportPath);
  assert.equal(workbook.worksheets[0].actualRowCount, 2);
  assert.ok(JSON.stringify(workbook.worksheets[0].getSheetValues()).includes(names.marketing));
  await dialog.getByRole("button", { name: "完成", exact: true }).click();
  await adminPage.getByRole("button", { name: "导出", exact: true }).click();
  dialog = adminPage.getByRole("dialog", { name: "导出数据", exact: true });
  await dialog.getByRole("button", { name: "导出记录", exact: true }).click();
  await dialog.getByText(exportedFileName, { exact: false }).first().waitFor();
  await shot(adminPage, "export-history-1440");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  pass("UAT Export Selected + Download + XLSX", { exportJobId: exportResult.data.id, rowCount: 1, file: exportPath.slice(resolve(".").length + 1) });
  pass("UAT Export History");

  const beforeCleanupSql = [
    `SELECT 'ML', status, owner_user_id, converted_organization_id, converted_contact_id, converted_opportunity_id, deleted_at IS NOT NULL FROM marketing_leads WHERE id='${marketingId}';`,
    `SELECT 'OPP', status, sales_owner_user_id, source_marketing_lead_id, deleted_at IS NOT NULL FROM crm_leads WHERE id='${opportunityId}';`,
    `SELECT 'CONTACT', contact_type, organization_id, deleted_at IS NOT NULL FROM contacts WHERE id='${contactId}';`,
    `SELECT 'ORG', lifecycle_stage, deleted_at IS NOT NULL FROM organizations WHERE id='${organizationId}';`,
    `SELECT 'NOTIFY', COUNT(*), GROUP_CONCAT(status ORDER BY created_at) FROM assignment_notifications WHERE entity_type='MARKETING_LEAD' AND entity_id='${marketingId}' AND to_user_id='${safeId(sales.id, "salesId")}';`,
  ].join("\n");
  const beforeCleanup = databaseQuery(beforeCleanupSql).split(/\r?\n/);
  assert.ok(beforeCleanup.some((line) => line === `ML\tCONVERTED\t${sales.id}\t${organizationId}\t${contactId}\t${opportunityId}\t0`));
  assert.ok(beforeCleanup.some((line) => line.startsWith(`OPP\tNEW\t${sales.id}\t${marketingId}\t0`)));
  assert.ok(beforeCleanup.some((line) => line === `CONTACT\tBUSINESS\t${organizationId}\t0`));
  assert.ok(beforeCleanup.some((line) => line === "ORG\tOPPORTUNITY\t0"));
  const notificationLine = beforeCleanup.find((line) => line.startsWith("NOTIFY\t"));
  assert.ok(notificationLine && Number(notificationLine.split("\t")[1]) >= 1);
  databaseEvidence.push({ phase: "before-cleanup", rows: beforeCleanup, notificationTransport: notificationLine.split("\t")[2] || "UNKNOWN" });
  pass("UAT HTTP + DB + Reload verification");

  await deleteRow(adminPage, "leads", "商机", "搜索商机、公司", names.opportunity, opportunityId);
  await deleteRow(adminPage, "marketing-leads", "线索", "搜索姓名、公司、Email、Phone 或询盘", names.marketing, marketingId);
  await deleteRow(adminPage, "contacts", "联系人", "搜索联系人、公司、Email 或 Phone", names.marketing, contactId);
  await deleteRow(adminPage, "organizations", "公司", "搜索公司、简称或联系人", names.company, organizationId, "删除公司");

  const afterCleanup = databaseQuery([
    `SELECT 'ML', deleted_at IS NOT NULL FROM marketing_leads WHERE id='${marketingId}';`,
    `SELECT 'OPP', deleted_at IS NOT NULL FROM crm_leads WHERE id='${opportunityId}';`,
    `SELECT 'CONTACT', deleted_at IS NOT NULL FROM contacts WHERE id='${contactId}';`,
    `SELECT 'ORG', deleted_at IS NOT NULL FROM organizations WHERE id='${organizationId}';`,
  ].join("\n")).split(/\r?\n/);
  assert.deepEqual(afterCleanup, ["ML\t1", "OPP\t1", "CONTACT\t1", "ORG\t1"]);
  databaseEvidence.push({ phase: "after-cleanup", rows: afterCleanup });
  pass("UAT Cleanup via UI soft delete");

  assert.deepEqual(consoleEvents, []);
  assert.deepEqual(networkEvents, []);
  pass("UAT unexpected console/network errors = 0");

  const healthResponse = await adminContext.request.get(`${base}/api/ready`);
  assert.equal(healthResponse.status(), 200);
  const health = await healthResponse.json();
  assert.equal(health.database, "ok");
  const deployedCommit = execFileSync("ssh", ["-o", "BatchMode=yes", host, `cat ${remoteApp}/DEPLOYED_COMMIT`], { encoding: "utf8" }).trim();
  const exportBytes = await readFile(exportPath);
  const result = {
    verdict: "PASS",
    runId,
    completedAt: new Date().toISOString(),
    target: base,
    deployedCommit,
    checks,
    writes,
    databaseEvidence,
    screenshots,
    exportFile: { file: exportPath.slice(resolve(".").length + 1), bytes: exportBytes.length, sha256: createHash("sha256").update(exportBytes).digest("hex") },
    notificationDelivery: { mailbox: "NOT_TESTED", outboxStatuses: databaseEvidence[0].notificationTransport },
    cleanup: { policy: "UI soft delete", objectIds: { marketingId, opportunityId, contactId, organizationId } },
    health,
    consoleEvents,
    networkEvents,
    expectedNetwork,
    evidenceId: randomUUID(),
  };
  await writeFile(resolve(out, "results.json"), JSON.stringify(result, null, 2) + "\n");
  await writeFile(resolve(outRoot, "latest-results.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ verdict: result.verdict, runId, deployedCommit, checks: checks.length, writes: writes.length, consoleErrors: consoleEvents.length, networkErrors: networkEvents.length, cleanup: result.cleanup, notificationDelivery: result.notificationDelivery }, null, 2));
} finally {
  await adminContext.close();
  await salesContext.close();
  await browser.close();
}
