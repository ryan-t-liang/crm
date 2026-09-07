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
const browser = await chromium.launch({ channel: "chrome", headless: true }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
const checks = [],
  errors = [],
  network = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("response", (r) => {
  if (r.status() >= 400) network.push({ status: r.status(), url: r.url() });
});
async function capture(name) {
  await page.waitForTimeout(300);
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    viewport: innerWidth,
  }));
  assert.ok(
    widths.document <= widths.viewport && widths.body <= widths.viewport,
    JSON.stringify(widths),
  );
  await page.screenshot({ path: resolve(out, name + ".png"), fullPage: true });
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
  await page.goto(base + "/#organizations");
  await page.getByRole("button", { name: "新建公司", exact: true }).click();
  await page.getByRole("tab", { name: "客户关系", exact: true }).click();
  await page.getByRole("button", { name: "保存公司", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "公司名称" }).waitFor();
  assert.equal(
    await page
      .getByRole("tab", { name: "公司资料", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.getByLabel("公司名称", { exact: true }).fill(`手工公司 ${run}`);
  await page.getByLabel("公司简称", { exact: true }).fill("手工验收");
  await page.getByRole("tab", { name: "客户关系", exact: true }).click();
  await page.getByLabel("Fit Score（0–100）", { exact: true }).fill("76");
  await page.getByRole("tab", { name: "备注与文件", exact: true }).click();
  await page
    .getByLabel("备注", { exact: true })
    .fill("从公司表单创建；分区切换保留输入。");
  await page
    .getByLabel("公司 Logo", { exact: true })
    .setInputFiles({
      name: "company-logo.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await capture("35-company-form-notes-logo");
  await page.getByRole("tab", { name: "公司资料", exact: true }).click();
  assert.equal(
    await page.getByLabel("公司名称", { exact: true }).inputValue(),
    `手工公司 ${run}`,
  );
  await page.getByRole("button", { name: "保存公司", exact: true }).click();
  await page
    .getByRole("dialog", { name: "新建公司", exact: true })
    .waitFor({ state: "hidden" });
  await page
    .getByRole("heading", { name: `手工公司 ${run}`, exact: true })
    .waitFor();
  const companyId = page.url().split("/").pop();
  const detail = (
    await (
      await context.request.get(base + "/api/v1/crm/organizations/" + companyId)
    ).json()
  ).data;
  assert.equal(detail.fitScore, 76);
  assert.ok(detail.logo);
  await page.getByRole("button", { name: `手工公司 ${run}的更多操作`, exact: true }).click();
  await page.getByRole("menuitem", { name: "编辑公司", exact: true }).click();
  await page.getByLabel("公司简称", { exact: true }).fill("手工验收已编辑");
  await page.getByRole("button", { name: "保存公司", exact: true }).click();
  await page
    .getByRole("dialog", { name: "编辑公司", exact: true })
    .waitFor({ state: "hidden" });
  await page.getByRole("tab", { name: "文件", exact: true }).click();
  await page
    .getByLabel("上传附件", { exact: true })
    .setInputFiles({
      name: "company-brief.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Company brief for Phase 2 QA"),
    });
  await page
    .getByRole("link", { name: "company-brief.txt", exact: true })
    .waitFor();
  await capture("36-company-files");
  checks.push({
    name: "company-create-edit-validation-tab-state-logo-files",
    status: "PASS",
  });
  const contact = (
    await (
      await context.request.get(base + "/api/v1/crm/contacts?pageSize=1")
    ).json()
  ).data[0];
  const lead = (
    await (
      await context.request.get(base + "/api/v1/crm/leads?pageSize=1")
    ).json()
  ).data[0];
  for (const route of [
    "dashboard",
    `organizations/${companyId}`,
    `contacts/${contact.id}`,
    `leads/${lead.id}`,
    "operations",
    "workbench",
    "accounts",
    "roles",
    "audit",
  ]) {
    await page.evaluate((r) => {
      location.hash = r;
    }, route);
    await page.waitForTimeout(600);
    for (const width of [1440, 1280, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      await capture(`37-${route.split("/")[0]}-${width}`);
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  await writeFile(
    resolve(out, "phase2-responsive-company-results.json"),
    JSON.stringify({ checks, errors, network }, null, 2),
  );
  console.log(JSON.stringify({ checks: checks.length, errors, network }));
} catch (e) {
  await page.screenshot({
    path: resolve(out, "responsive-company-failure.png"),
    fullPage: true,
  });
  await writeFile(
    resolve(out, "responsive-company-failure.json"),
    JSON.stringify(
      {
        message: e.message,
        errors,
        network,
        text: await page.locator("body").innerText(),
      },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser.close();
}
