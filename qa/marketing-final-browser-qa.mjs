import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

// Own isolated context only; no user browser storage is read, cleared or replaced.
const base = process.env.PROTOTYPE_BASE_URL || "http://127.0.0.1:4174";
const root = resolve("artifacts/prototype-qa", `${new Date().toISOString().replaceAll(":", "-")}-marketing-final`);
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "America/Los_Angeles" });
const page = await context.newPage(); page.setDefaultTimeout(15_000);
const keys = ["kivisense-crm-prototype-v1", "kivisense-member-operations-v1", "kivisense-marketing-prototype-v1"];
const results = [], evidence = [], errors = [], requests = []; let checkpoint = "startup";
page.on("pageerror", (error) => errors.push({ checkpoint, error: error.message }));
page.on("console", (message) => { if (message.type() === "error") errors.push({ checkpoint, error: message.text() }); });
page.on("response", (response) => { if (response.status() >= 400) requests.push({ url: response.url(), status: response.status() }); });
page.on("requestfailed", (request) => requests.push({ url: request.url(), error: request.failure()?.errorText }));
const raw = () => page.evaluate((keys) => keys.map((key) => localStorage.getItem(key)), keys);
const read = async () => (await raw()).map((row) => JSON.parse(row));
const local = (minutes) => new Date(Date.now() + minutes * 60_000 + 8 * 3_600_000).toISOString().slice(0, 16);
const pass = (name) => { results.push({ name, status: "PASS" }); process.stdout.write(`PASS ${name}\n`); };
async function route(path, heading) { await page.goto(`${base}/#${path}`, { waitUntil: "networkidle" }); if (heading) await page.getByRole("heading", { name: heading, exact: true }).waitFor(); }
async function step(name) { await page.locator(".semi-sidesheet:visible .semi-steps").getByText(name, { exact: true }).click(); }
async function select(label, value) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.locator(".semi-select-option:visible").filter({ hasText: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).click();
}
async function confirm() { const modal = page.locator(".semi-modal:visible").last(); await modal.getByRole("button", { name: "confirm", exact: true }).click(); await modal.waitFor({ state: "hidden" }); }
async function shot(name) {
  await page.waitForTimeout(250);
  const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth }));
  assert.ok(layout.documentWidth <= layout.width + 1, `${name}: horizontal overflow`);
  // Capture the actual viewport and action scroll position. Full-document screenshots
  // can reposition sticky CRM chrome relative to scrolled content; they are not UI bugs.
  const bytes = await page.screenshot({ path: resolve(root, `${name}.png`), fullPage: false });
  evidence.push({ step: evidence.length + 1, name, layout, sha256: createHash("sha256").update(bytes).digest("hex") });
}
async function verify(credential, action, name) {
  await route(`redemption/${encodeURIComponent(credential)}`, "核销端"); assert.equal(await page.locator(".sidebar").count(), 0);
  await page.getByRole("button", { name: "识别凭证 / 模拟扫码", exact: true }).click();
  await select("本次核验动作", action); await shot(`${name}-recognized`);
  await page.getByRole("button", { name: "确认执行所选动作", exact: true }).click(); await confirm(); await shot(`${name}-executed`);
}
async function create(name, virtual, booking) {
  await route("marketing", "营销活动"); await page.getByRole("button", { name: "新建活动", exact: true }).click();
  assert.equal(await page.getByLabel("活动开始", { exact: true }).inputValue(), "");
  for (const [label, value] of [["活动名称", name], ["活动说明", "Final Acceptance · 独立虚构数据"], ["活动地点", "验收工坊"], ["活动开始", local(-60)], ["活动结束", local(360)]]) await page.getByLabel(label, { exact: true }).fill(value);
  if (!booking) await page.getByRole("switch", { name: "开启活动预约", exact: true }).click();
  await step("预约设置"); await select("完成条件", "工作人员确认完成");
  if (booking) {
    await page.getByLabel("预约开放", { exact: true }).fill(local(-1440)); await page.getByLabel("预约截止", { exact: true }).fill(local(180));
    await page.getByRole("button", { name: "添加活动场次", exact: true }).click();
    for (const [label, value] of [["场次名称", "验收场次"], ["场次地点", "验收工坊"], ["场次容量", "2"], ["场次开始", local(30)], ["场次结束", local(120)], ["场次预约截止", local(20)], ["允许签到开始", local(-30)], ["允许签到结束（含配置宽限）", local(150)]]) await page.getByLabel(label, { exact: true }).fill(value);
  }
  await shot(`${name}-booking-config`); await step("抽奖设置");
  await page.getByLabel("抽奖开始", { exact: true }).fill(local(-60)); await page.getByLabel("抽奖截止", { exact: true }).fill(local(480)); await page.getByLabel("未中奖概率（%）", { exact: true }).fill("0");
  await step("奖品设置"); await page.getByRole("button", { name: "添加奖品", exact: true }).click();
  await page.getByLabel("奖品名称", { exact: true }).fill(`${name} · 奖品`); await page.getByLabel("奖品配置数量", { exact: true }).fill("2"); await page.getByLabel("中奖概率（%）", { exact: true }).fill("100");
  if (virtual) {
    await select("奖品类型", "虚拟奖品"); await page.getByLabel("奖品领取地点", { exact: true }).waitFor({ state: "detached" });
    await page.getByLabel("兑换码文本", { exact: true }).fill("FINAL-CODE-001\nFINAL-CODE-002"); await page.getByRole("button", { name: "确认导入兑换码", exact: true }).click();
    await page.getByText("成功导入：2，重复：0，非法：0，忽略空值：0", { exact: true }).waitFor();
  } else await page.getByLabel("奖品领取地点", { exact: true }).fill("验收工坊");
  await page.getByLabel("奖品有效开始", { exact: true }).fill(local(-60)); await page.getByLabel("奖品有效截止", { exact: true }).fill(local(8 * 1440));
  await shot(`${name}-prize-config`); await confirm(); await page.getByRole("button", { name: "保存并发布", exact: true }).click();
  await page.getByRole("heading", { name, exact: true }).waitFor(); const activity = (await read())[2].activities.find((row) => row.name === name);
  assert.equal(activity.status, "PUBLISHED"); assert.equal(activity.bookingEnabled, booking); await shot(`${name}-published`); return activity;
}
try {
  await route("marketing", "营销活动"); await page.waitForFunction((keys) => keys.every((key) => localStorage.getItem(key)), keys);
  const original = await raw(), [, members, seeded] = await read();
  checkpoint = "A physical creation / booking / staff / draw / claim";
  const physical = await create("Final-A-实体", false, true), user = members.brandUsers.find((row) => row.brand === physical.brand && row.is_deleted === 0);
  await page.getByRole("button", { name: /^已履约份数/ }).click(); await page.getByText("当前口径暂无记录", { exact: true }).waitFor(); await shot("A-empty-metric"); await page.keyboard.press("Escape");
  await route(`marketing/preview/${physical.id}/${user.id}`, "用户流程预览");
  assert.equal(await page.getByRole("button", { name: "即时抽奖", exact: true }).isEnabled(), false); await page.getByRole("button", { name: "预约参加", exact: true }).click();
  let state = (await read())[2], participant = state.participations.find((row) => row.activityId === physical.id);
  assert.ok(participant); assert.equal(state.chances.filter((row) => row.activityId === physical.id).length, 0); await shot("A-user-booked");
  await verify(participant.credential, "活动签到（不默认完成）", "A-checkin");
  state = (await read())[2]; assert.equal(state.chances.filter((row) => row.activityId === physical.id).length, 0);
  await verify(participant.credential, "工作人员确认完成（不默认领奖）", "A-complete");
  state = (await read())[2]; assert.equal(state.chances.filter((row) => row.activityId === physical.id).length, 1);
  await route(`marketing/preview/${physical.id}/${user.id}`, "用户流程预览"); await page.getByRole("button", { name: "即时抽奖", exact: true }).click(); await page.getByRole("status").filter({ hasText: "最近已保存结果" }).waitFor();
  state = (await read())[2]; const physicalAward = state.awards.find((row) => row.activityId === physical.id);
  assert.equal(physicalAward.prizeType, "PHYSICAL"); assert.equal(physicalAward.fulfilledAt, undefined); await page.getByText("现场直接领取 · 待领取", { exact: true }).waitFor(); await shot("A-winner-awaiting-claim");
  await verify(physicalAward.credential, "奖品领取 / 体验核销", "A-claim");
  state = (await read())[2]; assert.ok(state.awards.find((row) => row.id === physicalAward.id).fulfilledAt);
  assert.deepEqual(state.redemptions.filter((row) => row.activityId === physical.id).map((row) => row.type), ["CHECKIN", "COMPLETE", "PRIZE_CLAIM"]);
  await route(`marketing/activity/${physical.id}`, physical.name); assert.equal(await page.getByRole("button", { name: /^已履约份数/ }).locator("strong").innerText(), "1"); await shot("A-admin-fulfilled");
  await route(`marketing/activity/${physical.id}/awards`, physical.name); await page.getByText("已领取", { exact: true }).waitFor(); pass(checkpoint);

  checkpoint = "B virtual creation / import / staff completion / draw / stable code / fulfilled metric";
  const virtual = await create("Final-B-兑换码", true, false);
  await route(`marketing/preview/${virtual.id}/${user.id}`, "用户流程预览"); await page.getByRole("button", { name: "直接报名参加", exact: true }).click();
  participant = (await read())[2].participations.find((row) => row.activityId === virtual.id);
  await verify(participant.credential, "活动签到（不默认完成）", "B-checkin"); await verify(participant.credential, "工作人员确认完成（不默认领奖）", "B-complete");
  await route(`marketing/preview/${virtual.id}/${user.id}`, "用户流程预览"); await page.getByRole("button", { name: "即时抽奖", exact: true }).click(); await page.getByRole("status").filter({ hasText: "最近已保存结果" }).waitFor();
  const issued = (await read())[2].awards.find((row) => row.activityId === virtual.id); assert.equal(issued.virtualContent.code, "FINAL-CODE-001"); assert.ok(issued.issuedAt); assert.equal(issued.fulfilledAt, undefined);
  await page.getByText("兑换码 · 兑换码已分配", { exact: true }).waitFor(); await shot("B-code-issued");
  await page.reload({ waitUntil: "networkidle" }); await page.getByRole("button", { name: "重试上次请求（返回原结果）", exact: true }).click();
  state = (await read())[2]; assert.deepEqual(state.awards.find((row) => row.id === issued.id), issued); assert.equal(state.draws.filter((row) => row.activityId === virtual.id).length, 1);
  assert.equal(state.activities.find((row) => row.id === virtual.id).pool[0].codes.filter((row) => row.assignedAwardId === issued.id).length, 1);
  assert.equal(state.redemptions.filter((row) => row.activityId === virtual.id && row.type === "PRIZE_CLAIM").length, 0); await shot("B-reload-same-code");
  await route(`marketing/activity/${virtual.id}`, virtual.name); assert.equal(await page.getByRole("button", { name: /^已履约份数/ }).locator("strong").innerText(), "1");
  await page.getByRole("button", { name: /^已履约份数/ }).click(); await page.getByText(issued.id, { exact: true }).waitFor(); await shot("B-admin-issued-source"); await page.keyboard.press("Escape"); pass(checkpoint);

  checkpoint = "C old activity copy / all dates unset / no history or codes / draft delete confirmation";
  const ended = seeded.activities[3]; await route(`marketing/activity/${ended.id}`, ended.name);
  const before = (await read())[2]; await page.getByRole("button", { name: "复制活动", exact: true }).click();
  state = (await read())[2]; const copy = state.activities.find((row) => row.name === `${ended.name} · 副本`); await page.getByRole("heading", { name: copy.name, exact: true }).waitFor();
  assert.deepEqual([copy.startAt, copy.endAt, copy.bookingStart, copy.bookingEnd, copy.lotteryStart, copy.lotteryEnd], Array(6).fill(""));
  assert.ok(copy.pool.every((item) => item.claimStart === "" && item.claimEnd === "" && item.codes.length === 0));
  for (const slot of [...copy.slots, ...copy.pool.flatMap((item) => item.slots)]) assert.deepEqual([slot.startAt, slot.endAt, slot.bookingClosesAt, slot.checkinStart, slot.checkinEnd], Array(5).fill(""));
  for (const key of ["participations", "bookings", "chances", "draws", "awards", "redemptions"]) assert.deepEqual(state[key], before[key]);
  assert.deepEqual(state.activities.find((row) => row.id === ended.id), before.activities.find((row) => row.id === ended.id)); await shot("C-copy-empty-dates-and-counts");
  await page.getByRole("button", { name: "编辑活动", exact: true }).click(); assert.equal(await page.getByLabel("活动开始", { exact: true }).inputValue(), ""); await shot("C-copy-editor-empty"); await page.locator(".semi-sidesheet:visible").getByRole("button", { name: "取消", exact: true }).click();
  await route(`marketing/activity/${copy.id}/lottery`, copy.name);
  const codeRow = page.locator(".semi-table-row").filter({ hasText: copy.pool.find((item) => item.method === "REDEMPTION_CODE").name });
  await codeRow.getByRole("button", { name: "导入兑换码", exact: true }).click(); await page.getByLabel("兑换码文本", { exact: true }).fill("FINAL-UNUSED-DRAFT"); await page.getByRole("button", { name: "确认导入兑换码", exact: true }).click(); await page.locator(".semi-modal:visible").getByRole("button", { name: "完成", exact: true }).click();
  await page.getByRole("button", { name: "删除无记录草稿", exact: true }).click(); await page.getByRole("heading", { name: "删除草稿活动？", exact: true }).waitFor(); await shot("C-delete-second-confirm");
  await page.locator(".semi-modal:visible").getByRole("button", { name: "cancel", exact: true }).click(); assert.ok((await read())[2].activities.some((row) => row.id === copy.id));
  await page.getByRole("button", { name: "删除无记录草稿", exact: true }).click(); await confirm(); await page.getByRole("heading", { name: "营销活动", exact: true }).waitFor();
  state = (await read())[2]; assert.equal(state.activities.some((row) => row.id === copy.id), false); assert.equal(state.activities.flatMap((row) => row.pool.flatMap((item) => item.codes)).some((code) => code.code === "FINAL-UNUSED-DRAFT"), false);
  for (const key of ["participations", "bookings", "chances", "draws", "awards", "redemptions"]) assert.deepEqual(state[key], before[key]);
  assert.ok(state.audits.some((row) => row.action === "DELETE_ACTIVITY" && row.activityId === copy.id && row.result === "SUCCESS")); pass(checkpoint);

  checkpoint = "D activity and lottery ended / valid existing award / staff claim / idempotent retry";
  const existing = seeded.awards.find((row) => row.activityId === ended.id && row.method === "PICKUP");
  assert.ok(Date.parse(ended.endAt) < Date.now()); assert.ok(Date.parse(ended.lotteryEnd) < Date.now()); assert.ok(Date.parse(existing.claimEnd) > Date.now());
  await route(`marketing/activity/${ended.id}/awards`, ended.name); await page.getByText("已预约 / 待领取", { exact: true }).waitFor(); await shot("D-ended-valid-award");
  await verify(existing.credential, "奖品领取 / 体验核销", "D-ended-claim");
  const claimed = (await read())[2], savedAward = claimed.awards.find((row) => row.id === existing.id); assert.ok(savedAward.fulfilledAt);
  assert.equal(claimed.redemptions.filter((row) => row.awardId === existing.id && row.result === "SUCCESS").length, 1);
  await page.getByRole("button", { name: "确认执行所选动作", exact: true }).click(); await confirm();
  state = (await read())[2]; assert.deepEqual(state.awards, claimed.awards); assert.deepEqual(state.redemptions, claimed.redemptions);
  await route(`marketing/activity/${ended.id}/awards`, ended.name); assert.equal(await page.getByText("已领取", { exact: true }).count(), 2); await page.getByText("已过期（占用不返池）", { exact: true }).waitFor(); await shot("D-admin-history-retained"); pass(checkpoint);

  checkpoint = "Layout, storage isolation and diagnostics";
  for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) { await page.setViewportSize({ width, height }); await route(`marketing/activity/${ended.id}/awards`, ended.name); await shot(`Final-awards-${width}`); }
  assert.equal((await raw())[0], original[0]); assert.equal((await raw())[1], original[1]);
  assert.deepEqual(errors, []); assert.deepEqual(requests, []); pass("Sales/member namespaces byte-identical; console/runtime 0; failed requests 0; three desktop widths");
} catch (error) {
  results.push({ name: checkpoint, status: "FAIL", detail: error.stack || String(error) }); await page.screenshot({ path: resolve(root, "FAILED.png"), fullPage: true }).catch(() => {}); throw error;
} finally {
  await writeFile(resolve(root, "results.json"), JSON.stringify({ base, completedAt: new Date().toISOString(), results, errors, requests, evidence }, null, 2));
  await writeFile(resolve(root, "evidence.md"), `# Marketing Final Acceptance 页面证据\n\n独立Chrome隔离Context；场景A/B从创建起全部经UI执行，没有注入业务状态；C/D使用明确虚构旧活动种子。所有结论包含最终持久状态断言，不等同真实后端或生产并发保证。\n\n${evidence.map((item) => `## ${item.step}. ${item.name}\n\n![${item.name}](./${item.name}.png)\n\n${item.layout.width}×${item.layout.height} · SHA256 ${item.sha256}\n`).join("\n")}`);
  process.stdout.write(`Evidence ${root}\n`); await browser.close();
}
