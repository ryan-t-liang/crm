import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
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
for (const role of ["SUPER_ADMIN", "SALES", "VIEWER"]) {
  for (const suffix of ["USERNAME", "PASSWORD"]) {
    assert.ok(secrets[`UAT_${role}_${suffix}`], `Missing protected UAT credential for ${role}`);
  }
}

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || "/Users/ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs"));
const out = resolve("artifacts/uat-v4/readonly");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
const consoleErrors = [];
const networkErrors = [];
const deniedWrites = [];
const screenshots = [];

async function settle(page) {
  await page.locator("[data-slot='skeleton'], .animate-pulse").first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(async () => { await document.fonts?.ready; });
  await page.waitForTimeout(250);
}

async function go(page, route, heading, table) {
  await page.evaluate((hash) => { window.location.hash = hash; }, route);
  await page.getByRole("heading", { name: heading, exact: true }).first().waitFor();
  if (table) await page.getByRole("table", { name: table, exact: true }).waitFor();
  await settle(page);
}

async function shot(page, role, name) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth }));
  assert.ok(dimensions.body <= dimensions.viewport + 1 && dimensions.document <= dimensions.viewport + 1, `${role} ${name} overflows horizontally`);
  const file = resolve(out, `${role.toLowerCase()}-${name}.png`);
  const bytes = await page.screenshot({ path: file, fullPage: true });
  screenshots.push({ role, name, file: file.slice(resolve(".").length + 1), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), dimensions });
}

try {
  for (const role of ["SUPER_ADMIN", "SALES", "VIEWER"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      if (!["GET", "HEAD"].includes(request.method()) && !request.url().endsWith("/auth/login")) {
        deniedWrites.push({ role, method: request.method(), url: request.url() });
        await route.abort();
      } else {
        await route.continue();
      }
    });

    await page.goto(`${base}/#dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("登录账号", { exact: true }).fill(secrets[`UAT_${role}_USERNAME`]);
    await page.getByLabel("密码", { exact: true }).fill(secrets[`UAT_${role}_PASSWORD`]);
    const loginResponse = page.waitForResponse((response) => response.url().endsWith("/api/v1/auth/login") && response.request().method() === "POST");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    assert.equal((await loginResponse).status(), 200);
    await page.getByRole("heading", { name: "数据看板", exact: true }).waitFor();
    const sessionResponse = await context.request.get(`${base}/api/v1/auth/me`);
    assert.equal(sessionResponse.status(), 200);
    const session = (await sessionResponse.json()).data;
    const permissions = new Set(session.permissions);

    page.on("pageerror", (error) => consoleErrors.push({ role, type: "pageerror", message: error.message }));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push({ role, type: "console", message: message.text() }); });
    page.on("response", (response) => {
      if (response.status() >= 400) networkErrors.push({ role, status: response.status(), method: response.request().method(), url: response.url() });
    });

    await settle(page);
    assert.equal(await page.getByRole("link", { name: "客户运营", exact: true }).count(), 0);
    assert.equal(await page.getByRole("link", { name: "线索", exact: true }).count(), 1);
    assert.equal(await page.getByRole("link", { name: "商机", exact: true }).count(), 1);
    const management = permissions.has("crm.dashboard.management.view");
    const marketing = permissions.has("crm.marketing.analytics.view");
    const expectedTabs = ["管理概览", ...(marketing ? ["营销与转化"] : []), "商机推进", ...(management ? ["团队表现"] : [])];
    assert.deepEqual(await page.getByRole("tab").allTextContents(), expectedTabs);
    if (marketing) {
      await page.getByRole("tab", { name: "营销与转化", exact: true }).click();
      await page.getByText("网站访客追踪尚未接入", { exact: true }).waitFor();
    }
    await shot(page, role, "dashboard");

    const lists = [
      { route: "organizations", heading: "公司", table: "公司目录", create: "新增公司", permission: "crm.organization" },
      { route: "contacts", heading: "联系人", table: "联系人目录", create: "新增联系人", permission: "crm.contact" },
      { route: "marketing-leads", heading: "线索", table: "线索目录", create: "新增线索", permission: "crm.marketing_lead" },
      { route: "leads", heading: "商机", table: "商机目录", create: "新增商机", permission: "crm.lead" },
      { route: "suppliers", heading: "供应商", table: "供应商目录", create: "新增供应商", permission: "crm.organization" },
    ];
    const controls = [];
    for (const list of lists) {
      await go(page, list.route, list.heading, list.table);
      const canCreate = permissions.has(`${list.permission}.create`);
      const canImport = permissions.has(`${list.permission}.import`);
      const canExport = permissions.has(`${list.permission}.export`);
      assert.equal(await page.getByRole("button", { name: list.create, exact: true }).count(), canCreate ? 1 : 0);
      assert.equal(await page.getByRole("button", { name: "导入", exact: true }).count(), canImport ? 1 : 0);
      assert.equal(await page.getByRole("button", { name: "导出", exact: true }).count(), canExport ? 1 : 0);
      assert.equal(await page.getByRole("button", { name: "开始孵化", exact: true }).count(), 0);
      controls.push({ object: list.heading, canCreate, canImport, canExport });
      if (["marketing-leads", "leads"].includes(list.route)) await shot(page, role, list.route);
    }

    if (role === "VIEWER") {
      assert.equal(controls.some((item) => item.canCreate || item.canImport || item.canExport), false);
      assert.equal(await page.getByRole("button", { name: /新增|删除|编辑|批量分配/ }).count(), 0);
    }
    results.push({ role, status: "PASS", dashboardTabs: expectedTabs, listControls: controls });
    process.stdout.write(`PASS UAT read-only/RBAC ${role}\n`);
    await context.close();
  }

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(networkErrors, []);
  assert.deepEqual(deniedWrites, []);
  const deployedCommit = execFileSync("ssh", ["-o", "BatchMode=yes", host, `cat ${remoteApp}/DEPLOYED_COMMIT`], { encoding: "utf8" }).trim();
  const report = { verdict: "PASS", completedAt: new Date().toISOString(), target: base, deployedCommit, results, screenshots, consoleErrors, networkErrors, deniedWrites };
  await writeFile(resolve(out, "results.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ verdict: report.verdict, deployedCommit, roles: results.length, screenshots: screenshots.length, consoleErrors: 0, networkErrors: 0, deniedWrites: 0 }, null, 2));
} finally {
  await browser.close();
}
