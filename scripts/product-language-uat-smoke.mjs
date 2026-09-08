import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const base = process.env.CRM_UAT_URL || "https://www.gridworks.cn/crm_kivisense";
const host = process.env.CRM_UAT_HOST || "root@101.133.150.129";
const remoteApp = "/srv/kivisense-crm-uat";
const isLocal = ["127.0.0.1", "localhost"].includes(new URL(base).hostname);
const out = resolve(process.env.CRM_REVIEW_OUTPUT || "artifacts/product-language-audit");
const screenshotDir = resolve(out, "screenshots");
await mkdir(screenshotDir, { recursive: true });

const secrets = isLocal
  ? { UAT_SUPER_ADMIN_USERNAME: process.env.CRM_REVIEW_ACCOUNT, UAT_SUPER_ADMIN_PASSWORD: process.env.CRM_REVIEW_PASSWORD }
  : Object.fromEntries(execFileSync("ssh", ["-o", "BatchMode=yes", host, `cat ${remoteApp}/uat-credentials.env`], { encoding: "utf8" }).split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1).replace(/^(['"])(.*)\1$/, "$2")];
    }));
assert.ok(secrets.UAT_SUPER_ADMIN_USERNAME && secrets.UAT_SUPER_ADMIN_PASSWORD, "Protected UAT review account is unavailable");

const playwrightPath = process.env.PLAYWRIGHT_MODULE || "/Users/ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
const { chromium } = await import(pathToFileURL(playwrightPath));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const consoleErrors = [];
const networkErrors = [];
const deniedWrites = [];
const pages = [];
const screenshots = [];
let authenticated = false;

page.on("pageerror", (error) => consoleErrors.push({ type: "pageerror", message: error.message }));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  if (!authenticated && /status of 401 \(Unauthorized\)/.test(message.text())) return;
  consoleErrors.push({ type: "console", message: message.text() });
});
page.on("response", (response) => {
  if (response.status() < 400) return;
  const pathname = new URL(response.url()).pathname;
  if (!authenticated && response.status() === 401 && pathname.endsWith("/api/v1/auth/me")) return;
  networkErrors.push({ status: response.status(), method: response.request().method(), url: response.url() });
});
await context.route("**/api/**", async (route) => {
  const request = route.request();
  if (!authenticated && request.url().endsWith("/auth/login")) return route.continue();
  if (!["GET", "HEAD"].includes(request.method())) {
    deniedWrites.push({ method: request.method(), url: request.url() });
    return route.abort();
  }
  return route.continue();
});

async function settle() {
  await page.locator("[data-slot='skeleton'], .animate-pulse").first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(async () => { await document.fonts?.ready; });
  await page.waitForTimeout(250);
}

async function shot(name) {
  await settle();
  const dimensions = await page.evaluate(() => ({ viewport: [innerWidth, innerHeight], bodyWidth: document.body.scrollWidth, documentWidth: document.documentElement.scrollWidth }));
  assert.ok(dimensions.bodyWidth <= 1441 && dimensions.documentWidth <= 1441, `${name} has document-level horizontal overflow`);
  const file = resolve(screenshotDir, `${String(screenshots.length + 1).padStart(2, "0")}-${name}.png`);
  const bytes = await page.screenshot({ path: file, fullPage: false });
  screenshots.push({ name, file: file.slice(resolve(".").length + 1), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), dimensions });
}

const forbiddenProductCopy = /Contact 360|\bPhone\b|Fit Score|Fit Reason|\bManual\b|ORGANIC_SEARCH|CREATE_ORGANIZATION|销售机会 Pipeline|Win Rate|\b(?:LOW|MEDIUM|HIGH|TARGET|NURTURING|QUALIFIED)\b/;
async function openRoute(route, heading, tableName, screenshotName) {
  await page.evaluate((hash) => { window.location.hash = hash; }, route);
  await page.getByRole("heading", { name: heading, exact: true }).first().waitFor({ state: "visible" });
  if (tableName) await page.getByRole("table", { name: tableName, exact: true }).waitFor({ state: "visible" });
  await settle();
  const body = await page.locator("body").innerText();
  const forbidden = body.match(forbiddenProductCopy)?.[0];
  assert.equal(forbidden, undefined, `${route} exposes forbidden product copy: ${forbidden}`);
  assert.ok(body.trim().length > 80, `${route} appears blank`);
  pages.push({ route, heading, status: "OPEN" });
  await shot(screenshotName);
}

try {
  await page.goto(`${base}/#dashboard`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("登录账号", { exact: true }).fill(secrets.UAT_SUPER_ADMIN_USERNAME);
  await page.getByLabel("密码", { exact: true }).fill(secrets.UAT_SUPER_ADMIN_PASSWORD);
  const loginResponse = page.waitForResponse((response) => response.url().endsWith("/api/v1/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  assert.equal((await loginResponse).status(), 200);
  authenticated = true;

  await openRoute("dashboard", "数据看板", null, "dashboard-1440");
  await openRoute("organizations", "公司", "公司目录", "company-list-1440");
  await openRoute("contacts", "联系人", "联系人目录", "contact-list-1440");
  await openRoute("marketing-leads", "线索", "线索目录", "marketing-lead-list-1440");
  await openRoute("leads", "商机", "商机目录", "opportunity-list-1440");
  await openRoute("workbench", "我的工作台", null, "workbench-1440");
  await openRoute("suppliers", "供应商", "供应商目录", "supplier-list-1440");

  await page.evaluate(() => { window.location.hash = "marketing-leads"; });
  await page.getByRole("button", { name: "新增线索", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新增线索" });
  await dialog.waitFor({ state: "visible" });
  assert.equal(await dialog.getByText(/初始状态|Fit Score|Fit 理由|ORGANIC_SEARCH|Manual/).count(), 0);
  await dialog.getByRole("tab", { name: "营销资格", exact: true }).click();
  await dialog.getByText("来源渠道", { exact: true }).locator("..").getByRole("combobox").click();
  await page.getByRole("option", { name: "自然搜索", exact: true }).waitFor({ state: "visible" });
  assert.equal(await page.getByRole("option", { name: "ORGANIC_SEARCH", exact: true }).count(), 0);
  await shot("marketing-lead-create-channels-1440");

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(networkErrors, []);
  assert.deepEqual(deniedWrites, []);
  const deployedCommit = isLocal
    ? "LOCAL_WORKTREE"
    : execFileSync("ssh", ["-o", "BatchMode=yes", host, `cat ${remoteApp}/DEPLOYED_COMMIT`], { encoding: "utf8" }).trim();
  const result = {
    verdict: "PASS",
    completedAt: new Date().toISOString(),
    target: base,
    deployedCommit,
    viewport: "1440x900",
    pages,
    changedInteraction: "Marketing Lead create presentation only; no business write was submitted",
    screenshots,
    consoleErrors,
    networkErrors,
    deniedWrites,
  };
  await writeFile(resolve(out, "uat-smoke-results.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ verdict: result.verdict, deployedCommit, pages: pages.length, screenshots: screenshots.length, consoleErrors: 0, networkErrors: 0, businessWrites: 0 }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
