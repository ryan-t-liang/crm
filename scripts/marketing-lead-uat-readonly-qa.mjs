import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || "/Users/ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs"));
const base = "https://www.gridworks.cn/crm_kivisense";
const secretText = execFileSync("ssh", ["-o", "BatchMode=yes", "root@101.133.150.129", "cat /srv/kivisense-crm-uat/uat-credentials.env"], { encoding: "utf8" });
const secrets = Object.fromEntries(secretText.split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
  const at = line.indexOf("=");
  return [line.slice(0, at), line.slice(at + 1).replace(/^(['"])(.*)\1$/, "$2")];
}));
const out = resolve("docs/qa-evidence-marketing-lead/uat");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const checks = [];
const errors = [];
const network = [];
const expectedNetwork = [];
const deniedWrites = [];

try {
  for (const role of ["SUPER_ADMIN", "SALES", "VIEWER"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      if (!["GET", "HEAD"].includes(request.method()) && !request.url().endsWith("/auth/login")) {
        deniedWrites.push({ role, method: request.method(), url: request.url() });
        await route.abort();
      } else await route.continue();
    });
    page.on("pageerror", (error) => errors.push({ role, message: error.message }));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("status of 401")) errors.push({ role, message: message.text() });
    });
    page.on("response", (response) => {
      if (response.status() < 400) return;
      const item = { role, status: response.status(), url: response.url() };
      if (response.status() === 401 && response.url().endsWith("/api/v1/auth/me")) expectedNetwork.push(item);
      else network.push(item);
    });

    await page.goto(`${base}/#dashboard`);
    await page.getByRole("heading", { name: "登录", exact: true }).waitFor();
    await page.getByLabel("登录账号", { exact: true }).fill(secrets[`UAT_${role}_USERNAME`]);
    await page.getByLabel("密码", { exact: true }).fill(secrets[`UAT_${role}_PASSWORD`]);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.getByRole("heading", { name: "数据看板", exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "线索", exact: true }).count(), 1);
    assert.equal(await page.getByRole("link", { name: "商机", exact: true }).count(), 1);
    assert.equal(await page.getByRole("link", { name: "评分规则", exact: true }).count(), 1);
    const marketingAllowed = role !== "VIEWER";
    assert.equal(await page.getByRole("tab", { name: "营销漏斗", exact: true }).count(), marketingAllowed ? 1 : 0);
    if (marketingAllowed) {
      await page.getByRole("tab", { name: "营销漏斗", exact: true }).click();
      await page.getByText("未接入网站访客追踪", { exact: true }).waitFor();
    }
    await page.screenshot({ path: resolve(out, `${role.toLowerCase()}-dashboard.png`), fullPage: true });

    await page.getByRole("link", { name: "线索", exact: true }).click();
    await page.getByRole("table", { name: "线索目录", exact: true }).waitFor();
    const canCreate = role !== "VIEWER";
    assert.equal(await page.getByRole("button", { name: "新增线索", exact: true }).count(), canCreate ? 1 : 0);
    assert.equal(await page.getByRole("button", { name: "导入", exact: true }).count(), canCreate ? 1 : 0);
    assert.equal(await page.getByRole("button", { name: "导出", exact: true }).count(), canCreate ? 1 : 0);
    await page.screenshot({ path: resolve(out, `${role.toLowerCase()}-marketing-leads.png`), fullPage: true });

    await page.getByRole("link", { name: "商机", exact: true }).click();
    await page.getByRole("heading", { name: "商机", exact: true }).waitFor();
    assert.equal(await page.getByText("加载失败", { exact: true }).count(), 0);
    await page.screenshot({ path: resolve(out, `${role.toLowerCase()}-opportunities.png`), fullPage: true });

    await page.getByRole("link", { name: "评分规则", exact: true }).click();
    await page.getByRole("table", { name: "评分规则", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "新增规则", exact: true }).count(), role === "SUPER_ADMIN" ? 1 : 0);
    const scoring = await context.request.get(`${base}/api/v1/crm/marketing/scoring-rules`);
    assert.equal(scoring.status(), 200);
    assert.equal((await scoring.json()).data.length, 14);
    const analytics = await context.request.get(`${base}/api/v1/crm/marketing/analytics/funnel`);
    assert.equal(analytics.status(), marketingAllowed ? 200 : 403);
    await page.screenshot({ path: resolve(out, `${role.toLowerCase()}-scoring-rules.png`), fullPage: true });

    const widths = await page.evaluate(() => ({ body: document.body.scrollWidth, document: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(widths.body <= widths.viewport && widths.document <= widths.viewport);
    checks.push({ role, status: "PASS", marketingAnalytics: marketingAllowed, scoringRuleCount: 14, widths });
    await context.close();
  }

  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  assert.deepEqual(deniedWrites, []);
  await writeFile(resolve(out, "results.json"), JSON.stringify({ verdict: "PASS", checks, errors, network, expectedNetwork, deniedWrites }, null, 2));
  console.log(JSON.stringify({ verdict: "PASS", checks, errors, network, deniedWrites }, null, 2));
} finally {
  await browser.close();
}
