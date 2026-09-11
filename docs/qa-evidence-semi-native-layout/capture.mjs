import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
));

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:8766/";
if (!["127.0.0.1", "localhost"].includes(new URL(baseUrl).hostname)) {
  throw new Error("Layout verification is restricted to a local CRM preview.");
}

const outputDir = resolve(import.meta.dirname);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
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

const contactsResponse = await context.request.get(`${baseUrl}api/v1/crm/contacts?page=1&pageSize=20`);
if (!contactsResponse.ok()) throw new Error(`Contact fixture request failed: ${contactsResponse.status()}`);
const contact = (await contactsResponse.json()).data[0];
if (!contact?.id) throw new Error("No Contact fixture is available.");

const viewports = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 2048, height: 900 },
];
const captures = [];
let sequence = 1;

async function settle() {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(450);
}

async function measure(kind) {
  return page.evaluate((pageKind) => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return {
        left: Math.round(value.left),
        right: Math.round(value.right),
        width: Math.round(value.width),
      };
    };
    const recordBody = document.querySelector(".crm-record-layout-body");
    const recordStyle = recordBody ? getComputedStyle(recordBody) : null;
    const recordChildren = recordBody ? [...recordBody.children].map((child) => Math.round(child.getBoundingClientRect().width)) : [];
    const pageContainer = document.querySelector(".crm-page-container");
    const pageStyle = pageContainer ? getComputedStyle(pageContainer) : null;
    const breadcrumb = document.querySelector(".crm-site-breadcrumb");
    return {
      pageKind,
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      },
      semiShell: {
        layout: Boolean(document.querySelector(".crm-shell.semi-layout")),
        sider: Boolean(document.querySelector(".crm-app-sider.semi-layout-sider")),
        header: Boolean(document.querySelector(".crm-app-header.semi-layout-header")),
        content: Boolean(document.querySelector(".crm-app-content.semi-layout-content")),
        nav: Boolean(document.querySelector(".crm-navigation.semi-navigation")),
        breadcrumb: Boolean(breadcrumb),
      },
      shell: rect(".crm-shell"),
      sider: rect(".crm-app-sider"),
      topHeader: rect(".crm-site-header"),
      pageContainer: rect(".crm-page-container"),
      pagePaddingLeft: pageStyle ? Number.parseFloat(pageStyle.paddingLeft) : null,
      listLayout: rect(".crm-list-layout"),
      recordLayout: rect(".crm-record-layout"),
      recordBody: rect(".crm-record-layout-body"),
      recordColumns: recordChildren,
      recordGap: recordStyle ? Number.parseFloat(recordStyle.columnGap) : null,
      recordWorkspaceMinWidth: document.querySelector(".crm-record-layout-workspace")
        ? getComputedStyle(document.querySelector(".crm-record-layout-workspace")).minWidth
        : null,
      breadcrumbText: breadcrumb?.textContent?.replace(/\s+/g, " ").trim() || "",
      duplicateBackNavigation: Boolean(document.querySelector(".crm-detail-back-button, .crm-pattern-record-back")),
    };
  }, kind);
}

async function capture(kind, hash, viewport, ready) {
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}#${hash}`, { waitUntil: "domcontentloaded" });
  await ready();
  await settle();
  const filename = `${String(sequence).padStart(2, "0")}-${kind}-${viewport.width}x${viewport.height}.png`;
  sequence += 1;
  await page.screenshot({ path: resolve(outputDir, filename), fullPage: false, animations: "disabled" });
  captures.push({ kind, hash, filename, measurement: await measure(kind) });
}

for (const viewport of viewports) {
  await capture("contact-list", "contacts", viewport, async () => {
    await page.getByRole("heading", { name: "联系人", exact: true }).waitFor();
    await page.locator(".semi-table").first().waitFor();
  });
  await capture("contact-detail-overview", `contacts/${contact.id}`, viewport, async () => {
    await page.getByRole("heading", { name: contact.contactName, exact: true }).waitFor();
    await page.locator(".crm-record-layout").waitFor();
  });
}

const expectedFixtureFailures = httpFailures.filter(({ url, status }) =>
  status === 404 && /\/api\/v1\/crm\/(organizations|marketing-leads)\?/.test(url),
);
const unexpectedHttpFailures = httpFailures.filter((item) => !expectedFixtureFailures.includes(item));
const assertionFailures = [];
for (const captureResult of captures) {
  const { measurement } = captureResult;
  if (measurement.document.horizontalOverflow) assertionFailures.push(`${captureResult.filename}: document overflow`);
  if (!Object.values(measurement.semiShell).every(Boolean)) assertionFailures.push(`${captureResult.filename}: incomplete Semi shell`);
  if (captureResult.kind === "contact-detail-overview") {
    if ((measurement.recordLayout?.width || Infinity) > 1481) assertionFailures.push(`${captureResult.filename}: record exceeds 1480px`);
    if (measurement.duplicateBackNavigation) assertionFailures.push(`${captureResult.filename}: duplicate back navigation`);
    if (!measurement.breadcrumbText.includes(contact.contactName)) assertionFailures.push(`${captureResult.filename}: record breadcrumb missing`);
    if (measurement.recordWorkspaceMinWidth !== "0px") assertionFailures.push(`${captureResult.filename}: workspace min-width is not zero`);
    if (measurement.viewport.width > 1280) {
      if (Math.abs((measurement.recordColumns[0] || 0) - 288) > 2) assertionFailures.push(`${captureResult.filename}: contact rail is not 288px`);
      if (Math.abs((measurement.recordGap || 0) - 28) > 1) assertionFailures.push(`${captureResult.filename}: record gap is not 28px`);
    } else if (measurement.viewport.width === 1280) {
      if (Math.abs((measurement.recordColumns[0] || 0) - 280) > 2) assertionFailures.push(`${captureResult.filename}: contact rail is not 280px`);
      if (Math.abs((measurement.recordGap || 0) - 24) > 1) assertionFailures.push(`${captureResult.filename}: record gap is not 24px`);
    } else if (measurement.viewport.width <= 1100) {
      const [sidebarWidth, workspaceWidth] = measurement.recordColumns;
      if (Math.abs((sidebarWidth || 0) - (measurement.recordBody?.width || 0)) > 2 || Math.abs((workspaceWidth || 0) - (measurement.recordBody?.width || 0)) > 2) {
        assertionFailures.push(`${captureResult.filename}: record does not stack to one column`);
      }
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  browser: "Google Chrome via Playwright, headless",
  fixture: { id: contact.id, name: contact.contactName },
  captures,
  diagnostics: {
    consoleErrors,
    pageErrors,
    unexpectedHttpFailures,
    expectedFixtureFailures,
    assertionFailures,
  },
  verdict: consoleErrors.length || pageErrors.length || unexpectedHttpFailures.length || assertionFailures.length ? "FAIL" : "PASS",
};

await writeFile(resolve(outputDir, "runtime-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();

if (report.verdict !== "PASS") throw new Error(`Layout verification failed: ${JSON.stringify(report.diagnostics)}`);
console.log(`PASS: ${captures.length} Contact layout captures; no document overflow or runtime errors.`);
