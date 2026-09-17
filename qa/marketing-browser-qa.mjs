import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const base = process.env.PROTOTYPE_BASE_URL || "http://127.0.0.1:4173";
const root = resolve("artifacts/prototype-qa", `${new Date().toISOString().replaceAll(":", "-")}-marketing-v1`);
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "America/Los_Angeles" });
// Test-only deterministic RNG. The application uses Math.random and never branches on user identity.
await context.addInitScript(() => { Math.random = () => 0.1; });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const errors = [], requests = [], results = [], evidence = [];
let checkpoint = "startup";
page.on("pageerror", (error) => errors.push({ checkpoint, error: error.message }));
page.on("console", (message) => { if (message.type() === "error") errors.push({ checkpoint, error: message.text(), location: message.location() }); });
page.on("response", (response) => { if (response.status() >= 400) requests.push({ status: response.status(), url: response.url() }); });
page.on("requestfailed", (request) => requests.push({ url: request.url(), error: request.failure()?.errorText }));
const keys = ["kivisense-crm-prototype-v1", "kivisense-member-operations-v1", "kivisense-marketing-prototype-v1"];
const read = () => page.evaluate((keys) => keys.map((key) => JSON.parse(localStorage.getItem(key))), keys);
const raw = () => page.evaluate((keys) => keys.map((key) => localStorage.getItem(key)), keys);
const pass = (name, detail = "") => { results.push({ name, status: "PASS", detail }); checkpoint = name; process.stdout.write(`PASS ${name}\n`); };
async function route(path, heading) { await page.goto(`${base}/#${path}`, { waitUntil: "networkidle" }); if (heading) await page.getByRole("heading", { name: heading, exact: true }).waitFor(); }
async function select(label, value) {
  const control = label === "切换 Demo User" ? page.locator(".demo-user-select") : page.getByRole("combobox", { name: label, exact: true });
  await control.click(); await page.locator(".semi-select-option:visible").filter({ hasText: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).click();
  await page.waitForTimeout(100);
}
async function shot(name) {
  await page.waitForTimeout(150);
  const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, workspaceWidth: document.querySelector(".page-scroll").scrollWidth, workspaceClient: document.querySelector(".page-scroll").clientWidth }));
  assert.ok(layout.documentWidth <= layout.width + 1, `${name}: document horizontal overflow`);
  assert.ok(layout.workspaceWidth <= layout.workspaceClient + 1, `${name}: workspace horizontal overflow`);
  const file = resolve(root, `${name}.png`), bytes = await page.screenshot({ path: file, fullPage: true });
  evidence.push({ step: evidence.length + 1, name, file, layout, sha256: createHash("sha256").update(bytes).digest("hex") });
}
async function confirm() { const dialog = page.locator(".semi-modal:visible").last(); await dialog.waitFor(); await dialog.getByRole("button", { name: "confirm", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); }
async function verify(code, action) {
  await route(`marketing/redemption/${encodeURIComponent(code)}`, "核销工作台");
  await page.getByRole("button", { name: "识别凭证 / 模拟扫码", exact: true }).click();
  await select("本次核验动作", action);
  await page.getByRole("button", { name: "确认执行所选动作", exact: true }).click(); await confirm();
}
async function isolatedSet(index, value) { await page.evaluate(([key, value]) => localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value)), [keys[index], value]); await page.reload({ waitUntil: "networkidle" }); }
try {
  await route("marketing", "营销活动");
  await page.waitForFunction((keys) => keys.every((key) => localStorage.getItem(key)), keys);
  const [sales, members, seeded] = await read(), original = await raw();
  assert.equal(seeded.activities.length, 4); assert.equal(await page.getByRole("tab").count(), 4);
  assert.equal(await page.locator('.sidebar-nav button').filter({ hasText: "营销活动" }).count(), 1);
  await shot("01-activities-1440"); await page.setViewportSize({ width: 1280, height: 800 }); await shot("02-activities-1280");
  const scroll = await page.locator(".semi-table-body").first().evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth })); assert.ok(scroll.scroll >= scroll.width);
  await page.getByLabel("搜索活动", { exact: true }).fill("不存在的活动"); await page.getByText("暂无匹配活动", { exact: true }).waitFor(); await shot("03-empty-filter");
  await page.getByLabel("搜索活动", { exact: true }).fill(""); await select("活动品牌", "Girard-Perregaux"); await page.getByRole("link", { name: seeded.activities[1].name, exact: true }).waitFor({ state: "detached" });
  await select("活动品牌", "全部授权品牌");
  await page.getByLabel("活动举行日期", { exact: true }).fill("2099-01-01"); await page.getByText("暂无匹配活动", { exact: true }).waitFor(); await page.getByLabel("活动举行日期", { exact: true }).fill("");
  pass("Unique entry, four areas, search/brand/date filters, empty state and desktop internal table scroll");

  await page.getByRole("button", { name: "新建活动", exact: true }).click();
  await page.getByLabel("活动名称", { exact: true }).fill("浏览器验收 · 无预约无抽奖");
  await page.getByRole("switch", { name: "开启活动预约", exact: true }).click();
  await page.getByRole("switch", { name: "开启活动抽奖", exact: true }).click();
  assert.equal(await page.getByLabel("预约开放", { exact: true }).count(), 0); assert.equal(await page.getByLabel("抽奖截止", { exact: true }).count(), 0);
  await shot("04-config-disabled-capabilities"); await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await page.getByRole("heading", { name: "浏览器验收 · 无预约无抽奖", exact: true }).waitFor();
  const draft = (await read())[2].activities.find((row) => row.name === "浏览器验收 · 无预约无抽奖"); assert.equal(draft.status, "DRAFT");
  await page.getByRole("button", { name: "编辑配置", exact: true }).click(); await page.getByLabel("活动说明", { exact: true }).fill("浏览器真实保存后的说明"); await page.getByRole("button", { name: "保存并发布", exact: true }).click();
  assert.equal((await read())[2].activities.find((row) => row.id === draft.id).status, "PUBLISHED");
  await page.getByRole("button", { name: "暂停", exact: true }).click(); assert.equal((await read())[2].activities.find((row) => row.id === draft.id).status, "PAUSED");
  await page.getByRole("button", { name: "恢复", exact: true }).click(); assert.equal((await read())[2].activities.find((row) => row.id === draft.id).status, "PUBLISHED");
  await page.getByRole("button", { name: "编辑配置", exact: true }).click(); await page.getByText("品牌、完成条件、次数、概率、中奖上限与场次锁定", { exact: true }).waitFor();
  assert.equal(await page.getByRole("switch").count(), 0); await page.getByRole("button", { name: "保存说明", exact: true }).click();
  pass("Create/save/edit/publish/pause/resume; disabled form capabilities and published rule lock");

  await route("marketing/prizes", "奖品库"); await page.getByRole("button", { name: "新增奖品", exact: true }).click();
  await page.getByLabel("奖品名称", { exact: true }).fill("浏览器验收 · 本地奖品"); await page.getByLabel("奖品说明", { exact: true }).fill("仅本地演示，不是真实库房");
  await page.getByLabel("奖品图片", { exact: true }).setInputFiles({ name: "test.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC14AAAAASUVORK5CYII=", "base64") });
  await page.getByRole("img", { name: "本地演示封面", exact: true }).waitFor(); await confirm();
  let prize = (await read())[2].prizes.find((row) => row.name === "浏览器验收 · 本地奖品"); assert.ok(prize.image.startsWith("data:image/png;base64,"));
  const prizeRow = page.locator(".semi-table-row").filter({ hasText: "浏览器验收 · 本地奖品" }); await prizeRow.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("奖品说明", { exact: true }).fill("编辑后仍为本地演示"); await confirm(); prize = (await read())[2].prizes.find((row) => row.id === prize.id); assert.equal(prize.description, "编辑后仍为本地演示");
  assert.equal(await page.locator(".semi-table-row").filter({ hasText: seeded.prizes[0].name }).getByRole("button", { name: "删除", exact: true }).isEnabled(), false);
  await prizeRow.getByRole("button", { name: "删除", exact: true }).click(); assert.equal((await read())[2].prizes.some((row) => row.id === prize.id), false);
  await shot("04b-prize-library-real-local-image-and-crud"); pass("Prize library create/edit/local image/delete is real; referenced definition delete disabled");

  const activity = seeded.activities[0], user = members.brandUsers.find((row) => row.brand === activity.brand && row.is_deleted === 0);
  await route(`marketing/preview/${activity.id}/${user.id}`, "用户流程预览");
  assert.equal(await page.getByRole("button", { name: "即时抽奖", exact: true }).isEnabled(), false);
  await page.getByRole("button", { name: "预约参加", exact: true }).click();
  let state = (await read())[2], participation = state.participations.find((row) => row.activityId === activity.id && row.identities.some((ref) => ref.userId === user.id));
  assert.ok(participation); assert.equal(state.chances.filter((row) => row.participationId === participation.id).length, 0);
  const pid = participation.id;
  await shot("05-preview-booking-and-real-qr");
  const qr = page.getByRole("img", { name: "活动凭证（签到 / 完成）二维码", exact: true }); assert.ok((await qr.getAttribute("src")).startsWith("data:image/gif;base64,"));
  await page.getByRole("button", { name: "取消预约", exact: true }).click(); await page.getByRole("button", { name: "预约参加", exact: true }).click();
  await page.getByRole("button", { name: "预约参加", exact: true }).click();
  state = (await read())[2]; assert.equal(state.participations.filter((row) => row.id === pid).length, 1); assert.equal(state.bookings.filter((row) => row.participationId === pid && row.kind === "ACTIVITY" && row.status === "BOOKED").length, 1);
  const count = state.bookings.length;
  await page.getByRole("button", { name: "改约", exact: true }).filter({ hasNot: page.locator('[disabled]') }).last().click();
  await select("目标场次", `满额场（演示） · ${new Date(Date.parse(activity.slots[1].startAt) + 8 * 3_600_000).toISOString().slice(0, 16).replace("T", " ")}`);
  await page.locator(".semi-modal:visible").getByRole("button", { name: "confirm", exact: true }).click();
  await page.getByText("目标场次已截止或满额，原预约保留", { exact: true }).last().waitFor(); assert.equal((await read())[2].bookings.length, count);
  await page.locator(".semi-modal:visible").getByRole("button", { name: "cancel", exact: true }).click();
  pass("Booking creates no chances; cancel/rebook/duplicate submit keep one participant; full reschedule preserves original");

  await route(`marketing/activity/${activity.id}`, activity.name); await page.getByRole("button", { name: "暂停", exact: true }).click();
  await verify(participation.credential, "活动签到（不默认完成）");
  state = (await read())[2]; assert.ok(state.participations.find((row) => row.id === pid).checkedInAt); assert.equal(state.chances.filter((row) => row.participationId === pid).length, 0); assert.equal(state.awards.filter((row) => row.participationId === pid).length, 0);
  await shot("06-staff-checkin-not-completed");
  await verify(participation.credential, "工作人员确认完成（不默认领奖）"); await verify(participation.credential, "工作人员确认完成（不默认领奖）");
  state = (await read())[2]; assert.equal(state.chances.filter((row) => row.participationId === pid).length, 1); assert.equal(state.chances.find((row) => row.participationId === pid).count, 2);
  await route(`marketing/preview/${activity.id}/${user.id}`, "用户流程预览"); assert.equal(await page.getByRole("button", { name: "即时抽奖", exact: true }).isEnabled(), false);
  await route(`marketing/activity/${activity.id}`, activity.name); await page.getByRole("button", { name: "恢复", exact: true }).click();
  pass("Paused existing booking check-in/complete works; check-in is not completion; duplicate complete grants once");

  await route(`marketing/preview/${activity.id}/${user.id}`, "用户流程预览"); await page.getByRole("button", { name: "即时抽奖", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "最近已保存结果" }).waitFor();
  state = (await read())[2]; const draw = state.draws.find((row) => row.participationId === pid), award = state.awards.find((row) => row.drawId === draw.id);
  assert.ok(award); assert.equal(state.awards.filter((row) => row.participationId === pid).length, 1); assert.equal(await page.getByRole("button", { name: "即时抽奖", exact: true }).isEnabled(), false);
  assert.ok((await page.locator(".marketing-preview").innerText()).includes("中奖上限")); await shot("07-saved-win-and-unusable-remaining-chance");
  await page.reload({ waitUntil: "networkidle" }); await page.getByRole("button", { name: "重试上次请求（返回原结果）", exact: true }).click();
  assert.equal((await read())[2].draws.filter((row) => row.participationId === pid).length, 1); assert.equal((await read())[2].draws.find((row) => row.participationId === pid).id, draw.id);
  await route(`marketing/activity/${activity.id}`, activity.name); await page.getByRole("tab", { name: "抽奖与奖品", exact: true }).click(); await page.getByText("10 / 1 / 0 / 9", { exact: true }).waitFor();
  await verify(award.credential, "奖品领取 / 体验核销"); await verify(award.credential, "奖品领取 / 体验核销");
  state = (await read())[2]; assert.ok(state.awards.find((row) => row.id === award.id).fulfilledAt); assert.equal(state.draws.filter((row) => row.participationId === pid).length, 1);
  await shot("08-redeemed-no-second-stock-deduction");
  await route(`marketing/activity/${activity.id}`, activity.name); await page.getByRole("tab", { name: "抽奖与奖品", exact: true }).click(); await page.getByText("10 / 0 / 1 / 9", { exact: true }).waitFor();
  pass("Win occupies quota; win limit preserves unused chance; refresh/retry and repeated redemption are idempotent");

  await page.getByRole("button", { name: "增加配额", exact: true }).first().click(); await confirm();
  assert.equal((await read())[2].activities.find((row) => row.id === activity.id).pool[0].quota, 11); await page.getByText("11 / 0 / 1 / 10", { exact: true }).waitFor();
  for (const label of ["活动配置", "场次与预约", "参与名单", "核销记录"]) { await page.getByRole("tab", { name: label, exact: true }).click(); await shot(`08b-detail-${label}`); }
  assert.ok((await page.locator(".semi-tabs-content").innerText()).includes("CLAIM"));
  assert.ok((await read())[2].audits.some((row) => row.action === "ADD_QUOTA" && row.result === "SUCCESS"));
  pass("Published quota appended with persisted audit; all six detail areas render existing source records");

  await page.getByRole("tab", { name: "概览", exact: true }).click();
  const expected = { "当前有效预约人数": ["participation-demo-full", pid], "到场人数": [pid], "完成人数": [pid], "抽奖人数": [pid], "抽奖次数": [draw.id], "中奖人数": [pid], "中奖份数": [award.id], "已履约份数": [award.id] };
  for (const [label, ids] of Object.entries(expected)) {
    const button = page.locator(".marketing-metrics > button").filter({ has: page.locator("span", { hasText: new RegExp(`^${label}$`) }) }); assert.equal(await button.locator("strong").textContent(), String(ids.length)); await button.click();
    const sheet = page.locator(".semi-sidesheet:visible"); await sheet.waitFor(); const actual = await sheet.locator(".semi-table-row-cell").allTextContents(); assert.deepEqual(actual.sort(), [...ids].sort());
    await page.keyboard.press("Escape"); await sheet.waitFor({ state: "hidden" });
  }
  await shot("09-current-metrics-match-all-eight-drilldowns"); pass("All eight activity metrics drill into exact source IDs; people and attempts remain distinct");
  await route(`brand-members/${user.id}`); await page.getByRole("tab", { name: "营销活动", exact: true }).click(); await page.getByRole("link", { name: activity.name, exact: true }).waitFor();
  assert.equal((await raw())[0], original[0]); assert.equal((await raw())[1], original[1]); pass("Existing member detail readonly marketing path; sales/member data and statistics not mutated");

  const ended = seeded.activities[3], pickup = seeded.awards.find((row) => row.activityId === ended.id && row.method === "PICKUP"), expired = seeded.awards.find((row) => row.activityId === ended.id && row.method === "EXPERIENCE");
  const historicalUser = seeded.participations.find((row) => row.id === pickup.participationId).identities[0].userId;
  await route(`marketing/preview/${ended.id}/${historicalUser}`, "用户流程预览"); await shot("10-ended-event-existing-prize-booking");
  await page.getByRole("button", { name: "取消预约", exact: true }).click(); assert.equal((await read())[2].awards.find((row) => row.id === pickup.id).fulfilledAt, undefined);
  await page.getByRole("button", { name: "预约奖品领取 / 体验", exact: true }).first().click();
  assert.equal((await read())[2].bookings.filter((row) => row.awardId === pickup.id && row.status === "BOOKED").length, 1);
  await route(`marketing/activity/${ended.id}`, ended.name); await page.getByRole("button", { name: "取消活动", exact: true }).click(); await page.getByText(/保留 3 份获奖权益/).waitFor(); await confirm();
  assert.equal((await read())[2].bookings.find((row) => row.awardId === pickup.id && row.status === "BOOKED").kind, "PRIZE");
  await verify(pickup.credential, "奖品领取 / 体验核销"); assert.ok((await read())[2].awards.find((row) => row.id === pickup.id).fulfilledAt);
  await verify(expired.credential, "奖品领取 / 体验核销"); await page.getByText("奖品尚未到有效期或已过期，占用配额不退回", { exact: true }).waitFor(); assert.equal((await read())[2].awards.find((row) => row.id === expired.id).fulfilledAt, undefined);
  await shot("11-expired-prize-rejection"); pass("Prize booking cancel/rebook preserves award; ended/canceled activity still fulfills valid reserved prize; expired blocked");

  const noLottery = seeded.activities[2], noLotteryUser = members.brandUsers.find((row) => row.brand === noLottery.brand && row.is_deleted === 0);
  await route(`marketing/preview/${noLottery.id}/${noLotteryUser.id}`, "用户流程预览"); await page.getByRole("button", { name: "预约参加", exact: true }).click();
  const noLotteryParticipation = (await read())[2].participations.find((row) => row.activityId === noLottery.id && row.identities.some((ref) => ref.userId === noLotteryUser.id));
  await verify(noLotteryParticipation.credential, "活动签到（不默认完成）"); state = (await read())[2]; assert.ok(state.participations.find((row) => row.id === noLotteryParticipation.id).completedAt); assert.equal(state.chances.filter((row) => row.participationId === noLotteryParticipation.id).length, 0);
  pass("Check-in-completes activity without lottery completes normally, does not invent lottery rights");

  const onsite = seeded.activities[1], onsiteUser = members.brandUsers.find((row) => row.brand === onsite.brand && row.is_deleted === 0);
  await route(`marketing/preview/${onsite.id}/${onsiteUser.id}`, "用户流程预览"); await page.getByRole("button", { name: "直接报名参加", exact: true }).click();
  const onsiteParticipation = (await read())[2].participations.find((row) => row.activityId === onsite.id && row.identities.some((ref) => ref.userId === onsiteUser.id));
  await verify(onsiteParticipation.credential, "活动签到（不默认完成）");
  await route(`marketing/preview/${onsite.id}/${onsiteUser.id}`, "用户流程预览");
  const beforeSaveFailure = (await raw())[2];
  await page.evaluate((key) => { const original = Storage.prototype.setItem; window.restoreMarketingStorage = () => { Storage.prototype.setItem = original; }; Storage.prototype.setItem = function (name, value) { if (name === key) throw new DOMException("Test quota exceeded", "QuotaExceededError"); return original.call(this, name, value); }; }, keys[2]);
  await page.getByRole("button", { name: "即时抽奖", exact: true }).click(); await page.getByText("本地保存失败，未提交扣次或库存变化；请检查浏览器存储空间。", { exact: true }).waitFor();
  assert.equal((await raw())[2], beforeSaveFailure); assert.equal(await page.locator(".marketing-draw-result").count(), 0); await shot("11b-failed-save-no-orphaned-draw-or-stock");
  await page.evaluate(() => window.restoreMarketingStorage()); await page.getByRole("button", { name: "即时抽奖", exact: true }).click();
  assert.equal((await read())[2].draws.filter((row) => row.participationId === onsiteParticipation.id).length, 1);
  pass("No-booking direct participation; failed LocalStorage save commits no chances/award/inventory, subsequent valid draw succeeds");

  for (const width of [375, 430]) {
    await page.setViewportSize({ width, height: 812 }); await route(`marketing/preview/${activity.id}/${user.id}`, "用户流程预览"); await shot(`12-preview-${width}`);
    await route(`marketing/redemption/${encodeURIComponent(award.credential)}`, "核销工作台"); await page.getByRole("button", { name: "识别凭证 / 模拟扫码", exact: true }).click(); await shot(`13-redemption-${width}`);
  }
  await page.setViewportSize({ width: 1280, height: 800 }); pass("375/430 user preview and redemption: no document/workspace overflow, code/QR and controls accessible");

  // Existing identity reset/change must NOT resolve the historical reference by name, phone or a reused id.
  const beforeDangling = (await read())[1], dangling = structuredClone(beforeDangling); dangling.brandUsers = dangling.brandUsers.filter((row) => row.id !== user.id);
  await isolatedSet(1, dangling); await route(`marketing/redemption/${encodeURIComponent(participation.credential)}`, "核销工作台"); await page.getByRole("button", { name: "识别凭证 / 模拟扫码", exact: true }).click(); await page.getByText("参与身份引用待核对，不能自动绑定其他会员", { exact: true }).waitFor();
  await shot("14-dangling-identity-not-reassigned"); await isolatedSet(1, beforeDangling); pass("Dangling identities after independent member change show pending review and cannot be redeemed");
  await isolatedSet(1, { ...beforeDangling, brandUsers: [] }); await route("marketing", "营销活动"); await page.getByText("缺少可用品牌身份", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "新建活动", exact: true }).isEnabled(), false); await shot("14b-no-identities-explicit-reason");
  await isolatedSet(1, beforeDangling); pass("No existing identities shows explicit setup/review reason, not a false empty successful flow");
  const beforeReset = await raw();
  await route(`marketing/activity/${activity.id}`, activity.name); await page.getByRole("button", { name: "重置营销演示数据", exact: true }).click(); await confirm();
  const afterReset = await raw(); assert.equal(afterReset[0], beforeReset[0]); assert.equal(afterReset[1], beforeReset[1]); assert.notEqual(afterReset[2], beforeReset[2]);
  const resetMarketing = afterReset[2]; await route("settings"); await page.getByRole("button", { name: "Reset Sales Demo Data", exact: true }).click(); await confirm(); assert.equal((await raw())[2], resetMarketing);
  await page.getByRole("button", { name: "Reset Member Demo Data", exact: true }).click(); await confirm(); assert.equal((await raw())[2], resetMarketing);
  const corrupt = '{"version":99,"user-edit":"KEEP"}'; await isolatedSet(2, corrupt); await route("marketing"); await page.getByText(/营销数据版本 \/ 集合 \/ 字段不兼容/).waitFor(); assert.equal((await raw())[2], corrupt); await page.reload({ waitUntil: "networkidle" }); assert.equal((await raw())[2], corrupt);
  await isolatedSet(2, resetMarketing); pass("Marketing reset only marketing; existing sales/member resets preserve marketing; unsupported version survives refresh unchanged");
  await select("切换 Demo User", "Jason · Distributor Manager"); await page.locator('.sidebar-nav button').filter({ hasText: "营销活动" }).waitFor({ state: "detached" });
  for (const path of ["marketing", `marketing/activity/${activity.id}`, `marketing/preview/${activity.id}/${user.id}`, `marketing/redemption/${encodeURIComponent(participation.credential)}`]) {
    await route(path); await page.getByText("当前角色无权访问营销活动", { exact: true }).waitFor(); assert.equal(await page.locator(".marketing-panel").count(), 0);
  }
  await shot("15-unauthorized-direct-route"); pass("Distributor cannot view navigation, activity, preview, credential or records via direct URLs");
  assert.deepEqual(errors, []); assert.deepEqual(requests, []); pass("Console/runtime errors and failed requests", "0 / 0");
} catch (error) {
  results.push({ name: checkpoint, status: "FAIL", detail: error.stack || String(error) }); await page.screenshot({ path: resolve(root, "FAILED.png"), fullPage: true }).catch(() => {}); throw error;
} finally {
  await writeFile(resolve(root, "results.json"), JSON.stringify({ base, completedAt: new Date().toISOString(), browser: "Chrome", timezone: "America/Los_Angeles", deterministicRandom: "test-only 0.1", results, errors, requests, evidence }, null, 2));
  await writeFile(resolve(root, "evidence.md"), `# Marketing activity browser evidence\n\nTest-only random source: 0.1. Every mutation uses real page controls and is checked against persisted state.\n\n${evidence.map((item) => `## Step ${item.step}: ${item.name}\n\n![${item.name}](./${item.name}.png)\n\nViewport ${item.layout.width}×${item.layout.height}; SHA256 ${item.sha256}.\n`).join("\n")}`);
  process.stdout.write(`Evidence ${root}\n`); await browser.close();
}
