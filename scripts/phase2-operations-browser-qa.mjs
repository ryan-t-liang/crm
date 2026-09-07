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
  throw new Error("Local QA only.");
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
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("response", (r) => {
  if (r.status() >= 400) network.push({ status: r.status(), url: r.url() });
});
async function capture(name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(out, name + ".png"), fullPage: true });
  const widths = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  assert.ok(
    widths.body <= widths.viewport && widths.document <= widths.viewport,
  );
  checks.push({ name, status: "PASS", widths, url: page.url() });
}
try {
  assert.equal(
    (
      await context.request.post(base + "/api/v1/auth/login", {
        data: {
          loginAccount: "admin@phase2.example.test",
          password: process.env.QA_PASSWORD,
        },
      })
    ).status(),
    200,
  );
  const me = (
    await (await context.request.get(base + "/api/v1/auth/me")).json()
  ).data;
  const fixture = await context.request.post(
    base + "/api/v1/crm/organizations",
    {
      data: {
        name: `唤醒验收 ${run}`,
        roles: ["PROSPECT"],
        fitScore: 86,
        fitReason: "自动化验收隔离样本",
        ownerUserId: me.id,
      },
    },
  );
  assert.equal(fixture.status(), 201);
  const organizationId = (await fixture.json()).data.id;
  assert.equal(
    (
      await context.request.post(base + "/api/v1/crm/contacts", {
        data: {
          contactName: `唤醒联系人 ${run}`,
          organizationId,
          ownerUserId: me.id,
        },
      })
    ).status(),
    201,
  );
  await page.goto(base + "/#operations");
  await page.getByRole("table", { name: "客户运营队列" }).waitFor();
  await capture("17-customer-operations");
  await page.getByRole("tab", { name: "待唤醒", exact: true }).click();
  await page
    .getByRole("link", { name: `唤醒验收 ${run}`, exact: true })
    .waitFor();
  await capture("18-reactivation");
  const row = page
    .getByRole("row")
    .filter({
      has: page.getByRole("link", { name: `唤醒验收 ${run}`, exact: true }),
    });
  await row.getByRole("button", { name: /更多操作/ }).click();
  await page.getByRole("menuitem", { name: "创建任务", exact: true }).click();
  await page
    .getByRole("textbox", { name: "任务标题", exact: true })
    .fill(`唤醒需求确认 ${run}`);
  await page.getByRole("button", { name: "保存任务", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await row.getByRole("button", { name: /更多操作/ }).click();
  await page
    .getByRole("menuitem", { name: "开始 / 管理孵化", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "孵化原因", exact: true })
    .fill("业务匹配，等待新的预算窗口");
  await page
    .getByRole("textbox", { name: "孵化目标", exact: true })
    .fill(`重新确认客户需求 ${run}`);
  await page
    .getByRole("textbox", { name: "触达主题", exact: true })
    .fill("分享新的交互案例");
  await capture("19-nurture");
  await page.getByRole("button", { name: "保存孵化计划", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("tab", { name: "孵化池", exact: true }).click();
  await page.getByText(`重新确认客户需求 ${run}`, { exact: true }).waitFor();
  await capture("20-nurture-pool");
  await page.getByRole("tab", { name: "沉睡客户", exact: true }).click();
  await page.getByRole("table", { name: "客户运营队列" }).waitFor();
  checks.push({ name: "operations-four-pools-task-nurture", status: "PASS" });
  await page.getByRole("link", { name: "我的工作台", exact: true }).click();
  await page.getByRole("heading", { name: "任务队列", exact: true }).waitFor();
  await page.getByText(`唤醒需求确认 ${run}`, { exact: true }).waitFor();
  await capture("21-workbench");
  const task = page
    .getByRole("listitem")
    .filter({ has: page.getByText(`唤醒需求确认 ${run}`, { exact: true }) });
  await task.getByRole("button", { name: "推迟一天", exact: true }).click();
  await page.waitForTimeout(300);
  await task.getByRole("button", { name: "跟进", exact: true }).click();
  await page.getByRole("combobox", { name: "联系人", exact: true }).click();
  await page.getByRole("option").first().click();
  await page
    .getByRole("textbox", { name: "互动内容", exact: true })
    .fill(`工作台唤醒跟进 ${run}`);
  await page
    .getByRole("textbox", { name: "下一步行动", exact: true })
    .fill(`确认下一预算 ${run}`);
  await page.getByLabel("下次跟进", { exact: true }).fill("2026-09-20T10:00");
  await page.getByRole("button", { name: "保存互动", exact: true }).click();
  await page
    .getByRole("dialog", { name: "新增互动", exact: true })
    .waitFor({ state: "hidden" });
  await page.getByText(`确认下一预算 ${run}`, { exact: true }).waitFor();
  assert.equal(
    await page.getByText(`唤醒需求确认 ${run}`, { exact: true }).count(),
    0,
  );
  const next = page
    .getByRole("listitem")
    .filter({ has: page.getByText(`确认下一预算 ${run}`, { exact: true }) });
  await next.getByRole("button", { name: "完成", exact: true }).click();
  await page
    .getByText(`确认下一预算 ${run}`, { exact: true })
    .waitFor({ state: "hidden" });
  checks.push({
    name: "workbench-postpone-followup-completes-current-and-creates-next-complete",
    status: "PASS",
  });
  await page.getByRole("link", { name: "供应商", exact: true }).click();
  await page.getByRole("table", { name: "供应商目录", exact: true }).waitFor();
  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await capture(`22-suppliers-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: /景深数字制作/ }).click();
  await page.getByRole("heading", { name: /景深数字制作/ }).waitFor();
  checks.push({ name: "supplier-shares-company-detail", status: "PASS" });
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  await writeFile(
    resolve(out, "phase2d-browser-results.json"),
    JSON.stringify({ checks, errors, network }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, network }, null, 2));
} catch (error) {
  await page.screenshot({
    path: resolve(out, "phase2d-failure.png"),
    fullPage: true,
  });
  await writeFile(
    resolve(out, "phase2d-failure.json"),
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
