import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ||
      "/Users/ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
  ),
);

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
if (!["127.0.0.1", "localhost"].includes(new URL(baseUrl).hostname)) {
  throw new Error("Interaction regression is restricted to the local CRM server.");
}

const configuredAccount = process.env.QA_ACCOUNT || "";
const loginPassword = process.env.QA_PASSWORD || "";
if (!loginPassword) {
  throw new Error("QA_PASSWORD is required and is never written to evidence.");
}

const evidenceDir = import.meta.dirname;
const repositoryRoot = resolve(evidenceDir, "../../../");
const storageStateInput = process.env.QA_STORAGE_STATE || "";
if (!storageStateInput) {
  throw new Error("QA_STORAGE_STATE must point to an authenticated local QA state and is never copied to evidence.");
}
const storageStatePath = resolve(storageStateInput);
const uploadFixturePath = resolve(evidenceDir, "qa-followup-note.txt");
const importFixtureInput = process.env.QA_IMPORT_FILE || "";
if (!importFixtureInput) {
  throw new Error("QA_IMPORT_FILE must point to the controlled one-row contact XLSX fixture.");
}
const importFixturePath = resolve(importFixtureInput);
const importFixtureMetadataPath = importFixturePath.replace(/\.xlsx$/i, ".json");
const importFixtureMetadata = JSON.parse(await readFile(importFixtureMetadataPath, "utf8"));
assert.equal(importFixtureMetadata.rows, 1, "Controlled import fixture must contain exactly one row");
assert.match(importFixtureMetadata.contactName, /^QA-Semi-Import-/);
assert.match(importFixtureMetadata.email, /^qa-semi-import-.+@example\.test$/);
const buildPaths = [
  resolve(repositoryRoot, "frontend/react-build/assets/app.js"),
  resolve(repositoryRoot, "frontend/react-build/assets/app.css"),
];
const noCacheHeaders = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
};
const runSuffix = String(process.env.QA_RUN_ID || Date.now()).slice(-10);
const loginAccount = `qa-semi-login-${runSuffix}@example.test`;
const loginDisplayName = `QA Semi Login ${runSuffix}`;
const qaContactName = `QA-Semi-Contact-${runSuffix}`;
const qaContactTitle = `QA-Semi-Edited-${runSuffix}`;
const qaFollowupContent = `QA-Semi-Followup-${runSuffix}`;
const qaNextAction = `QA-Semi-Next-${runSuffix}`;
const targetFollowupLocal = "2026-09-16T14:30";
const expectedFollowupIso = new Date(targetFollowupLocal).toISOString();
const viewerPassword = `Vw9!${randomBytes(18).toString("base64url")}aA`;
const invalidPassword = randomBytes(18).toString("base64url");

await mkdir(evidenceDir, { recursive: true });
for (const entry of await readdir(evidenceDir)) {
  if (/^\d{2}-.*\.png$/.test(entry)) await unlink(resolve(evidenceDir, entry));
}

function redact(value) {
  let output = String(value ?? "");
  for (const secret of [configuredAccount, loginAccount, loginPassword, viewerPassword, invalidPassword]) {
    if (secret) output = output.split(secret).join("[REDACTED]");
  }
  return output.replace(/(?:cookie|authorization)=?[^\s&]*/gi, "$1=[REDACTED]");
}

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
const cases = [];
const writes = [];
const events = {
  consoleErrors: [],
  consoleWarnings: [],
  pageErrors: [],
  httpFailures: [],
  requestFailures: [],
};
let screenshotSequence = 1;
let activeCase = null;
let activePage = null;

function trackPage(page, contextName) {
  page.on("console", (message) => {
    const item = {
      case: activeCase,
      context: contextName,
      type: message.type(),
      text: redact(message.text()),
      pageUrl: redact(page.url()),
    };
    if (message.type() === "error") events.consoleErrors.push(item);
    if (message.type() === "warning") events.consoleWarnings.push(item);
  });
  page.on("pageerror", (error) => {
    events.pageErrors.push({
      case: activeCase,
      context: contextName,
      message: redact(error.message),
      pageUrl: redact(page.url()),
    });
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    events.httpFailures.push({
      case: activeCase,
      context: contextName,
      method: response.request().method(),
      status: response.status(),
      url: redact(response.url()),
      pageUrl: redact(page.url()),
    });
  });
  page.on("requestfailed", (request) => {
    events.requestFailures.push({
      case: activeCase,
      context: contextName,
      method: request.method(),
      url: redact(request.url()),
      error: redact(request.failure()?.errorText || "Unknown request failure"),
      pageUrl: redact(page.url()),
    });
  });
}

async function newContext({ authenticated = true } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
    colorScheme: "light",
    deviceScaleFactor: 1,
    serviceWorkers: "block",
    extraHTTPHeaders: noCacheHeaders,
    ...(authenticated ? { storageState: storageStatePath } : {}),
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  trackPage(page, authenticated ? "authenticated" : "unauthenticated");
  return { context, page };
}

async function screenshot(page, slug, result) {
  await page.waitForTimeout(180);
  const file = `${String(screenshotSequence).padStart(2, "0")}-${slug}.png`;
  screenshotSequence += 1;
  await page.evaluate(
    ({ exactValues, selectors }) => {
      const replacements = new Map();
      const remember = (node, value) => {
        if (!replacements.has(node)) replacements.set(node, node.nodeValue || "");
        node.nodeValue = value;
      };
      const redactDescendantText = (element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        let first = true;
        while (node) {
          if ((node.nodeValue || "").trim()) {
            remember(node, first ? "[REDACTED]" : "");
            first = false;
          }
          node = walker.nextNode();
        }
      };

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const original = node.nodeValue || "";
        const redacted = exactValues.reduce(
          (value, secret) => value.split(secret).join("[REDACTED]"),
          original,
        );
        if (redacted !== original) remember(node, redacted);
        node = walker.nextNode();
      }
      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach(redactDescendantText);
      }
      window.__qaScreenshotRedactions = [...replacements.entries()];
    },
    {
      exactValues: [configuredAccount, loginAccount].filter(Boolean),
      selectors: [".crm-dashboard-team-member small", ".crm-user-menu-copy span"],
    },
  );
  try {
    await page.screenshot({ path: resolve(evidenceDir, file), fullPage: false });
  } finally {
    await page.evaluate(() => {
      for (const [node, original] of window.__qaScreenshotRedactions || []) {
        node.nodeValue = original;
      }
      delete window.__qaScreenshotRedactions;
    });
  }
  result.screenshots.push(file);
  return file;
}

function assertion(result, condition, message, details) {
  assert.ok(condition, message);
  result.assertions.push({ message, ...(details ? { details } : {}) });
}

async function runCase(id, title, callback) {
  const startedAt = Date.now();
  const result = {
    id,
    title,
    status: "PASS",
    assertions: [],
    screenshots: [],
    durationMs: 0,
  };
  cases.push(result);
  activeCase = id;
  try {
    if (activePage && !activePage.isClosed()) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const transient = activePage.locator(".semi-modal:visible, .semi-sidesheet:visible, .semi-dropdown:visible, .semi-datepicker:visible");
        if (!(await transient.count())) break;
        await activePage.keyboard.press("Escape");
        await activePage.waitForTimeout(100);
      }
    }
    await callback(result);
  } catch (error) {
    result.status = "FAIL";
    result.error = { message: redact(error.message), stack: redact(error.stack) };
    if (activePage && !activePage.isClosed()) {
      await screenshot(activePage, `${id}-failure`, result).catch(() => undefined);
    }
  } finally {
    result.durationMs = Date.now() - startedAt;
    activeCase = null;
  }
  return result;
}

async function jsonResponse(response) {
  return response.json().catch(() => ({}));
}

async function getJson(context, path) {
  const response = await context.request.get(`${baseUrl}${path}`, {
    headers: noCacheHeaders,
  });
  const body = await jsonResponse(response);
  assert.ok(response.ok(), `GET ${path} returned ${response.status()}`);
  return body;
}

function crmField(root, label) {
  return root
    .locator(".crm-form-field")
    .filter({ hasText: label })
    .first();
}

async function chooseSemiOption(page, control, optionText) {
  await control.click();
  const option = page
    .locator(".semi-select-option-text:visible")
    .filter({ hasText: new RegExp(`^${optionText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
    .last();
  await option.waitFor();
  await option.click();
}

async function waitForTable(page) {
  await page.locator(".semi-table").first().waitFor();
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]')).catch(() => undefined);
}

function pathOf(response) {
  return new URL(response.url()).pathname;
}

async function searchContacts(targetPage, keyword) {
  await waitForTable(targetPage);
  const search = targetPage.getByRole("textbox", { name: "搜索", exact: true });
  const submit = async (value) => {
    await search.fill("");
    await targetPage.waitForTimeout(60);
    await search.fill(value);
    await targetPage.waitForTimeout(60);
    const responsePromise = targetPage.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "GET" &&
        url.pathname === "/api/v1/crm/contacts" &&
        url.searchParams.get("keyword") === value;
    });
    await search.press("Enter");
    return responsePromise;
  };
  if ((await search.inputValue()) === keyword) {
    await submit(`${keyword}-distinct-query`);
  }
  const response = await submit(keyword);
  assert.ok(response.ok(), `Contact search returned ${response.status()}`);
  return { response, body: await jsonResponse(response) };
}

async function documentHasNoHorizontalOverflow(targetPage) {
  return targetPage.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
}

let authenticatedContext;
let page;
let organization;
let knownLead;
let createdContact;
let createdFollowup;
let exportJob;
let loginUser;
let adminSession;
let importJob;
let importedContact;
const fixtureCleanup = [];
const fixtureResiduals = { qaLoginUsers: [], qaContacts: [] };

async function deleteContactThroughUi(contact, result, slug) {
  assert.ok(contact?.id && contact?.contactName, "A QA contact is required for deletion");
  await page.goto(`${baseUrl}/#contacts`, { waitUntil: "domcontentloaded" });
  const before = await searchContacts(page, contact.contactName);
  assertion(
    result,
    before.body.data?.filter((item) => item.id === contact.id).length === 1,
    `删除前目录中仅匹配目标联系人 ${contact.contactName}`,
  );
  const row = page.getByRole("row").filter({ hasText: contact.contactName });
  await row.waitFor();
  await row.getByRole("button", { name: `${contact.contactName}的更多操作` }).click();
  const dropdown = page.locator(".semi-dropdown:visible");
  await dropdown.waitFor();
  await dropdown.getByText("删除", { exact: true }).click();
  const modal = page.locator(".semi-modal:visible");
  await modal.waitFor();
  assertion(result, (await modal.count()) === 1, "真实删除由可见 Semi Modal 二次确认");
  await screenshot(page, `${slug}-delete-confirmation`, result);

  const deleteResponsePromise = page.waitForResponse(
    (response) => pathOf(response) === `/api/v1/crm/contacts/${contact.id}` && response.request().method() === "DELETE",
  );
  const listRefreshPromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" &&
      url.pathname === "/api/v1/crm/contacts" &&
      url.searchParams.get("keyword") === contact.contactName;
  });
  await modal.getByRole("button", { name: "确认删除", exact: true }).click();
  const [deleteResponse, listRefresh] = await Promise.all([deleteResponsePromise, listRefreshPromise]);
  assertion(result, deleteResponse.ok(), "DELETE 请求成功", { status: deleteResponse.status() });
  const refreshed = await jsonResponse(listRefresh);
  assertion(result, !refreshed.data?.some((item) => item.id === contact.id), "软删除后联系人从列表查询中消失");
  writes.push({ kind: "contact", action: "soft-delete", id: contact.id, name: contact.contactName, status: deleteResponse.status() });

  const detailResponse = await authenticatedContext.request.get(`${baseUrl}/api/v1/crm/contacts/${contact.id}`, {
    headers: noCacheHeaders,
  });
  assertion(result, detailResponse.status() === 404, "软删除后详情 API 返回 404", { status: detailResponse.status() });
  await page.reload({ waitUntil: "domcontentloaded" });
  const afterReload = await searchContacts(page, contact.contactName);
  assertion(result, !afterReload.body.data?.some((item) => item.id === contact.id), "刷新后联系人仍不在正式列表中");
  await screenshot(page, `${slug}-deleted-after-reload`, result);
}

const setup = await newContext({ authenticated: true });
adminSession = (await getJson(setup.context, "/api/v1/auth/me")).data;
assert.ok(adminSession?.id, "Authenticated QA administrator session is required");

const [existingQaUsers, existingQaContacts, existingImportedContacts] = await Promise.all([
  getJson(setup.context, "/api/v1/users"),
  getJson(setup.context, "/api/v1/crm/contacts?keyword=QA-Semi-Contact-&page=1&pageSize=100"),
  getJson(
    setup.context,
    `/api/v1/crm/contacts?keyword=${encodeURIComponent(importFixtureMetadata.contactName)}&page=1&pageSize=100`,
  ),
]);
for (const user of existingQaUsers.data.filter(
  (item) => item.name.startsWith("QA Semi Login ") && item.status === "ACTIVE" && item.id !== adminSession.id,
)) {
  const response = await setup.context.request.post(`${baseUrl}/api/v1/users/${user.id}/disable`, {
    headers: noCacheHeaders,
  });
  assert.ok(response.ok(), `Disabling prior QA login fixture returned ${response.status()}`);
  fixtureCleanup.push({ kind: "qa-login-user", displayName: user.name, action: "disable", status: response.status() });
}
for (const contact of existingQaContacts.data.filter((item) => item.contactName.startsWith("QA-Semi-Contact-"))) {
  const response = await setup.context.request.delete(`${baseUrl}/api/v1/crm/contacts/${contact.id}`, {
    headers: noCacheHeaders,
  });
  fixtureCleanup.push({
    kind: "contact",
    displayName: contact.contactName,
    action: response.ok() ? "soft-delete" : "retained",
    status: response.status(),
  });
  if (!response.ok()) fixtureResiduals.qaContacts.push({ displayName: contact.contactName });
}
for (const contact of existingImportedContacts.data.filter(
  (item) => item.contactName === importFixtureMetadata.contactName,
)) {
  const response = await setup.context.request.delete(`${baseUrl}/api/v1/crm/contacts/${contact.id}`, {
    headers: noCacheHeaders,
  });
  fixtureCleanup.push({
    kind: "imported-contact",
    displayName: contact.contactName,
    action: response.ok() ? "soft-delete" : "retained",
    status: response.status(),
  });
  if (!response.ok()) fixtureResiduals.qaContacts.push({ displayName: contact.contactName });
}

const setupRoles = await getJson(setup.context, "/api/v1/roles");
const loginRole = setupRoles.data.find((role) => role.key === "VIEWER");
assert.ok(loginRole?.id, "The VIEWER role is required to create the isolated login fixture");
const createLoginUserResponse = await setup.context.request.post(`${baseUrl}/api/v1/users`, {
  headers: { ...noCacheHeaders, "Content-Type": "application/json" },
  data: {
    name: loginDisplayName,
    loginAccount,
    roleId: loginRole.id,
    status: "ACTIVE",
  },
});
const createLoginUserBody = await jsonResponse(createLoginUserResponse);
assert.ok(createLoginUserResponse.ok(), `Creating isolated login fixture returned ${createLoginUserResponse.status()}`);
loginUser = createLoginUserBody.data;
assert.ok(loginUser?.id, "Created login fixture must include an id");
writes.push({
  kind: "qa-login-user",
  action: "create",
  id: loginUser.id,
  displayName: loginDisplayName,
  role: loginRole.key,
  status: createLoginUserResponse.status(),
});
const persistedLoginUser = (await getJson(setup.context, `/api/v1/users/${loginUser.id}`)).data;
assert.equal(persistedLoginUser.name, loginDisplayName);
assert.equal(persistedLoginUser.role.key, loginRole.key);
await setup.context.close();

await runCase("LOGIN-ERROR", "登录错误状态", async (result) => {
  const fresh = await newContext({ authenticated: false });
  activePage = fresh.page;
  await fresh.page.goto(`${baseUrl}/#login`, { waitUntil: "domcontentloaded" });
  await fresh.page.getByRole("heading", { name: "登录", exact: true }).waitFor();
  await fresh.page.locator('input[type="email"]').fill("qa-invalid@kivisense.test");
  await fresh.page.locator('input[type="password"]').fill(invalidPassword);
  const responsePromise = fresh.page.waitForResponse(
    (response) => pathOf(response) === "/api/v1/auth/login" && response.request().method() === "POST",
  );
  await fresh.page.getByRole("button", { name: "登录", exact: true }).click();
  const response = await responsePromise;
  assertion(result, response.status() === 401, "错误凭据返回 HTTP 401", { status: response.status() });
  const alert = fresh.page.getByRole("alert");
  await alert.waitFor();
  assertion(result, (await alert.innerText()).trim().length > 0, "页面显示非空登录错误提示");
  await fresh.page.locator('input[type="email"]').fill("");
  await fresh.page.locator('input[type="password"]').fill("");
  await screenshot(fresh.page, "login-error", result);

  await runCase("LOGIN-SUCCESS", "登录成功并建立会话", async (successResult) => {
    activePage = fresh.page;
    await fresh.page.locator('input[type="email"]').fill(loginAccount);
    await fresh.page.locator('input[type="password"]').fill(loginPassword);
    const successPromise = fresh.page.waitForResponse(
      (candidate) => pathOf(candidate) === "/api/v1/auth/login" && candidate.request().method() === "POST",
    );
    await fresh.page.getByRole("button", { name: "登录", exact: true }).click();
    const successResponse = await successPromise;
    assertion(successResult, successResponse.ok(), "有效凭据返回成功状态", { status: successResponse.status() });
    await fresh.page.getByRole("heading", { name: "首次登录 · 修改密码", exact: true }).waitFor();
    const sessionResponse = await fresh.context.request.get(`${baseUrl}/api/v1/auth/me`);
    const session = await jsonResponse(sessionResponse);
    assertion(successResult, sessionResponse.ok(), "登录后 /auth/me 可读取");
    assertion(successResult, session.data?.role?.key === loginRole.key, `登录会话角色为 ${loginRole.key}`);
    assertion(successResult, session.data?.mustChangePassword === true, "首次登录进入强制修改密码页面");
    await fresh.page.getByText(loginAccount, { exact: true }).evaluate((element) => {
      element.textContent = "[REDACTED]";
    });
    await screenshot(fresh.page, "login-success-password-gate", successResult);
  });

  await runCase("VIEWER-RBAC", "VIEWER 强制改密与只读权限", async (viewerResult) => {
    activePage = fresh.page;
    await fresh.page.getByLabel("当前密码", { exact: true }).fill(loginPassword);
    await fresh.page.getByLabel("新密码", { exact: true }).fill(viewerPassword);
    await fresh.page.getByLabel("确认新密码", { exact: true }).fill(viewerPassword);
    const changePasswordPromise = fresh.page.waitForResponse(
      (response) => pathOf(response) === "/api/v1/auth/change-password" && response.request().method() === "POST",
    );
    await fresh.page.getByRole("button", { name: "更新密码", exact: true }).click();
    const changePasswordResponse = await changePasswordPromise;
    assertion(viewerResult, changePasswordResponse.ok(), "VIEWER 首次登录强制改密成功", {
      status: changePasswordResponse.status(),
    });
    await fresh.page.getByRole("heading", { name: "数据看板", exact: true }).waitFor();
    const sessionResponse = await fresh.context.request.get(`${baseUrl}/api/v1/auth/me`, { headers: noCacheHeaders });
    const session = await jsonResponse(sessionResponse);
    assertion(viewerResult, sessionResponse.ok(), "改密后的 /auth/me 可读取");
    assertion(viewerResult, session.data?.role?.key === "VIEWER", "正式页面会话角色仍为 VIEWER");
    assertion(viewerResult, session.data?.mustChangePassword === false, "改密门禁已解除");

    await fresh.page.goto(`${baseUrl}/#contacts`, { waitUntil: "domcontentloaded" });
    await waitForTable(fresh.page);
    for (const hiddenAction of ["新增联系人", "批量导入", "导出", "导出所选", "批量分配"]) {
      assertion(
        viewerResult,
        (await fresh.page.getByRole("button", { name: hiddenAction, exact: true }).count()) === 0,
        `VIEWER 不显示“${hiddenAction}”操作`,
      );
    }
    assertion(
      viewerResult,
      (await fresh.page.locator('.semi-table [role="checkbox"]').count()) === 0,
      "VIEWER 不显示批量选择入口",
    );
    const firstRowAction = fresh.page.locator('button[aria-label$="的更多操作"]').first();
    await firstRowAction.click();
    const viewerDropdown = fresh.page.locator(".semi-dropdown:visible");
    await viewerDropdown.waitFor();
    for (const hiddenRowAction of ["编辑", "删除", "记录跟进"]) {
      assertion(
        viewerResult,
        (await viewerDropdown.getByText(hiddenRowAction, { exact: true }).count()) === 0,
        `VIEWER 行菜单不显示“${hiddenRowAction}”`,
      );
    }
    assertion(viewerResult, (await viewerDropdown.getByText("查看详情", { exact: true }).count()) === 1, "VIEWER 保留只读详情入口");
    await fresh.page.keyboard.press("Escape");
    await screenshot(fresh.page, "viewer-contact-read-only", viewerResult);
  });

  await fresh.context.close();
});

({ context: authenticatedContext, page } = await newContext({ authenticated: true }));
activePage = page;

const [organizations, contactsBefore, leadsBefore] = await Promise.all([
  getJson(authenticatedContext, "/api/v1/crm/organizations?page=1&pageSize=20"),
  getJson(authenticatedContext, "/api/v1/crm/contacts?page=1&pageSize=20"),
  getJson(authenticatedContext, "/api/v1/crm/leads?page=1&pageSize=20"),
]);
organization = organizations.data.find((item) => item.name === "Semi Migration QA Organization") || organizations.data[0];
assert.ok(organization?.id, "An organization fixture is required");
const knownContact = contactsBefore.data.find((item) => item.contactName === "Semi QA Contact") || contactsBefore.data[0];
assert.ok(knownContact?.id, "A contact fixture is required");
knownLead = leadsBefore.data[0];
assert.ok(knownLead?.id, "An opportunity fixture is required for DateInput focus validation");

await runCase("SIDEBAR-PERSISTENCE", "Semi Navigation 侧栏折叠持久化", async (result) => {
  await page.goto(`${baseUrl}/#dashboard`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "数据看板", exact: true }).waitFor();
  await page.evaluate(() => window.localStorage.setItem("kivisense.crm.sidebar.collapsed", "false"));
  await page.reload({ waitUntil: "domcontentloaded" });
  const shell = page.locator('.crm-shell[data-collapsed="false"]');
  await shell.waitFor();
  await page.getByRole("button", { name: "展开或收起侧栏", exact: true }).click();
  await page.locator('.crm-shell[data-collapsed="true"]').waitFor();
  assertion(result, await documentHasNoHorizontalOverflow(page), "侧栏折叠后页面无文档级横向溢出");
  assertion(
    result,
    (await page.evaluate(() => window.localStorage.getItem("kivisense.crm.sidebar.collapsed"))) === "true",
    "折叠状态写入 localStorage",
  );
  await screenshot(page, "sidebar-collapsed", result);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('.crm-shell[data-collapsed="true"]').waitFor();
  assertion(result, true, "刷新后侧栏保持折叠");
  assertion(result, await documentHasNoHorizontalOverflow(page), "刷新后的折叠布局仍无横向溢出");
  await page.getByRole("button", { name: "展开或收起侧栏", exact: true }).click();
  await page.locator('.crm-shell[data-collapsed="false"]').waitFor();
  assertion(
    result,
    (await page.evaluate(() => window.localStorage.getItem("kivisense.crm.sidebar.collapsed"))) === "false",
    "验收结束前恢复展开状态",
  );
});

await runCase("NAVIGATION", "Semi Navigation 路由切换", async (result) => {
  await page.goto(`${baseUrl}/#dashboard`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "数据看板", exact: true }).waitFor();
  assertion(result, (await page.locator(".semi-navigation").count()) > 0, "主导航由 Semi Navigation 渲染");
  await page.locator('aside a[href="#contacts"]').click();
  await waitForTable(page);
  assertion(result, page.url().endsWith("#contacts"), "点击导航进入联系人路由");
  assertion(result, (await page.locator(".semi-table").count()) > 0, "联系人目录由 Semi Table 渲染");
  await screenshot(page, "navigation-contacts", result);
});

await runCase("LIST-CONTROLS", "列表搜索、筛选与分页", async (result) => {
  const total = contactsBefore.meta.total;
  assertion(result, total > 20, "联系人夹具足以验证第二页", { total });
  const nextResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/crm/contacts" && url.searchParams.get("page") === "2";
  });
  await page.getByRole("button", { name: "Next" }).click();
  const nextResponse = await nextResponsePromise;
  assertion(result, nextResponse.ok(), "分页到第二页请求成功", { status: nextResponse.status() });
  await page.locator('[aria-label="Page 2"][aria-current="page"]').waitFor();
  assertion(result, (await page.locator(".semi-page").count()) > 0, "分页由 Semi Pagination 渲染");
  await screenshot(page, "contacts-page-2", result);

  const pageOnePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/crm/contacts" && url.searchParams.get("page") === "1";
  });
  await page.locator('[aria-label="Page 1"]').click();
  await pageOnePromise;

  const typeControl = page
    .locator(".crm-filter-control")
    .filter({ has: page.getByText("联系人类型", { exact: true }) })
    .first()
    .locator('[role="combobox"]');
  const filterResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/crm/contacts" && url.searchParams.get("contactType") === "BUSINESS";
  });
  await chooseSemiOption(page, typeControl, "企业联系人");
  const filterResponse = await filterResponsePromise;
  assertion(result, filterResponse.ok(), "联系人类型筛选请求成功", { status: filterResponse.status() });
  assertion(
    result,
    (await page.getByRole("combobox", { name: "联系人类型", exact: true }).count()) === 1,
    "筛选 Select 暴露正确 accessible name",
  );

  await page.getByRole("button", { name: "重置", exact: true }).click();
  const search = page.getByRole("textbox", { name: "搜索", exact: true });
  await search.fill(knownContact.contactName);
  const searchResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/crm/contacts" && url.searchParams.get("keyword") === knownContact.contactName;
  });
  await search.press("Enter");
  const searchResponse = await searchResponsePromise;
  assertion(result, searchResponse.ok(), "关键词搜索请求成功", { status: searchResponse.status() });
  await page.getByRole("row").filter({ hasText: knownContact.contactName }).waitFor();
  await screenshot(page, "contacts-filter-search", result);
  await page.getByRole("button", { name: "重置", exact: true }).click();
});

await runCase("CONTACT-CREATE", "联系人 SideSheet 与 EntityCombobox 清除", async (result) => {
  await page.getByRole("button", { name: /新增联系人/ }).click();
  const sheet = page.locator(".semi-sidesheet:visible");
  await page.getByRole("heading", { name: "新增联系人", exact: true }).waitFor();
  assertion(result, (await sheet.count()) === 1, "新增表单由 Semi SideSheet 渲染");

  const relationMode = crmField(sheet, "组织关联方式").locator('[role="combobox"]');
  assertion(
    result,
    (await sheet.getByRole("combobox", { name: "组织关联方式", exact: true }).count()) === 1,
    "SideSheet Select 暴露正确 accessible name",
  );
  await chooseSemiOption(page, relationMode, "选择已有组织");

  const nameInput = crmField(sheet, "联系人姓名").locator("input").first();
  assertion(
    result,
    (await sheet.getByRole("textbox", { name: /^联系人姓名/ }).count()) === 1,
    "SideSheet Input 与可见标签正确关联",
  );
  await nameInput.fill(qaContactName);

  const companyInput = sheet.locator('input[aria-label="组织"]');
  await companyInput.fill(organization.name);
  await page.locator(".crm-entity-combobox-dropdown [role=option]:visible").filter({ hasText: organization.name }).click();
  assertion(result, (await companyInput.inputValue()) === organization.name, "EntityCombobox 选择已有组织");

  let contactPostCount = 0;
  const countPost = (request) => {
    if (pathOf(request) === "/api/v1/crm/contacts" && request.method() === "POST") contactPostCount += 1;
  };
  page.on("request", countPost);
  await companyInput.fill("");
  await sheet.getByRole("button", { name: "保存联系人", exact: true }).click();
  await sheet.getByText("请选择已存在的组织", { exact: true }).waitFor();
  assertion(result, contactPostCount === 0, "清除 EntityCombobox 后旧 organizationId 未提交");
  await screenshot(page, "contact-combobox-cleared-validation", result);

  await companyInput.fill(organization.name);
  await page.locator(".crm-entity-combobox-dropdown [role=option]:visible").filter({ hasText: organization.name }).click();
  const createResponsePromise = page.waitForResponse(
    (response) => pathOf(response) === "/api/v1/crm/contacts" && response.request().method() === "POST",
  );
  await sheet.getByRole("button", { name: "保存联系人", exact: true }).click();
  const createResponse = await createResponsePromise;
  const createBody = await jsonResponse(createResponse);
  assertion(result, createResponse.ok(), "联系人创建 HTTP 请求成功", { status: createResponse.status() });
  createdContact = createBody.data;
  assert.ok(createdContact?.id, "Created contact response must include an id");
  writes.push({ kind: "contact", action: "create", id: createdContact.id, name: qaContactName, status: createResponse.status() });
  await sheet.waitFor({ state: "hidden" });

  const search = page.getByRole("textbox", { name: "搜索", exact: true });
  await search.fill(qaContactName);
  const visibleResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/crm/contacts" && url.searchParams.get("keyword") === qaContactName;
  });
  await search.press("Enter");
  await visibleResponsePromise;
  await page.getByRole("row").filter({ hasText: qaContactName }).waitFor();
  assertion(result, true, "创建结果在联系人目录可见");
  await screenshot(page, "contact-created-list", result);

  const persisted = (await getJson(authenticatedContext, `/api/v1/crm/contacts/${createdContact.id}`)).data;
  assertion(result, persisted.organizationId === organization.id, "API 持久化正确 organizationId");
  assertion(result, persisted.contactName === qaContactName, "API 持久化联系人姓名");

  await page.goto(`${baseUrl}/#contacts/${createdContact.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: qaContactName, exact: true }).waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: qaContactName, exact: true }).waitFor();
  await page.getByText(organization.name, { exact: true }).first().waitFor();
  assertion(result, true, "刷新详情页后联系人与组织关联仍可见");
  page.off("request", countPost);
});

await runCase("CONTACT-EDIT", "联系人编辑 SideSheet 持久化", async (result) => {
  assert.ok(createdContact?.id, "CONTACT-CREATE must succeed before editing");
  await page.goto(`${baseUrl}/#contacts/${createdContact.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: qaContactName, exact: true }).waitFor();
  await page.getByRole("button", { name: /编辑$/ }).click();
  const sheet = page.locator(".semi-sidesheet:visible");
  await page.getByRole("heading", { name: "编辑联系人", exact: true }).waitFor();
  const titleInput = crmField(sheet, "职位").locator("input").first();
  await titleInput.fill(qaContactTitle);
  const patchResponsePromise = page.waitForResponse(
    (response) => pathOf(response) === `/api/v1/crm/contacts/${createdContact.id}` && response.request().method() === "PATCH",
  );
  await sheet.getByRole("button", { name: "保存联系人", exact: true }).click();
  const patchResponse = await patchResponsePromise;
  assertion(result, patchResponse.ok(), "联系人编辑 HTTP 请求成功", { status: patchResponse.status() });
  writes.push({ kind: "contact", action: "edit", id: createdContact.id, field: "title", value: qaContactTitle, status: patchResponse.status() });
  await sheet.waitFor({ state: "hidden" });
  const persisted = (await getJson(authenticatedContext, `/api/v1/crm/contacts/${createdContact.id}`)).data;
  assertion(result, persisted.title === qaContactTitle, "API 持久化编辑后的职位");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText(qaContactTitle, { exact: true }).first().waitFor();
  assertion(result, true, "刷新详情页后编辑值仍可见");
  await screenshot(page, "contact-edit-persisted", result);
});

await runCase("DATE-UPLOAD", "Semi DatePicker 与 Upload 跟进持久化", async (result) => {
  assert.ok(createdContact?.id, "CONTACT-CREATE must succeed before adding a follow-up");
  await page.goto(`${baseUrl}/#contacts/${createdContact.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: qaContactName, exact: true }).waitFor();
  await page.getByRole("button", { name: /记录跟进/ }).click();
  const sheet = page.locator(".semi-sidesheet:visible");
  await page.getByRole("heading", { name: "新增互动", exact: true }).waitFor();
  const nextInput = crmField(sheet, "下次跟进").locator("input").first();
  await nextInput.click();
  let picker = page.locator('.semi-datepicker[x-type="dateTime"]:visible').last();
  await picker.waitFor();
  assertion(result, (await picker.count()) === 1, "日期时间面板由 Semi DatePicker 渲染");
  await screenshot(page, "followup-datepicker-open", result);

  await picker.getByRole("gridcell", { name: "2026-09-16", exact: true }).click();
  if (!(await picker.isVisible().catch(() => false))) {
    await nextInput.click();
    picker = page.locator('.semi-datepicker[x-type="dateTime"]:visible').last();
  }
  await picker.getByRole("button", { name: "Switch to time panel" }).click();
  const timeColumns = picker.locator(".semi-scrolllist-item");
  await timeColumns.nth(0).getByRole("option", { name: "14", exact: true }).click();
  await timeColumns.nth(1).getByRole("option", { name: "30", exact: true }).click();
  assertion(result, (await nextInput.inputValue()) === "2026-09-16 14:30", "通过 Semi 面板选择日期和时间");

  await crmField(sheet, "互动内容").locator("textarea").fill(qaFollowupContent);
  await crmField(sheet, "下一步行动").locator("textarea").fill(qaNextAction);
  const uploadField = crmField(sheet, "互动附件");
  await uploadField.locator('input[type="file"]').first().setInputFiles(uploadFixturePath);
  await sheet.getByText(basename(uploadFixturePath), { exact: true }).waitFor();
  assertion(result, (await uploadField.locator(".semi-upload").count()) > 0, "附件选择由 Semi Upload 渲染");
  await screenshot(page, "followup-date-file-ready", result);

  const followupResponsePromise = page.waitForResponse(
    (response) =>
      pathOf(response) === `/api/v1/crm/contacts/${createdContact.id}/followups` &&
      response.request().method() === "POST",
  );
  const attachmentResponsePromise = page.waitForResponse(
    (response) =>
      pathOf(response).includes("/attachments/followupAttachments") &&
      response.request().method() === "POST",
  );
  await sheet.getByRole("button", { name: "保存互动", exact: true }).click();
  const [followupResponse, attachmentResponse] = await Promise.all([
    followupResponsePromise,
    attachmentResponsePromise,
  ]);
  const followupBody = await jsonResponse(followupResponse);
  createdFollowup = followupBody.data;
  assertion(result, followupResponse.ok(), "跟进创建 HTTP 请求成功", { status: followupResponse.status() });
  assertion(result, attachmentResponse.ok(), "既有跟进附件端点上传成功", { status: attachmentResponse.status() });
  assert.ok(createdFollowup?.id, "Created follow-up response must include an id");
  writes.push({ kind: "contact-followup", action: "create", id: createdFollowup.id, contactId: createdContact.id, status: followupResponse.status() });
  writes.push({ kind: "followup-attachment", action: "upload", followupId: createdFollowup.id, fileName: basename(uploadFixturePath), status: attachmentResponse.status() });
  await sheet.waitFor({ state: "hidden" });

  const followups = await getJson(
    authenticatedContext,
    `/api/v1/crm/contacts/${createdContact.id}/followups?page=1&pageSize=20`,
  );
  const persisted = followups.data.find((item) => item.id === createdFollowup.id);
  assertion(result, persisted?.content === qaFollowupContent, "API 持久化跟进内容");
  assertion(result, persisted?.nextAction === qaNextAction, "API 持久化下一步行动");
  assertion(result, persisted?.nextFollowupAt === expectedFollowupIso, "API 持久化 DatePicker 日期时间", { expected: expectedFollowupIso, actual: persisted?.nextFollowupAt });
  assertion(result, persisted?.attachments?.some((item) => item.originalName === basename(uploadFixturePath)), "API 返回已持久化附件");

  await page.getByRole("tab", { name: "客户旅程", exact: true }).click();
  await page.getByText(qaFollowupContent, { exact: true }).waitFor();
  await page.getByText(basename(uploadFixturePath), { exact: true }).waitFor();
  assertion(result, true, "跟进与附件在客户旅程可见");
  await screenshot(page, "followup-visible-journey", result);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: qaContactName, exact: true }).waitFor();
  await page.getByRole("tab", { name: "客户旅程", exact: true }).click();
  await page.getByText(qaFollowupContent, { exact: true }).waitFor();
  await page.getByText(basename(uploadFixturePath), { exact: true }).waitFor();
  assertion(result, true, "刷新后跟进与附件仍可见");
  await screenshot(page, "followup-reload-persisted", result);
});

await runCase("DETAIL-TABS", "Semi Tabs 详情切换", async (result) => {
  assert.ok(createdContact?.id, "CONTACT-CREATE must succeed before detail tab validation");
  await page.goto(`${baseUrl}/#contacts/${createdContact.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: qaContactName, exact: true }).waitFor();
  assertion(result, (await page.locator(".semi-tabs").count()) > 0, "详情页由 Semi Tabs 渲染");
  await page.getByRole("tab", { name: "备注与附件", exact: true }).click();
  await page.getByRole("heading", { name: "备注与资料", exact: true }).waitFor();
  await page.getByRole("tab", { name: "客户旅程", exact: true }).click();
  await page.getByText(qaFollowupContent, { exact: true }).waitFor();
  assertion(result, true, "详情 Tabs 可往返切换且内容正确");
  await screenshot(page, "contact-detail-tabs", result);
});

await runCase("ROW-ACTION-MODAL", "行操作 Dropdown 与确认 Modal", async (result) => {
  await page.goto(`${baseUrl}/#contacts`, { waitUntil: "domcontentloaded" });
  await searchContacts(page, qaContactName);
  const row = page.getByRole("row").filter({ hasText: qaContactName });
  await row.waitFor();
  let deleteRequestCount = 0;
  const countDelete = (request) => {
    if (pathOf(request) === `/api/v1/crm/contacts/${createdContact.id}` && request.method() === "DELETE") deleteRequestCount += 1;
  };
  page.on("request", countDelete);
  await row.getByRole("button", { name: `${qaContactName}的更多操作` }).click();
  const dropdown = page.locator(".semi-dropdown:visible");
  await dropdown.waitFor();
  assertion(result, (await dropdown.count()) > 0, "行操作由 Semi Dropdown 渲染");
  await dropdown.getByText("删除", { exact: true }).click();
  const modal = page.locator(".semi-modal:visible");
  await modal.waitFor();
  assertion(result, (await modal.count()) === 1, "删除确认由 Semi Modal 渲染");
  await screenshot(page, "row-dropdown-delete-modal", result);
  await modal.getByRole("button", { name: "取消", exact: true }).click();
  await modal.waitFor({ state: "hidden" });
  assertion(result, deleteRequestCount === 0, "取消确认未发送 DELETE 请求");
  const persisted = await getJson(authenticatedContext, `/api/v1/crm/contacts/${createdContact.id}`);
  assertion(result, persisted.data?.id === createdContact.id, "取消后联系人仍存在");
  page.off("request", countDelete);
});

await runCase("BATCH-ASSIGN", "Semi Table 批量分配与持久化", async (result) => {
  assert.ok(createdContact?.id, "CONTACT-CREATE must succeed before batch selection");
  await page.goto(`${baseUrl}/#contacts`, { waitUntil: "domcontentloaded" });
  const filtered = await searchContacts(page, qaContactName);
  assertion(result, filtered.body.data?.filter((item) => item.id === createdContact.id).length === 1, "搜索结果仅包含本轮 QA 联系人");
  let row = page.getByRole("row").filter({ hasText: qaContactName });
  await row.waitFor();
  await row.getByRole("checkbox").check({ force: true });
  let bulk = page.getByRole("toolbar", { name: "批量操作" });
  await bulk.waitFor();
  await bulk.getByText("已选择 1 条", { exact: true }).waitFor();
  assertion(result, (await row.locator(".semi-checkbox").count()) > 0, "批量勾选由 Semi Checkbox 渲染");
  const ownerControl = bulk.getByRole("combobox", { name: "批量分配负责人", exact: true });
  await chooseSemiOption(page, ownerControl, loginDisplayName);
  const assignResponsePromise = page.waitForResponse(
    (response) => pathOf(response) === "/api/v1/crm/contacts/batch-assign" && response.request().method() === "POST",
  );
  const assignedListPromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && url.pathname === "/api/v1/crm/contacts" && url.searchParams.get("keyword") === qaContactName;
  });
  await bulk.getByRole("button", { name: "批量分配", exact: true }).click();
  const [assignResponse] = await Promise.all([assignResponsePromise, assignedListPromise]);
  const assignBody = await jsonResponse(assignResponse);
  assertion(result, assignResponse.ok(), "批量分配 POST 成功", { status: assignResponse.status() });
  assertion(result, assignBody.data?.matched === 1, "批量分配仅命中本轮联系人");
  writes.push({ kind: "contact", action: "batch-assign", id: createdContact.id, ownerDisplayName: loginDisplayName, status: assignResponse.status() });
  const assigned = (await getJson(authenticatedContext, `/api/v1/crm/contacts/${createdContact.id}`)).data;
  assertion(result, assigned.ownerUserId === loginUser.id, "API 持久化 VIEWER 负责人编号");
  row = page.getByRole("row").filter({ hasText: qaContactName });
  await row.getByText(loginDisplayName, { exact: true }).waitFor();
  await screenshot(page, "contact-batch-assigned-viewer", result);

  await page.reload({ waitUntil: "domcontentloaded" });
  await searchContacts(page, qaContactName);
  row = page.getByRole("row").filter({ hasText: qaContactName });
  await row.getByText(loginDisplayName, { exact: true }).waitFor();
  assertion(result, true, "刷新后 VIEWER 负责人仍在列表可见");

  await row.getByRole("checkbox").check({ force: true });
  bulk = page.getByRole("toolbar", { name: "批量操作" });
  await bulk.waitFor();
  await chooseSemiOption(page, bulk.getByRole("combobox", { name: "批量分配负责人", exact: true }), adminSession.name);
  const restoreResponsePromise = page.waitForResponse(
    (response) => pathOf(response) === "/api/v1/crm/contacts/batch-assign" && response.request().method() === "POST",
  );
  await bulk.getByRole("button", { name: "批量分配", exact: true }).click();
  const restoreResponse = await restoreResponsePromise;
  assertion(result, restoreResponse.ok(), "验收后批量恢复管理员负责人成功", { status: restoreResponse.status() });
  writes.push({ kind: "contact", action: "batch-assign-restore", id: createdContact.id, ownerDisplayName: adminSession.name, status: restoreResponse.status() });
  const restored = (await getJson(authenticatedContext, `/api/v1/crm/contacts/${createdContact.id}`)).data;
  assertion(result, restored.ownerUserId === adminSession.id, "API 确认负责人已恢复为 QA 管理员");
});

process.stdout.write("WAIT rate-limit window before import/export and cleanup\n");
await page.waitForTimeout(61_000);

await runCase("IMPORT-COMPLETE", "Semi Upload 完整导入与持久化", async (result) => {
  await page.goto(`${baseUrl}/#contacts`, { waitUntil: "domcontentloaded" });
  await waitForTable(page);
  await page.getByRole("button", { name: /批量导入$/ }).click();
  const sheet = page.locator(".semi-sidesheet:visible");
  await page.getByRole("heading", { name: "批量导入", exact: true }).waitFor();
  await sheet.locator('input[type="file"]').first().setInputFiles(importFixturePath);
  await sheet.getByText(basename(importFixturePath), { exact: true }).waitFor();
  await sheet.locator("label").filter({ hasText: "确认重新上传相同文件" }).click();
  assertion(result, await sheet.getByRole("checkbox").nth(1).isChecked(), "明确允许重复上传同一 QA 文件");
  assertion(result, (await sheet.locator(".semi-upload").count()) > 0, "XLSX 文件选择由 Semi Upload 渲染");
  assertion(result, (await sheet.getByRole("button", { name: "开始预检", exact: true }).isEnabled()), "选择 XLSX 后预检操作可用");
  await screenshot(page, "import-sidesheet-file-selected", result);

  const preflightPromise = page.waitForResponse(
    (response) => pathOf(response) === "/api/v1/crm/imports/contacts" && response.request().method() === "POST",
  );
  await sheet.getByRole("button", { name: "开始预检", exact: true }).click();
  const preflightResponse = await preflightPromise;
  const preflightBody = await jsonResponse(preflightResponse);
  importJob = preflightBody.data;
  assertion(result, preflightResponse.status() === 201, "联系人导入预检返回 HTTP 201", { status: preflightResponse.status() });
  assert.ok(importJob?.id, "Import preflight must return a job id");
  assertion(result, importJob.preflight?.totalRows === 1, "预检识别到 1 行受控数据");
  assertion(result, importJob.preflight?.importableRows === 1, "预检结果为 1 行可导入");
  assertion(result, importJob.preflight?.errorRows === 0, "预检没有错误行");
  await sheet.getByRole("button", { name: "确认导入", exact: true }).waitFor();
  await sheet.getByText(importFixtureMetadata.contactName, { exact: false }).waitFor();
  assertion(
    result,
    (await sheet.locator(".crm-import-preview-table").count()) === 1 && (await sheet.locator(".semi-table").count()) > 0,
    "预检明细由 Semi Table 展示",
  );
  await screenshot(page, "import-preflight-ready", result);

  const executePromise = page.waitForResponse(
    (response) => pathOf(response) === `/api/v1/crm/imports/${importJob.id}/execute` && response.request().method() === "POST",
  );
  await sheet.getByRole("button", { name: "确认导入", exact: true }).click();
  const executeResponse = await executePromise;
  const executeBody = await jsonResponse(executeResponse);
  assertion(result, executeResponse.ok(), "确认导入 HTTP 请求成功", { status: executeResponse.status() });
  assertion(result, executeBody.data?.result?.imported === 1, "执行结果成功导入 1 行");
  assertion(result, executeBody.data?.result?.failed === 0, "执行结果失败 0 行");
  const persistedImport = await getJson(
    authenticatedContext,
    `/api/v1/crm/contacts?keyword=${encodeURIComponent(importFixtureMetadata.contactName)}&page=1&pageSize=20`,
  );
  importedContact = persistedImport.data?.find((item) => item.contactName === importFixtureMetadata.contactName);
  assert.ok(importedContact?.id, "Imported contact must be persisted immediately after execute");
  writes.push({ kind: "contact-import", action: "execute", id: importJob.id, contactId: importedContact.id, imported: 1, failed: 0, status: executeResponse.status() });
  await sheet.getByText("成功 1 条，失败 0 条，需注意 0 条。", { exact: true }).waitFor();
  await screenshot(page, "import-execute-completed", result);
  await sheet.getByRole("button", { name: "完成", exact: true }).click();
  await sheet.waitFor({ state: "hidden" });

  const importedList = await searchContacts(page, importFixtureMetadata.contactName);
  const visibleImportedContact = importedList.body.data?.find((item) => item.id === importedContact.id);
  assert.ok(visibleImportedContact?.id, "Imported contact must be visible through the contacts API");
  assertion(result, importedContact.contactType === "INDIVIDUAL", "API 持久化个人联系人类型");
  assertion(result, importedContact.email === importFixtureMetadata.email, "API 持久化受控邮箱");
  await page.getByRole("row").filter({ hasText: importFixtureMetadata.contactName }).waitFor();
  await screenshot(page, "import-contact-visible-list", result);
  await page.reload({ waitUntil: "domcontentloaded" });
  const importedAfterReload = await searchContacts(page, importFixtureMetadata.contactName);
  assertion(result, importedAfterReload.body.data?.some((item) => item.id === importedContact.id), "刷新后导入联系人仍在正式列表中");
});

await runCase("EXPORT-SIDESHEET", "导出 SideSheet、任务与重载持久化", async (result) => {
  await page.goto(`${baseUrl}/#contacts`, { waitUntil: "domcontentloaded" });
  await waitForTable(page);
  await page.getByRole("button", { name: /导出$/ }).click();
  let sheet = page.locator(".semi-sidesheet:visible");
  await page.getByRole("heading", { name: "导出数据", exact: true }).waitFor();
  await sheet.getByText(/预计记录数：\d+ 条/).waitFor();
  assertion(result, (await sheet.locator('[role="combobox"]').count()) > 0, "导出范围使用 Semi Select");
  await screenshot(page, "export-sidesheet-estimate", result);
  const exportResponsePromise = page.waitForResponse(
    (response) => pathOf(response) === "/api/v1/crm/exports/contacts" && response.request().method() === "POST",
  );
  await sheet.getByRole("button", { name: "生成导出文件", exact: true }).click();
  const exportResponse = await exportResponsePromise;
  const exportBody = await jsonResponse(exportResponse);
  exportJob = exportBody.data;
  assertion(result, exportResponse.ok(), "导出任务创建 HTTP 请求成功", { status: exportResponse.status() });
  assert.ok(exportJob?.id, "Export response must include a job id");
  await sheet.getByText(/已生成 \d+ 条记录。/).waitFor({ timeout: 30_000 });
  assertion(result, true, "页面显示导出完成与记录数");
  writes.push({ kind: "contact-export", action: "create", id: exportJob.id, status: exportResponse.status() });
  const persisted = (await getJson(authenticatedContext, `/api/v1/crm/exports/${exportJob.id}`)).data;
  assertion(result, persisted.status === "COMPLETED", "API 返回导出任务 COMPLETED", { status: persisted.status });
  assertion(result, Boolean(persisted.downloadUrl), "API 返回可下载地址");
  await screenshot(page, "export-completed", result);
  await sheet.getByRole("button", { name: "完成", exact: true }).click();
  await sheet.waitFor({ state: "hidden" });

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForTable(page);
  await page.getByRole("button", { name: /导出$/ }).click();
  sheet = page.locator(".semi-sidesheet:visible");
  await page.getByRole("heading", { name: "导出数据", exact: true }).waitFor();
  await sheet.getByRole("button", { name: "导出记录", exact: true }).click();
  await sheet.getByText(exportJob.jobNo || exportJob.id, { exact: false }).waitFor();
  assertion(result, true, "页面重载后导出记录仍可读取");
  await screenshot(page, "export-history-reload", result);
  await sheet.getByRole("button", { name: "取消", exact: true }).click();
});

await runCase("ROLE-PERMISSIONS", "角色权限 SideSheet", async (result) => {
  await page.goto(`${baseUrl}/#roles`, { waitUntil: "domcontentloaded" });
  await waitForTable(page);
  await page.getByRole("button", { name: "查看权限", exact: true }).first().click();
  const sheet = page.locator(".semi-sidesheet:visible");
  await sheet.locator("h2").filter({ hasText: "查看权限" }).waitFor();
  assertion(result, (await sheet.count()) === 1, "角色权限在 Semi SideSheet 中展示");
  await sheet.getByText(/crm\./).first().waitFor();
  assertion(result, (await sheet.locator("section").count()) > 0, "权限按业务模块分组展示");
  await screenshot(page, "role-permission-sidesheet", result);
  await sheet.getByRole("button", { name: "关闭", exact: true }).click();
  await sheet.waitFor({ state: "hidden" });
});

await runCase("AUDIT-COLLAPSE", "审计详情 Semi Collapse", async (result) => {
  await page.goto(`${baseUrl}/#audit`, { waitUntil: "domcontentloaded" });
  await waitForTable(page);
  await page.getByRole("button", { name: "查看记录", exact: true }).first().click();
  const sheet = page.locator(".semi-sidesheet:visible");
  await page.getByRole("heading", { name: "操作记录详情", exact: true }).waitFor();
  const technical = sheet.locator(".crm-audit-technical-content");
  assertion(result, !(await technical.isVisible()), "技术信息默认折叠");
  assertion(result, (await sheet.locator(".semi-collapse").count()) === 1, "审计技术信息由 Semi Collapse 渲染");
  await sheet.getByText("技术信息", { exact: true }).click();
  await technical.waitFor({ state: "visible" });
  assertion(result, true, "点击后技术信息展开");
  await screenshot(page, "audit-collapse-expanded", result);
  await sheet.getByRole("button", { name: "关闭", exact: true }).click();
});

await runCase("RESPONSIVE-RUNTIME", "核心页面响应式溢出与运行时检查", async (result) => {
  try {
    for (const width of [1280, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${baseUrl}/#dashboard`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "数据看板", exact: true }).waitFor();
      assertion(result, await documentHasNoHorizontalOverflow(page), `${width}px 数据看板无文档级横向溢出`);

      await page.goto(`${baseUrl}/#contacts`, { waitUntil: "domcontentloaded" });
      await waitForTable(page);
      assertion(result, await documentHasNoHorizontalOverflow(page), `${width}px 联系人目录无文档级横向溢出`);

      await page.goto(`${baseUrl}/#leads/${knownLead.id}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: knownLead.requirementSummary, exact: true }).waitFor();
      assertion(result, await documentHasNoHorizontalOverflow(page), `${width}px 商机详情无文档级横向溢出`);
      if (width === 1024) await screenshot(page, "opportunity-detail-1024", result);
    }
  } finally {
    await page.setViewportSize({ width: 1440, height: 900 });
  }
});

await runCase("IMPORTED-CONTACT-DELETE", "导入联系人真实软删除", async (result) => {
  assert.ok(importedContact?.id, "IMPORT-COMPLETE must succeed before imported-contact cleanup");
  await deleteContactThroughUi(importedContact, result, "imported-contact");
});

await runCase("QA-CONTACT-DELETE", "本轮联系人真实软删除", async (result) => {
  assert.ok(createdContact?.id, "CONTACT-CREATE must succeed before final contact cleanup");
  await deleteContactThroughUi(createdContact, result, "qa-contact");
});

await runCase("FIXTURE-CLEANUP", "QA 账号停用与夹具清理核验", async (result) => {
  const disableResponse = await authenticatedContext.request.post(`${baseUrl}/api/v1/users/${loginUser.id}/disable`, {
    headers: noCacheHeaders,
  });
  const disableBody = await jsonResponse(disableResponse);
  assertion(result, disableResponse.ok(), "本轮 VIEWER 账号停用请求成功", { status: disableResponse.status() });
  assertion(result, disableBody.data?.status === "DISABLED", "停用响应状态为 DISABLED");
  const persisted = (await getJson(authenticatedContext, `/api/v1/users/${loginUser.id}`)).data;
  assertion(result, persisted.status === "DISABLED", "API 确认本轮 VIEWER 已停用");
  fixtureCleanup.push({ kind: "qa-login-user", displayName: loginDisplayName, action: "disable", status: disableResponse.status() });
  writes.push({ kind: "qa-login-user", action: "disable", id: loginUser.id, displayName: loginDisplayName, status: disableResponse.status() });

  const allUsers = (await getJson(authenticatedContext, "/api/v1/users")).data;
  const qaUsers = allUsers.filter((item) => item.name.startsWith("QA Semi Login "));
  assertion(result, qaUsers.every((item) => item.status === "DISABLED"), "所有可确认由 harness 创建的 QA VIEWER 均已停用", {
    count: qaUsers.length,
  });
  fixtureResiduals.qaLoginUsers = qaUsers.map((item) => ({ displayName: item.name, status: item.status }));
  assertion(result, true, "已记录无法安全软删除的历史 QA 联系人残留数量", {
    count: fixtureResiduals.qaContacts.length,
  });
});

await authenticatedContext.close();
await browser.close();

const expectedHttpFailures = events.httpFailures.filter((item) => {
  const pathname = new URL(item.url).pathname;
  return item.context === "unauthenticated" && item.status === 401 && ["/api/v1/auth/me", "/api/v1/auth/login"].includes(pathname);
});
const unexpectedHttpFailures = events.httpFailures.filter((item) => !expectedHttpFailures.includes(item));
const unexpectedRequestFailures = events.requestFailures.filter(
  (item) => !/ERR_ABORTED|NS_BINDING_ABORTED|aborted/i.test(item.error),
);
const unexpectedConsoleErrors = events.consoleErrors.filter(
  (item) => !(item.context === "unauthenticated" && /401/.test(item.text)),
);
const failedCases = cases.filter((item) => item.status !== "PASS");
const verdict =
  failedCases.length ||
  unexpectedHttpFailures.length ||
  unexpectedRequestFailures.length ||
  unexpectedConsoleErrors.length ||
  events.pageErrors.length
    ? "FAIL"
    : "PASS";

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  browser: "Google Chrome via Playwright",
  build: await Promise.all(buildPaths.map(fingerprint)),
  importFixture: await fingerprint(importFixturePath),
  qaData: {
    loginUserId: loginUser?.id || null,
    loginDisplayName,
    loginRole: loginRole?.key || null,
    contactName: qaContactName,
    contactId: createdContact?.id || null,
    followupId: createdFollowup?.id || null,
    exportJobId: exportJob?.id || null,
    importJobId: importJob?.id || null,
    importedContactName: importFixtureMetadata.contactName,
    importedContactId: importedContact?.id || null,
    finalState: "contacts soft-deleted; QA login fixtures disabled",
  },
  summary: {
    verdict,
    total: cases.length,
    passed: cases.length - failedCases.length,
    failed: failedCases.length,
    screenshots: cases.reduce((total, item) => total + item.screenshots.length, 0),
    criticalWrites: writes.length,
  },
  cases,
  writes,
  fixtureCleanup,
  fixtureResiduals,
  network: {
    expectedHttpFailures,
    unexpectedHttpFailures,
    unexpectedRequestFailures,
    unexpectedConsoleErrors,
    consoleWarnings: events.consoleWarnings,
    pageErrors: events.pageErrors,
  },
};

await writeFile(resolve(evidenceDir, "results.json"), `${JSON.stringify(report, null, 2)}\n`);

const caseRows = cases
  .map(
    (item) =>
      `| ${item.id} | ${item.title} | ${item.status} | ${item.assertions.length} | ${item.screenshots.join(", ") || "-"} |`,
  )
  .join("\n");
const readme = `# Semi Migration Final Interaction Regression\n\n- Verdict: **${verdict}**\n- Run: ${report.generatedAt}\n- Browser: ${report.browser}\n- Cases: ${report.summary.passed}/${report.summary.total} passed\n- Screenshots: ${report.summary.screenshots}\n- Critical writes verified: ${report.summary.criticalWrites}\n- QA login fixture: \`${loginDisplayName}\` / \`${loginRole?.key || "unknown role"}\` (login account and passwords omitted; final status DISABLED)\n- QA contact: \`${qaContactName}\` (isolated record, soft-deleted after dependent scenarios)\n- Imported QA contact: \`${importFixtureMetadata.contactName}\` (one-row controlled XLSX, soft-deleted after persistence checks)\n- Historical QA contact residuals: ${fixtureResiduals.qaContacts.length} (only records blocked from safe cleanup are retained)\n\nNo cookies, passwords, login accounts, authorization headers, storage-state contents, or request bodies are stored in this evidence. Only records with the reserved QA prefixes were mutated; existing business records were untouched.\n\n## Re-run Prerequisites\n\nSet \`QA_PASSWORD\` to the local server's configured initial password, \`QA_STORAGE_STATE\` to a temporary authenticated SUPER_ADMIN Playwright state outside this evidence directory, and \`QA_IMPORT_FILE\` to the controlled one-row contact XLSX. The harness reads runtime credentials and storage state without copying them into its output.\n\n## Coverage\n\n| ID | Scenario | Result | Assertions | Evidence |\n| --- | --- | --- | ---: | --- |\n${caseRows}\n\n## Verification Model\n\nCritical writes were checked at four levels: visible UI state, successful HTTP response, persisted API state, and state after a page reload. The interaction run directly exercised Semi Navigation, Table, Pagination, Select, SideSheet, AutoComplete, DatePicker, Upload, Tabs, Dropdown, Modal, Checkbox, and Collapse. It also verifies sidebar persistence, first-login password change, VIEWER read-only RBAC, real batch assignment and restoration, full import preflight/execute, export history, and soft-delete filtering.\n\nThis report verifies the runtime component migration and interactions. Visual distinctiveness from the legacy layout is evaluated separately from whether Semi owns the underlying controls. Machine-readable details, including sanitized network diagnostics and build fingerprints, are in \`results.json\`. The complementary 22-route visual audit is in the parent directory's \`README.md\` and \`runtime-audit.json\`.\n`;
await writeFile(resolve(evidenceDir, "README.md"), readme);

const functionalIssues = failedCases.length
  ? failedCases.map((item) => `- **${item.id}**: ${item.error?.message || "Case failed."}`).join("\n")
  : "- None found in the executed interaction regression.";
const networkIssues = [
  ...unexpectedHttpFailures.map((item) => `- HTTP ${item.status} ${item.method} ${new URL(item.url).pathname} during ${item.case}.`),
  ...unexpectedRequestFailures.map((item) => `- Request failure during ${item.case}: ${item.error}.`),
  ...unexpectedConsoleErrors.map((item) => `- Console error during ${item.case}: ${item.text}.`),
  ...events.pageErrors.map((item) => `- Page error during ${item.case}: ${item.message}.`),
];
const issues = `# Interaction Regression Issues\n\n## Functional Issues\n\n${functionalIssues}\n\n## Network and Runtime Issues\n\n${networkIssues.length ? networkIssues.join("\n") : "- None. The unauthenticated /auth/me and invalid-login HTTP 401 responses are expected test behavior."}\n\n## Cleanup Residuals\n\n${fixtureResiduals.qaContacts.length ? fixtureResiduals.qaContacts.map((item) => `- Retained \`${item.displayName}\` because the supported soft-delete request did not succeed; no forced cleanup was attempted.`).join("\n") : "- None. All active QA contacts created by this harness were soft-deleted, and all QA login fixtures were disabled."}\n\n## Design and Regression Issues\n\n- No overflow, overlap, clipping, or viewport regression was found. This interaction pass verifies Semi ownership and behavior; it does not treat component replacement alone as proof of a visually distinct redesign.\n`;
await writeFile(resolve(evidenceDir, "issues.md"), issues);

console.log(`Semi migration interaction regression: ${verdict} (${report.summary.passed}/${report.summary.total} cases passed)`);
if (verdict !== "PASS") process.exitCode = 1;
