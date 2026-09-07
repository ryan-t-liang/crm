import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ||
      "/Users/ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
  )
);
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3310";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Local QA only");
const out = resolve("docs/qa-evidence-shadcn-phase2"),
  run = Date.now();
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
const errors = [],
  network = [],
  expected = [],
  checks = [];
function monitor(p) {
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("status of 401"))
      errors.push(m.text());
  });
  p.on("response", (r) => {
    if (r.status() >= 400) {
      const info = { status: r.status(), url: r.url() };
      if (r.status() === 401 && r.url().endsWith("/api/v1/auth/me"))
        expected.push(info);
      else network.push(info);
    }
  });
}
monitor(page);
async function capture(name, p = page) {
  await p.waitForTimeout(250);
  await p.screenshot({ path: resolve(out, name + ".png"), fullPage: true });
  const widths = await p.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  assert.ok(
    widths.body <= widths.viewport && widths.document <= widths.viewport,
  );
  checks.push({ name, status: "PASS", widths, url: p.url() });
}
async function login(p, account, password) {
  await p.goto(base + "/#dashboard");
  await p.getByRole("heading", { name: "登录", exact: true }).waitFor();
  await p.getByRole("textbox", { name: "登录账号", exact: true }).fill(account);
  await p.getByLabel("密码", { exact: true }).fill(password);
  await p.getByRole("button", { name: "登录", exact: true }).click();
}
try {
  await page.goto(base + "/#dashboard");
  await page.getByRole("heading", { name: "登录", exact: true }).waitFor();
  await capture("23-login");
  await page
    .getByRole("textbox", { name: "登录账号", exact: true })
    .fill("admin@phase2.example.test");
  await page.getByLabel("密码", { exact: true }).fill(process.env.QA_PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  assert.ok(!page.url().includes("/legacy"));
  await page.getByRole("link", { name: "账户管理", exact: true }).click();
  await page.getByRole("table", { name: "账户目录" }).waitFor();
  await capture("24-accounts");
  await page.getByRole("button", { name: "新增账号", exact: true }).click();
  await page
    .getByRole("textbox", { name: "姓名", exact: true })
    .fill(`系统验收 ${run}`);
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill(`system-${run}@example.test`);
  await page.getByRole("combobox", { name: "角色", exact: true }).click();
  await page.getByRole("option", { name: "只读用户", exact: true }).click();
  await page.getByRole("button", { name: "保存账号", exact: true }).click();
  await page
    .getByRole("dialog", { name: "新增账号", exact: true })
    .waitFor({ state: "hidden" });
  await page.getByText(`系统验收 ${run}`, { exact: true }).waitFor();
  const userRow = page
    .getByRole("row")
    .filter({ has: page.getByText(`系统验收 ${run}`, { exact: true }) });
  await userRow.getByRole("button", { name: /更多操作/ }).click();
  await page.getByRole("menuitem", { name: "编辑账号", exact: true }).click();
  await page
    .getByRole("textbox", { name: "姓名", exact: true })
    .fill(`系统验收已编辑 ${run}`);
  await page.getByRole("button", { name: "保存账号", exact: true }).click();
  await page
    .getByRole("dialog", { name: "编辑账号", exact: true })
    .waitFor({ state: "hidden" });
  const updatedRow = page
    .getByRole("row")
    .filter({ has: page.getByText(`系统验收已编辑 ${run}`, { exact: true }) });
  for (const action of ["禁用账号", "启用账号", "重置密码"]) {
    await updatedRow.getByRole("button", { name: /更多操作/ }).click();
    await page.getByRole("menuitem", { name: action, exact: true }).click();
    await page.getByRole("button", { name: "确认", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await updatedRow.waitFor();
  }
  checks.push({
    name: "account-create-edit-disable-enable-reset",
    status: "PASS",
  });
  await page.getByRole("link", { name: "角色与权限", exact: true }).click();
  await page.getByRole("table", { name: "角色目录" }).waitFor();
  await capture("25-roles");
  const salesRow = page
    .getByRole("row")
    .filter({ has: page.getByText("销售人员", { exact: true }) });
  await salesRow.getByRole("button", { name: "配置权限", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "查看客户联系人", exact: true })
    .waitFor();
  await capture("26-role-permissions");
  await page.getByRole("button", { name: "保存权限", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  checks.push({
    name: "role-permission-read-save-current-policy-no-business-change",
    status: "PASS",
  });
  await page.getByRole("link", { name: "审计日志", exact: true }).click();
  await page.getByRole("table", { name: "审计目录" }).waitFor();
  await capture("27-audit");
  await page
    .getByRole("button", { name: "查看记录", exact: true })
    .first()
    .click();
  await page
    .getByRole("heading", { name: "操作记录详情", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  checks.push({ name: "audit-list-detail", status: "PASS" });
  const forcedContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    forced = await forcedContext.newPage();
  monitor(forced);
  await login(
    forced,
    `system-${run}@example.test`,
    process.env.QA_INITIAL_PASSWORD,
  );
  await forced
    .getByRole("heading", { name: "首次登录 · 修改密码", exact: true })
    .waitFor();
  await capture("28-force-password", forced);
  await forced
    .getByLabel("当前密码", { exact: true })
    .fill(process.env.QA_INITIAL_PASSWORD);
  await forced
    .getByLabel("新密码", { exact: true })
    .fill(`BrowserChanged-${run}!`);
  await forced
    .getByLabel("确认新密码", { exact: true })
    .fill(`BrowserChanged-${run}!`);
  await forced.getByRole("button", { name: "更新密码", exact: true }).click();
  await forced
    .getByRole("heading", { name: "Dashboard", exact: true })
    .waitFor();
  await forcedContext.close();
  checks.push({
    name: "first-login-password-change-stays-react",
    status: "PASS",
  });
  for (const role of ["sales", "viewer"]) {
    const c = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      p = await c.newPage();
    monitor(p);
    await login(p, `${role}@phase2.example.test`, process.env.QA_PASSWORD);
    await p.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
    for (const route of [
      "organizations",
      "contacts",
      "leads",
      "operations",
      "workbench",
      "suppliers",
    ]) {
      await p.evaluate((r) => {
        location.hash = r;
      }, route);
      await p.locator('[data-slot="sidebar-inset"] main').first().waitFor();
      await p.waitForTimeout(250);
      if (role === "viewer") {
        assert.equal(
          await p
            .getByRole("button", {
              name: /^(新增|新建|创建|编辑|删除|保存|开始孵化|记录跟进|推迟一天|完成$)/,
            })
            .count(),
          0,
        );
      }
      assert.ok(!p.url().includes("/legacy"));
    }
    await capture(`29-${role}-permission-surface`, p);
    assert.equal(
      await p.getByRole("link", { name: "账户管理", exact: true }).count(),
      0,
    );
    checks.push({ name: `${role}-navigation-rbac`, status: "PASS" });
    await c.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  await writeFile(
    resolve(out, "phase2e-browser-results.json"),
    JSON.stringify(
      { checks, errors, network, expectedUnauthorizedOnLogin: expected },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { checks, errors, network, expectedUnauthorizedOnLogin: expected },
      null,
      2,
    ),
  );
} catch (error) {
  await page.screenshot({
    path: resolve(out, "phase2e-failure.png"),
    fullPage: true,
  });
  await writeFile(
    resolve(out, "phase2e-failure.json"),
    JSON.stringify(
      {
        message: error.message,
        errors,
        network,
        url: page.url(),
        text: await page.locator("body").innerText(),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
