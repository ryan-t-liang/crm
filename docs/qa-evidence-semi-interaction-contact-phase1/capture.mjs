import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
));

const baseUrl = process.env.QA_BASE_URL;
const storageState = process.env.QA_STORAGE_STATE;
if (!baseUrl || !storageState) throw new Error("QA_BASE_URL and QA_STORAGE_STATE are required.");
if (!["127.0.0.1", "localhost"].includes(new URL(baseUrl).hostname)) {
  throw new Error("Contact visual verification is restricted to a local preview.");
}
await stat(storageState);

const outputDir = resolve(process.env.QA_OUTPUT_DIR || import.meta.dirname);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  storageState,
  locale: "zh-CN",
  colorScheme: "light",
  deviceScaleFactor: 1,
  serviceWorkers: "block",
});
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const httpFailures = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push({ url: page.url(), text: message.text() });
});
page.on("pageerror", (error) => pageErrors.push({ url: page.url(), text: error.message }));
page.on("response", (response) => {
  if (response.status() >= 400) httpFailures.push({ status: response.status(), url: response.url() });
});

const apiResponse = await context.request.get(`${baseUrl}api/v1/crm/contacts?page=1&pageSize=20`);
if (!apiResponse.ok()) throw new Error(`Contact fixture request failed: ${apiResponse.status()}`);
const contacts = (await apiResponse.json()).data;
const contact = contacts.find((item) => item.contactName === "Semi QA Contact") || contacts[0];
if (!contact?.id) throw new Error("No Contact fixture is available.");

const captures = [];
let sequence = 1;
async function settle() {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(350);
}

async function measure() {
  return page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    documentWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    sideSheetVisible: Boolean(document.querySelector(".semi-sidesheet")),
  }));
}

async function capture(key, viewport, ready) {
  await page.setViewportSize(viewport);
  await ready();
  await settle();
  const filename = `${String(sequence).padStart(2, "0")}-${key}-${viewport.width}x${viewport.height}.png`;
  sequence += 1;
  await page.screenshot({ path: resolve(outputDir, filename), fullPage: false });
  captures.push({ key, filename, ...(await measure()) });
}

async function openList() {
  await page.goto(`${baseUrl}#contacts`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "联系人", exact: true }).waitFor();
  await page.locator(".semi-table").first().waitFor();
}

async function openDetail() {
  await page.goto(`${baseUrl}#contacts/${contact.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: contact.contactName, exact: true }).waitFor();
}

const desktop = { width: 1440, height: 900 };
await capture("contact-list", desktop, openList);
await capture("contact-detail-overview", desktop, openDetail);

for (const [key, name] of [
  ["contact-detail-opportunities", /关联商机/],
  ["contact-detail-journey", "客户旅程"],
  ["contact-detail-notes", "备注与附件"],
  ["contact-detail-audit", "操作记录"],
]) {
  const tab = page.getByRole("tab", { name });
  if (await tab.count()) {
    await tab.click();
    await capture(key, desktop, async () => tab.waitFor());
  }
}

await capture("contact-create", desktop, async () => {
  await openList();
  await page.locator("button").filter({ hasText: "新增联系人" }).first().click();
  await page.getByRole("heading", { name: "新增联系人", exact: true }).waitFor();
});
await page.getByRole("button", { name: "关闭" }).click().catch(async () => {
  await page.keyboard.press("Escape");
});

await capture("contact-edit", desktop, async () => {
  await openDetail();
  await page.locator("button").filter({ hasText: "编辑" }).first().click();
  await page.getByRole("heading", { name: "编辑联系人", exact: true }).waitFor();
});
await page.keyboard.press("Escape");

const compact = { width: 1280, height: 800 };
await capture("contact-list", compact, openList);
await capture("contact-detail-overview", compact, openDetail);
await capture("contact-create", compact, async () => {
  await openList();
  await page.locator("button").filter({ hasText: "新增联系人" }).first().click();
  await page.getByRole("heading", { name: "新增联系人", exact: true }).waitFor();
});
await page.keyboard.press("Escape");
await capture("contact-edit", compact, async () => {
  await openDetail();
  await page.locator("button").filter({ hasText: "编辑" }).first().click();
  await page.getByRole("heading", { name: "编辑联系人", exact: true }).waitFor();
});

await page.keyboard.press("Escape");
const narrow = { width: 1024, height: 768 };
await capture("contact-list", narrow, openList);
await capture("contact-detail-overview", narrow, openDetail);

const audit = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  contact: { id: contact.id, name: contact.contactName },
  captures,
  consoleErrors,
  pageErrors,
  httpFailures,
  build: {
    indexBytes: (await readFile(resolve(import.meta.dirname, "../../frontend/react-build/index.html"))).byteLength,
  },
};
await writeFile(resolve(outputDir, "runtime-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
await browser.close();

const failures = captures.filter((item) => item.horizontalOverflow);
if (consoleErrors.length || pageErrors.length || httpFailures.length || failures.length) {
  throw new Error(`Visual verification found issues: ${JSON.stringify({ consoleErrors, pageErrors, httpFailures, failures })}`);
}
console.log(`Captured ${captures.length} Contact states with no document overflow or runtime errors.`);
