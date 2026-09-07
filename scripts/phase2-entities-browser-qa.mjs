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
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({
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
  const login = await context.request.post(base + "/api/v1/auth/login", {
    data: {
      loginAccount: "admin@phase2.example.test",
      password: process.env.QA_PASSWORD,
    },
  });
  assert.equal(login.status(), 200);
  await page.goto(base + "/#contacts");
  await page.getByRole("table", { name: "联系人目录" }).waitFor();
  await page.evaluate(() => {
    window.phase2ShellMarker = "stable";
  });
  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await capture(`09-contact-list-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "新增联系人", exact: true }).click();
  await page.getByRole("combobox", { name: "公司", exact: true }).click();
  await page.getByPlaceholder("搜索公司…").fill("星河");
  await page.getByRole("option", { name: /星河科技/ }).click();
  await page
    .getByRole("textbox", { name: "客户联系人", exact: true })
    .fill(`UI验收联系人 ${run}`);
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill(`ui-${run}@example.test`);
  await page.getByRole("tab", { name: "CRM 状态", exact: true }).click();
  await page
    .getByRole("textbox", { name: "跟进注意", exact: true })
    .fill("先邮件联系，再安排演示。");
  await page.getByRole("tab", { name: "基本资料", exact: true }).click();
  assert.equal(
    await page
      .getByRole("textbox", { name: "客户联系人", exact: true })
      .inputValue(),
    `UI验收联系人 ${run}`,
  );
  await page.getByRole("button", { name: "保存联系人", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("link", { name: new RegExp(`UI验收联系人 ${run}`) })
    .click();
  await page
    .getByRole("heading", { name: `UI验收联系人 ${run}`, exact: true })
    .waitFor();
  await capture("10-contact-360");
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page
    .getByRole("textbox", { name: "职位", exact: true })
    .fill("技术负责人");
  await page.getByRole("button", { name: "保存联系人", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("技术负责人", { exact: true }).waitFor();
  const contactId = page.url().split("/").at(-1);
  checks.push({
    name: "contact-create-company-select-edit-tab-state",
    status: "PASS",
    contactId,
  });
  await page.getByRole("link", { name: "线索", exact: true }).click();
  await page.getByRole("table", { name: "线索目录" }).waitFor();
  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await capture(`11-lead-list-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "新增线索", exact: true }).click();
  await page
    .getByRole("combobox", {
      name: "联系人、公司、Email 或 Phone",
      exact: true,
    })
    .click();
  await page
    .getByPlaceholder("搜索联系人、公司、Email 或 Phone…")
    .fill(`ui-${run}`);
  await page
    .getByRole("option", { name: new RegExp(`UI验收联系人 ${run}`) })
    .click();
  await page
    .getByRole("textbox", { name: "项目需求简述", exact: true })
    .fill(`UI验收线索 ${run}`);
  await page.getByRole("tab", { name: "需求信息", exact: true }).click();
  await page
    .getByRole("textbox", { name: "需求整理 / 详细需求", exact: true })
    .fill("为展厅提供互动产品体验，需要支持移动端与大屏联动。");
  await page.getByLabel("需求附件", { exact: true }).setInputFiles({
    name: "requirement.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("QA requirement attachment: interactive showroom."),
  });
  await page.getByRole("tab", { name: "方案与报价", exact: true }).click();
  await page
    .getByRole("textbox", { name: "方案说明", exact: true })
    .fill("第一阶段：需求确认与交互原型。");
  await page.getByRole("tab", { name: "基础信息", exact: true }).click();
  assert.equal(
    await page
      .getByRole("textbox", { name: "项目需求简述", exact: true })
      .inputValue(),
    `UI验收线索 ${run}`,
  );
  await capture("12-lead-create-combobox");
  await page.getByRole("button", { name: "保存线索", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("link", { name: new RegExp(`UI验收线索 ${run}`) })
    .click();
  await page
    .getByRole("heading", { name: `UI验收线索 ${run}`, exact: true })
    .waitFor();
  await page.getByText("requirement.txt", { exact: true }).waitFor();
  const leadId = page.url().split("/").at(-1);
  await capture("13-lead-detail");
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("tab", { name: "团队协作", exact: true }).click();
  await page
    .getByRole("textbox", { name: "内部备注", exact: true })
    .fill("重点关注预算确认。");
  await capture("14-lead-edit");
  await page.getByRole("button", { name: "保存线索", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "记录跟进", exact: true }).click();
  await page
    .getByRole("textbox", { name: "互动内容", exact: true })
    .fill("客户已确认需求方向，待安排技术评审。");
  await page
    .getByRole("textbox", { name: "当前进展", exact: true })
    .fill("需求确认完成");
  await page
    .getByRole("textbox", { name: "下一步行动", exact: true })
    .fill("安排技术评审");
  await page.getByLabel("下次跟进", { exact: true }).fill("2026-09-15T10:00");
  await page.getByRole("button", { name: "保存互动", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("需求确认完成", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "跟进记录", exact: true }).click();
  await page
    .getByText("客户已确认需求方向，待安排技术评审。", { exact: true })
    .waitFor();
  await capture("15-lead-followup");
  const taskResponse = await context.request.get(
      base + `/api/v1/crm/tasks?leadId=${leadId}`,
    ),
    tasks = await taskResponse.json();
  assert.ok(
    tasks.data.some((t) => t.title === "安排技术评审" && t.status === "OPEN"),
  );
  checks.push({
    name: "lead-create-fuzzy-selector-attachment-edit-followup-task-loop",
    status: "PASS",
    leadId,
  });
  await page
    .getByRole("link", { name: `UI验收联系人 ${run}`, exact: true })
    .click();
  await page.getByRole("tab", { name: "客户旅程", exact: true }).click();
  await page.getByText(/客户已确认需求方向/).waitFor();
  await capture("16-contact-journey");
  assert.equal(await page.evaluate(() => window.phase2ShellMarker), "stable");
  checks.push({
    name: "no-app-shell-reload-across-contact-lead-routes",
    status: "PASS",
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  await writeFile(
    resolve(out, "phase2bc-browser-results.json"),
    JSON.stringify({ checks, errors, network }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, network }, null, 2));
} catch (error) {
  await page.screenshot({
    path: resolve(out, "phase2bc-failure.png"),
    fullPage: true,
  });
  await writeFile(
    resolve(out, "phase2bc-failure.json"),
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
