import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const base = process.env.PROTOTYPE_BASE_URL || "http://127.0.0.1:4174";
const root = resolve("artifacts/prototype-qa", `${new Date().toISOString().replaceAll(":", "-")}-marketing-v2`);
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "America/Los_Angeles" });
await context.addInitScript(() => {
  window.__marketingRandom = 0.1; Math.random = () => window.__marketingRandom;
  if (localStorage.getItem("QA_FAIL_BACKUP") === "1") {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (key.endsWith(":backup-v1")) throw new DOMException("Test backup quota failure", "QuotaExceededError"); return set.call(this, key, value); };
  }
});
const page = await context.newPage(); page.setDefaultTimeout(15_000);
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
  await page.waitForTimeout(120);
  const layout = await page.evaluate(() => { const workspace = document.querySelector(".page-scroll"); return { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, workspaceWidth: workspace?.scrollWidth ?? 0, workspaceClient: workspace?.clientWidth ?? 0 }; });
  assert.ok(layout.documentWidth <= layout.width + 1, `${name}: document horizontal overflow`);
  assert.ok(layout.workspaceWidth <= layout.workspaceClient + 1, `${name}: workspace horizontal overflow`);
  const bytes = await page.screenshot({ path: resolve(root, `${name}.png`), fullPage: true });
  evidence.push({ step: evidence.length + 1, name, layout, sha256: createHash("sha256").update(bytes).digest("hex") });
}
async function confirm() { const dialog = page.locator(".semi-modal:visible").last(); await dialog.waitFor(); await dialog.getByRole("button", { name: /^(confirm|保存奖品|保存场次)$/ }).click(); await dialog.waitFor({ state: "hidden" }); }
async function more(name) { await page.locator(".semi-modal:visible").waitFor({ state: "hidden" }); await page.getByRole("button", { name: "更多操作", exact: true }).click(); await page.waitForTimeout(150); await page.locator(".semi-dropdown-item:visible").filter({ hasText: new RegExp(`^${name}$`) }).click(); }
async function rowAction(row, name) { await page.locator(".semi-modal:visible").waitFor({ state: "hidden" }); await page.waitForTimeout(150); const direct = row.getByRole("button", { name, exact: true }); if (await direct.count()) return direct.click(); await row.getByRole("button", { name: "更多", exact: true }).click(); await page.waitForTimeout(150); await page.locator(".semi-dropdown-item:visible").filter({ hasText: new RegExp(`^${name}$`) }).click(); }
async function step(label) { await page.locator(".marketing-editor-nav").getByText(label, { exact: true }).click(); }
async function explicitActivityBasics() {
  const local = (minutes) => new Date(Date.now() + minutes * 60_000 + 8 * 3_600_000).toISOString().slice(0, 16);
  // V2.1 operators must explicitly enter dates; runnable QA data is intentionally active.
  await page.getByLabel("活动说明", { exact: true }).fill("纯前端浏览器验收活动");
  await page.getByLabel("活动地点", { exact: true }).fill("演示工作室");
  await page.getByLabel("活动开始", { exact: true }).fill(local(-60));
  await page.getByLabel("活动结束", { exact: true }).fill(local(360));
}
async function verify(code, action) {
  await route(`redemption/${encodeURIComponent(code)}`, "核销端");
  assert.equal(await page.locator(".sidebar").count(), 0);
  await page.getByRole("button", { name: "识别凭证 / 模拟扫码", exact: true }).click();
  await select("本次核验动作", action);
  await page.getByRole("button", { name: "确认执行所选动作", exact: true }).click(); await confirm();
}
async function isolatedSet(index, value) { await page.evaluate(([key, value]) => localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value)), [keys[index], value]); await page.reload({ waitUntil: "networkidle" }); }
try {
  await route("marketing", "营销活动"); await page.waitForFunction((keys) => keys.every((key) => localStorage.getItem(key)), keys);
  const [sales, members, seeded] = await read(), original = await raw();
  assert.equal(seeded.version, 2); assert.equal(seeded.activities.length, 4); assert.equal(await page.getByRole("tab").count(), 0); assert.ok(!("prizes" in seeded));
  assert.ok(seeded.activities.every((activity) => activity.pool.every((prize) => prize.activityId === activity.id)));
  assert.equal(await page.locator('.sidebar-nav button').filter({ hasText: "营销活动" }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "核销工作台", exact: true }).count(), 0);
  for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) { await page.setViewportSize({ width, height }); await shot(`01-activity-list-${width}`); }
  await page.getByLabel("搜索活动", { exact: true }).fill("不存在"); await page.getByText("暂无匹配活动", { exact: true }).waitFor(); await shot("02-list-empty");
  await page.getByLabel("搜索活动", { exact: true }).fill(""); await select("活动品牌", "Girard-Perregaux");
  await page.getByRole("link", { name: seeded.activities[1].name, exact: true }).waitFor({ state: "detached" });
  assert.equal(await page.getByRole("link", { name: seeded.activities[1].name, exact: true }).count(), 0);
  await select("活动品牌", "全部授权品牌");
  await page.getByLabel("活动举行日期", { exact: true }).fill("2099-01-01"); await page.getByText("暂无匹配活动", { exact: true }).waitFor(); await page.getByLabel("活动举行日期", { exact: true }).fill("");
  pass("Activity-centered list, required columns, independent activity data, filters and three desktop sizes");

  await route("marketing/prizes", "营销活动"); await page.getByText("请选择活动查看相关记录", { exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "奖品库", exact: true }).count(), 0);
  await route("marketing/bookings", "营销活动"); await page.getByText("请选择活动查看相关记录", { exact: true }).waitFor();
  const sourceActivity = seeded.activities[0];
  await route("marketing", "营销活动"); const sourceRow = page.locator(".semi-table-row").filter({ has: page.getByRole("link", { name: sourceActivity.name, exact: true }) });
  await sourceRow.getByRole("button", { name: "更多", exact: true }).click(); await page.locator(".semi-dropdown-item:visible").filter({ hasText: /^预约记录$/ }).click();
  assert.ok(page.url().endsWith(`/activity/${sourceActivity.id}/bookings`)); await page.getByRole("tab", { name: "预约记录", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "确认执行所选动作", exact: true }).count(), 0);
  pass("Legacy top-level library/bookings retired; list More opens same Activity data tab without copied collections");

  await route("marketing", "营销活动"); await page.getByRole("button", { name: "新建活动", exact: true }).click();
  await page.getByLabel("活动名称", { exact: true }).fill("V2验收 · 无预约无抽奖");
  await explicitActivityBasics();
  await page.locator(".semi-radio").filter({ hasText: /^直接参与$/ }).click();
  await step("参与设置"); assert.equal(await page.getByLabel("场次名称", { exact: true }).count(), 0); await select("完成条件", "签到即完成");
  await step("抽奖规则"); await page.getByRole("switch", { name: "开启活动抽奖", exact: true }).click(); assert.equal(await page.getByLabel("未中奖概率（%）", { exact: true }).count(), 0);
  await step("奖品设置"); assert.equal(await page.getByRole("button", { name: /添加奖品$/ }).count(), 0);
  await step("发布检查"); await page.getByRole("button", { name: "发布活动", exact: true }).click(); await page.getByRole("heading", { name: "V2验收 · 无预约无抽奖", exact: true }).waitFor();
  const simple = (await read())[2].activities.find((row) => row.name === "V2验收 · 无预约无抽奖"); assert.equal(simple.status, "PUBLISHED");
  await more("暂停活动"); assert.equal((await read())[2].activities.find((row) => row.id === simple.id).status, "PAUSED");
  await more("恢复活动"); await page.getByRole("button", { name: "编辑活动", exact: true }).click();
  await page.getByLabel("活动说明", { exact: true }).fill("真实页面修改说明"); await page.getByRole("button", { name: "保存内容", exact: true }).click();
  assert.equal((await read())[2].activities.find((row) => row.id === simple.id).description, "真实页面修改说明");
  pass("Five-step create, optional capabilities hide fields, publish/pause/resume and rule-safe description edit");

  await route("marketing", "营销活动"); await page.getByRole("button", { name: "新建活动", exact: true }).click();
  await page.getByLabel("活动名称", { exact: true }).fill("V2验收 · 兑换码活动"); await page.locator(".semi-radio").filter({ hasText: /^直接参与$/ }).click();
  await explicitActivityBasics();
  await step("参与设置"); await select("完成条件", "签到即完成");
  await step("抽奖规则"); await page.getByLabel("未中奖概率（%）", { exact: true }).fill("0");
  await page.getByLabel("抽奖开始", { exact: true }).fill(new Date(Date.now() - 60 * 60_000 + 8 * 3_600_000).toISOString().slice(0, 16));
  await page.getByLabel("抽奖截止", { exact: true }).fill(new Date(Date.now() + 480 * 60_000 + 8 * 3_600_000).toISOString().slice(0, 16));
  await step("奖品设置"); await page.getByRole("button", { name: /添加奖品$/ }).click();
  await page.getByLabel("奖品名称", { exact: true }).fill("V2浏览器兑换码奖品");
  assert.equal(await page.getByLabel("奖品领取地点", { exact: true }).count(), 1);
  await select("奖品类型", "虚拟奖品"); await page.getByLabel("奖品领取地点", { exact: true }).waitFor({ state: "detached" }); assert.equal(await page.getByLabel("奖品领取地点", { exact: true }).count(), 0);
  await select("虚拟奖品内容", "虚拟权益"); await page.getByLabel("虚拟凭证名称", { exact: true }).waitFor(); assert.equal(await page.getByLabel("虚拟凭证名称", { exact: true }).count(), 1);
  await select("虚拟奖品内容", "领取链接"); await page.getByLabel("领取链接", { exact: true }).waitFor(); await page.getByLabel("虚拟凭证名称", { exact: true }).waitFor({ state: "detached" }); assert.equal(await page.getByLabel("领取链接", { exact: true }).count(), 1); assert.equal(await page.getByLabel("虚拟凭证名称", { exact: true }).count(), 0);
  await select("虚拟奖品内容", "兑换码");
  await page.getByLabel("奖品配置数量", { exact: true }).fill("-1"); await page.locator(".semi-modal:visible").getByRole("button", { name: "confirm", exact: true }).click();
  await page.getByText(/数量须为非负整数/).last().waitFor(); assert.equal(await page.locator(".semi-modal:visible").count(), 1);
  await page.getByLabel("奖品配置数量", { exact: true }).fill("2"); await page.getByLabel("中奖概率（%）", { exact: true }).fill("99");
  await page.getByLabel("兑换码文本", { exact: true }).fill("V2-BROWSER-001"); await page.getByRole("button", { name: "确认导入兑换码", exact: true }).click();
  await shot("03-prize-virtual-form-text-import"); await confirm();
  await step("发布检查"); assert.equal(await page.getByRole("button", { name: "发布活动", exact: true }).isEnabled(), false);
  await page.getByText(/各奖品概率 \+ 未中奖须合计100%/).waitFor(); await page.getByText(/兑换码不足：已导入数量/).waitFor(); await shot("04-publish-validation");
  await step("奖品设置"); await page.locator(".marketing-editor-content .semi-table-row").getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("中奖概率（%）", { exact: true }).fill("100");
  await page.getByLabel("兑换码CSV", { exact: true }).setInputFiles({ name: "codes.csv", mimeType: "text/csv", buffer: Buffer.from("code\nV2-BROWSER-002\n") });
  await page.waitForFunction(() => document.querySelector('[aria-label="兑换码文本"]')?.value.includes("V2-BROWSER-002"));
  await page.getByRole("button", { name: "确认导入兑换码", exact: true }).click();
  await page.getByLabel("奖品图片", { exact: true }).setInputFiles({ name: "test.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC14AAAAASUVORK5CYII=", "base64") });
  await page.getByRole("img", { name: "活动图片", exact: true }).waitFor(); await confirm();
  await step("发布检查"); await page.getByRole("button", { name: "发布活动", exact: true }).click(); await page.getByRole("heading", { name: "V2验收 · 兑换码活动", exact: true }).waitFor();
  const activity = (await read())[2].activities.find((row) => row.name === "V2验收 · 兑换码活动");
  assert.equal(activity.pool[0].codes.length, 2); assert.ok(activity.pool[0].image.startsWith("data:image/png;base64,"));
  assert.deepEqual((await read())[2].activities.find((row) => row.id === sourceActivity.id), sourceActivity);
  pass("Physical/virtual/voucher/link fields, illegal stock blocked, probability and code-shortage publish gates, real CSV/image save");

  const user = members.brandUsers.find((row) => row.brand === activity.brand && row.is_deleted === 0);
  await route(`marketing/preview/${activity.id}/${user.id}`, "用户流程预览"); assert.equal(await page.getByRole("button", { name: "即时抽奖", exact: true }).isEnabled(), false);
  await page.getByRole("button", { name: "直接报名参加", exact: true }).click();
  let state = (await read())[2], participant = state.participations.find((row) => row.activityId === activity.id && row.identities.some((ref) => ref.userId === user.id));
  assert.ok(participant); assert.equal(state.chances.filter((row) => row.participationId === participant.id).length, 0);
  await verify(participant.credential, "活动签到（不默认完成）"); await verify(participant.credential, "活动签到（不默认完成）");
  state = (await read())[2]; assert.equal(state.chances.filter((row) => row.participationId === participant.id).length, 1);
  assert.deepEqual(state.redemptions.filter((row) => row.activityId === activity.id).map((row) => row.type), ["CHECKIN", "COMPLETE"]);
  await shot("05-independent-redemption-checkin");
  await route(`marketing/preview/${activity.id}/${user.id}`, "用户流程预览"); await page.getByRole("button", { name: "即时抽奖", exact: true }).click(); await page.getByRole("status").filter({ hasText: "最近已保存结果" }).waitFor();
  state = (await read())[2]; const draw = state.draws.find((row) => row.activityId === activity.id), award = state.awards.find((row) => row.drawId === draw.id);
  assert.equal(award.virtualContent.code, "V2-BROWSER-001"); assert.equal(award.prizeType, "VIRTUAL"); assert.ok(award.issuedAt); assert.equal(award.fulfilledAt, undefined);
  assert.equal(await page.getByRole("button", { name: "即时抽奖", exact: true }).isEnabled(), false);
  await page.reload({ waitUntil: "networkidle" }); await page.getByRole("button", { name: "重试上次请求（返回原结果）", exact: true }).click();
  state = (await read())[2]; assert.equal(state.draws.filter((row) => row.activityId === activity.id).length, 1); assert.equal(state.awards.find((row) => row.id === award.id).virtualContent.code, award.virtualContent.code);
  assert.equal(state.activities.find((row) => row.id === activity.id).pool[0].codes.filter((row) => row.assignedAwardId).length, 1);
  await shot("06-virtual-content-persisted-repeat");
  pass("Separate staff surface, incomplete cannot draw, checkin completion grants once, code assignment and refresh/retry/win-limit idempotence");

  await route(`marketing/activity/${activity.id}/awards`, activity.name);
  assert.ok(!(await page.locator(".marketing-primary-tabs > .semi-tabs-content").innerText()).includes(award.virtualContent.code));
  await page.getByRole("button", { name: "查看权益", exact: true }).click(); await page.getByText(award.virtualContent.code, { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "确认执行所选动作", exact: true }).count(), 0); await shot("07-award-detail-masked-list"); await page.keyboard.press("Escape");
  await verify(award.credential, "奖品领取 / 体验核销"); await page.getByText("直接发放虚拟奖品或待确认类型不由现场核销端发放", { exact: true }).waitFor();
  assert.equal((await read())[2].awards.find((row) => row.id === award.id).fulfilledAt, undefined);
  pass("Ordinary award list masks codes, detail reveals snapshot, management read-only and virtual prize never physically redeemed");

  await route(`marketing/activity/${activity.id}/lottery`, activity.name);
  await rowAction(page.locator(".semi-table-row").filter({ hasText: activity.pool[0].name }), "导入兑换码"); await page.getByLabel("兑换码文本", { exact: true }).fill("V2-BROWSER-003\nV2-BROWSER-001");
  await page.getByRole("button", { name: "确认导入兑换码", exact: true }).click(); await page.getByText("成功导入：1，重复：1，非法：0，忽略空值：0", { exact: true }).waitFor();
  assert.equal((await read())[2].activities.find((row) => row.id === activity.id).pool[0].codes.length, 3); await page.locator(".semi-modal:visible").getByRole("button", { name: "完成", exact: true }).click();
  await more("复制活动");
  state = (await read())[2]; const copy = state.activities.find((row) => row.name === `${activity.name} · 副本`); await page.getByRole("heading", { name: copy.name, exact: true }).waitFor();
  assert.equal(copy.status, "DRAFT"); assert.equal(copy.pool[0].codes.length, 0); assert.notEqual(copy.pool[0].id, activity.pool[0].id); assert.equal(copy.pool[0].activityId, copy.id);
  for (const rows of [state.participations, state.bookings, state.chances, state.draws, state.awards, state.redemptions]) assert.equal(rows.filter((row) => row.activityId === copy.id).length, 0);
  await page.getByRole("button", { name: "发布", exact: true }).click(); await page.locator('.marketing-readiness-row[data-check-key="codes"]').getByText(/兑换码不足/).waitFor(); assert.equal(await page.getByRole("button", { name: "发布活动", exact: true }).isEnabled(), false); assert.equal((await read())[2].activities.find((row) => row.id === copy.id).status, "DRAFT");
  await shot("08-copy-config-no-codes-or-records");
  await page.locator(".semi-modal:visible").getByRole("button", { name: "取消", exact: true }).click();
  await route(`marketing/activity/${copy.id}/lottery`, copy.name); await page.getByRole("button", { name: "编辑奖品", exact: true }).click();
  const prizeDialog = page.locator(".marketing-prize-dialog .semi-modal:visible"); await prizeDialog.waitFor();
  const bodyScroll = await prizeDialog.locator(".semi-modal-body").evaluate((body) => ({ height: body.clientHeight, scroll: body.scrollHeight, overflow: getComputedStyle(body).overflowY, viewport: innerHeight }));
  assert.ok(bodyScroll.height <= bodyScroll.viewport - 190 + 1); assert.equal(bodyScroll.overflow, "auto"); assert.ok(bodyScroll.scroll > bodyScroll.height);
  await prizeDialog.getByRole("button", { name: "cancel", exact: true }).click(); await prizeDialog.waitFor({ state: "hidden" });
  pass("Duplicate rows report partial import without rewriting existing codes; copy has no codes/records; publish review and draft prize editor scroll safely");

  await route(`marketing/activity/${sourceActivity.id}/lottery`, sourceActivity.name);
  const pickupRow = page.locator(".semi-table-row").filter({ hasText: sourceActivity.pool[1].name }); await rowAction(pickupRow, "增加配额");
  await page.getByLabel("追加配额", { exact: true }).fill("50");
  await page.locator(".semi-modal:visible").getByRole("button", { name: "confirm", exact: true }).click();
  await page.locator(".semi-modal:visible").getByText("追加后履约容量不足，请先追加合法履约时段再增加配额", { exact: true }).waitFor();
  assert.equal((await read())[2].activities.find((row) => row.id === sourceActivity.id).pool[1].quota, 10);
  await shot("09a-quota-addition-capacity-rejected");
  await page.locator(".semi-modal:visible").getByRole("button", { name: "cancel", exact: true }).click();
  await rowAction(pickupRow, "追加履约时段");
  await page.getByLabel("场次地点", { exact: true }).fill("演示工作室"); await page.getByLabel("场次容量", { exact: true }).fill("50"); await confirm();
  await rowAction(pickupRow, "增加配额"); await page.getByLabel("追加配额", { exact: true }).fill("50"); await confirm();
  state = (await read())[2]; assert.equal(state.activities.find((row) => row.id === sourceActivity.id).pool[1].quota, 60);
  assert.ok((await pickupRow.innerText()).includes("60 / 0 / 0 / 60")); assert.ok((await pickupRow.innerText()).includes("60 · 未预约0"));
  await shot("09-safe-quota-after-added-fulfillment-capacity"); pass("Unsafe reservation quota addition denied; explicit extra fulfillment capacity then allows backed quota; runtime stock/capacity remains constrained");

  await route(`marketing/preview/${sourceActivity.id}/${user.id}`, "用户流程预览"); await page.getByRole("button", { name: "预约参加", exact: true }).click();
  state = (await read())[2]; const experienceParticipant = state.participations.find((row) => row.activityId === sourceActivity.id && row.identities.some((ref) => ref.userId === user.id));
  await verify(experienceParticipant.credential, "活动签到（不默认完成）");
  assert.equal((await read())[2].chances.filter((row) => row.participationId === experienceParticipant.id).length, 0);
  await verify(experienceParticipant.credential, "工作人员确认完成（不默认领奖）"); await verify(experienceParticipant.credential, "工作人员确认完成（不默认领奖）");
  await route(`marketing/preview/${sourceActivity.id}/${user.id}`, "用户流程预览"); await page.evaluate(() => { window.__marketingRandom = 0.5; }); await page.getByRole("button", { name: "即时抽奖", exact: true }).click(); await page.getByRole("status").filter({ hasText: "最近已保存结果" }).waitFor();
  const experience = (await read())[2].awards.find((row) => row.activityId === sourceActivity.id && row.participationId === experienceParticipant.id); assert.equal(experience.method, "EXPERIENCE");
  await page.getByRole("button", { name: "预约奖品领取 / 体验", exact: true }).click(); await verify(experience.credential, "奖品领取 / 体验核销"); await verify(experience.credential, "奖品领取 / 体验核销");
  state = (await read())[2]; assert.ok(state.awards.find((row) => row.id === experience.id).fulfilledAt);
  assert.equal(state.redemptions.filter((row) => row.awardId === experience.id && row.result === "SUCCESS").length, 1); assert.equal(state.redemptions.find((row) => row.awardId === experience.id).type, "EXPERIENCE_CLAIM");
  await shot("10-valid-experience-redemption"); pass("Staff completion is not checkin; valid physical experience booking and repeat redemption preserve one fulfillment fact");

  const ended = seeded.activities[3], pickup = seeded.awards.find((row) => row.activityId === ended.id && row.method === "PICKUP"), expired = seeded.awards.find((row) => row.activityId === ended.id && row.method === "EXPERIENCE"), historicalUser = seeded.participations.find((row) => row.id === pickup.participationId).identities[0].userId;
  await route(`marketing/preview/${ended.id}/${historicalUser}`, "用户流程预览"); await page.getByRole("button", { name: "取消预约", exact: true }).click();
  assert.equal((await read())[2].awards.find((row) => row.id === pickup.id).fulfilledAt, undefined); await page.getByRole("button", { name: "预约奖品领取 / 体验", exact: true }).first().click();
  await route(`marketing/activity/${ended.id}`, ended.name); await more("取消活动"); await confirm();
  await verify(pickup.credential, "奖品领取 / 体验核销"); assert.ok((await read())[2].awards.find((row) => row.id === pickup.id).fulfilledAt);
  await verify(expired.credential, "奖品领取 / 体验核销"); await page.getByText("奖品尚未到有效期或已过期，占用配额不退回", { exact: true }).waitFor();
  await shot("11-ended-canceled-retains-prize-rights"); pass("Ended/canceled activity still fulfills reserved physical prize; booking cancel retains rights; expired experience rejects");

  await route(`marketing/activity/${sourceActivity.id}/redemptions`, sourceActivity.name);
  assert.equal(await page.getByRole("button", { name: "确认执行所选动作", exact: true }).count(), 0);
  assert.ok(!(await page.locator(".marketing-primary-tabs > .semi-tabs-content").innerText()).includes("ADD_QUOTA"));
  state = (await read())[2]; assert.deepEqual(state.redemptions.filter((row) => row.activityId === sourceActivity.id).map((row) => row.type), ["CHECKIN", "COMPLETE", "EXPERIENCE_CLAIM"]);
  await shot("12-readonly-redemptions-not-audit");
  await route(`marketing/activity/${sourceActivity.id}/basic`, sourceActivity.name); await more("操作记录");
  assert.equal(await page.getByText("ADD_QUOTA", { exact: true }).count(), 2);
  const quotaAudits = (await read())[2].audits.filter((row) => row.activityId === sourceActivity.id && row.action === "ADD_QUOTA");
  assert.deepEqual(quotaAudits.map((row) => row.result), ["REJECTED", "SUCCESS"]);
  await shot("13-separate-config-audit"); await page.keyboard.press("Escape"); pass("Activity redemption rows contain actual business facts only; config audit retained separately");

  await route(`marketing/activity/${activity.id}/overview`, activity.name); state = (await read())[2];
  const expected = { "当前有效预约人数": [], "到场人数": [participant.id], "完成人数": [participant.id], "抽奖人数": [participant.id], "抽奖次数": [draw.id], "中奖人数": [participant.id], "中奖份数": [award.id], "已履约份数": [award.id] };
  for (const [label, ids] of Object.entries(expected)) {
    const button = page.locator(".marketing-metrics > button").filter({ has: page.locator("span", { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }) });
    if (label === "当前有效预约人数") {
      assert.equal(activity.bookingEnabled, false); assert.equal(await button.count(), 0, "Direct activity hides the inapplicable booking metric");
      assert.deepEqual(state.bookings.filter((booking) => booking.activityId === activity.id && booking.kind === "ACTIVITY"), ids, "Direct activity still has no activity bookings");
      continue;
    }
    assert.equal(await button.locator("strong").textContent(), String(ids.length)); await button.click();
    const sheet = page.locator(".semi-sidesheet:visible"); await sheet.waitFor(); if (ids.length) assert.deepEqual((await sheet.locator(".semi-table-row-cell").allTextContents()).sort(), [...ids].sort()); else await sheet.getByText("当前口径暂无记录", { exact: true }).waitFor();
    await page.keyboard.press("Escape"); await sheet.waitFor({ state: "hidden" });
  }
  // Preserve the eighth source-ID drilldown on an actually Reservation activity;
  // a hidden Direct-only booking metric is not treated as a clickable zero.
  await route(`marketing/activity/${sourceActivity.id}/overview`, sourceActivity.name);
  const reservationIds = state.participations.filter((row) => row.activityId === sourceActivity.id && state.bookings.some((booking) => booking.participationId === row.id && booking.kind === "ACTIVITY" && ["BOOKED", "CHECKED_IN"].includes(booking.status))).map((row) => row.id);
  assert.ok(sourceActivity.slots.every((slot) => Date.parse(slot.checkinEnd) > Date.now()), "Reservation metric fixture is still within its source window");
  const reservationMetric = page.getByRole("button", { name: /^当前有效预约人数/ }); assert.equal(await reservationMetric.locator("strong").textContent(), String(reservationIds.length)); await reservationMetric.click();
  const reservationSheet = page.locator(".semi-sidesheet:visible"); await reservationSheet.waitFor(); assert.deepEqual((await reservationSheet.locator(".semi-table-row-cell").allTextContents()).sort(), reservationIds.sort()); await page.keyboard.press("Escape"); await reservationSheet.waitFor({ state: "hidden" });
  await shot("14-exact-eight-metric-drilldowns");
  await route(`marketing/activity/${activity.id}/participants`, activity.name); await page.getByLabel("搜索参与用户", { exact: true }).fill("NO_SUCH_USER");
  const participantRows = page.locator(".marketing-detail .semi-table-row[data-row-key]:visible"); await participantRows.waitFor({ state: "detached" }); assert.equal(await participantRows.count(), 0);
  await page.getByLabel("搜索参与用户", { exact: true }).fill(""); await select("参与状态", "已完成"); await participantRows.waitFor(); assert.equal(await participantRows.count(), 1);
  await page.getByLabel("参与创建日期", { exact: true }).fill("2099-01-01"); await participantRows.waitFor({ state: "detached" }); assert.equal(await participantRows.count(), 0);
  await route(`brand-members/${user.id}`); await page.getByRole("tab", { name: "营销活动", exact: true }).click(); await page.getByRole("link", { name: activity.name, exact: true }).waitFor();
  assert.equal((await raw())[0], original[0]); assert.equal((await raw())[1], original[1]);
  pass("All eight metrics use identical source IDs; participant filters and readonly member references; sales/member stores unchanged");

  for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) {
    await page.setViewportSize({ width, height }); await route(`marketing/activity/${sourceActivity.id}/bookings`, sourceActivity.name); await shot(`15-activity-bookings-${width}`);
  }
  for (const width of [375, 430]) {
    await page.setViewportSize({ width, height: 812 }); await route(`marketing/preview/${activity.id}/${user.id}`, "用户流程预览");
    const escapedButtons = await page.locator(".marketing-preview .button-row > button").evaluateAll((buttons) => buttons.filter((button) => {
      const own = button.getBoundingClientRect(), row = button.parentElement.getBoundingClientRect(); return own.left < row.left - 1 || own.right > row.right + 1;
    }).map((button) => button.textContent)); assert.deepEqual(escapedButtons, [], `Preview ${width}: buttons must stay inside their action row`);
    await shot(`16-preview-${width}`);
    await route(`redemption/${encodeURIComponent(experience.credential)}`, "核销端"); await page.getByRole("button", { name: "识别凭证 / 模拟扫码", exact: true }).click(); await shot(`17-separate-redemption-${width}`);
  }
  await page.setViewportSize({ width: 1280, height: 800 }); pass("Desktop detail internal table scroll and 375/430 preview/staff surfaces have no horizontal document/workspace overflow");

  await route("marketing", "营销活动"); const beforeMigration = await raw();
  const v1 = await page.evaluate((key) => {
    const current = JSON.parse(localStorage.getItem(key)), activity = current.activities.find((row) => row.id === "activity-demo-1"), physical = activity.pool.filter((item) => item.prizeType === "PHYSICAL");
    const prizes = physical.map((item) => ({ id: `LEGACY-${item.id}`, name: item.name, description: item.description, image: item.image, method: item.method }));
    const { allowCancel, allowReschedule, ...oldActivity } = activity;
    oldActivity.name = "用户修改的V1活动"; oldActivity.noWinProbability = 100 - physical.reduce((sum, item) => sum + item.probability, 0);
    oldActivity.pool = physical.map(({ activityId, name, description, image, prizeType, codes, voucherName, voucherDescription, link, ...item }) => ({ ...item, prizeId: `LEGACY-${item.id}` }));
    return JSON.stringify({ ...current, version: 1, activities: [oldActivity], prizes, redemptions: undefined,
      participations: current.participations.filter((row) => row.activityId === activity.id), bookings: current.bookings.filter((row) => row.activityId === activity.id).map(({ source, ...row }) => row),
      chances: current.chances.filter((row) => row.activityId === activity.id), draws: current.draws.filter((row) => row.activityId === activity.id),
      awards: current.awards.filter((row) => row.activityId === activity.id).map(({ prizeType, image, description, awardLabel, ...row }) => row), audits: current.audits.filter((row) => row.activityId === activity.id) });
  }, keys[2]);
  await page.evaluate(([key, value]) => { localStorage.setItem(key, value); localStorage.setItem("QA_FAIL_BACKUP", "1"); }, [keys[2], v1]);
  await page.reload({ waitUntil: "networkidle" }); await page.getByText(/营销升级 \/ 保存失败/).waitFor(); assert.equal((await raw())[2], v1);
  await page.evaluate(() => localStorage.removeItem("QA_FAIL_BACKUP")); await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("link", { name: "用户修改的V1活动", exact: true }).waitFor(); state = (await read())[2];
  assert.equal(state.version, 2); assert.equal(await page.evaluate((key) => localStorage.getItem(`${key}:backup-v1`), keys[2]), v1);
  assert.ok(state.activities[0].pool.every((item) => item.prizeType === "PHYSICAL" && item.activityId === sourceActivity.id));
  assert.equal(state.awards.find((row) => row.id === experience.id).fulfilledAt, JSON.parse(beforeMigration[2]).awards.find((row) => row.id === experience.id).fulfilledAt);
  assert.equal(state.redemptions.filter((row) => row.type === "EXPERIENCE_CLAIM").length, 1);
  assert.equal((await raw())[0], beforeMigration[0]); assert.equal((await raw())[1], beforeMigration[1]); await shot("18-v1-upgrade-user-edits-preserved");
  await isolatedSet(2, beforeMigration[2]); pass("V1 exact raw backup, backup-write failure preserves old primary, safe type/ownership/ledger upgrade and user edits survive");

  const conflictingV1 = JSON.parse(v1); conflictingV1.activities[0].name = "另一份未覆盖的V1活动";
  const conflictingRaw = JSON.stringify(conflictingV1); await isolatedSet(2, conflictingRaw);
  await page.getByText(/已有另一份V1备份/).waitFor(); assert.equal((await raw())[2], conflictingRaw);
  await page.getByRole("button", { name: "确认后重置营销数据", exact: true }).click(); await confirm();
  const afterFailedMigrationReset = (await read())[2]; assert.equal(afterFailedMigrationReset.version, 2);
  await route(`marketing/activity/${afterFailedMigrationReset.activities[0].id}`, afterFailedMigrationReset.activities[0].name);
  await more("复制活动");
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).activities.length === 5, keys[2]);
  assert.equal(await page.evaluate((key) => localStorage.getItem(`${key}:backup-v1`), keys[2]), v1);
  assert.equal((await raw())[0], beforeMigration[0]); assert.equal((await raw())[1], beforeMigration[1]);
  await isolatedSet(2, beforeMigration[2]); pass("Conflicting V1 backup never overwrites either original; confirmed reset restores working actions and keeps backup");

  const corrupt = '{"version":99,"user-edit":"KEEP"}'; await isolatedSet(2, corrupt); await route("marketing"); await page.getByText(/营销数据版本 \/ 集合 \/ 字段不兼容/).waitFor(); assert.equal((await raw())[2], corrupt); await page.reload({ waitUntil: "networkidle" }); assert.equal((await raw())[2], corrupt);
  await isolatedSet(2, beforeMigration[2]); await route(`marketing/activity/${activity.id}`, activity.name);
  const beforeReset = await raw(); await more("重置营销数据"); await confirm();
  const reset = await raw(); assert.equal(reset[0], beforeReset[0]); assert.equal(reset[1], beforeReset[1]); assert.notEqual(reset[2], beforeReset[2]); assert.equal(await page.evaluate((key) => localStorage.getItem(`${key}:backup-v1`), keys[2]), v1);
  await route("settings"); await page.getByRole("button", { name: "Reset Sales Demo Data", exact: true }).click(); await confirm(); assert.equal((await raw())[2], reset[2]);
  await page.getByRole("button", { name: "Reset Member Demo Data", exact: true }).click(); await confirm(); assert.equal((await raw())[2], reset[2]);
  pass("Unknown versions preserved, three resets remain independent and marketing reset never deletes V1 backup");

  await select("切换 Demo User", "Jason · Distributor Manager"); await page.locator('.sidebar-nav button').filter({ hasText: "营销活动" }).waitFor({ state: "detached" });
  for (const path of ["marketing", `marketing/activity/${sourceActivity.id}/awards`, `marketing/preview/${sourceActivity.id}/${user.id}`]) { await route(path); await page.getByText("当前角色无权访问营销活动", { exact: true }).waitFor(); assert.equal(await page.locator(".marketing-panel").count(), 0); }
  for (const path of [`redemption/${participant.credential}`, `marketing/redemption/${participant.credential}`]) { await route(path); await page.getByText("当前角色无权访问核销端", { exact: true }).waitFor(); assert.equal(await page.locator(".marketing-panel").count(), 0); }
  await shot("19-unauthorized-independent-surface"); pass("Distributor denies management/detail/user preview and current/legacy staff credential URLs");
  assert.deepEqual(errors, []); assert.deepEqual(requests, []); pass("Console/runtime errors and failed requests", "0 / 0");
} catch (error) {
  results.push({ name: checkpoint, status: "FAIL", detail: error.stack || String(error) }); await page.screenshot({ path: resolve(root, "FAILED.png"), fullPage: true }).catch(() => {}); throw error;
} finally {
  await writeFile(resolve(root, "results.json"), JSON.stringify({ base, completedAt: new Date().toISOString(), browser: "Chrome", timezone: "America/Los_Angeles", random: "test-only configurable; no user-dependent production code", results, errors, requests, evidence }, null, 2));
  await writeFile(resolve(root, "evidence.md"), `# 营销活动V2真实页面验收\n\n所有业务动作通过页面执行，并核对最终持久状态；旧数据/存储失败仅在隔离测试上下文注入兼容夹具。\n\n${evidence.map((item) => `## ${item.step}. ${item.name}\n\n![${item.name}](./${item.name}.png)\n\nViewport ${item.layout.width}×${item.layout.height}; SHA256 ${item.sha256}.\n`).join("\n")}`);
  process.stdout.write(`Evidence ${root}\n`); await browser.close();
}
