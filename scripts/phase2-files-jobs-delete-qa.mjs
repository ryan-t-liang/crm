import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(
    new URL("../backend/package.json", import.meta.url),
  ),
  ExcelJS = require("exceljs");
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
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("response", (r) => {
  if (r.status() >= 400) network.push({ status: r.status(), url: r.url() });
});
async function capture(name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(out, name + ".png"), fullPage: true });
  checks.push({ name, status: "PASS", url: page.url() });
}
async function xlsx(rows) {
  const wb = new ExcelJS.Workbook(),
    sheet = wb.addWorksheet("Import"),
    headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(headers.map((k) => r[k] ?? "")));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
async function download(link) {
  const promised = page.waitForEvent("download");
  await link.click();
  const file = await promised,
    stream = await file.createReadStream(),
    chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function importRows(kind, rows) {
  await page.evaluate((r) => {
    location.hash = r;
  }, kind);
  await page.getByRole("button", { name: "导入", exact: true }).click();
  const template = await download(
    page.getByRole("link", { name: "下载标准模板", exact: true }),
  );
  assert.ok(template.length > 1000);
  await page.getByLabel("XLSX 文件", { exact: true }).setInputFiles({
    name: `${kind}-${run}.xlsx`,
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await xlsx(rows),
  });
  await page.getByRole("button", { name: "开始预检", exact: true }).click();
  await page.getByRole("button", { name: "确认导入", exact: true }).waitFor();
  await capture(`30-${kind}-import-preview`);
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await page.getByText(/成功 1 条/).waitFor();
  await capture(`31-${kind}-import-result`);
  await page.getByRole("button", { name: "完成", exact: true }).click();
  checks.push({ name: `${kind}-template-preflight-execute`, status: "PASS" });
}
async function exportRows(kind, needle) {
  await page.evaluate((r) => {
    location.hash = r;
  }, kind);
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("button", { name: "生成导出文件", exact: true }).click();
  await page.getByRole("link", { name: "下载 XLSX", exact: true }).waitFor();
  const bytes = await download(
    page.getByRole("link", { name: "下载 XLSX", exact: true }),
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  assert.ok(JSON.stringify(wb.worksheets[0].getSheetValues()).includes(needle));
  await page.getByRole("button", { name: "完成", exact: true }).click();
  checks.push({ name: `${kind}-export-download-content`, status: "PASS" });
}
async function deleteRow(kind, name) {
  await page.evaluate((r) => {
    location.hash = r;
  }, kind);
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: new RegExp(name) }) });
  await row.getByRole("button", { name: /更多操作/ }).click();
  await page
    .getByRole("menuitem", {
      name: kind === "organizations" ? "删除公司" : "删除",
      exact: true,
    })
    .click();
  await page.getByRole("alertdialog").waitFor();
  assert.ok((await page.getByRole("alertdialog").innerText()).includes(name));
  await capture(`34-${kind}-delete-confirm`);
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await page.getByRole("alertdialog").waitFor({ state: "hidden" });
  await row.waitFor({ state: "hidden" });
  checks.push({ name: `${kind}-row-soft-delete`, status: "PASS" });
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
  const me = (
    await (await context.request.get(base + "/api/v1/auth/me")).json()
  ).data;
  await importRows("organizations", [
    {
      name: `导入公司 ${run}`,
      roles: "PROSPECT",
      owner: me.id,
      fitScore: "80",
      fitReason: "UI验收",
    },
  ]);
  const organizations = (
      await (
        await context.request.get(
          base + `/api/v1/crm/organizations?keyword=${run}`,
        )
      ).json()
    ).data,
    organization = organizations.find((o) => o.name === `导入公司 ${run}`);
  assert.ok(organization);
  await importRows("contacts", [
    {
      contactName: `导入联系人 ${run}`,
      organizationName: organization.name,
      email: `import-${run}@example.test`,
      stage: "INITIAL",
      owner: me.id,
    },
  ]);
  const contacts = (
      await (
        await context.request.get(
          base + `/api/v1/crm/contacts?keyword=import-${run}`,
        )
      ).json()
    ).data,
    contact = contacts[0];
  assert.equal(contact.organizationId, organization.id);
  await importRows("leads", [
    {
      contactId: contact.id,
      requirementSummary: `导入线索 ${run}`,
      salesOwner: me.id,
      status: "NEW",
      priority: "HIGH",
    },
  ]);
  const leads = (
      await (
        await context.request.get(base + `/api/v1/crm/leads?keyword=${run}`)
      ).json()
    ).data,
    lead = leads.find((l) => l.requirementSummary === `导入线索 ${run}`);
  assert.ok(lead);
  for (const [kind, needle] of [
    ["organizations", organization.name],
    ["contacts", contact.contactName],
    ["leads", lead.requirementSummary],
  ])
    await exportRows(kind, needle);
  await page.evaluate((id) => {
    location.hash = `leads/${id}`;
  }, lead.id);
  await page
    .getByRole("heading", { name: lead.requirementSummary, exact: true })
    .waitFor();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l8sAAAAASUVORK5CYII=",
    "base64",
  );
  const video = Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ddd";
      ctx.fillRect(0, 0, 32, 32);
      const stream = canvas.captureStream(5),
        recorder = new MediaRecorder(stream, { mimeType: "video/webm" }),
        chunks = [];
      const done = new Promise((resolve) => {
        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = resolve;
      });
      recorder.start();
      await new Promise((r) => setTimeout(r, 300));
      recorder.stop();
      await done;
      stream.getTracks().forEach((t) => t.stop());
      return Array.from(
        new Uint8Array(
          await new Blob(chunks, { type: "video/webm" }).arrayBuffer(),
        ),
      );
    }),
  );
  const files = [
    {
      field: "上传需求附件",
      name: "需求.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("要求支持多终端交互"),
    },
    {
      field: "上传图片参考",
      name: "参考.png",
      mimeType: "image/png",
      buffer: png,
    },
    {
      field: "上传正式方案",
      name: "演示.webm",
      mimeType: "video/webm",
      buffer: video,
    },
  ];
  for (const file of files) {
    await page.getByLabel(file.field, { exact: true }).setInputFiles({
      name: file.name,
      mimeType: file.mimeType,
      buffer: file.buffer,
    });
    await page.getByRole("link", { name: file.name, exact: true }).waitFor();
    const bytes = await download(
      page.getByRole("link", { name: `下载${file.name}`, exact: true }),
    );
    assert.deepEqual(bytes, file.buffer);
  }
  await capture("32-contextual-attachments");
  checks.push({
    name: "document-image-real-webm-upload-download-byte-parity",
    status: "PASS",
  });
  await page.getByRole("button", { name: "移除参考.png", exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await page.getByRole("alertdialog").waitFor({ state: "hidden" });
  await page
    .getByRole("link", { name: "参考.png", exact: true })
    .waitFor({ state: "hidden" });
  checks.push({ name: "attachment-delete", status: "PASS" });
  await deleteRow("leads", lead.requirementSummary);
  await deleteRow("contacts", contact.contactName);
  await deleteRow("organizations", organization.name);
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  await writeFile(
    resolve(out, "phase2-files-jobs-delete-results.json"),
    JSON.stringify({ checks, errors, network }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, network }, null, 2));
} catch (error) {
  await page.screenshot({
    path: resolve(out, "phase2-extra-failure.png"),
    fullPage: true,
  });
  await writeFile(
    resolve(out, "phase2-extra-failure.json"),
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
