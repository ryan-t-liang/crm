import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
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
  throw new Error("This final visual audit is restricted to the local CRM server.");
}

const repositoryRoot = resolve(import.meta.dirname, "../../");
const evidenceDir = import.meta.dirname;
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
  resolve(repositoryRoot, "frontend/react-build/index.html"),
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

function isExpectedUnauthenticatedHttp(item) {
  if (item.context !== "unauthenticated" || item.status !== 401) return false;
  return new URL(item.url).pathname === "/api/v1/auth/me";
}

function isExpectedUnauthenticatedConsole(item) {
  return (
    item.context === "unauthenticated" &&
    item.type === "error" &&
    item.text.includes("401")
  );
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const events = {
  consoleErrors: [],
  consoleWarnings: [],
  pageErrors: [],
  httpFailures: [],
  requestFailures: [],
};
let activeCase = null;

async function createAuditContext({ authenticated, viewport }) {
  const context = await browser.newContext({
    viewport,
    ...(authenticated ? { storageState: storageStatePath } : {}),
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
  const contextName = authenticated ? "authenticated" : "unauthenticated";

  page.on("console", (message) => {
    const item = {
      case: activeCase,
      context: contextName,
      type: message.type(),
      text: message.text(),
      pageUrl: page.url(),
    };
    if (message.type() === "error") events.consoleErrors.push(item);
    if (message.type() === "warning") events.consoleWarnings.push(item);
  });
  page.on("pageerror", (error) => {
    events.pageErrors.push({
      case: activeCase,
      context: contextName,
      message: error.message,
      stack: error.stack,
      pageUrl: page.url(),
    });
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    events.httpFailures.push({
      case: activeCase,
      context: contextName,
      method: response.request().method(),
      status: response.status(),
      url: response.url(),
      pageUrl: page.url(),
    });
  });
  page.on("requestfailed", (request) => {
    events.requestFailures.push({
      case: activeCase,
      context: contextName,
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText || "Unknown request failure",
      pageUrl: page.url(),
    });
  });

  return { context, page, contextName };
}

async function api(context, path) {
  const response = await context.request.get(`${baseUrl}${path}`, {
    headers: noCacheHeaders,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok()) {
    throw new Error(`GET ${path} failed with ${response.status()}: ${JSON.stringify(body)}`);
  }
  return body;
}

function pageMetrics(page) {
  return page.evaluate(() => {
    const roundRect = (rect) => ({
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        rect.width > 1 &&
        rect.height > 1 &&
        rect.bottom > 0 &&
        rect.top < innerHeight
      );
    };
    const describe = (element) => ({
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      role: element.getAttribute("role"),
      ariaLabel: element.getAttribute("aria-label"),
      className:
        typeof element.className === "string"
          ? element.className.split(/\s+/).filter(Boolean).slice(0, 5).join(" ")
          : null,
      text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 100) || null,
      rect: roundRect(element.getBoundingClientRect()),
    });
    const hasContainingOverflowAncestor = (element) => {
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const style = getComputedStyle(parent);
        if (["auto", "scroll", "hidden", "clip"].includes(style.overflowX)) return true;
        parent = parent.parentElement;
      }
      return false;
    };

    const interactiveSelector = [
      "button",
      "a[href]",
      "input",
      "textarea",
      "select",
      "[role='button']",
      "[role='combobox']",
      "[role='tab']",
      "[role='checkbox']",
      "[role='menuitem']",
    ].join(",");
    const interactives = [...new Set(document.querySelectorAll(interactiveSelector))].filter(visible);
    const interactiveOverlaps = [];
    for (let firstIndex = 0; firstIndex < interactives.length; firstIndex += 1) {
      const first = interactives[firstIndex];
      const firstRect = first.getBoundingClientRect();
      for (let secondIndex = firstIndex + 1; secondIndex < interactives.length; secondIndex += 1) {
        const second = interactives[secondIndex];
        if (first.contains(second) || second.contains(first)) continue;
        const secondRect = second.getBoundingClientRect();
        const width = Math.min(firstRect.right, secondRect.right) - Math.max(firstRect.left, secondRect.left);
        const height = Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top);
        if (width <= 2 || height <= 2) continue;
        const intersection = width * height;
        const smallerArea = Math.min(firstRect.width * firstRect.height, secondRect.width * secondRect.height);
        if (intersection < 36 || intersection / smallerArea < 0.15) continue;
        interactiveOverlaps.push({ first: describe(first), second: describe(second), intersection: Math.round(intersection) });
      }
    }

    const regionOverlaps = [];
    for (const region of document.querySelectorAll(
      ".crm-page-header, .crm-entity-header, .crm-workbench-task-header, .crm-dashboard-page-header, .crm-data-toolbar",
    )) {
      const children = [...region.children].filter(visible);
      for (let firstIndex = 0; firstIndex < children.length; firstIndex += 1) {
        const first = children[firstIndex];
        const firstRect = first.getBoundingClientRect();
        for (let secondIndex = firstIndex + 1; secondIndex < children.length; secondIndex += 1) {
          const second = children[secondIndex];
          const secondRect = second.getBoundingClientRect();
          const width = Math.min(firstRect.right, secondRect.right) - Math.max(firstRect.left, secondRect.left);
          const height = Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top);
          if (width > 2 && height > 2) {
            regionOverlaps.push({ region: describe(region), first: describe(first), second: describe(second) });
          }
        }
      }
    }

    const outsideViewport = [...document.body.querySelectorAll("*")]
      .filter(visible)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return (rect.left < -1 || rect.right > innerWidth + 1) && !hasContainingOverflowAncestor(element);
      })
      .slice(0, 20)
      .map(describe);

    const clippedTextCandidates = [...document.querySelectorAll(
      "h1, h2, h3, .semi-button-content, .crm-nav-item-text, .crm-entity-meta dd, th, td",
    )]
      .filter(visible)
      .filter((element) => element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2)
      .slice(0, 30)
      .map((element) => ({
        ...describe(element),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflow: getComputedStyle(element).overflow,
        textOverflow: getComputedStyle(element).textOverflow,
      }));

    const comboboxControls = [...document.querySelectorAll("[role='combobox']")]
      .filter(visible)
      .map((element) => {
        const ariaLabel = element.getAttribute("aria-label")?.trim() || null;
        const labelledBy = element.getAttribute("aria-labelledby")?.trim() || null;
        const labelledByText = labelledBy
          ? labelledBy
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent?.replace(/\s+/g, " ").trim())
              .filter(Boolean)
              .join(" ") || null
          : null;
        const explicitLabelText = element.id
          ? [...document.querySelectorAll("label")]
              .find((label) => label.htmlFor === element.id)
              ?.textContent?.replace(/\s+/g, " ").trim() || null
          : null;
        // ARIA name calculation gives aria-labelledby precedence over aria-label.
        const accessibleName = labelledByText || ariaLabel || explicitLabelText;
        return {
          ...describe(element),
          ariaLabel,
          labelledBy,
          labelledByText,
          explicitLabelText,
          accessibleName,
          hasAccessibleName: Boolean(accessibleName),
        };
      });

    const tables = [...document.querySelectorAll(".semi-table")].map((table) => ({
      ...describe(table),
      clientWidth: table.clientWidth,
      scrollWidth: table.scrollWidth,
      horizontalScroll: table.scrollWidth > table.clientWidth + 1,
    }));
    const sidebar = document.querySelector(".crm-shell-sidebar");
    const main = document.querySelector("main");
    const documentWidth = document.documentElement.scrollWidth;
    const bodyWidth = document.body.scrollWidth;

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
      h1: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || null,
      bodyTextLength: document.body.innerText.trim().length,
      documentHorizontalOverflow: Math.max(documentWidth, bodyWidth) > innerWidth + 1,
      sidebar: sidebar ? describe(sidebar) : null,
      main: main ? describe(main) : null,
      tables,
      overlapRisk: {
        interactiveOverlaps,
        regionOverlaps,
        outsideViewport,
        clippedTextCandidates,
      },
      comboboxAccessibility: {
        total: comboboxControls.length,
        unnamed: comboboxControls.filter((control) => !control.hasAccessibleName),
        controls: comboboxControls,
      },
    };
  });
}

const results = [];
let sequence = 1;

async function captureRoute({ page, contextName, definition, viewport }) {
  await page.setViewportSize(viewport);
  activeCase = `${definition.key}-${viewport.width}x${viewport.height}`;
  const screenshot = `${String(sequence).padStart(2, "0")}-${definition.key}-${viewport.width}x${viewport.height}.png`;
  sequence += 1;
  const indices = Object.fromEntries(Object.entries(events).map(([key, items]) => [key, items.length]));
  let loadFailure = null;

  try {
    await page.goto(`${baseUrl}/?finalAudit=${Date.now()}#${definition.hash}`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await definition.ready(page);
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
    await page.waitForFunction(() => document.fonts?.status === "loaded", null, { timeout: 5_000 }).catch(() => undefined);
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 5_000 }).catch(() => undefined);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
  } catch (error) {
    loadFailure = { message: error.message, stack: error.stack };
  }

  const measurement = await pageMetrics(page).catch((error) => ({ measurementError: error.message }));
  await page.screenshot({
    path: resolve(evidenceDir, screenshot),
    fullPage: false,
    animations: "disabled",
  });

  const scoped = Object.fromEntries(
    Object.entries(events).map(([key, items]) => [key, items.slice(indices[key])]),
  );
  const unexpectedConsoleErrors = scoped.consoleErrors.filter((item) => !isExpectedUnauthenticatedConsole(item));
  const unexpectedHttpFailures = scoped.httpFailures.filter((item) => !isExpectedUnauthenticatedHttp(item));
  const failed = Boolean(
    loadFailure ||
      measurement.documentHorizontalOverflow ||
      measurement.comboboxAccessibility?.unnamed.length ||
      unexpectedConsoleErrors.length ||
      scoped.pageErrors.length ||
      unexpectedHttpFailures.length ||
      scoped.requestFailures.length,
  );

  const result = {
    key: definition.key,
    label: definition.label,
    hash: definition.hash,
    context: contextName,
    url: page.url(),
    viewport,
    screenshot,
    status: failed ? "FAIL" : "PASS",
    loadFailure,
    measurement,
    unexpectedConsoleErrors,
    unexpectedHttpFailures,
    ...scoped,
  };
  results.push(result);
  console.log(`${result.status} ${definition.label} ${viewport.width}x${viewport.height} -> ${screenshot}`);
  return result;
}

const authenticatedAudit = await createAuditContext({
  authenticated: true,
  viewport: { width: 1024, height: 768 },
});
const { context: authenticatedContext, page: authenticatedPage } = authenticatedAudit;

const [session, organizations, contacts, marketingLeads, opportunities] = await Promise.all([
  api(authenticatedContext, "/api/v1/auth/me"),
  api(authenticatedContext, "/api/v1/crm/organizations?page=1&pageSize=20"),
  api(authenticatedContext, "/api/v1/crm/contacts?page=1&pageSize=100"),
  api(authenticatedContext, "/api/v1/crm/marketing-leads?page=1&pageSize=20"),
  api(authenticatedContext, "/api/v1/crm/leads?page=1&pageSize=20"),
]);

const organization = organizations.data.find((item) => item.name === "Semi Migration QA Organization") || organizations.data[0];
const contact = contacts.data.find((item) => item.contactName === "Semi QA Contact") || contacts.data[0];
const marketingLead = marketingLeads.data.find((item) => item.fullName === "Semi QA Marketing Lead") || marketingLeads.data[0];
const opportunity = opportunities.data.find((item) => item.requirementSummary === "Semi Design enterprise CRM rollout") || opportunities.data[0];
for (const [kind, record] of Object.entries({ organization, contact, marketingLead, opportunity })) {
  if (!record?.id) throw new Error(`No ${kind} record is available for final detail capture.`);
}

const tableOrEmpty = (page) => page.locator(".semi-table, .crm-empty-state").first().waitFor();
const core1024 = [
  { key: "dashboard", label: "数据看板", hash: "dashboard", ready: (page) => page.locator(".crm-dashboard-content").waitFor() },
  { key: "workbench", label: "我的工作台", hash: "workbench", ready: (page) => page.locator(".crm-workbench-layout").waitFor() },
  { key: "organizations-list", label: "组织列表", hash: "organizations", ready: tableOrEmpty },
  { key: "organization-detail", label: "组织详情", hash: `organizations/${organization.id}`, ready: (page) => page.getByRole("heading", { name: organization.name, exact: true }).waitFor() },
  { key: "contacts-list", label: "联系人列表", hash: "contacts", ready: tableOrEmpty },
  { key: "contact-detail", label: "联系人详情", hash: `contacts/${contact.id}`, ready: (page) => page.getByRole("heading", { name: contact.contactName, exact: true }).waitFor() },
  { key: "marketing-leads-list", label: "营销线索列表", hash: "marketing-leads", ready: tableOrEmpty },
  { key: "marketing-lead-detail", label: "营销线索详情", hash: `marketing-leads/${marketingLead.id}`, ready: (page) => page.getByRole("heading", { name: marketingLead.fullName, exact: true }).waitFor() },
  { key: "opportunities-list", label: "商机列表", hash: "leads", ready: tableOrEmpty },
  { key: "opportunity-detail", label: "商机详情", hash: `leads/${opportunity.id}`, ready: (page) => page.getByRole("heading", { name: opportunity.requirementSummary, exact: true }).waitFor() },
];

const systemPages = [
  { key: "suppliers", label: "供应商", hash: "suppliers", ready: tableOrEmpty },
  { key: "accounts", label: "账户管理", hash: "accounts", ready: tableOrEmpty },
  { key: "roles", label: "角色与权限", hash: "roles", ready: tableOrEmpty },
  { key: "scoring-rules", label: "评分规则", hash: "scoring-rules", ready: tableOrEmpty },
  { key: "audit", label: "审计日志", hash: "audit", ready: tableOrEmpty },
];

try {
  for (const definition of core1024) {
    await captureRoute({
      page: authenticatedPage,
      contextName: authenticatedAudit.contextName,
      definition,
      viewport: { width: 1024, height: 768 },
    });
  }
  for (const definition of systemPages) {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
    ]) {
      await captureRoute({
        page: authenticatedPage,
        contextName: authenticatedAudit.contextName,
        definition,
        viewport,
      });
    }
  }
} finally {
  await authenticatedContext.close();
}

const unauthenticatedAudit = await createAuditContext({
  authenticated: false,
  viewport: { width: 1440, height: 900 },
});
try {
  const loginDefinition = {
    key: "login",
    label: "登录页",
    hash: "login",
    ready: (page) => page.getByRole("heading", { name: "登录", exact: true }).waitFor(),
  };
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
  ]) {
    await captureRoute({
      page: unauthenticatedAudit.page,
      contextName: unauthenticatedAudit.contextName,
      definition: loginDefinition,
      viewport,
    });
  }
} finally {
  await unauthenticatedAudit.context.close();
  await browser.close();
}

const normalizedEvents = {
  expectedUnauthenticatedHttp: events.httpFailures.filter(isExpectedUnauthenticatedHttp),
  unexpectedHttpFailures: events.httpFailures.filter((item) => !isExpectedUnauthenticatedHttp(item)),
  expectedUnauthenticatedConsole: events.consoleErrors.filter(isExpectedUnauthenticatedConsole),
  unexpectedConsoleErrors: events.consoleErrors.filter((item) => !isExpectedUnauthenticatedConsole(item)),
  consoleWarnings: events.consoleWarnings,
  pageErrors: events.pageErrors,
  requestFailures: events.requestFailures,
};
const currentSession = session.data.user || session.data;
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  browser: "Google Chrome via Playwright, headless, cache disabled",
  authentication: "Existing storage state used without inspecting or emitting its cookie contents",
  session: {
    name: currentSession.name,
    role: currentSession.role,
    permissionCount: currentSession.permissions.length,
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
    normalizedEvents.unexpectedHttpFailures.length === 0 &&
    normalizedEvents.unexpectedConsoleErrors.length === 0 &&
    normalizedEvents.consoleWarnings.length === 0 &&
    normalizedEvents.pageErrors.length === 0 &&
    normalizedEvents.requestFailures.length === 0
      ? "PASS"
      : "FAIL",
  summary: {
    cases: results.length,
    passed: results.filter((item) => item.status === "PASS").length,
    failed: results.filter((item) => item.status === "FAIL").length,
    documentHorizontalOverflow: results.filter((item) => item.measurement.documentHorizontalOverflow).length,
    interactiveOverlapCandidates: results.reduce((sum, item) => sum + (item.measurement.overlapRisk?.interactiveOverlaps.length || 0), 0),
    regionOverlapCandidates: results.reduce((sum, item) => sum + (item.measurement.overlapRisk?.regionOverlaps.length || 0), 0),
    outsideViewportCandidates: results.reduce((sum, item) => sum + (item.measurement.overlapRisk?.outsideViewport.length || 0), 0),
    clippedTextCandidates: results.reduce((sum, item) => sum + (item.measurement.overlapRisk?.clippedTextCandidates.length || 0), 0),
    comboboxesChecked: results.reduce((sum, item) => sum + (item.measurement.comboboxAccessibility?.total || 0), 0),
    unnamedComboboxes: results.reduce((sum, item) => sum + (item.measurement.comboboxAccessibility?.unnamed.length || 0), 0),
    expectedUnauthenticatedHttp: normalizedEvents.expectedUnauthenticatedHttp.length,
    expectedUnauthenticatedConsole: normalizedEvents.expectedUnauthenticatedConsole.length,
    unexpectedConsoleErrors: normalizedEvents.unexpectedConsoleErrors.length,
    consoleWarnings: normalizedEvents.consoleWarnings.length,
    pageErrors: normalizedEvents.pageErrors.length,
    unexpectedHttpFailures: normalizedEvents.unexpectedHttpFailures.length,
    requestFailures: normalizedEvents.requestFailures.length,
  },
  events: normalizedEvents,
  results,
};

await writeFile(resolve(evidenceDir, "runtime-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ verdict: report.verdict, summary: report.summary }, null, 2));
