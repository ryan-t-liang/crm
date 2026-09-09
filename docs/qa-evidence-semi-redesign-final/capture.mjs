import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ||
      "/Users/ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
  ),
);

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
if (!["127.0.0.1", "localhost"].includes(new URL(baseUrl).hostname)) {
  throw new Error("This visual audit is restricted to the local CRM server.");
}

const repositoryRoot = resolve(import.meta.dirname, "../../");
const evidenceDir = resolve(process.env.QA_EVIDENCE_DIR || import.meta.dirname);
await mkdir(evidenceDir, { recursive: true });
const storageStateInput = process.env.QA_STORAGE_STATE?.trim();
if (!storageStateInput) {
  throw new Error(
    "QA_STORAGE_STATE is required and must point to a readable Playwright storage-state JSON file.",
  );
}
const storageStatePath = resolve(repositoryRoot, storageStateInput);
try {
  await stat(storageStatePath);
} catch {
  throw new Error(`QA_STORAGE_STATE does not point to a readable file: ${storageStatePath}`);
}
const buildFiles = [
  resolve(repositoryRoot, "frontend/react-build/assets/app.js"),
  resolve(repositoryRoot, "frontend/react-build/assets/app.css"),
];
const noCacheHeaders = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
};

async function fingerprint(path) {
  const [content, metadata] = await Promise.all([readFile(path), stat(path)]);
  return {
    path: path.replace(`${repositoryRoot}/`, ""),
    bytes: metadata.size,
    modifiedAt: metadata.mtime.toISOString(),
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  storageState: storageStatePath,
  locale: "zh-CN",
  colorScheme: "light",
  deviceScaleFactor: 1,
  serviceWorkers: "block",
  extraHTTPHeaders: noCacheHeaders,
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
await cdp.send("Network.setBypassServiceWorker", { bypass: true });

const consoleErrors = [];
const consoleWarnings = [];
const pageErrors = [];
const httpFailures = [];
const requestFailures = [];

page.on("console", (message) => {
  const item = {
    type: message.type(),
    text: message.text(),
    url: page.url(),
  };
  if (message.type() === "error") consoleErrors.push(item);
  if (message.type() === "warning") consoleWarnings.push(item);
});
page.on("pageerror", (error) => {
  pageErrors.push({ message: error.message, stack: error.stack, url: page.url() });
});
page.on("response", (response) => {
  if (response.status() >= 400) {
    httpFailures.push({
      method: response.request().method(),
      status: response.status(),
      url: response.url(),
      pageUrl: page.url(),
    });
  }
});
page.on("requestfailed", (request) => {
  requestFailures.push({
    method: request.method(),
    url: request.url(),
    error: request.failure()?.errorText || "Unknown request failure",
    pageUrl: page.url(),
  });
});

async function api(path) {
  const response = await context.request.get(`${baseUrl}${path}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok()) {
    throw new Error(`GET ${path} failed with ${response.status()}: ${JSON.stringify(body)}`);
  }
  return body;
}

const [organizations, contacts, marketingLeads, opportunities, session] = await Promise.all([
  api("/api/v1/crm/organizations?page=1&pageSize=20"),
  api("/api/v1/crm/contacts?page=1&pageSize=100"),
  api("/api/v1/crm/marketing-leads?page=1&pageSize=20"),
  api("/api/v1/crm/leads?page=1&pageSize=20"),
  api("/api/v1/auth/me"),
]);

const organization = organizations.data.find((item) => item.name === "Semi Migration QA Organization") || organizations.data[0];
const contact = contacts.data.find((item) => item.contactName === "Semi QA Contact") || contacts.data[0];
const marketingLead = marketingLeads.data.find((item) => item.fullName === "Semi QA Marketing Lead") || marketingLeads.data[0];
const opportunity = opportunities.data.find((item) => item.requirementSummary === "Semi Design enterprise CRM rollout") || opportunities.data[0];

for (const [kind, record] of Object.entries({ organization, contact, marketingLead, opportunity })) {
  if (!record?.id) throw new Error(`No ${kind} fixture is available for detail capture.`);
}

const routeDefinitions = [
  {
    key: "dashboard",
    label: "数据看板",
    hash: "dashboard",
    ready: () => page.getByRole("heading", { name: "数据看板", exact: true }).waitFor(),
  },
  {
    key: "workbench",
    label: "我的工作台",
    hash: "workbench",
    ready: () => page.getByRole("heading", { name: "我的工作台", exact: true }).waitFor(),
  },
  {
    key: "organizations-list",
    label: "组织列表",
    hash: "organizations",
    ready: () => page.locator(".semi-table").first().waitFor(),
  },
  {
    key: "organization-detail",
    label: "组织详情",
    hash: `organizations/${organization.id}`,
    ready: () => page.getByRole("heading", { name: organization.name, exact: true }).waitFor(),
  },
  {
    key: "contacts-list",
    label: "联系人列表",
    hash: "contacts",
    ready: () => page.locator(".semi-table").first().waitFor(),
  },
  {
    key: "contact-detail",
    label: "联系人详情",
    hash: `contacts/${contact.id}`,
    ready: () => page.getByRole("heading", { name: contact.contactName, exact: true }).waitFor(),
  },
  {
    key: "marketing-leads-list",
    label: "线索列表",
    hash: "marketing-leads",
    ready: () => page.locator(".semi-table").first().waitFor(),
  },
  {
    key: "marketing-lead-detail",
    label: "线索详情",
    hash: `marketing-leads/${marketingLead.id}`,
    ready: () => page.getByRole("heading", { name: marketingLead.fullName, exact: true }).waitFor(),
  },
  {
    key: "opportunities-list",
    label: "商机列表",
    hash: "leads",
    ready: () => page.locator(".semi-table").first().waitFor(),
  },
  {
    key: "opportunity-detail",
    label: "商机详情",
    hash: `leads/${opportunity.id}`,
    ready: () => page.getByRole("heading", { name: opportunity.requirementSummary, exact: true }).waitFor(),
  },
];

const results = [];
let sequence = 1;

async function measurePage() {
  return page.evaluate(() => {
    const documentWidth = document.documentElement.scrollWidth;
    const bodyWidth = document.body.scrollWidth;
    const tables = [...document.querySelectorAll("table")].map((table) => {
      const parent = table.parentElement;
      return {
        ariaLabel: table.getAttribute("aria-label"),
        clientWidth: table.clientWidth,
        scrollWidth: table.scrollWidth,
        parentClientWidth: parent?.clientWidth ?? null,
        parentScrollWidth: parent?.scrollWidth ?? null,
        parentOverflowX: parent ? getComputedStyle(parent).overflowX : null,
      };
    });
    const main = document.querySelector("main");
    const mainRect = main?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: documentWidth,
        scrollHeight: document.documentElement.scrollHeight,
      },
      body: {
        clientWidth: document.body.clientWidth,
        scrollWidth: bodyWidth,
        scrollHeight: document.body.scrollHeight,
      },
      main: mainRect
        ? {
            left: Math.round(mainRect.left),
            right: Math.round(mainRect.right),
            width: Math.round(mainRect.width),
            height: Math.round(mainRect.height),
          }
        : null,
      bodyTextLength: document.body.innerText.trim().length,
      h1: document.querySelector("h1")?.textContent?.trim() || null,
      documentHorizontalOverflow: Math.max(documentWidth, bodyWidth) > innerWidth + 1,
      tables,
    };
  });
}

async function captureRoute(definition, viewport) {
  await page.setViewportSize(viewport);
  const screenshotName = `${String(sequence).padStart(2, "0")}-${definition.key}-${viewport.width}x${viewport.height}.png`;
  sequence += 1;
  const indices = {
    consoleErrors: consoleErrors.length,
    consoleWarnings: consoleWarnings.length,
    pageErrors: pageErrors.length,
    httpFailures: httpFailures.length,
    requestFailures: requestFailures.length,
  };
  let status = "PASS";
  let failure = null;
  try {
    await page.goto(`${baseUrl}/?visualBaseline=1#${definition.hash}`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await definition.ready();
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
    await page.waitForFunction(() => document.fonts?.status === "loaded", null, { timeout: 5_000 }).catch(() => undefined);
    await page.waitForFunction(
      () => !document.querySelector('[aria-busy="true"]'),
      null,
      { timeout: 5_000 },
    ).catch(() => undefined);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(350);
  } catch (error) {
    status = "FAIL";
    failure = { message: error.message, stack: error.stack };
  }

  const measurement = await measurePage().catch((error) => ({ measurementError: error.message }));
  await page.screenshot({
    path: resolve(evidenceDir, screenshotName),
    fullPage: false,
    animations: "disabled",
  });

  const scoped = {
    consoleErrors: consoleErrors.slice(indices.consoleErrors),
    consoleWarnings: consoleWarnings.slice(indices.consoleWarnings),
    pageErrors: pageErrors.slice(indices.pageErrors),
    httpFailures: httpFailures.slice(indices.httpFailures),
    requestFailures: requestFailures.slice(indices.requestFailures),
  };
  if (
    measurement.documentHorizontalOverflow ||
    scoped.consoleErrors.length ||
    scoped.pageErrors.length ||
    scoped.httpFailures.length ||
    scoped.requestFailures.length
  ) {
    status = "FAIL";
  }
  results.push({
    key: definition.key,
    label: definition.label,
    hash: definition.hash,
    url: page.url(),
    viewport,
    screenshot: screenshotName,
    status,
    failure,
    measurement,
    ...scoped,
  });
  console.log(`${status} ${definition.label} ${viewport.width}x${viewport.height} -> ${screenshotName}`);
}

try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
  ]) {
    for (const definition of routeDefinitions) {
      await captureRoute(definition, viewport);
    }
  }
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  browser: "Google Chrome via Playwright, headless, cache disabled",
  authentication: "Existing storage state used without inspecting or emitting its path or cookie contents",
  session: {
    id: (session.data.user || session.data).id,
    name: (session.data.user || session.data).name,
    role: (session.data.user || session.data).role,
    permissionCount: (session.data.user || session.data).permissions.length,
  },
  fixture: {
    organization: { id: organization.id, name: organization.name },
    contact: { id: contact.id, name: contact.contactName },
    marketingLead: { id: marketingLead.id, name: marketingLead.fullName },
    opportunity: { id: opportunity.id, name: opportunity.requirementSummary },
  },
  build: await Promise.all(buildFiles.map(fingerprint)),
  verdict:
    results.every((item) => item.status === "PASS") &&
    consoleErrors.length === 0 &&
    pageErrors.length === 0 &&
    httpFailures.length === 0 &&
    requestFailures.length === 0
      ? "PASS"
      : "FAIL",
  summary: {
    routes: results.length,
    passed: results.filter((item) => item.status === "PASS").length,
    failed: results.filter((item) => item.status === "FAIL").length,
    documentOverflow: results.filter((item) => item.measurement.documentHorizontalOverflow).length,
    consoleErrors: consoleErrors.length,
    consoleWarnings: consoleWarnings.length,
    pageErrors: pageErrors.length,
    httpFailures: httpFailures.length,
    requestFailures: requestFailures.length,
  },
  consoleErrors,
  consoleWarnings,
  pageErrors,
  httpFailures,
  requestFailures,
  results,
};

await writeFile(resolve(evidenceDir, "runtime-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ verdict: report.verdict, summary: report.summary }, null, 2));
