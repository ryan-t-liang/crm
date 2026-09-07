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
  throw new Error("This mutation suite is restricted to local QA.");
const out = resolve("docs/qa-evidence-shadcn-phase2");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const run = Date.now();
const errors = [],
  network = [],
  checks = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("response", (r) => {
  if (r.status() >= 400) network.push({ status: r.status(), url: r.url() });
});
async function capture(name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(out, name + ".png"), fullPage: true });
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    viewport: innerWidth,
  }));
  assert.ok(
    widths.document <= widths.viewport && widths.body <= widths.viewport,
    JSON.stringify(widths),
  );
  checks.push({ name, status: "PASS", widths, url: page.url() });
}
try {
  const login = await context.request.post(base + "/api/v1/auth/login", {
    data: {
      loginAccount: "admin@phase2.example.test",
      password: process.env.QA_PASSWORD,
    },
  });
  assert.equal(login.status(), 200);
  await page.goto(base + "/#dashboard");
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await page.getByText("团队执行", { exact: false }).first().waitFor();
  await page.waitForTimeout(1200);
  await capture("01-dashboard-1440");
  await page.getByRole("link", { name: "公司", exact: true }).click();
  await page.getByRole("table", { name: "公司目录", exact: true }).waitFor();
  await page
    .getByRole("link", { name: /星河科技/ })
    .first()
    .waitFor();
  await capture("02-company-list-1440");
  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await capture(`02-company-list-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "更多筛选", exact: false }).click();
  await page.getByRole("combobox", { name: "Fit", exact: true }).click();
  await page.getByRole("option", { name: "高 Fit", exact: true }).click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("link", { name: /星河科技/ })
    .first()
    .waitFor();
  await capture("03-company-filter-high-fit");
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  await page
    .getByRole("link", { name: /星河科技/ })
    .first()
    .click();
  await page.getByRole("heading", { name: /星河科技/ }).waitFor();
  await page
    .getByRole("heading", { name: "Fit & Engagement", exact: true })
    .waitFor();
  await capture("04-company-360-overview");
  await page.getByRole("tab", { name: "客户旅程", exact: true }).click();
  await page
    .getByText("已完成业务与技术方案评审，客户希望下周确认实施范围。")
    .waitFor();
  await capture("05-company-journey");
  await page.getByRole("tab", { name: "任务", exact: true }).click();
  await capture("06-company-tasks");
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  await page
    .getByRole("textbox", { name: "任务标题" })
    .fill("确认技术演示时间");
  await capture("07-company-task-dialog");
  await page.getByRole("button", { name: "保存任务", exact: true }).click();
  await page.getByText("确认技术演示时间", { exact: true }).first().waitFor();
  checks.push({ name: "create-task-persisted", status: "PASS" });
  await page.getByRole("button", { name: "新增联系人", exact: true }).click();
  await page
    .getByRole("textbox", { name: "客户联系人", exact: true })
    .fill(`公司页验收联系人 ${run}`);
  await page.getByRole("tab", { name: "CRM 状态", exact: true }).click();
  await page.getByRole("tab", { name: "基本资料", exact: true }).click();
  assert.equal(
    await page
      .getByRole("textbox", { name: "客户联系人", exact: true })
      .inputValue(),
    `公司页验收联系人 ${run}`,
  );
  await capture("08-company-contact-form");
  await page.getByRole("button", { name: "保存联系人", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("tab", { name: /^联系人/ }).click();
  await page
    .getByRole("link", { name: new RegExp(`公司页验收联系人 ${run}`) })
    .waitFor();
  checks.push({ name: "company-contact-create-and-tab-state", status: "PASS" });
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  await writeFile(
    resolve(out, "phase2a-browser-results.json"),
    JSON.stringify({ checks, errors, network }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, network }, null, 2));
} catch (error) {
  await page.screenshot({ path: resolve(out, "failure.png"), fullPage: true });
  await writeFile(
    resolve(out, "failure.json"),
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
