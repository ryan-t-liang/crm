import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const base = process.env.PROTOTYPE_BASE_URL || "http://127.0.0.1:4173";
const root = resolve("artifacts/prototype-qa", `${new Date().toISOString().replaceAll(":", "-")}-dashboard-v1`);
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "America/Los_Angeles" });
const page = await context.newPage();
const errors = [], requests = [], results = [], evidence = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("response", (response) => { if (response.status() >= 400) requests.push({ status: response.status(), url: response.url() }); });
page.on("requestfailed", (request) => requests.push({ url: request.url(), error: request.failure()?.errorText }));
const keys = ["kivisense-crm-prototype-v1", "kivisense-member-operations-v1"];
const read = () => page.evaluate((keys) => keys.map((key) => JSON.parse(localStorage.getItem(key))), keys);
const pass = (name, detail = "") => { results.push({ name, status: "PASS", detail }); process.stdout.write(`PASS ${name}\n`); };
async function select(label, text) {
  const control = label === "切换 Demo User" ? page.locator(".demo-user-select") : page.getByRole("combobox", { name: label, exact: true });
  await control.click(); await page.locator(".semi-select-option:visible").filter({ hasText: new RegExp(`^${text}$`) }).click();
  await control.getByText(text, { exact: true }).waitFor(); await page.waitForTimeout(100);
}
async function route(view, title) { await page.goto(`${base}/#dashboard${view ? `/${view}` : ""}`, { waitUntil: "networkidle" }); await page.getByRole("heading", { name: title, exact: true }).waitFor(); }
async function shot(name) {
  await page.waitForTimeout(200);
  const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, scrollWidth: document.querySelector(".page-scroll").scrollWidth, clientWidth: document.querySelector(".page-scroll").clientWidth }));
  assert.ok(layout.documentWidth <= layout.width + 1, `${name} document overflow`); assert.ok(layout.scrollWidth <= layout.clientWidth + 1, `${name} workspace overflow`);
  const file = resolve(root, `${name}.png`), bytes = await page.screenshot({ path: file, fullPage: true });
  evidence.push({ name, file, layout, sha256: createHash("sha256").update(bytes).digest("hex") });
}
async function drawer(label, expected, sections) {
  const button = page.getByRole("button", { name: `${label}：查看明细`, exact: true }).first();
  if (!sections) assert.equal(await button.textContent(), String(expected.length));
  await button.click();
  const sheet = page.locator(".semi-sidesheet:visible"); await sheet.waitFor();
  assert.ok((await sheet.textContent()).includes("当前角色授权范围"));
  const lists = sections || [{ label: "匹配记录", ids: expected.map((row) => row.id) }];
  for (const list of lists) {
    const section = sheet.locator(".dashboard-drilldown > section").filter({ has: page.getByRole("heading", { name: `${list.label} · ${list.ids.length} 条`, exact: true }) });
    await section.waitFor();
    const ids = [];
    if (list.ids.length) {
      while (true) {
        ids.push(...await section.locator(".dashboard-record-id").allTextContents());
        const next = section.locator(".semi-page-next");
        if (!await next.count() || await next.getAttribute("aria-disabled") === "true" || (await next.getAttribute("class"))?.includes("semi-page-item-disabled")) break;
        await next.click(); await page.waitForTimeout(80);
      }
    } else await section.getByText("当前口径没有匹配记录", { exact: true }).waitFor();
    assert.deepEqual(ids.sort(), [...list.ids].sort(), `${label} drawer ids`);
  }
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "hidden" });
}
try {
  await route("", "业务总览");
  await page.waitForFunction((keys) => keys.every((key) => localStorage.getItem(key)), keys);
  const [sales, members] = await read();
  const dateText = await page.locator(".dashboard-context").textContent(); assert.ok(dateText.includes("Asia/Shanghai")); assert.ok(dateText.includes("UTC+08"));
  assert.equal(await page.getByRole("tab").count(), 3);
  for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    for (const [view, title] of [["", "业务总览"], ["sales", "销售概览"], ["members", "会员运营概览"]]) { await route(view, title); await shot(`${view || "business"}-${width}x${height}`); }
  }
  pass("Three views, old #dashboard and desktop layout", "1440×900 / 1280×800 / 1024×768; browser timezone Los Angeles, statistics Shanghai");
  await page.setViewportSize({ width: 1280, height: 800 });
  await route("", "业务总览");
  const salesNumbers = await page.locator(".dashboard-summaries > section").first().locator(".dashboard-number").allTextContents();
  const memberNumbers = await page.locator(".dashboard-summaries > section").nth(1).locator(".dashboard-number").allTextContents();
  await select("概览品牌范围", "GP");
  assert.deepEqual(await page.locator(".dashboard-summaries > section").first().locator(".dashboard-number").allTextContents(), salesNumbers);
  const gpNumbers = await page.locator(".dashboard-summaries > section").nth(1).locator(".dashboard-number").allTextContents();
  await select("销售分销商范围", "Shanghai Partner");
  assert.deepEqual(await page.locator(".dashboard-summaries > section").nth(1).locator(".dashboard-number").allTextContents(), gpNumbers);
  const cnLeads = sales.leads.filter((row) => row.distributorId === "dist-cn");
  const rangeLabel = await page.locator(".dashboard-context").textContent();
  const start = Date.parse(`${rangeLabel.match(/创建期：(\d{4}-\d{2}-\d{2})/)[1]}T00:00:00+08:00`);
  const end = Date.parse(`${rangeLabel.match(/创建期：\d{4}-\d{2}-\d{2} — (\d{4}-\d{2}-\d{2})/)[1]}T00:00:00+08:00`) + 86_400_000;
  // Existing sales seeds have whole-second timestamps. Use the displayed fixed
  // snapshot, not wall-clock time or a start-only test expectation at LA midnight.
  const snapshotAt = Date.parse(`${rangeLabel.match(/查看时刻：(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/)[1].replace(" ", "T")}+08:00`);
  const inPeriod = (row) => { const time = Date.parse(row.createdAt); return time >= start && time < end && time <= snapshotAt; };
  const notFuture = (row) => !Number.isFinite(Date.parse(row.createdAt)) || Date.parse(row.createdAt) <= snapshotAt;
  await drawer("本期新增 Lead", cnLeads.filter(inPeriod));
  const futureLeads = cnLeads.filter((row) => Date.parse(row.createdAt) > snapshotAt);
  if (futureLeads.length) await drawer("Lead未来日期（未纳入）", futureLeads, [{ label: "匹配记录", ids: futureLeads.map((row) => row.id) }]);
  await drawer("当前进行中 Deal", sales.deals.filter((row) => row.distributorId === "dist-cn" && notFuture(row) && ["DISCOVERY", "SOLUTION", "QUOTATION", "NEGOTIATION"].includes(row.stage)));
  await drawer("当前未关联会员的意向", members.purchaseIntents.filter((row) => row.brand === "gp" && row.user_id === null));
  await drawer("当前同步异常", members.purchaseIntents.filter((row) => row.brand === "gp" && row.hq_sync_status === 0 && row.error?.trim()));
  const currentBefore = await page.getByRole("button", { name: "当前进行中 Deal：查看明细", exact: true }).first().textContent();
  await select("统计周期", "今天"); assert.equal(await page.getByRole("button", { name: "当前进行中 Deal：查看明细", exact: true }).first().textContent(), currentBefore);
  pass("Independent brand/distributor/date filters and exact snapshot drilldowns");
  await page.getByRole("tab", { name: "销售概览", exact: true }).click(); await page.getByRole("heading", { name: "销售概览", exact: true }).waitFor();
  assert.ok((await page.getByRole("combobox", { name: "统计周期" }).textContent()).includes("今天"));
  assert.ok((await page.getByRole("combobox", { name: "销售分销商范围" }).textContent()).includes("Shanghai Partner"));
  await select("统计周期", "最近 30 个自然日");
  const cohortLeads = cnLeads.filter(inPeriod);
  const numerator = cohortLeads.filter((lead) => {
    const deal = sales.deals.find((row) => row.id === lead.convertedDealId && row.distributorId === "dist-cn");
    return lead.status === "CONVERTED" && deal && notFuture(deal) && (!deal.sourceLeadId || deal.sourceLeadId === lead.id) && sales.leads.filter((row) => row.convertedDealId === deal.id).length === 1;
  });
  await drawer("新增 Lead 转 Deal 比例", [], [{ label: "分子：已确认转 Deal 的 Lead", ids: numerator.map((row) => row.id) }, { label: "分母：本期创建的全部 Lead", ids: cohortLeads.map((row) => row.id) }]);
  await page.locator(".dashboard-secondary > summary").click();
  const product = sales.products[0];
  const productDeals = sales.deals.filter((row) => row.productId === product.id && row.distributorId === "dist-cn" && inPeriod(row));
  await drawer(`${product.name} / 新增 Deal`, productDeals);
  await page.locator('circle[role="button"]').first().click(); await page.locator(".dashboard-drilldown").waitFor(); assert.ok((await page.locator(".dashboard-drilldown").textContent()).includes("分桶")); await page.keyboard.press("Escape");
  await page.locator(".dashboard-trend-details > summary").click(); const firstBin = page.locator(".dashboard-trend-details tbody tr").first(); await firstBin.locator("button").first().click(); await page.locator(".dashboard-drilldown").waitFor(); await page.keyboard.press("Escape");
  pass("Ratio numerator/denominator, product table and chart-point drilldowns; filters survive tab switch");
  await page.getByRole("tab", { name: "会员运营概览", exact: true }).click(); await page.getByRole("heading", { name: "会员运营概览", exact: true }).waitFor();
  await drawer("本品牌关联集团客户数", members.customers.filter((customer) => members.brandUsers.some((row) => row.brand === "gp" && row.is_deleted === 0 && row.customer_id === customer.id)));
  assert.equal(await page.getByRole("heading", { name: "集团品牌关系结构", exact: true }).count(), 0);
  await select("概览品牌范围", "全部授权品牌");
  await drawer("集团客户记录数", members.customers);
  await page.getByRole("heading", { name: "集团品牌关系结构", exact: true }).waitFor();
  await drawer("集团品牌关系结构 / GP + UN", members.customers.filter((row) => row.id === "customer-1001"));
  pass("Deduplicated group drilldown, shared-brand customers and single-brand intersection hidden");
  const amended = structuredClone(members);
  amended.purchaseIntents.push({ ...members.purchaseIntents[0], id: "qa-inconsistent", error: "persisted old error", hq_sync_status: 1 });
  amended.purchaseIntents.push({ ...members.purchaseIntents[0], id: "qa-whitespace", error: "  \n ", hq_sync_status: 0, hq_ref: { present: true } });
  amended.purchaseIntents.push({ ...members.purchaseIntents[0], id: "qa-cross-brand", user_id: "user-un-1001-a", hq_sync_status: 0, error: null });
  await page.evaluate(([key, value]) => localStorage.setItem(key, JSON.stringify(value)), [keys[1], amended]); await page.reload({ waitUntil: "networkidle" });
  await drawer("当前 HQ 同步状态 / 状态与错误不一致 / 待核验", amended.purchaseIntents.filter((row) => row.hq_sync_status === 1 && row.error?.trim()));
  await drawer("当前 HQ 同步状态 / 未同步", amended.purchaseIntents.filter((row) => row.hq_sync_status === 0 && !row.error?.trim()));
  await drawer("当前关联待核验意向", amended.purchaseIntents.filter((row) => row.id === "qa-cross-brand"));
  await shot("members-hq-and-association-edge-cases"); pass("HQ 0/1 error combinations and cross-brand association classification");
  await select("统计周期", "自定义日期"); await page.getByText("请选择完整的开始日期和结束日期。", { exact: true }).waitFor();
  await page.getByLabel("开始日期", { exact: true }).fill("2026-01-10"); await page.getByLabel("结束日期", { exact: true }).fill("2026-01-01"); await page.getByText("开始日期不能晚于结束日期。", { exact: true }).waitFor();
  await page.getByLabel("开始日期", { exact: true }).fill("2099-01-01"); await page.getByLabel("结束日期", { exact: true }).fill("2099-01-02"); await page.getByText("所选日期全部在未来，暂无可统计记录。", { exact: true }).waitFor();
  await page.getByLabel("开始日期", { exact: true }).fill("2020-01-01"); await page.getByLabel("结束日期", { exact: true }).fill("2020-01-02");
  await page.getByRole("heading", { name: "所选期间暂无新增记录", exact: true }).waitFor();
  await drawer("本期新增购买意向", []); await shot("members-empty-period"); pass("Custom date validation, empty trend and empty drilldown");
  const oldSales = structuredClone(sales), oldMembers = structuredClone(members);
  oldSales.leads[0].name = "旧销售用户修改";
  oldMembers.userProfiles[0].has_watch = 0;
  oldMembers.purchaseIntents[0].name = "旧会员意向用户修改";
  oldMembers.purchaseIntents[0].hq_ref = "LEGACY-STRING-REF";
  for (const list of [oldMembers.customers, oldMembers.brandUsers, oldMembers.userProfiles, oldMembers.purchaseIntents]) for (const row of list) { delete row.created_at; delete row.updated_at; delete row.is_deleted; }
  await page.evaluate(([keys, values]) => keys.forEach((key, index) => localStorage.setItem(key, JSON.stringify(values[index]))), [keys, [oldSales, oldMembers]]);
  await page.reload({ waitUntil: "networkidle" });
  await route("members", "会员运营概览");
  assert.ok(await page.getByRole("button", { name: "新增品牌档案：查看明细", exact: true }).textContent() === "暂不可统计");
  assert.ok(await page.getByRole("button", { name: "本期新增购买意向：查看明细", exact: true }).textContent() === "暂不可统计");
  await drawer("删除状态待补", oldMembers.brandUsers, [{ label: "匹配记录", ids: oldMembers.brandUsers.map((row) => row.id) }]);
  assert.deepEqual(await read(), [oldSales, oldMembers]); await page.reload({ waitUntil: "networkidle" }); assert.deepEqual(await read(), [oldSales, oldMembers]); await shot("members-old-localstorage");
  pass("Old LocalStorage reload preserves every user edit; no timestamp/deletion backfill or reset");
  await page.goto(`${base}/#purchase-intents/intent-gp-linked`, { waitUntil: "networkidle" }); await page.getByRole("heading", { name: "旧会员意向用户修改", exact: true }).waitFor(); await page.getByText("LEGACY-STRING-REF", { exact: true }).waitFor();
  pass("Old string HQ reference remains readable in existing intent detail");
  await page.goto(`${base}/#settings`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Reset Sales Demo Data", exact: true }).click(); await page.getByRole("button", { name: "confirm", exact: true }).click();
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).leads[0].name !== "旧销售用户修改", keys[0]);
  assert.deepEqual((await read())[1], oldMembers);
  const resetSales = (await read())[0];
  await page.getByRole("button", { name: "Reset Member Demo Data", exact: true }).click(); await page.getByRole("button", { name: "confirm", exact: true }).click();
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).brandUsers.every((row) => row.is_deleted === 0), keys[1]);
  assert.deepEqual((await read())[0], resetSales); pass("Sales/member resets remain mutually isolated");
  await select("切换 Demo User", "Jason · Distributor Manager");
  await route("", "业务总览"); assert.equal(await page.getByRole("tab", { name: "会员运营概览", exact: true }).count(), 0); assert.equal(await page.getByRole("heading", { name: "会员摘要", exact: true }).count(), 0); assert.equal(await page.getByText(/Sowind/).count(), 0);
  const actor = sales.users.find((row) => row.id === "user-jason"); const hiddenLead = sales.leads.find((row) => row.distributorId !== actor.distributorId); const hiddenDeal = sales.deals.find((row) => row.distributorId !== actor.distributorId);
  for (const route of [`leads/${hiddenLead.id}`, `deals/${hiddenDeal.id}`]) { await page.goto(`${base}/#${route}`, { waitUntil: "networkidle" }); await page.getByText("记录不存在或不在当前角色授权范围", { exact: true }).waitFor(); }
  await route("members", "会员运营概览"); await page.getByText("当前角色无权查看会员运营概览", { exact: true }).waitFor(); assert.equal(await page.locator(".dashboard-number").count(), 0);
  await shot("unauthorized-member-dashboard"); pass("Role guard: hidden member stats, direct dashboard URL and sales detail URLs denied");
  assert.deepEqual(errors, []); assert.deepEqual(requests, []); pass("Console/runtime errors and failed requests", "0 / 0");
} catch (error) {
  results.push({ name: "Dashboard browser QA", status: "FAIL", detail: error.stack || String(error) }); await page.screenshot({ path: resolve(root, "FAILED.png"), fullPage: true }).catch(() => {}); throw error;
} finally {
  await writeFile(resolve(root, "results.json"), JSON.stringify({ base, completedAt: new Date().toISOString(), browser: "Chrome", timezone: "America/Los_Angeles", results, errors, requests, evidence }, null, 2));
  process.stdout.write(`Evidence ${root}\n`); await browser.close();
}
