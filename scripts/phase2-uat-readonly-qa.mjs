import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || "/Users/ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs"));
const base = "https://www.gridworks.cn/crm_kivisense";
// Credentials stay in memory. Never print the env file or save browser storage state.
const secretText = execFileSync("ssh", ["-o", "BatchMode=yes", "root@101.133.150.129", "cat /srv/kivisense-crm-uat/uat-credentials.env"], { encoding: "utf8" });
const secrets = Object.fromEntries(secretText.split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const at = l.indexOf("="); return [l.slice(0, at), l.slice(at + 1).replace(/^(['"])(.*)\1$/, "$2")]; }));
const out = resolve("docs/qa-evidence-shadcn-phase2/uat"); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const checks = [], errors = [], network = [], expected = [], deniedWrites = [];
try {
  for (const role of ["SUPER_ADMIN", "SALES", "VIEWER"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
    await context.route("**/api/**", async route => {
      const req = route.request();
      if (!["GET", "HEAD"].includes(req.method()) && !req.url().endsWith("/auth/login")) {
        deniedWrites.push({ method: req.method(), url: req.url() }); await route.abort();
      } else await route.continue();
    });
    page.on("pageerror", e => errors.push({ role, message: e.message }));
    page.on("console", m => { if (m.type() === "error" && !m.text().includes("status of 401")) errors.push({ role, message: m.text() }); });
    page.on("response", r => {
      if (r.status() >= 400) {
        const item = { role, status: r.status(), url: r.url() };
        if (r.status() === 401 && r.url().endsWith("/auth/me")) expected.push(item); else network.push(item);
      }
    });
    await page.goto(base + "/#dashboard");
    await page.getByRole("heading", { name: "登录", exact: true }).waitFor();
    await page.getByLabel("登录账号", { exact: true }).fill(secrets[`UAT_${role}_USERNAME`]);
    await page.getByLabel("密码", { exact: true }).fill(secrets[`UAT_${role}_PASSWORD`]);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
    await page.evaluate(() => { document.querySelector('[data-slot="sidebar-wrapper"]').dataset.qaShell = "persistent"; });
    for (const [route, name] of [["dashboard", "Dashboard"], ["organizations", "公司"], ["contacts", "客户联系人"], ["leads", "线索"], ["operations", "客户运营"], ["workbench", "我的工作台"], ["suppliers", "供应商"], ...(role === "SUPER_ADMIN" ? [["accounts", "账户管理"], ["roles", "角色与权限"], ["audit", "审计日志"]] : [])]) {
      await page.getByRole("link", { name, exact: true }).click();
      await page.waitForTimeout(850);
      assert.ok(page.url().endsWith("#" + route), page.url());
      assert.equal(await page.locator('[data-slot="sidebar-wrapper"]').getAttribute("data-qa-shell"), "persistent");
      assert.equal(await page.getByText("加载失败", { exact: true }).count(), 0);
      if (role === "VIEWER") assert.equal(await page.getByRole("button", { name: /^(新建公司|新增联系人|新增线索|创建任务|新增互动|导入|导出|开始孵化|保存)/ }).count(), 0);
      await page.screenshot({ path: resolve(out, `${role.toLowerCase()}-${route}.png`), fullPage: true });
      const widths = await page.evaluate(() => ({ body: document.body.scrollWidth, document: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(widths.body <= widths.viewport && widths.document <= widths.viewport);
      checks.push({ role, route, status: "PASS", widths });
    }
    if (role === "SUPER_ADMIN") {
      for (const family of ["organizations", "contacts", "leads"]) {
        const result = await context.request.get(base + `/api/v1/crm/${family}?pageSize=1`);
        assert.equal(result.status(), 200); const row = (await result.json()).data[0];
        if (!row) { checks.push({ role, route: family + "/detail", status: "NOT_RUN", reason: "No existing UAT record" }); continue; }
        await page.evaluate(r => { location.hash = r; }, `${family}/${row.id}`);
        await page.waitForTimeout(900);
        assert.equal(await page.getByText("加载失败", { exact: true }).count(), 0);
        await page.reload(); await page.waitForTimeout(900);
        assert.ok(!page.url().includes("/legacy"));
        await page.screenshot({ path: resolve(out, `${family}-detail.png`), fullPage: true });
        checks.push({ role, route: family + "/detail-and-refresh", status: "PASS" });
      }
    }
    await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(network, []); assert.deepEqual(deniedWrites, []);
  await writeFile(resolve(out, "results.json"), JSON.stringify({ checks, errors, network, expectedUnauthenticated: expected, deniedWrites }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, errors, network, deniedWrites }));
} finally { await browser.close(); }
