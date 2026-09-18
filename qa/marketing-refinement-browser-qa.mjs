import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

// This suite never attaches to an existing browser or runs against a deployment.
// Business creation, participation and fulfillment below are real UI operations.
// The legacy compatibility case is a separately labelled isolated-context fixture.
const base = (process.env.PROTOTYPE_BASE_URL || "http://127.0.0.1:4174").replace(/\/$/, "");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname), "Refinement QA is restricted to a local preview, not user/production data");
const root = resolve("artifacts/prototype-qa", `${new Date().toISOString().replaceAll(":", "-")}-marketing-refinement-v2`);
const evidenceRoot = resolve(root, "00-evidence"), issueRoot = resolve(root, "01-issues");
await mkdir(evidenceRoot, { recursive: true }); await mkdir(issueRoot, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "America/Los_Angeles" });
const page = await context.newPage(); page.setDefaultTimeout(15_000);
const keys = ["kivisense-crm-prototype-v1", "kivisense-member-operations-v1", "kivisense-marketing-prototype-v1"];
const titles = [
  "新增活动规则保存", "编辑活动规则", "详情展示规则", "用户预览展示规则", "复制保留规则", "旧活动缺规则兼容", "规则文案不修改抽奖限制",
  "预约参与正常创建ACT预约", "直接参与不要求Booking", "直接参与创建稳定Participation", "直接参与不配置ACT场次", "预约参与发布检查有效场次",
  "直接领奖不要求PRIZE预约", "直接领奖生成独立WIN凭证", "预约领奖先预约再核验", "ACT与PRIZE场次独立", "参与方式与领奖方式独立",
  "预约参与+预约领奖", "预约参与+直接领奖", "直接参与+预约领奖", "直接参与+直接领奖",
  "无会员可参加", "无UnionID可参加", "无OpenID可参加", "无手机号可参加", "OpenID+AppID独立身份", "手机号H5参加", "匿名H5参加", "匿名身份可ACT预约", "匿名完成取得机会", "匿名可以中奖", "获奖不依赖手机号", "核销不依赖微信身份", "OpenID保留App上下文", "不同可选身份不错误合并",
  "基本信息错误返回基本步骤", "场次错误返回参与步骤", "抽奖错误返回抽奖步骤", "奖品错误返回奖品步骤", "去完善执行实际步骤跳转", "全部完成可发布",
];
const cases = titles.map((name, index) => ({ id: index + 1, name, status: "NOT_RUN", evidence: [] }));
const groups = [], evidence = [], errors = [], requests = [], fixtureNotes = [];
let checkpoint = "startup", initialRaw, failure;
function attachDiagnostics(target) {
  target.on("pageerror", (error) => errors.push({ checkpoint, error: error.message }));
  target.on("console", (message) => { if (message.type() === "error") errors.push({ checkpoint, error: message.text() }); });
  target.on("response", (response) => { if (response.status() >= 400) requests.push({ checkpoint, url: response.url(), status: response.status() }); });
  target.on("requestfailed", (request) => requests.push({ checkpoint, url: request.url(), error: request.failure()?.errorText }));
}
attachDiagnostics(page);
const raw = () => page.evaluate((storageKeys) => storageKeys.map((key) => localStorage.getItem(key)), keys);
const read = async () => (await raw()).map((row) => JSON.parse(row));
const local = (minutes) => new Date(Date.now() + minutes * 60_000 + 8 * 3_600_000).toISOString().slice(0, 16);
const editor = () => page.locator(".marketing-activity-editor:visible");
const pass = (ids, note, names = [evidence.at(-1)?.name]) => {
  for (const id of ids) { cases[id - 1].status = "PASS"; cases[id - 1].note = note; cases[id - 1].evidence.push(...names.filter(Boolean)); }
  process.stdout.write(`PASS [${ids.join(",")}] ${note}\n`);
};
const group = (name) => { groups.push({ name, status: "PASS" }); process.stdout.write(`PASS ${name}\n`); };
async function route(path, heading) {
  await page.goto(`${base}/#${path}`, { waitUntil: "networkidle" });
  if (heading) await page.getByRole("heading", { name: heading, exact: true }).waitFor();
}
async function step(name) { await editor().locator(".marketing-editor-nav").getByText(name, { exact: true }).click(); }
async function select(label, value) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.locator(".semi-select-option:visible").filter({ hasText: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).click();
  // Scenario selection can change the hash route and remount its form. Wait for
  // the selected visible value before addressing a control on the next page.
  await page.getByRole("combobox", { name: label, exact: true }).getByText(value, { exact: true }).waitFor();
  if (label === "身份演示场景") await page.waitForTimeout(150); // Hash-change remount + Semi dropdown close transition.
}
async function fill(values) { for (const [label, value] of Object.entries(values)) await page.getByLabel(label, { exact: true }).fill(value); }
async function modalSave(name) {
  const modal = page.locator(".semi-modal:visible").last(), target = await modal.elementHandle();
  assert.ok(target, `Expected visible modal for ${name}`);
  // Semi Modal keeps aria-label="confirm" even when okText is Chinese.
  const action = name === "confirm" ? modal.getByRole("button", { name, exact: true }) : modal.getByRole("button").filter({ hasText: new RegExp(`^${name}$`) });
  await action.click();
  // Pin the actual child modal: a live :visible.last() locator would retarget
  // its still-open prize parent after saving an embedded slot dialog.
  await page.waitForFunction((element) => !element.isConnected || element.getClientRects().length === 0 || getComputedStyle(element).visibility === "hidden", target);
  await target.dispose();
}
async function confirm() { await modalSave("confirm"); }
async function more(name) { await page.getByRole("button", { name: "更多操作", exact: true }).click(); await page.locator(".semi-dropdown-item:visible").getByText(name, { exact: true }).click(); }
async function openRule() {
  const details = page.locator("details.marketing-rule");
  if (await details.count() && !await details.evaluate((element) => element.open)) await details.locator("summary").click();
}
async function shot(name) {
  await page.waitForTimeout(150);
  const layout = await page.evaluate(() => {
    const workspace = document.querySelector(".page-scroll");
    return { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, workspaceWidth: workspace?.scrollWidth ?? 0, workspaceClient: workspace?.clientWidth ?? 0 };
  });
  assert.ok(layout.documentWidth <= layout.width + 1, `${name}: document horizontal overflow ${layout.documentWidth}>${layout.width}`);
  assert.ok(layout.workspaceWidth <= layout.workspaceClient + 1, `${name}: workspace horizontal overflow`);
  const bytes = await page.screenshot({ path: resolve(evidenceRoot, `${name}.png`), fullPage: false });
  evidence.push({ step: evidence.length + 1, name, url: page.url(), layout, sha256: createHash("sha256").update(bytes).digest("hex") });
}
async function fix(key, label, requiredLabel) {
  await step("发布检查");
  await editor().locator(`.marketing-readiness-row[data-check-key="${key}"]`).getByRole("button", { name: /去完善/ }).click();
  if (requiredLabel) await editor().getByLabel(requiredLabel, { exact: true }).waitFor();
  else await editor().getByRole("button", { name: /添加奖品/ }).waitFor();
  await shot(`publish-${key}-jump-${label}`);
}
async function addSlot(kind) {
  const prizeDialog = page.locator(".semi-modal:visible").last();
  if (kind === "PRIZE" && await prizeDialog.getByRole("button", { name: "编辑", exact: true }).count()) await prizeDialog.getByRole("button", { name: "编辑", exact: true }).first().click();
  else await page.getByRole("button", { name: kind === "ACT" ? /添加活动场次/ : /添加履约时段/ }).click();
  await fill({ "场次名称": `${kind} · 独立验收时段`, "场次地点": "验收工坊", "场次容量": "8", "场次开始": local(30), "场次结束": local(120), "场次预约截止": local(20), "允许签到开始": local(-30), "允许签到结束（含配置宽限）": local(150) });
  await modalSave("保存场次");
}
async function create(name, activityBooking, prizeBooking, checkErrors = false, virtual = false) {
  checkpoint = `${name} create / publish`;
  await route("marketing", "营销活动"); await page.getByRole("button", { name: "新建活动", exact: true }).click();
  if (checkErrors) {
    await fix("basic", "basic", "活动名称"); pass([36, 40], "发布检查basic去完善实际返回活动名称表单");
    await fill({ "活动名称": name, "活动规则": "参与需遵守活动说明；文案抽奖999次，不修改真实次数配置。" });
    await editor().getByRole("button", { name: "保存草稿", exact: true }).click();
    await page.getByRole("heading", { name, exact: true }).waitFor();
    let activity = (await read())[2].activities.find((row) => row.name === name);
    assert.ok(activity.ruleContent.includes("999")); await shot("rule-new-draft-saved"); pass([1], "从新建UI保存草稿后持久化ruleContent");
    await page.getByRole("button", { name: "编辑活动", exact: true }).click();
    await fill({ "活动规则": "修改后的规则：抽奖999次仅文案，不解析配置。" });
    await editor().getByRole("button", { name: "保存草稿", exact: true }).click();
    activity = (await read())[2].activities.find((row) => row.id === activity.id); assert.ok(activity.ruleContent.startsWith("修改后的"));
    await shot("rule-edited-draft-saved"); pass([2], "UI编辑ruleContent并重新保存，字段真实持久化");
    await page.getByRole("button", { name: "编辑活动", exact: true }).click();
  }
  await fill({ "活动名称": name, "活动说明": "Refinement V2 独立虚构验收活动", "活动地点": "验收工坊", "活动开始": local(-60), "活动结束": local(360) });
  if (!checkErrors) await fill({ "活动规则": `${name}规则；文案不解析业务数值。` });
  await editor().getByRole("radio", { name: activityBooking ? "预约参与" : "直接参与", exact: true }).check();
  await step("参与设置"); await select("完成条件", "工作人员确认完成");
  if (activityBooking) {
    if (checkErrors) { await fix("booking", "participation", "预约开放"); pass([12, 37, 40], "预约活动缺有效ACT场次不能发布，去完善返回参与设置"); }
    await fill({ "预约开放": local(-1440), "预约截止": local(180) }); await addSlot("ACT");
  } else {
    assert.equal(await editor().getByLabel("预约开放", { exact: true }).count(), 0);
    assert.equal(await editor().getByRole("button", { name: /添加活动场次/ }).count(), 0);
    assert.equal(await editor().getByRole("switch", { name: "允许取消预约", exact: true }).count(), 0);
    await shot(`${name}-direct-no-act-fields`); pass([9, 11], "直接参与没有ACT预约窗口/场次/取消字段要求");
  }
  await step("抽奖规则");
  await fill({ "抽奖开始": local(-60), "抽奖截止": local(480), "未中奖概率（%）": "0", "完成后发放次数": "1", "累计抽奖上限": "1" });
  if (checkErrors) {
    await fill({ "累计抽奖上限": "0" }); await fix("lottery", "lottery", "累计抽奖上限");
    pass([38, 40], "非法抽奖上限去完善返回抽奖规则"); await fill({ "累计抽奖上限": "1" });
  }
  await step("奖品设置"); await editor().getByRole("button", { name: /添加奖品/ }).click();
  if (virtual) await select("奖品类型", "虚拟奖品");
  await select("领取方式", virtual ? prizeBooking ? "预约履约" : "直接发放" : prizeBooking ? "预约领取" : "直接领取");
  await fill({ "奖品名称": `${name} · ${virtual ? "虚拟" : "实体"}奖品`, "奖品配置数量": "4", "中奖概率（%）": "100", "使用 / 领取说明": "凭本次独立中奖凭证领取", "奖品有效开始": local(-60), "奖品有效截止": local(8 * 1440) });
  if (!virtual || prizeBooking) await fill({ "奖品领取地点": "验收工坊" });
  if (virtual) {
    await fill({ "兑换码文本": [1, 2, 3, 4].map((id) => `REFINEMENT-RESERVATION-CODE-${id}`).join("\n") });
    await page.getByRole("button", { name: "确认导入兑换码", exact: true }).click();
    await page.getByText("成功导入：4，重复：0，非法：0，忽略空值：0", { exact: true }).waitFor();
  }
  if (prizeBooking) await addSlot("PRIZE");
  await shot(`${name}-prize-type-and-fulfillment`); await modalSave("保存奖品"); await step("发布检查");
  if (checkErrors) {
    // A zero-capacity slot is legal draft data, but cannot cover four promised awards.
    await step("奖品设置"); await editor().getByRole("button", { name: "编辑", exact: true }).first().click();
    await page.locator(".semi-modal:visible").last().getByRole("button", { name: "编辑", exact: true }).first().click();
    await fill({ "场次容量": "0" }); await modalSave("保存场次"); await modalSave("保存奖品");
    await fix("fulfillment", "prize", undefined); pass([39, 40], "奖品容量不足检查去完善实际返回奖品设置，不放宽发布条件");
    await editor().getByRole("button", { name: "编辑", exact: true }).first().click(); await addSlot("PRIZE"); await modalSave("保存奖品"); await step("发布检查");
  }
  assert.equal(await editor().getByRole("button", { name: /去完善/ }).count(), 0);
  await editor().getByText("已准备好发布", { exact: false }).waitFor();
  await shot(`${name}-ready-to-publish`); await editor().getByRole("button", { name: "发布活动", exact: true }).click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
  const activity = (await read())[2].activities.find((row) => row.name === name);
  assert.equal(activity.status, "PUBLISHED"); assert.equal(activity.bookingEnabled, activityBooking);
  assert.equal(activity.pool[0].fulfillmentMode, prizeBooking ? "RESERVATION" : "DIRECT");
  assert.equal(activity.drawLimit, 1); if (checkErrors) pass([7, 41], "全部检查完成才发布；规则含999不改变真实drawLimit=1");
  await shot(`${name}-published-overview`); return activity;
}
async function verify(credential, action, name) {
  await route(`redemption/${encodeURIComponent(credential)}`, "核销端"); assert.equal(await page.locator(".sidebar").count(), 0);
  await page.getByRole("button", { name: "识别凭证 / 模拟扫码", exact: true }).click(); await select("本次核验动作", action);
  await shot(`${name}-recognized`); await page.getByRole("button", { name: "确认执行所选动作", exact: true }).click(); await confirm();
  await shot(`${name}-executed`);
}
async function participate(activity, scene, name) {
  await route(`marketing/preview/${activity.id}`, "用户流程预览"); await select("身份演示场景", scene);
  if (scene === "微信 OpenID") await select("参与渠道", "微信 H5");
  await openRule();
  await page.getByText(activity.ruleContent, { exact: true }).waitFor(); await shot(`${name}-identity-before-participation`);
  const before = (await read())[2].participations.filter((row) => row.activityId === activity.id).map((row) => row.id);
  await page.getByRole("button", { name: activity.bookingEnabled ? "预约参加" : "直接报名参加", exact: true }).click();
  await page.waitForFunction(({ key, activityId, before }) => JSON.parse(localStorage.getItem(key)).participations.some((row) => row.activityId === activityId && !before.includes(row.id)), { key: keys[2], activityId: activity.id, before });
  let state = (await read())[2], participant = state.participations.find((row) => row.activityId === activity.id && !before.includes(row.id));
  assert.ok(participant?.participantId, "new participation has a stable internal participantId");
  assert.equal(state.chances.filter((row) => row.participationId === participant.id).length, 0, "register/book never grants a chance");
  const bookings = state.bookings.filter((row) => row.participationId === participant.id);
  assert.equal(bookings.filter((row) => row.kind === "ACTIVITY").length, activity.bookingEnabled ? 1 : 0);
  await shot(`${name}-participated`);
  if (activity.bookingEnabled) pass([8], "预约参与通过页面创建关联内部Participation的ACT Booking，未发机会");
  else pass([9, 10, 11], "直接参加产生内部稳定Participation，没有ACT Booking或slot依赖");
  return participant;
}
async function completeDrawClaim(activity, scene, name, combinationCase) {
  checkpoint = `${name} participate / complete / draw / fulfillment`;
  const participant = await participate(activity, scene, name);
  if (scene === "匿名 H5") {
    assert.ok(participant.identity.anonymousId); assert.ok(!participant.identity.memberId && !participant.identity.unionId && !participant.identity.openId && !participant.identity.phone);
    pass([22, 23, 24, 25, 28], "匿名UI参与外部会员/微信/手机号均缺失仍成功");
    if (activity.bookingEnabled) pass([29], "匿名身份通过真实预约UI占ACT场次");
  }
  if (scene === "微信 OpenID") {
    assert.ok(participant.identity.openId && participant.identity.wechatAppId);
    assert.equal(participant.participationChannel, "WECHAT_H5");
    assert.ok(!participant.identity.unionId && !participant.identity.phone && !participant.identity.memberId);
    pass([22, 23, 25, 26, 34], "OpenID+AppID场景实际参加，保留应用上下文，不要求Union/会员/手机");
  }
  if (scene === "手机号 H5") {
    assert.ok(participant.identity.phone && participant.identity.phoneCountryCode);
    assert.ok(!participant.identity.openId && !participant.identity.unionId);
    pass([23, 24, 27], "手机号H5实际参与，不依赖微信身份");
  }
  await verify(participant.credential, "活动签到（不默认完成）", `${name}-checkin`);
  assert.equal((await read())[2].chances.filter((row) => row.participationId === participant.id).length, 0);
  await verify(participant.credential, "工作人员确认完成（不默认领奖）", `${name}-complete`);
  let state = (await read())[2]; assert.equal(state.chances.filter((row) => row.participationId === participant.id).length, 1);
  if (scene === "匿名 H5") pass([30], "匿名凭ACT凭证完成，通过最终状态确认仅一次机会");
  await route(`marketing/preview/${activity.id}/p:${participant.id}`, "用户流程预览");
  await page.getByRole("button", { name: "即时抽奖", exact: true }).click();
  await page.waitForFunction(({ key, participationId }) => JSON.parse(localStorage.getItem(key)).awards.some((row) => row.participationId === participationId), { key: keys[2], participationId: participant.id });
  state = (await read())[2]; const award = state.awards.find((row) => row.participationId === participant.id);
  assert.ok(award?.credential.startsWith("WIN-") && award.credential !== participant.credential);
  assert.equal(award.fulfillmentMode, activity.pool[0].fulfillmentMode); assert.equal(state.draws.filter((row) => row.participationId === participant.id).length, 1);
  assert.equal(state.awards.filter((row) => row.poolItemId === award.poolItemId).length, 1, "winning occupies one quota unit");
  if (scene === "匿名 H5") { assert.ok(!participant.identity.phone); pass([31, 32], "匿名实际UI中奖，Award仅依赖内部Participation，无手机号要求"); }
  const prizeBooking = award.fulfillmentMode === "RESERVATION";
  if (prizeBooking) {
    assert.equal(await page.getByText(award.credential, { exact: true }).count(), 0, "reservation WIN credential is displayed only after an actual prize booking");
    if (award.prizeType === "VIRTUAL") {
      assert.equal(award.issuedAt, undefined);
      assert.equal(await page.getByText(award.virtualContent.code, { exact: true }).count(), 0, "reserved virtual content is not prematurely issued/displayed");
    }
    await verify(award.credential, "奖品领取 / 体验核销", `${name}-claim-before-booking-rejected`);
    assert.equal((await read())[2].awards.find((row) => row.id === award.id).fulfilledAt, undefined);
    await route(`marketing/preview/${activity.id}/p:${participant.id}`, "用户流程预览");
    await page.getByRole("button", { name: "预约奖品领取 / 体验", exact: true }).click();
    state = (await read())[2]; const prize = state.bookings.find((row) => row.awardId === award.id && row.kind === "PRIZE");
    assert.ok(prize && prize.participationId === participant.id && prize.poolItemId === award.poolItemId);
    assert.ok(activity.pool[0].slots.some((slot) => slot.id === prize.slotId));
    assert.ok(!activity.slots.some((slot) => slot.id === prize.slotId));
    assert.equal(state.chances.filter((row) => row.participationId === participant.id).length, 1);
    await page.getByText(award.credential, { exact: true }).waitFor();
    await shot(`${name}-prize-booked-independent-slot`); pass([15, 16], "未PRIZE预约核验拒绝；页面预约后引用奖品独立slot，不重发机会");
  } else {
    assert.equal(state.bookings.filter((row) => row.awardId === award.id && row.kind === "PRIZE").length, 0);
    assert.equal(await page.getByRole("button", { name: "预约奖品领取 / 体验", exact: true }).count(), 0);
    await page.getByText(award.credential, { exact: true }).waitFor();
    await shot(`${name}-direct-win-credential`); pass([13, 14], "直接领奖真实中奖后有独立WIN凭证，无PRIZE Booking要求");
  }
  await verify(award.credential, "奖品领取 / 体验核销", `${name}-claim`);
  state = (await read())[2]; assert.ok(state.awards.find((row) => row.id === award.id).fulfilledAt);
  assert.equal(state.redemptions.filter((row) => row.awardId === award.id && row.result === "SUCCESS").length, 1);
  if (scene === "匿名 H5" || scene === "手机号 H5") pass([33], "缺微信身份仍经Staff凭WIN完成CLAIM，成功事实恰好一条");
  const snapshot = JSON.stringify({ awards: state.awards, redemptions: state.redemptions, draws: state.draws });
  await page.getByRole("button", { name: "确认执行所选动作", exact: true }).click(); await confirm();
  state = (await read())[2]; assert.equal(JSON.stringify({ awards: state.awards, redemptions: state.redemptions, draws: state.draws }), snapshot);
  await route(`marketing/activity/${activity.id}/awards`, activity.name);
  await page.getByText("已领取", { exact: true }).waitFor(); await shot(`${name}-admin-fulfilled`);
  pass([...(combinationCase ? [combinationCase] : []), 17], `${name}完整UI链路+持久结果，活动预约与奖品履约独立，成功核销重试不二领`);
  return { participant, award };
}

try {
  await route("marketing", "营销活动"); await page.waitForFunction((storageKeys) => storageKeys.every((key) => localStorage.getItem(key)), keys);
  initialRaw = await raw(); const seeded = (await read())[2];
  const matrix = [];
  for (const [name, booking, prizeBooking, scene, id] of [
    ["Refinement-A预约预约", true, true, "匿名 H5", 18], ["Refinement-B预约直接", true, false, "微信 OpenID", 19],
    ["Refinement-C直接预约", false, true, "手机号 H5", 20], ["Refinement-D直接直接", false, false, "匿名 H5", 21],
  ]) {
    const activity = await create(name, booking, prizeBooking, id === 18);
    if (id === 18) {
      await route(`marketing/activity/${activity.id}/basic`, activity.name); await page.getByRole("tabpanel", { name: "基本信息", exact: true }).getByText(activity.ruleContent, { exact: true }).waitFor();
      await shot("rule-detail-visible"); pass([3], "活动配置基本信息实际显示与description独立的ruleContent");
    }
    const result = await completeDrawClaim(activity, scene, name, id); matrix.push({ activity, ...result });
  }
  pass([4], "四种用户预览均显示保存的活动规则", matrix.map(({ activity }) => `${activity.name}-identity-before-participation`));
  checkpoint = "virtual RESERVATION remains independent of type";
  const virtual = await create("Refinement-E虚拟预约", false, true, false, true);
  const virtualResult = await completeDrawClaim(virtual, "匿名 H5", "Refinement-E虚拟预约");
  const virtualState = (await read())[2], finalVirtual = virtualState.awards.find((row) => row.id === virtualResult.award.id);
  assert.equal(virtualResult.award.prizeType, "VIRTUAL"); assert.equal(virtualResult.award.issuedAt, undefined, "reservation virtual is not issued before booking/claim");
  assert.ok(finalVirtual.issuedAt && finalVirtual.fulfilledAt); assert.ok(finalVirtual.virtualContent.code);
  assert.notEqual(finalVirtual.virtualContent.code, finalVirtual.credential);
  assert.equal(virtualState.activities.find((row) => row.id === virtual.id).pool[0].codes.filter((row) => row.assignedAwardId === finalVirtual.id).length, 1);
  group("Virtual reservation: separate fulfillment, deferred issue, one allocated code and WIN != code");
  checkpoint = "stable optional identities / copy / navigation";
  const direct = matrix[3].activity;
  await route(`marketing/preview/${direct.id}`, "用户流程预览"); await select("身份演示场景", "微信完整身份");
  const full = await participate(direct, "微信完整身份", "identity-full-wechat");
  assert.ok(full.identity.openId && full.identity.wechatAppId && full.identity.unionId);
  const ids = (await read())[2].participations.filter((row) => row.activityId === direct.id).map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length); assert.ok(!ids.includes(matrix[3].participant.id) || full.id !== matrix[3].participant.id);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "直接报名参加", exact: true }).click();
  assert.deepEqual((await read())[2].participations.filter((row) => row.activityId === direct.id).map((row) => row.id), ids);
  await shot("identity-reload-stable-no-merge"); pass([10, 35], "匿名与微信完整身份保持不同内部记录，刷新同场景报名幂等，不根据弱字段合并");
  await route(`marketing/activity/${matrix[0].activity.id}`, matrix[0].activity.name); await more("复制活动");
  const copy = (await read())[2].activities.find((row) => row.name === `${matrix[0].activity.name} · 副本`);
  assert.equal(copy.ruleContent, matrix[0].activity.ruleContent); assert.equal(copy.status, "DRAFT");
  assert.deepEqual([copy.startAt, copy.endAt, copy.bookingStart, copy.bookingEnd, copy.lotteryStart, copy.lotteryEnd], Array(6).fill(""));
  assert.equal((await read())[2].participations.some((row) => row.activityId === copy.id), false);
  await shot("copy-retains-rule-without-history"); pass([5], "真实复制保留ruleContent，原Final日期/历史清空仍成立"); group("Four combinations, optional identities, rules and publish step jumps");

  checkpoint = "desktop hierarchy / empty / dialogs";
  const forbidden = [/后台职责/, /纯前端演示/, /免费单人活动/, /Asia\/Shanghai/, /本地抽奖/, /容量和权限不具备生产并发能力/, /不发送消息/, /不连接微信/, /CRM仅配置活动/, /当前原型/, /不是核销数据/, /规则版本/, /业务归属/];
  const productCopy = async (width) => { const text = await page.locator(".marketing-detail:visible").innerText(); for (const pattern of forbidden) assert.ok(!pattern.test(text), `${width}: persistent developer copy ${pattern}`); };
  for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) {
    await page.setViewportSize({ width, height }); await route(`marketing/activity/${direct.id}`, direct.name);
    await productCopy(width);
    const primary = page.locator(".marketing-primary-tabs");
    assert.deepEqual((await primary.getByRole("tab").allTextContents()).map((value) => value.trim()), ["概览", "活动配置", "参与记录", "奖品履约"]);
    assert.equal(await page.getByRole("button", { name: /有效预约/ }).count(), 0, "direct overview hides ACT reservation metric");
    await shot(`overview-${width}`);
    await page.getByRole("button", { name: "查看时间安排", exact: true }).click(); await shot(`time-arrangement-${width}`); await page.keyboard.press("Escape");
    await route(`marketing/activity/${direct.id}/participants`, direct.name); await shot(`participants-${width}`);
    const table = page.locator(".semi-table:visible").first(); const tableText = await table.innerText();
    const scrollers = await table.evaluate((element) => {
      const wrapper = element.closest(".semi-table-wrapper") || element.parentElement;
      return [wrapper, ...wrapper.querySelectorAll("*")].filter((node) => node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1 && ["auto", "scroll"].includes(getComputedStyle(node).overflowX)).map((node) => ({ className: node.className, width: node.clientWidth, scrollWidth: node.scrollWidth }));
    });
    assert.ok(scrollers.length > 0, `${width}: wide participant table must scroll internally, not at document/workspace level`);
    for (const participant of (await read())[2].participations.filter((row) => row.activityId === direct.id)) {
      for (const value of [participant.identity?.openId, participant.identity?.unionId, participant.identity?.phone]) if (value) assert.ok(!tableText.includes(value), `${width}: unmasked identity in ordinary table`);
    }
    assert.ok(!/\b(?:undefined|null)\b/.test(tableText));
    await table.getByRole("button").first().click();
    const participantDrawer = page.locator(".semi-sidesheet:visible");
    await participantDrawer.getByText("参与用户详情", { exact: true }).waitFor();
    const identityText = await participantDrawer.innerText(); assert.ok(!/\b(?:undefined|null)\b/.test(identityText));
    for (const label of ["UnionID", "OpenID", "微信应用", "国家码", "参与编号"]) await participantDrawer.getByText(label, { exact: true }).waitFor();
    await shot(`participant-detail-${width}`); await page.keyboard.press("Escape");
    // Every requested desktop leaf gets real navigation and a viewport capture;
    // use the completed reservation activity, so booking pages are not only empty.
    await route(`marketing/activity/${matrix[0].activity.id}`, matrix[0].activity.name);
    for (const [leaf, primaryLabel, secondaryLabel] of [
      ["basic", "活动配置", "基本信息"], ["booking-settings", "活动配置", "参与设置"], ["lottery", "活动配置", "抽奖与奖品"],
      ["bookings", "参与记录", "预约记录"], ["draws", "参与记录", "抽奖记录"], ["awards", "奖品履约", "中奖记录"], ["redemptions", "奖品履约", "核销记录"],
    ]) {
      await page.locator(".marketing-primary-tabs").getByRole("tab", { name: primaryLabel, exact: true }).click();
      await page.getByRole("tab", { name: secondaryLabel, exact: true }).click();
      await page.waitForURL((url) => url.hash === `#marketing/activity/${matrix[0].activity.id}/${leaf}`);
      await page.getByRole("tabpanel", { name: secondaryLabel, exact: true }).waitFor();
      await productCopy(width); await shot(`detail-${leaf}-${width}`);
    }
    await route(`marketing/activity/${copy.id}`, copy.name); await page.getByRole("button", { name: "编辑活动", exact: true }).click();
    await shot(`editor-basic-${width}`);
    await step("参与设置"); await shot(`editor-participation-reservation-${width}`);
    await step("抽奖规则"); await shot(`editor-draw-rules-${width}`);
    await step("奖品设置"); await shot(`editor-prize-settings-${width}`);
    await step("基本信息"); await editor().getByRole("radio", { name: "直接参与", exact: true }).check();
    await step("参与设置"); assert.equal(await editor().getByLabel("预约开放", { exact: true }).count(), 0);
    await shot(`editor-participation-direct-${width}`);
    await step("发布检查"); await shot(`publish-check-${width}`);
    await editor().getByRole("button", { name: "返回", exact: true }).click();
    await editor().getByRole("button", { name: "取消", exact: true }).click();
    assert.equal((await read())[2].activities.find((row) => row.id === copy.id).bookingEnabled, true, "unsaved direct-mode preview does not change copied persistent configuration");
  }
  group("Four primary tabs, nested routes, operational publish UI, responsive desktop and identity masking");

  checkpoint = "mobile preview / independent staff";
  for (const width of [375, 430]) {
    await page.setViewportSize({ width, height: 900 }); await route(`marketing/preview/${direct.id}`, "用户流程预览"); await select("身份演示场景", "匿名 H5");
    await shot(`mobile-preview-${width}`); await route(`redemption/${matrix[3].award.credential}`, "核销端");
    await page.getByRole("button", { name: "识别凭证 / 模拟扫码", exact: true }).click(); await shot(`mobile-staff-${width}`);
    assert.equal(await page.locator(".sidebar").count(), 0);
  }
  group("375/430 preview and independent staff layouts");

  checkpoint = "legacy missing optional fields (explicit fixture, no claimed UI creation)";
  const legacyContext = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const legacyPage = await legacyContext.newPage(); attachDiagnostics(legacyPage);
  const legacy = structuredClone(seeded); delete legacy.activities[0].ruleContent;
  for (const row of legacy.participations) { delete row.participantId; delete row.identity; delete row.participationChannel; }
  const legacyRaw = JSON.stringify(legacy); fixtureNotes.push("Case6: isolated fresh context seeded with existing V2 snapshot minus optional rule/identity/channel; only fixture preparation uses storage write, browser reads/reloads assert byte preservation.");
  await legacyPage.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: keys[2], value: legacyRaw });
  await legacyPage.goto(`${base}/#marketing/activity/${legacy.activities[0].id}/basic`, { waitUntil: "networkidle" });
  await legacyPage.getByRole("heading", { name: legacy.activities[0].name, exact: true }).waitFor();
  assert.equal(await legacyPage.evaluate((key) => localStorage.getItem(key), keys[2]), legacyRaw);
  await legacyPage.reload({ waitUntil: "networkidle" }); assert.equal(await legacyPage.evaluate((key) => localStorage.getItem(key), keys[2]), legacyRaw);
  const legacyBytes = await legacyPage.screenshot({ path: resolve(evidenceRoot, "legacy-missing-rule-readonly.png"), fullPage: false });
  evidence.push({ step: evidence.length + 1, name: "legacy-missing-rule-readonly", url: legacyPage.url(), layout: { width: 1280, height: 800 }, sha256: createHash("sha256").update(legacyBytes).digest("hex") });
  pass([6], "明确旧V2 fixture只读页面兼容：缺规则/可选身份刷新原文不变，不回填"); await legacyContext.close();

  checkpoint = "legacy anonymous p:id replay (explicit UI-created-record compatibility fixture)";
  const pointerContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: "America/Los_Angeles" });
  const pointerPage = await pointerContext.newPage(); attachDiagnostics(pointerPage);
  const pointerFixture = structuredClone((await read())[2]), oldAnonymousId = matrix[3].participant.id;
  const oldAnonymous = pointerFixture.participations.find((row) => row.id === oldAnonymousId);
  assert.ok(oldAnonymous && oldAnonymous.identities.length === 0);
  delete oldAnonymous.participantId; delete oldAnonymous.identity; delete oldAnonymous.participationChannel;
  const pointerRaw = JSON.stringify(pointerFixture);
  fixtureNotes.push("Supplement: clone the Direct anonymous record originally created/completed/drawn/claimed by UI in D, remove optional participantId/identity/channel only in a second isolated context, then p:id reload and UI re-register. This is a compatibility fixture, not a claim that legacy metadata was edited through UI.");
  await pointerPage.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: keys[2], value: pointerRaw });
  await pointerPage.goto(`${base}/#marketing/preview/${direct.id}/p:${oldAnonymousId}`, { waitUntil: "networkidle" });
  await pointerPage.getByRole("heading", { name: "用户流程预览", exact: true }).waitFor();
  assert.equal(await pointerPage.evaluate((key) => localStorage.getItem(key), keys[2]), pointerRaw, "legacy anonymous read is non-mutating");
  await pointerPage.reload({ waitUntil: "networkidle" });
  assert.equal(await pointerPage.evaluate((key) => localStorage.getItem(key), keys[2]), pointerRaw, "legacy p:id refresh does not reseed/backfill");
  const pointerOtherBefore = await pointerPage.evaluate((storageKeys) => storageKeys.map((key) => localStorage.getItem(key)), keys.slice(0, 2));
  await pointerPage.getByRole("button", { name: "直接报名参加", exact: true }).click();
  await pointerPage.waitForURL(`**/p:${oldAnonymousId}`);
  const pointerAfter = await pointerPage.evaluate((key) => JSON.parse(localStorage.getItem(key)), keys[2]);
  assert.deepEqual(pointerAfter.participations.map((row) => row.id), pointerFixture.participations.map((row) => row.id), "legacy anonymous replay preserves every participation ID/count");
  for (const collection of ["bookings", "chances", "draws", "awards", "redemptions"]) assert.deepEqual(pointerAfter[collection], pointerFixture[collection], `legacy anonymous replay preserves ${collection} facts`);
  assert.ok(pointerAfter.participations.find((row) => row.id === oldAnonymousId).identity?.memberId == null, "legacy anonymous replay does not attach a member");
  assert.deepEqual(await pointerPage.evaluate((storageKeys) => storageKeys.map((key) => localStorage.getItem(key)), keys.slice(0, 2)), pointerOtherBefore, "compatibility replay never creates sales/member data");
  const pointerLayout = await pointerPage.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth }));
  assert.ok(pointerLayout.documentWidth <= pointerLayout.width + 1);
  const pointerBytes = await pointerPage.screenshot({ path: resolve(evidenceRoot, "legacy-anonymous-p-id-replay.png"), fullPage: false });
  evidence.push({ step: evidence.length + 1, name: "legacy-anonymous-p-id-replay", url: pointerPage.url(), layout: pointerLayout, sha256: createHash("sha256").update(pointerBytes).digest("hex") });
  group("Legacy anonymous p:id: reload and real UI replay preserve IDs, chances, draws, awards and other workspaces"); await pointerContext.close();

  checkpoint = "Final storage isolation / errors / complete matrix";
  assert.equal((await raw())[0], initialRaw[0], "sales namespace byte-identical"); assert.equal((await raw())[1], initialRaw[1], "member namespace byte-identical");
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  assert.equal(cases.filter((row) => row.status !== "PASS").length, 0, `Uncovered cases: ${cases.filter((row) => row.status !== "PASS").map((row) => row.id).join(",")}`);
  group("41/41 checks; sales/member unchanged; runtime/console/request failures zero");
} catch (error) {
  failure = error; groups.push({ name: checkpoint, status: "FAIL", detail: error.stack || String(error) });
  await page.screenshot({ path: resolve(issueRoot, "FAILED.png"), fullPage: false }).catch(() => {});
} finally {
  const completedAt = new Date().toISOString();
  await writeFile(resolve(root, "results.json"), JSON.stringify({ base, completedAt, status: failure ? "NOT_PASSED" : "PASSED", groups, cases, errors, requests, fixtureNotes, evidence }, null, 2));
  await writeFile(resolve(evidenceRoot, "evidence.md"), `# Marketing Refinement V2 页面证据\n\n本地独立Chrome Context；A–D从新建活动到领取均为真实UI和最终LocalStorage结果。匿名/手机号/OpenID身份是明确虚构演示场景。奖品概率通过页面配置为100%，不覆写Math.random、内部状态或生产逻辑。旧数据兼容单独标注fixture，不声称该旧数据由页面创建。不等同生产认证、库存事务或真实服务验证。\n\n${fixtureNotes.join("\n\n")}\n\n${evidence.map((item) => `## ${item.step}. ${item.name}\n\n页面：${item.url}\n\n![${item.name}](./${item.name}.png)\n\n${item.layout.width}×${item.layout.height} · SHA256 ${item.sha256}\n`).join("\n")}`);
  await writeFile(resolve(issueRoot, "issues.md"), `# Issues\n\n## Functional Issues\n\n${failure ? `S2 · ${checkpoint}\n\nExpected: task acceptance invariant.\n\nActual:\n\n\`\`\`text\n${failure.stack || failure}\n\`\`\`\n\n![failure](./FAILED.png)\n\nRetest: rerun unchanged case after fix.\n` : "未发现已执行功能检查失败。"}\n\n## Design Consistency Issues\n\n自动检查仅涵盖层级、禁用研发文案、身份掩码和document overflow；截图仍需人工视觉复核，不声称逐像素验收。\n\n## Coverage\n\n${cases.filter((row) => row.status !== "PASS").map((row) => `${row.id}. ${row.name}: NOT_RUN`).join("\n") || "41项均有已执行UI或明确标注的旧数据fixture断言；原Final/权限/代码边界须另重跑原六套回归。"}\n`);
  process.stdout.write(`Evidence ${root}\n`); await browser.close();
}
if (failure) throw failure;
