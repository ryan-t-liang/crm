import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ||
      "/Users/ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
  ),
);

const base = process.env.QA_BASE_URL || "http://127.0.0.1:3300";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) {
  throw new Error("This script is intentionally restricted to local QA.");
}
if (!process.env.QA_PASSWORD) throw new Error("QA_PASSWORD is required.");

const out = resolve("docs/qa-evidence-marketing-lead/local");
await mkdir(out, { recursive: true });
const run = Date.now();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const checks = [];
const errors = [];
const network = [];
const expectedNetwork = [];

page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("status of 401")) errors.push(message.text());
});
page.on("response", (response) => {
  if (response.status() < 400) return;
  const item = { status: response.status(), url: response.url() };
  if (response.status() === 401 && response.url().endsWith("/api/v1/auth/me")) expectedNetwork.push(item);
  else network.push(item);
});

async function capture(name) {
  await page.waitForTimeout(220);
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true });
  const widths = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  assert.ok(widths.body <= widths.viewport && widths.document <= widths.viewport, `${name} has horizontal overflow`);
  checks.push({ name, status: "PASS", url: page.url(), widths });
}

async function request(method, path, data) {
  const response = await context.request.fetch(`${base}${path}`, { method, ...(data === undefined ? {} : { data }) });
  const body = await response.json().catch(() => ({}));
  assert.ok(response.ok(), `${method} ${path} failed with ${response.status()}: ${JSON.stringify(body)}`);
  return body;
}

async function openHash(hash) {
  await page.goto(`${base}/?qa=${run}#${hash}`);
  await page.locator("main").first().waitFor();
  await page.waitForTimeout(180);
}

async function createLifecycleFixture(suffix, acceptSql) {
  const created = await request("POST", "/api/v1/crm/marketing-leads", {
    fullName: `Naderi ${suffix} ${run}`,
    email: `naderi-${suffix.toLowerCase()}-${run}@example.test`,
    companyName: "Dena Lifecycle Review",
    title: "Manager",
    countryCode: "IR",
    source: "WEBSITE",
    sourceChannel: "ORGANIC_SEARCH",
    sourceDetail: "Google/Bing",
    inquiryType: "Not sure yet",
    inquiryContent: "Lifecycle browser review fixture.",
    status: "NURTURING",
    ownerUserId: me.id,
    fitScore: 40,
    fitReason: "Browser lifecycle review",
  });
  for (const ruleCode of ["REQUEST_SOLUTION", "EXPLICIT_REQUIREMENT", "MEETING_COMPLETED", "EXPLICIT_INTEREST"]) {
    await request("POST", `/api/v1/crm/marketing-leads/${created.data.id}/activities`, { ruleCode, source: "CRM", note: `${suffix} browser evidence` });
  }
  if (acceptSql) await request("POST", `/api/v1/crm/marketing-leads/${created.data.id}/transition`, { action: "ACCEPT_SQL" });
  return created.data.id;
}

async function createQualifiedNaderiFixture() {
  const created = await request("POST", "/api/v1/crm/marketing-leads", {
    fullName: "Naderi",
    email: "naderi@denaholding.com",
    phone: "+98 21 5555 0188",
    whatsapp: "+98 912 555 0188",
    companyName: "Dena",
    companyWebsite: "https://denaholding.com",
    title: "Manager",
    countryCode: "IR",
    source: "WEBSITE",
    sourceChannel: "ORGANIC_SEARCH",
    sourceDetail: "Google/Bing",
    inquiryType: "Not sure yet",
    inquiryContent: "We interest to add AR app and service on our products.\nCan we use as a OEM? With our brand?\nBecause we have limitation in our country and server should be inside of country.",
    productInterest: "AR app and OEM service",
    requirementTags: ["OEM", "On-premise"],
    status: "NURTURING",
    ownerUserId: me.id,
    fitScore: 40,
    fitReason: "International OEM prospect",
  });
  for (const ruleCode of ["REQUEST_SOLUTION", "EXPLICIT_REQUIREMENT", "MEETING_COMPLETED", "EXPLICIT_INTEREST"]) {
    await request("POST", `/api/v1/crm/marketing-leads/${created.data.id}/activities`, { ruleCode, source: "CRM", note: "Naderi browser evidence" });
  }
  await request("POST", `/api/v1/crm/marketing-leads/${created.data.id}/transition`, { action: "ACCEPT_SQL" });
  await request("POST", `/api/v1/crm/marketing-leads/${created.data.id}/transition`, { action: "QUALIFY" });
  return (await request("GET", `/api/v1/crm/marketing-leads/${created.data.id}`)).data;
}

let me;
try {
  await page.goto(`${base}/#dashboard`);
  await page.getByRole("heading", { name: "登录", exact: true }).waitFor();
  await page.getByRole("textbox", { name: "登录账号", exact: true }).fill("admin@kivisense.com");
  await page.getByLabel("密码", { exact: true }).fill(process.env.QA_PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("heading", { name: "数据看板", exact: true }).waitFor();
  const mePayload = await request("GET", "/api/v1/auth/me");
  me = mePayload.data.user || mePayload.data;

  const leadList = await request("GET", "/api/v1/crm/marketing-leads?page=1&pageSize=100&keyword=Naderi");
  let target = leadList.data.find((row) => row.email === "naderi@denaholding.com" && row.status === "QUALIFIED");
  if (!target) target = await createQualifiedNaderiFixture();
  assert.equal(target.status, "QUALIFIED", "Naderi fixture must be Qualified before conversion review");

  const mqlId = await createLifecycleFixture("MQL", false);
  const sqlId = await createLifecycleFixture("SQL", true);

  await openHash("dashboard");
  await page.getByRole("heading", { name: "数据看板", exact: true }).waitFor();
  await capture("01-dashboard-management-overview-1440");
  await page.getByRole("tab", { name: "营销漏斗", exact: true }).click();
  await page.getByText("未接入网站访客追踪", { exact: true }).waitFor();
  await capture("02-dashboard-marketing-funnel-1440");
  await page.getByRole("tab", { name: "孵化与评分", exact: true }).click();
  await page.getByText("Top Scoring Signals", { exact: true }).waitFor();
  await capture("03-dashboard-nurture-scoring-1440");

  await openHash("marketing-leads");
  await page.getByRole("table", { name: "线索目录", exact: true }).waitFor();
  await capture("04-marketing-lead-list-1440");
  await openHash(`marketing-leads/${target.id}`);
  await page.getByRole("heading", { name: "Naderi", exact: true }).waitFor();
  await page.getByText("已确认机会", { exact: true }).first().waitFor();
  await capture("05-marketing-lead-detail-qualified-1440");
  await page.getByRole("button", { name: "记录行为", exact: true }).click();
  await page.getByRole("dialog", { name: "记录行为", exact: true }).waitFor();
  await capture("06-activity-entry-dialog-1440");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("tab", { name: "评分", exact: true }).click();
  await page.getByRole("heading", { name: "Score Breakdown", exact: true }).waitFor();
  await capture("07-score-breakdown-1440");

  await openHash(`marketing-leads/${mqlId}`);
  await page.getByText("营销合格", { exact: true }).first().waitFor();
  await capture("08-marketing-lead-mql-1440");
  await openHash(`marketing-leads/${sqlId}`);
  await page.getByText("销售合格", { exact: true }).first().waitFor();
  await capture("09-marketing-lead-sql-1440");

  await openHash(`marketing-leads/${target.id}`);
  await page.getByRole("button", { name: "转商机", exact: true }).click();
  const conversion = page.getByRole("dialog", { name: "线索转商机", exact: true });
  await conversion.waitFor();
  await page.getByText(/DOMAIN_EXACT/).first().waitFor();
  await page.getByText(/EMAIL_EXACT/).first().waitFor();
  await capture("10-convert-dialog-1440");
  await conversion.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: /使用已有公司 · Dena · DOMAIN_EXACT/ }).waitFor();
  await capture("11-existing-company-match-1440");
  await page.keyboard.press("Escape");
  await conversion.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: /使用已有联系人 · Naderi · EMAIL_EXACT/ }).waitFor();
  await capture("12-existing-contact-match-1440");
  await page.keyboard.press("Escape");
  await conversion.getByRole("textbox", { name: "商机名称 / 需求简述", exact: true }).fill("Dena AR OEM opportunity");
  await conversion.getByRole("textbox", { name: "转换备注", exact: true }).fill("Browser-reviewed exact organization and contact matches.");
  await conversion.getByRole("button", { name: "确认转商机", exact: true }).click();
  await conversion.waitFor({ state: "hidden" });
  await page.getByText("已转商机", { exact: true }).first().waitFor();
  await capture("13-converted-marketing-lead-1440");

  const converted = await request("GET", `/api/v1/crm/marketing-leads/${target.id}`);
  const opportunityId = converted.data.convertedOpportunityId;
  const organizationId = converted.data.convertedOrganizationId;
  assert.ok(opportunityId && organizationId && converted.data.convertedContactId);

  await openHash("leads");
  await page.getByRole("heading", { name: "商机", exact: true }).waitFor();
  await capture("14-opportunity-list-1440");
  await openHash(`leads/${opportunityId}`);
  await page.getByRole("heading", { name: "Dena AR OEM opportunity", exact: true }).waitFor();
  await page.getByRole("heading", { name: "来源线索", exact: true }).waitFor();
  await capture("15-opportunity-source-block-1440");

  await openHash(`organizations/${organizationId}`);
  await page.getByRole("heading", { name: /Dena/, exact: false }).first().waitFor();
  await page.getByRole("tab", { name: "客户旅程", exact: true }).click();
  await page.getByText(/Marketing Lead Converted|线索已转商机/).first().waitFor();
  await capture("16-company-journey-1440");

  await openHash("scoring-rules");
  await page.getByRole("table", { name: "评分规则", exact: true }).waitFor();
  await capture("17-scoring-rules-1440");

  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await openHash("dashboard");
    await capture(`18-dashboard-management-overview-${width}`);
    await openHash("marketing-leads");
    await page.getByRole("table", { name: "线索目录", exact: true }).waitFor();
    await capture(`19-marketing-lead-list-${width}`);
    await openHash("leads");
    await page.getByRole("heading", { name: "商机", exact: true }).waitFor();
    await capture(`20-opportunity-list-${width}`);
  }

  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  await writeFile(resolve(out, "results.json"), JSON.stringify({
    verdict: "PASS",
    checks,
    errors,
    network,
    expectedNetwork,
    fixture: { marketingLeadId: target.id, mqlId, sqlId, opportunityId, organizationId },
  }, null, 2));
  console.log(JSON.stringify({ verdict: "PASS", checks: checks.length, errors, network, fixture: { marketingLeadId: target.id, mqlId, sqlId, opportunityId, organizationId } }, null, 2));
} catch (error) {
  await page.screenshot({ path: resolve(out, "failure.png"), fullPage: true }).catch(() => undefined);
  await writeFile(resolve(out, "failure.json"), JSON.stringify({ verdict: "FAIL", message: error.message, stack: error.stack, errors, network, url: page.url() }, null, 2));
  throw error;
} finally {
  await browser.close();
}
