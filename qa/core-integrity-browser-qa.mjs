import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

// Fixture writes below are confined to this fresh, disposable BrowserContext.
// No selected user browser, real data, remote deployment, or production service is used.
const base = process.env.PROTOTYPE_BASE_URL || "http://127.0.0.1:4174";
const root = resolve("artifacts/prototype-qa", `${new Date().toISOString().replaceAll(":", "-")}-core-integrity`);
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage(); page.setDefaultTimeout(12_000);
const keys = ["kivisense-crm-prototype-v1", "kivisense-member-operations-v1", "kivisense-marketing-prototype-v1"];
const results = [], evidence = [], errors = [], requests = [];
let checkpoint = "startup";
page.on("pageerror", (error) => errors.push({ checkpoint, error: error.message }));
page.on("console", (message) => { if (message.type() === "error") errors.push({ checkpoint, error: message.text() }); });
page.on("response", (response) => { if (response.status() >= 400) requests.push({ checkpoint, url: response.url(), status: response.status() }); });
page.on("requestfailed", (request) => requests.push({ checkpoint, url: request.url(), error: request.failure()?.errorText }));
const raw = () => page.evaluate((keys) => keys.map((key) => localStorage.getItem(key)), keys);
const read = async () => (await raw()).map((value) => JSON.parse(value));
async function restore(values) { await page.evaluate(({ keys, values }) => keys.forEach((key, i) => localStorage.setItem(key, values[i])), { keys, values }); await page.reload({ waitUntil: "networkidle" }); }
async function route(path, heading) { await page.goto(`${base}/#${path}`, { waitUntil: "networkidle" }); if (heading) await page.getByRole("heading", { name: heading, exact: true }).first().waitFor(); }
async function select(locator, label) { await locator.click(); await page.locator(".semi-select-option:visible").filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).click(); }
async function shot(name) {
  await page.waitForTimeout(250);
  const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth }));
  assert.ok(layout.documentWidth <= layout.width + 1, `${name}: document horizontal overflow`);
  const file = `${String(evidence.length + 1).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: resolve(root, file), fullPage: false }); evidence.push({ name, file, url: page.url(), layout });
}
function pass(name) { results.push({ name, status: "PASS" }); checkpoint = name; process.stdout.write(`PASS ${name}\n`); }
async function confirm() { await page.locator(".semi-modal:visible").last().getByRole("button", { name: "confirm", exact: true }).click(); }
async function createIntent(name, phone, country = "+86") {
  await route("purchase-intents", "品牌购买意向"); await page.getByRole("button", { name: "新建购买意向", exact: true }).click();
  const modal = page.locator(".semi-modal:visible");
  await modal.getByLabel("购买意向名字", { exact: true }).fill(name);
  await modal.getByLabel("购买意向电话号码", { exact: true }).fill(phone);
  await modal.getByLabel("购买意向国家码", { exact: true }).fill(country);
  await modal.getByLabel("购买意向产品 SKU", { exact: true }).fill("CORE-DEMO-SKU");
  await shot(`${name}-form`); await modal.getByRole("button", { name: "confirm", exact: true }).click();
  await modal.waitFor({ state: "hidden" });
  const row = (await read())[1].purchaseIntents.find((row) => row.first_name === name);
  assert.ok(row, `${name}: new intent must persist`);
  await route(`purchase-intents/${row.id}`, name); await shot(`${name}-detail`);
  await page.locator(".detail-actions .semi-select").click();
  assert.equal(await page.locator(".semi-select-option:visible").filter({ hasText: "NULL" }).count(), 0, "new SQL intent cannot select NULL has_watch");
  await page.keyboard.press("Escape");
  await page.locator(".semi-select-option:visible").first().waitFor({ state: "hidden" }); return row;
}
try {
  await route("dashboard", "业务总览"); await page.waitForFunction((keys) => keys.every((key) => localStorage.getItem(key)), keys);
  const baseline = await raw(), [sales, members] = await read();
  checkpoint = "Lead Convert lifecycle";
  await route("leads", "Leads"); await page.getByRole("button", { name: /Create Lead/ }).click();
  const sheet = page.locator(".semi-sidesheet:visible"); await sheet.getByLabel("Lead Name", { exact: true }).fill("Core Integrity Lead"); await shot("lead-create-form");
  await sheet.getByRole("button", { name: /Create Lead/ }).click(); await page.getByRole("heading", { name: "Core Integrity Lead", exact: true }).waitFor();
  const lead = (await read())[0].leads.find((row) => row.name === "Core Integrity Lead");
  assert.equal(await page.getByRole("button", { name: "Convert to Deal", exact: true }).isDisabled(), true);
  const status = page.locator(".detail-actions .semi-select").nth(1); await status.click();
  assert.equal(await page.locator(".semi-select-option:visible").filter({ hasText: "已转换" }).count(), 0);
  await page.locator(".semi-select-option:visible").filter({ hasText: /^已确认$/ }).click(); await shot("lead-qualified");
  const before = (await read())[0].deals.length;
  await page.getByRole("button", { name: "Convert to Deal", exact: true }).click(); await confirm();
  await page.getByRole("heading", { name: "Core Integrity Lead Deal", exact: true }).waitFor(); await shot("lead-converted-deal");
  const after = (await read())[0], converted = after.leads.find((row) => row.id === lead.id), deal = after.deals.find((row) => row.id === converted.convertedDealId);
  assert.equal(after.deals.length, before + 1); assert.equal(converted.status, "CONVERTED"); assert.equal(deal.sourceLeadId, lead.id); assert.equal(deal.distributorId, converted.distributorId);
  await route(`leads/${lead.id}`, "Core Integrity Lead"); assert.equal(await page.getByRole("button", { name: "Convert to Deal", exact: true }).count(), 0);
  assert.equal(await page.getByRole("combobox", { name: "Lead Status", exact: true }).count(), 0, "CONVERTED renders read-only status, not editable combobox");
  await page.reload({ waitUntil: "networkidle" }); assert.equal((await read())[0].deals.length, before + 1); await shot("lead-repeat-blocked"); pass("Sales Qualified → Convert → persisted exact links; repeat UI blocked and count unchanged");

  checkpoint = "Owner constraints";
  await route(`leads/${lead.id}`, "Core Integrity Lead"); await page.locator(".detail-actions .semi-select").first().click();
  const expectedOwners = sales.users.filter((row) => row.distributorId === lead.distributorId && row.role !== "VIEWER").map((row) => row.name);
  const detailOwners = await page.locator(".semi-select-option:visible").allTextContents();
  assert.deepEqual(detailOwners.sort(), expectedOwners.sort()); await shot("lead-detail-owner-scope"); await page.keyboard.press("Escape");
  await route("leads", "Leads"); await page.getByPlaceholder("Search Lead, Organization, Contact").fill("Core Integrity Lead");
  await page.locator(".semi-table-tbody .semi-table-row").first().locator(".semi-select").last().click();
  assert.deepEqual((await page.locator(".semi-select-option:visible").allTextContents()).sort(), expectedOwners.sort()); await page.keyboard.press("Escape");
  await route("tasks", "Tasks"); const task = (await read())[0].tasks.find((row) => row.status === "OPEN");
  const taskRow = page.locator(".semi-table-tbody .semi-table-row").filter({ hasText: task.title }).first(); await taskRow.locator(".semi-select").click();
  assert.deepEqual((await page.locator(".semi-select-option:visible").allTextContents()).sort(), sales.users.filter((row) => row.distributorId === task.distributorId && row.role !== "VIEWER").map((row) => row.name).sort()); await shot("task-owner-scope"); await page.keyboard.press("Escape"); pass("Lead List/Detail and Task owner options use each record distributor");

  checkpoint = "Deal terminal stage";
  await route(`deals/${deal.id}`, "Core Integrity Lead Deal"); await page.getByRole("button", { name: "Mark Won", exact: true }).click();
  assert.equal((await read())[0].deals.find((row) => row.id === deal.id).probability, 100);
  assert.equal(await page.getByRole("button", { name: "Mark Lost", exact: true }).isDisabled(), true); await shot("won-terminal-locked"); pass("WON probability100 and terminal stage locked");

  checkpoint = "Purchase Intent SQL matching";
  const memberFixture = structuredClone(members), target = memberFixture.brandUsers.find((row) => row.id === "user-gp-1001-a"), profile = memberFixture.userProfiles.find((row) => row.user_id === target.id);
  target.phone = "legacy-wrong"; target.country_code = "999"; profile.tel = "138 0001 2011"; profile.tel_country_code = "86";
  const prePI = await raw(); prePI[1] = JSON.stringify(memberFixture); await restore(prePI);
  const salesBeforePI = (await raw())[0], marketingBeforePI = (await raw())[2];
  const linked = await createIntent("Core-Linked", "13800012011", "0086"); assert.equal(linked.user_id, target.id); assert.equal(linked.tel, "13800012011"); assert.equal(linked.product_sku, "CORE-DEMO-SKU");
  const unlinked = await createIntent("Core-Unlinked", "18899990001"); assert.equal(unlinked.user_id, null);
  const ambiguous = await createIntent("Core-Ambiguous", "13900012022"); assert.equal(ambiguous.user_id, null); assert.equal(ambiguous.error, null);
  assert.equal((await raw())[0], salesBeforePI); assert.equal((await raw())[2], marketingBeforePI); pass("PI creation: SQL profile phone precedence; unique linked, unknown/ambiguous null; Sales/Marketing untouched");

  const beforeLegacy = await raw(), legacy = JSON.parse(beforeLegacy[1]).purchaseIntents.find((row) => row.has_watch === null);
  assert.ok(legacy, "historical NULL fixture exists");
  await route(`purchase-intents/${legacy.id}`, legacy.name); assert.equal((await raw())[1], beforeLegacy[1]);
  const legacyWatch = page.locator(".detail-actions .semi-select");
  await legacyWatch.click();
  const nullOption = page.locator(".semi-select-option:visible").filter({ hasText: "NULL" });
  if (await nullOption.count()) assert.equal(await nullOption.getAttribute("aria-disabled"), "true");
  await page.locator(".semi-select-option:visible").filter({ hasText: /^0 · 未选择$/ }).click();
  await page.waitForFunction(({ key, id }) => JSON.parse(localStorage.getItem(key)).purchaseIntents.find((row) => row.id === id)?.has_watch === 0, { key: keys[1], id: legacy.id });
  assert.equal((await read())[1].purchaseIntents.find((row) => row.id === legacy.id).has_watch, 0);
  assert.equal((await raw())[0], beforeLegacy[0]); assert.equal((await raw())[2], beforeLegacy[2]); await shot("legacy-intent-null-explicit-valid-edit");
  pass("Intent SQL NOT NULL edit: new NULL choice absent; historical NULL preserved until explicit valid edit");

  checkpoint = "Role scope";
  await route("settings", "Prototype Settings"); assert.equal(await page.getByRole("button", { name: /^Reset .* Demo Data$/ }).count(), 2);
  await page.getByRole("button", { name: "Reset Sales Demo Data", exact: true }).click(); await page.getByText("此操作会清除当前浏览器中的 Sales Demo 数据并恢复初始数据。会员和营销数据不会受影响。", { exact: true }).waitFor(); await shot("admin-reset-confirmation"); await page.getByRole("button", { name: "cancel", exact: true }).click();
  const distributor = sales.users.find((row) => row.role === "DISTRIBUTOR_SALES" && row.distributorId !== lead.distributorId);
  await select(page.locator(".demo-user-select"), `${distributor.name} · ${distributor.title}`);
  await page.waitForFunction(({ key, id }) => JSON.parse(localStorage.getItem(key)).currentUserId === id, { key: keys[0], id: distributor.id });
  await page.getByRole("button", { name: "Reset Sales Demo Data", exact: true }).waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("button", { name: /^Reset .* Demo Data$/ }).count(), 0);
  await route(`leads/${lead.id}`); await page.getByText("记录不存在或不在当前角色授权范围", { exact: true }).waitFor(); await shot("distributor-cross-scope-denied");
  const own = (await read())[0].leads.find((row) => row.distributorId === distributor.distributorId && row.status !== "CONVERTED"); await route(`leads/${own.id}`, own.name); assert.equal(await page.getByRole("button", { name: "Convert to Deal", exact: true }).isDisabled(), own.status !== "QUALIFIED");
  const viewerFixture = await raw(), viewerSales = JSON.parse(viewerFixture[0]); viewerSales.users.push({ ...distributor, id: "qa-viewer", name: "QA Viewer", role: "VIEWER", title: "QA read-only fixture" }); viewerSales.currentUserId = "qa-viewer"; viewerFixture[0] = JSON.stringify(viewerSales); await restore(viewerFixture);
  await route("settings", "Prototype Settings"); assert.equal(await page.getByRole("button", { name: /^Reset .* Demo Data$/ }).count(), 0);
  await route(`leads/${own.id}`, own.name); assert.equal(await page.getByRole("button", { name: "Convert to Deal", exact: true }).isDisabled(), true); assert.equal(await page.locator(".detail-actions .semi-select").first().getAttribute("aria-disabled"), "true");
  await route("tasks", "Tasks"); assert.equal(await page.getByRole("button", { name: "Create Task", exact: true }).count(), 0); await shot("viewer-readonly-tasks"); pass("Admin confirmation, Distributor reset hidden/cross-scope denied, isolated Viewer fixture read-only");

  checkpoint = "Storage corruption recovery";
  for (const index of [0, 1]) {
    await restore(baseline); const beforeCorrupt = await raw(), damaged = `${index ? "Member" : "Sales"}-broken-{`;
    await page.evaluate(({ key, damaged }) => localStorage.setItem(key, damaged), { key: keys[index], damaged }); await route(index ? "brand-members" : "leads"); await page.reload({ waitUntil: "networkidle" });
    await page.getByText(`${index ? "Member" : "Sales"} 数据无法读取，原始数据已保留。`, { exact: true }).waitFor(); await shot(`${index ? "member" : "sales"}-corruption-preserved`); assert.equal((await raw())[index], damaged);
    await page.reload({ waitUntil: "networkidle" }); assert.equal((await raw())[index], damaged);
    await route("settings", "Prototype Settings"); await page.getByRole("button", { name: `Reset ${index ? "Member" : "Sales"} Demo Data`, exact: true }).click(); await confirm();
    const afterReset = await raw(); assert.equal(JSON.parse(afterReset[index]).version, index ? 2 : 1); assert.equal(afterReset[1 - index], beforeCorrupt[1 - index]); assert.equal(afterReset[2], beforeCorrupt[2]); await shot(`${index ? "member" : "sales"}-explicit-reset-recovered`);
  }
  pass("Sales/Member damaged raw survive refresh; only confirmed HQ reset recovers its own key");
  for (const index of [0, 1]) {
    await restore(baseline); const future = '{"version":999,"userModified":"keep"}'; await page.evaluate(({ key, future }) => localStorage.setItem(key, future), { key: keys[index], future }); await route(index ? "purchase-intents" : "deals"); await page.reload({ waitUntil: "networkidle" });
    await page.getByText(`${index ? "Member" : "Sales"} 数据版本不兼容，原始数据已保留。`, { exact: true }).waitFor(); assert.equal((await raw())[index], future); await shot(`${index ? "member" : "sales"}-future-version-preserved`);
  }
  pass("Unknown Sales/Member versions are not overwritten");
  for (const [kind, path, label] of [["lead", `leads/${sales.leads[0].id}`, "Lead 关联资料缺失，待核验"], ["deal", `deals/${sales.deals[0].id}`, "Deal 关联资料缺失，待核验"], ["contact", `contacts/${sales.contacts[0].id}`, "联系人关联组织缺失，待核验"]]) {
    const fixture = structuredClone(sales);
    if (kind === "lead") fixture.leads[0].organizationId = "missing-org";
    else if (kind === "deal") fixture.deals[0].productId = "missing-product";
    else fixture.contacts[0].organizationId = "missing-org";
    const values = [...baseline]; values[0] = JSON.stringify(fixture); await restore(values); await route(path);
    await page.getByText(label, { exact: true }).waitFor(); assert.equal((await raw())[0], values[0]); await shot(`${kind}-missing-relation-preserved`);
  }
  const invalidDate = structuredClone(sales); invalidDate.leads[0].createdAt = "invalid legacy date"; invalidDate.leads[0].lastActivityAt = "invalid legacy date";
  const oldDates = [...baseline]; oldDates[0] = JSON.stringify(invalidDate); await restore(oldDates); await route(`leads/${invalidDate.leads[0].id}`, invalidDate.leads[0].name); assert.equal((await raw())[0], oldDates[0]); await shot("invalid-legacy-dates-readable");
  pass("Missing Lead/Deal/Contact relations and invalid legacy dates remain readable without rewriting records");
  await restore(baseline);
  for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    for (const [path, title] of [["dashboard", "业务总览"], ["dashboard/sales", "销售概览"], ["dashboard/members", "会员运营概览"]]) { await route(path, title); await shot(`${path.replaceAll("/", "-")}-${width}`); }
  }
  pass("All three Dashboard views retain desktop layouts at1440/1280/1024");
  assert.deepEqual(errors, []); assert.deepEqual(requests, []); pass("Console/page errors and failed requests:0/0");
} catch (error) {
  results.push({ name: checkpoint, status: "FAIL", error: error.stack || String(error) }); await page.screenshot({ path: resolve(root, "FAILED.png") }).catch(() => {}); throw error;
} finally {
  await writeFile(resolve(root, "results.json"), JSON.stringify({ base, completedAt: new Date().toISOString(), results, errors, requests, evidence }, null, 2));
  await writeFile(resolve(root, "00-evidence.md"), [`# Core Integrity browser evidence`, ``, `Target: ${base}. Fresh isolated Chrome context; fixtures are fictional.`, ``, ...results.map((row) => `- ${row.status}: ${row.name}`), ``, ...evidence.flatMap((row, index) => [`## Step ${index + 1}: ${row.name}`, ``, `URL: ${row.url} · ${row.layout.width}×${row.layout.height}`, ``, `![${row.name}](./${row.file})`, ``])].join("\n"));
  await writeFile(resolve(root, "01-issues.md"), `# Issues\n\n## Functional issues\n\n${results.filter((row) => row.status === "FAIL").map((row) => `- S2 ${row.name}: ${row.error}`).join("\n") || "None observed in completed checks."}\n\n## Design consistency issues\n\nDocument-overflow assertions and screenshots cover touched screens; no full visual redesign acceptance is claimed.\n\n## Coverage gaps\n\nNo production/backend/concurrency/HQ/WeChat tests; no Firefox/Safari/mobile.\n`);
  await browser.close(); process.stdout.write(`Evidence: ${root}\n`);
}
