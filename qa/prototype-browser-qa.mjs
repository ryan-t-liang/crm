import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
const base = process.env.PROTOTYPE_BASE_URL || "http://127.0.0.1:4173";
const root = resolve("artifacts/prototype-qa", `${new Date().toISOString().replaceAll(":", "-")}-sales-regression`);
const screenshots = resolve(root, "screenshots");
await mkdir(screenshots, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = []; const failedResponses = []; const results = []; const evidence = [];
let currentCheckpoint = "Browser startup";
await page.addInitScript(() => {
  window.addEventListener("error", (event) => {
    if (event.message?.includes("ResizeObserver")) console.error(`[window-error] ${event.message}`);
  }, true);
});
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(`${currentCheckpoint}: ${message.text()}`); });
page.on("response", (response) => { if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() }); });
page.on("requestfailed", (request) => failedResponses.push({ status: 0, url: request.url(), error: request.failure()?.errorText }));

function pass(name, detail = "") { results.push({ name, status: "PASS", detail }); currentCheckpoint = name; process.stdout.write(`PASS ${name}\n`); }
async function shot(name) {
  await page.waitForTimeout(name.startsWith("dashboard") ? 1800 : 250);
  const dimensions = await page.evaluate(() => ({ viewport: [innerWidth, innerHeight], documentWidth: document.documentElement.scrollWidth, overflowX: document.documentElement.scrollWidth > innerWidth + 1 }));
  assert.equal(dimensions.overflowX, false, `${name} has document horizontal overflow`);
  const path = resolve(screenshots, `${String(evidence.length + 1).padStart(2, "0")}-${name}.png`);
  const bytes = await page.screenshot({ path, fullPage: true });
  evidence.push({ name, file: path.slice(resolve(".").length + 1), dimensions, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
async function route(hash, heading) {
  await page.goto(`${base}/#${hash}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: heading, exact: true }).first().waitFor();
}
async function selectSemi(locator, option) {
  await locator.click();
  await page.locator(".semi-select-option:visible").filter({ hasText: option }).click();
}

try {
  await page.goto(`${base}/#dashboard`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "业务总览", exact: true }).waitFor();
  assert.equal(await page.getByText("全部授权分销商", { exact: true }).count(), 1);
  const userMenuLayout = await page.evaluate(() => {
    const topbar = document.querySelector(".topbar")?.getBoundingClientRect();
    const menu = document.querySelector(".user-menu")?.getBoundingClientRect();
    const avatar = document.querySelector(".user-menu .semi-avatar")?.getBoundingClientRect();
    const copy = document.querySelector(".user-menu-copy")?.getBoundingClientRect();
    return topbar && menu && avatar && copy ? { topbar: { top: topbar.top, bottom: topbar.bottom }, menu: { top: menu.top, bottom: menu.bottom }, avatarCenter: avatar.top + avatar.height / 2, copyCenter: copy.top + copy.height / 2 } : null;
  });
  assert.ok(userMenuLayout);
  assert.ok(userMenuLayout.menu.top >= userMenuLayout.topbar.top && userMenuLayout.menu.bottom <= userMenuLayout.topbar.bottom, "Demo User menu must stay inside the topbar");
  assert.ok(Math.abs(userMenuLayout.avatarCenter - userMenuLayout.copyCenter) <= 2, "Demo User avatar and copy must align on one row");
  pass("Topbar Demo User menu stays aligned");
  await shot("dashboard-hq-1440x900"); pass("HQ dashboard and distributor filter");

  const routeChecks = [["leads", "Leads"], ["deals", "Deals"], ["contacts", "Contacts"], ["organizations", "Organizations"], ["member-customers", "集团客户"], ["brand-members", "品牌会员"], ["purchase-intents", "品牌购买意向"], ["products", "Products"], ["tasks", "Tasks"], ["distributors", "Distributors"], ["users", "Users"], ["settings", "Prototype Settings"]];
  for (const [hash, heading] of routeChecks) { await route(hash, heading); await shot(`${hash}-1440x900`); }
  pass("All primary routes render at 1440x900", `${routeChecks.length + 1} routes`);

  await page.waitForFunction(() => Boolean(localStorage.getItem("kivisense-crm-prototype-v1") && localStorage.getItem("kivisense-member-operations-v1")));
  const salesBeforeMemberOperations = await page.evaluate(() => localStorage.getItem("kivisense-crm-prototype-v1"));
  await route("member-customers", "集团客户");
  await page.getByRole("link", { name: "customer-1001", exact: true }).click();
  await page.getByRole("heading", { name: "customer-1001", exact: true }).waitFor();
  await page.getByRole("tab", { name: "品牌用户", exact: true }).click();
  assert.equal(await page.locator(".member-profile-card").count(), 2);
  await page.locator(".member-profile-card").filter({ hasText: "user-gp-1001-a" }).click();
  await page.getByRole("heading", { name: "gp · user-gp-1001-a", exact: true }).waitFor();
  await page.getByRole("tab", { name: "品牌用户资料", exact: true }).click();
  const intentSnapshotBeforeProfileEdit = await page.evaluate(() => JSON.parse(localStorage.getItem("kivisense-member-operations-v1") || "{}").purchaseIntents?.find((item) => item.id === "intent-gp-linked"));
  await selectSemi(page.locator(".data-panel .page-actions .semi-select"), "0 · 否");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("kivisense-member-operations-v1") || "{}").userProfiles?.find((item) => item.id === "profile-gp-1001-a")?.has_watch === 0);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("kivisense-member-operations-v1") || "{}").purchaseIntents?.find((item) => item.id === "intent-gp-linked")), intentSnapshotBeforeProfileEdit);
  await page.getByRole("tab", { name: "购买意向", exact: true }).click();
  await page.getByRole("link", { name: /王婧怡（Demo）/ }).click();
  await page.getByRole("heading", { name: "王婧怡（Demo）", exact: true }).waitFor();
  await selectSemi(page.locator(".detail-actions .semi-select"), "2 · 否");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("kivisense-member-operations-v1") || "{}").purchaseIntents?.find((item) => item.id === "intent-gp-linked")?.has_watch === 2);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("kivisense-member-operations-v1") || "{}").userProfiles?.find((item) => item.id === "profile-gp-1001-a")?.has_watch), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem("kivisense-crm-prototype-v1")), salesBeforeMemberOperations);
  pass("customer → user + user_profile → user_purchase_intent path and isolated persistence"); await shot("member-purchase-intent-detail");

  await route("settings", "Prototype Settings");
  await page.getByRole("button", { name: "Reset Member Demo Data", exact: true }).click();
  await page.getByRole("button", { name: "confirm", exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("kivisense-member-operations-v1") || "{}").purchaseIntents?.find((item) => item.id === "intent-gp-linked")?.has_watch === 1);
  assert.equal(await page.evaluate(() => localStorage.getItem("kivisense-crm-prototype-v1")), salesBeforeMemberOperations);
  pass("Member reset preserves Sales LocalStorage");

  await route("purchase-intents", "品牌购买意向");
  assert.ok(await page.getByText("未关联（NULL）", { exact: true }).count() > 0);
  await selectSemi(page.locator(".page-actions .semi-select"), "Ulysse Nardin");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("kivisense-member-operations-v1") || "{}").brandScope === "un");
  assert.equal(await page.locator(".data-surface .semi-tag").filter({ hasText: /^gp$/ }).count(), 0);
  await selectSemi(page.locator(".page-actions .semi-select"), "全部品牌");
  pass("Brand scope and unlinked Purchase Intent behavior"); await shot("purchase-intents-brand-scope");

  await route("leads", "Leads");
  await page.getByRole("button", { name: /Create Lead/ }).click();
  const sheet = page.getByRole("dialog").filter({ hasText: "Create Lead" });
  await sheet.getByLabel("Lead Name", { exact: true }).fill("L'Oréal Interactive Beauty Launch");
  await sheet.getByRole("button", { name: /Create Lead/ }).click();
  await page.getByRole("heading", { name: "L'Oréal Interactive Beauty Launch", exact: true }).waitFor();
  pass("Create Lead and navigate to detail"); await shot("lead-created-detail");

  await selectSemi(page.locator(".detail-actions .semi-select").nth(1), "已确认");
  const convert = page.getByRole("button", { name: "Convert to Deal", exact: true });
  await convert.waitFor();
  await page.waitForTimeout(250);
  assert.equal(await convert.isEnabled(), true);
  await convert.click();
  await page.getByText("Convert Lead to Deal", { exact: true }).waitFor();
  await page.getByRole("button", { name: "confirm", exact: true }).click();
  await page.getByRole("heading", { name: "L'Oréal Interactive Beauty Launch Deal", exact: true }).waitFor();
  assert.ok((await page.evaluate(() => JSON.parse(localStorage.getItem("kivisense-crm-prototype-v1") || "{}").deals.length)) >= 25);
  pass("Qualified Lead converts to Deal and persists"); await shot("converted-deal-detail");

  await selectSemi(page.locator(".detail-sidebar .side-field .semi-select").nth(0), "Kiviview");
  await selectSemi(page.locator(".detail-sidebar .side-field .semi-select").nth(1), "Image AR");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => { const state = JSON.parse(localStorage.getItem("kivisense-crm-prototype-v1") || "{}"); const deal = state.deals.find((item) => item.name === "L'Oréal Interactive Beauty Launch Deal"); return deal?.productId === "product-kiviview" && deal.capabilityIds.includes("cap-1"); });
  pass("Deal Product and Add-ons update");

  currentCheckpoint = "Open Emails tab";
  await page.getByRole("tab", { name: "Emails", exact: true }).click();
  currentCheckpoint = "Open New Email dialog";
  await page.getByRole("button", { name: /New Email/ }).click();
  const email = page.getByRole("dialog").filter({ hasText: "New Email" });
  currentCheckpoint = "Fill New Email dialog";
  await email.getByLabel("TO", { exact: true }).fill("buyer@example.com");
  await email.getByLabel("Body", { exact: true }).fill("Thanks for the discovery session. Here is the agreed next step.");
  currentCheckpoint = "Submit New Email dialog";
  await page.getByRole("button", { name: "confirm", exact: true }).click();
  await page.locator(".email-thread p").getByText("Thanks for the discovery session. Here is the agreed next step.", { exact: true }).waitFor();
  pass("Mock email compose and send");

  await page.getByRole("tab", { name: "Comments", exact: true }).click();
  await page.getByPlaceholder(/添加内部评论/).fill("@Jason Please confirm the demo agenda.");
  await page.getByRole("button", { name: "发布评论", exact: true }).click();
  await page.getByLabel("Comments").getByText("@Jason Please confirm the demo agenda.", { exact: true }).waitFor(); pass("Internal comment and Activity linkage");

  await page.getByRole("tab", { name: "Calls", exact: true }).click(); await page.getByRole("button", { name: /Add Call/ }).click();
  const call = page.getByRole("dialog").filter({ hasText: "Add Call" }); await call.getByLabel("Summary", { exact: true }).fill("Discovery call completed"); await call.getByLabel("Next Action", { exact: true }).fill("Prepare focused demo"); await page.getByRole("button", { name: "confirm", exact: true }).click(); await page.locator(".record-list p").getByText("Discovery call completed", { exact: true }).waitFor(); pass("Call logging");

  await page.getByRole("tab", { name: "Tasks", exact: true }).click(); await page.getByRole("button", { name: /Create Task/ }).click();
  const task = page.getByRole("dialog").filter({ hasText: "Create Task" }); await task.getByLabel("Title", { exact: true }).fill("Prepare prototype walkthrough"); await page.getByRole("button", { name: "confirm", exact: true }).click(); await page.locator(".task-list strong").getByText("Prepare prototype walkthrough", { exact: true }).waitFor(); pass("Task create");
  const createdTask = page.locator(".task-list article").filter({ hasText: "Prepare prototype walkthrough" }); await createdTask.getByRole("button", { name: "Complete", exact: true }).click(); await page.getByRole("tab", { name: "Activity", exact: true }).click(); await page.getByLabel("Activity").getByText("Task completed", { exact: true }).waitFor(); pass("Task completion and Activity linkage");

  await page.getByRole("tab", { name: "Notes", exact: true }).click(); await page.getByPlaceholder("Note title").fill("Discovery summary"); await page.getByPlaceholder("Write a note…").fill("Customer prioritizes Image AR and Cloud Recognition."); await page.getByRole("button", { name: "Save Note", exact: true }).click(); await page.getByLabel("Notes").getByText("Discovery summary", { exact: true }).waitFor(); pass("Note create");

  await page.getByRole("tab", { name: "Attachments", exact: true }).click(); await page.locator('input[type="file"]').first().setInputFiles({ name: "demo-brief.pdf", mimeType: "application/pdf", buffer: Buffer.from("mock pdf") }); await page.getByLabel("Attachments").getByText("demo-brief.pdf", { exact: true }).waitFor(); pass("Attachment upload and mock actions");
  await page.reload({ waitUntil: "networkidle" }); await page.getByRole("heading", { name: "L'Oréal Interactive Beauty Launch Deal", exact: true }).waitFor(); pass("LocalStorage survives refresh");
  await page.getByRole("button", { name: "Mark Won", exact: true }).click();
  await page.waitForFunction(() => { const state = JSON.parse(localStorage.getItem("kivisense-crm-prototype-v1") || "{}"); return state.deals.find((item) => item.name === "L'Oréal Interactive Beauty Launch Deal")?.stage === "WON"; });
  pass("Mark Deal Won and persist stage");
  assert.equal(await page.getByRole("button", { name: "Mark Lost", exact: true }).isDisabled(), true, "WON is terminal; ordinary Mark Lost cannot reopen/replace it");
  const otherOpenDeal = await page.evaluate(() => JSON.parse(localStorage.getItem("kivisense-crm-prototype-v1")).deals.find((row) => ["DISCOVERY", "SOLUTION", "QUOTATION", "NEGOTIATION"].includes(row.stage)));
  assert.ok(otherOpenDeal, "Use a separate open Deal for LOST acceptance; never weaken terminal lock");
  await route(`deals/${otherOpenDeal.id}`, otherOpenDeal.name);
  await page.getByRole("button", { name: "Mark Lost", exact: true }).click();
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem("kivisense-crm-prototype-v1")).deals.find((row) => row.id === id)?.stage === "LOST", otherOpenDeal.id);
  assert.equal(await page.evaluate((id) => JSON.parse(localStorage.getItem("kivisense-crm-prototype-v1")).deals.find((row) => row.id === id).probability, otherOpenDeal.id), 0);
  pass("Mark a separate open Deal Lost; WON remains terminal and LOST probability is zero");

  await route("deals", "Deals"); await page.getByText("Kanban", { exact: true }).click(); await page.getByLabel("Deal Pipeline").waitFor(); const card = page.locator(".deal-card").first(); const destination = page.locator(".kanban-column").nth(1); const draggedId = (await card.locator("a").getAttribute("href")).split("/").at(-1); await card.dragTo(destination, { sourcePosition: { x: 20, y: 110 }, targetPosition: { x: 50, y: 50 } }); await page.waitForFunction((id) => JSON.parse(localStorage.getItem("kivisense-crm-prototype-v1")).deals.find((row) => row.id === id)?.stage === "SOLUTION", draggedId); pass("Deal Kanban drag changes stage"); await shot("deal-kanban-1440x900");

  await route("contacts/contact-1", "Bob Martinez");
  await page.getByRole("tab", { name: "Notes", exact: true }).click(); await page.getByPlaceholder("Note title").fill("Buying committee"); await page.getByPlaceholder("Write a note…").fill("Digital commerce and innovation teams are aligned."); await page.getByRole("button", { name: "Save Note", exact: true }).click(); await page.getByLabel("Notes").getByText("Buying committee", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Attachments", exact: true }).click(); await page.getByLabel("Attachments").locator('input[type="file"]').first().setInputFiles({ name: "contact-brief.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("mock docx") }); await page.getByLabel("Attachments").getByText("contact-brief.docx", { exact: true }).waitFor(); pass("Contact notes and attachments");

  await route("products/product-kivicube", "Kivicube");
  await page.getByRole("button", { name: "Edit Product", exact: true }).click(); const productDialog = page.getByRole("dialog").filter({ hasText: "Edit Product" }); await productDialog.getByLabel("Product Description", { exact: true }).fill("Enterprise WebAR creation, publishing, and campaign operations platform."); await page.getByRole("button", { name: "confirm", exact: true }).click(); await page.locator(".detail-title p").getByText("Enterprise WebAR creation, publishing, and campaign operations platform.", { exact: true }).waitFor();
  await page.getByLabel("New Add-on", { exact: true }).fill("Spatial Audio"); await page.getByRole("button", { name: /Add/ }).click(); await page.getByText("Spatial Audio", { exact: true }).waitFor(); pass("HQ Product edit and Add-on management");

  const userSelect = page.locator(".demo-user-select");
  await selectSemi(userSelect, "Jason · Distributor Manager");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("kivisense-crm-prototype-v1") || "{}").currentUserId === "user-jason");
  await route("products/product-kivicube", "Kivicube"); assert.equal(await page.getByRole("button", { name: "Edit Product", exact: true }).count(), 0); assert.equal(await page.getByLabel("New Add-on", { exact: true }).count(), 0); pass("Distributor Product catalog is read-only");
  await page.goto(`${base}/#member-customers`, { waitUntil: "networkidle" });
  await page.getByText("当前 Demo User 无权访问 HQ 工作区", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /集团客户/ }).count(), 0);
  pass("Distributor role cannot enter member operations workspace");
  await route("dashboard", "业务总览");
  assert.equal(await page.getByText("全部授权分销商", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: /分销商/ }).count(), 0);
  const scopedLeadCount = await page.evaluate(() => { const state = JSON.parse(localStorage.getItem("kivisense-crm-prototype-v1") || "{}"); const user = state.users.find((item) => item.id === state.currentUserId); return state.leads.filter((item) => item.distributorId === user.distributorId).length; });
  assert.ok(scopedLeadCount > 0 && scopedLeadCount < 36);
  pass("Distributor role changes navigation and data scope", `${scopedLeadCount} Leads`); await shot("dashboard-distributor-1440x900");

  await selectSemi(page.locator(".demo-user-select"), "Ryan · Kivisense Super Admin");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("kivisense-crm-prototype-v1") || "{}").currentUserId === "user-ryan");
  for (const [width, height] of [[1600, 900], [1920, 1080], [1024, 768]]) { await page.setViewportSize({ width, height }); for (const [hash, heading] of [["dashboard", "业务总览"], ["leads", "Leads"], ["deals", "Deals"]]) { await route(hash, heading); await shot(`${hash}-${width}x${height}`); } }
  for (const [hash, heading] of [["member-customers", "集团客户"], ["brand-members", "品牌会员"], ["purchase-intents", "品牌购买意向"]]) { await route(hash, heading); await shot(`${hash}-1024x768`); }
  pass("Responsive desktop layouts", "Sales at 1600x900, 1920x1080, 1024x768; member workspace at 1440x900 and 1024x768");
  assert.deepEqual(consoleErrors, []); assert.deepEqual(failedResponses, []); pass("Console errors and failed requests", "0 / 0");
} catch (error) {
  results.push({ name: "Browser QA", status: "FAIL", detail: error instanceof Error ? error.stack : String(error) });
  await page.screenshot({ path: resolve(screenshots, "FAILED.png"), fullPage: true }).catch(() => undefined);
  throw error;
} finally {
  const summary = { completedAt: new Date().toISOString(), base, results, consoleErrors, failedResponses, evidence };
  await writeFile(resolve(root, "results.json"), JSON.stringify(summary, null, 2) + "\n");
  await writeFile(resolve(root, "00-index.md"), [`# Kivisense CRM Prototype Browser QA`, ``, `- Target: ${base}`, `- Browser: Chrome / Chromium`, `- Console errors: ${consoleErrors.length}`, `- Failed requests: ${failedResponses.length}`, ``, `## Results`, ``, ...results.map((item) => `- ${item.status}: ${item.name}${item.detail ? ` — ${item.detail}` : ""}`), ``, `## Screenshots`, ``, ...evidence.map((item) => `- ${item.name}: ${item.file} (${item.dimensions.viewport.join("x")})`), ``].join("\n"));
  await browser.close();
}
