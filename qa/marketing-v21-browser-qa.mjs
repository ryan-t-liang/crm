import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const base = process.env.PROTOTYPE_BASE_URL || "http://127.0.0.1:4174";
const root = resolve("artifacts/prototype-qa", `${new Date().toISOString().replaceAll(":", "-")}-marketing-v21`);
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
const pass = (name) => { results.push({ name, status: "PASS" }); checkpoint = name; process.stdout.write(`PASS ${name}\n`); };
const local = (minutes) => new Date(Date.now() + minutes * 60_000 + 8 * 3_600_000).toISOString().slice(0, 16);
async function route(path, heading) { await page.goto(`${base}/#${path}`, { waitUntil: "networkidle" }); if (heading) await page.getByRole("heading", { name: heading, exact: true }).waitFor(); }
async function step(label) { await page.locator(".semi-sidesheet:visible .semi-steps").getByText(label, { exact: true }).click(); }
async function select(label, value) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.locator(".semi-select-option:visible").filter({ hasText: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).click(); await page.waitForTimeout(100);
}
async function confirm() { const dialog = page.locator(".semi-modal:visible").last(); await dialog.getByRole("button", { name: "confirm", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); }
async function shot(name) {
  await page.waitForTimeout(250); // Let Semi overlay transitions settle before visual evidence.
  const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scroll: document.documentElement.scrollWidth }));
  assert.ok(layout.scroll <= layout.width + 1, `${name}: document horizontal overflow`);
  const bytes = await page.screenshot({ path: resolve(root, `${name}.png`), fullPage: true });
  evidence.push({ step: evidence.length + 1, name, layout, sha256: createHash("sha256").update(bytes).digest("hex") });
}
async function setMemberFixture(value) { await page.evaluate(([key, value]) => localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value)), [keys[1], value]); await page.reload({ waitUntil: "networkidle" }); }
async function importCodes(text) {
  await page.getByLabel("兑换码文本", { exact: true }).fill(text); await page.getByRole("button", { name: "确认导入兑换码", exact: true }).click();
}
try {
  await route("marketing", "营销活动"); await page.waitForFunction((keys) => keys.every((key) => localStorage.getItem(key)), keys);
  const originals = await raw(), [sales, members, seeded] = await read();
  const emptyMembers = { ...members, brandUsers: [], userProfiles: [] };
  await setMemberFixture(emptyMembers); await page.getByRole("heading", { name: "营销活动", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "新建活动", exact: true }).isEnabled(), true);
  await page.getByRole("button", { name: "新建活动", exact: true }).click();
  assert.equal(await page.getByLabel("活动开始", { exact: true }).inputValue(), ""); assert.equal(await page.getByLabel("活动结束", { exact: true }).inputValue(), "");
  await page.getByText("请选择活动开始时间", { exact: true }).waitFor(); await page.getByText("请选择活动结束时间", { exact: true }).waitFor();
  await page.getByLabel("活动名称", { exact: true }).fill("V2.1 · 无会员活动"); await select("所属品牌", "Ulysse Nardin");
  await step("预约设置"); await page.getByRole("button", { name: "添加活动场次", exact: true }).click();
  assert.equal(await page.getByLabel("场次开始", { exact: true }).inputValue(), ""); assert.equal(await page.getByLabel("场次结束", { exact: true }).inputValue(), "");
  await shot("01-empty-member-draft-unset-slot-times"); await page.getByRole("button", { name: "删除草稿场次", exact: true }).click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click(); await page.getByRole("heading", { name: "V2.1 · 无会员活动", exact: true }).waitFor();
  let state = (await read())[2]; const emptyActivity = state.activities.find((activity) => activity.name === "V2.1 · 无会员活动");
  assert.equal(emptyActivity.brand, "un"); assert.equal(emptyActivity.startAt, ""); assert.equal(emptyActivity.status, "DRAFT");
  await route(`marketing/preview/${emptyActivity.id}`, "用户流程预览"); await page.getByText("当前品牌暂无可用参与用户。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /现场报名/ }).count(), 0); await shot("02-empty-member-preview");
  await route(`marketing/activity/${emptyActivity.id}`, emptyActivity.name); await page.getByRole("button", { name: "编辑活动", exact: true }).click();
  await page.getByLabel("活动说明", { exact: true }).fill("无需会员也可以发布未来活动"); await page.getByLabel("活动地点", { exact: true }).fill("未来品牌工坊");
  await page.getByLabel("活动开始", { exact: true }).fill(local(1440)); await page.getByLabel("活动结束", { exact: true }).fill(local(1800));
  await page.getByRole("switch", { name: "开启活动预约", exact: true }).click(); await page.getByRole("switch", { name: "开启活动抽奖", exact: true }).click();
  await page.getByRole("button", { name: "保存并发布", exact: true }).click(); await page.getByRole("heading", { name: emptyActivity.name, exact: true }).waitFor();
  assert.equal((await read())[2].activities.find((activity) => activity.id === emptyActivity.id).status, "PUBLISHED");
  await route("redemption", "核销端"); assert.equal(await page.locator(".sidebar").count(), 0);
  await page.getByText("当前品牌暂无可用参与用户。", { exact: true }).waitFor(); await shot("03-empty-member-staff");
  assert.equal((await raw())[0], originals[0]); await setMemberFixture(originals[1]);
  pass("No-member manager creates/saves/publishes future activity; brand selection and blank-time/session UI; preview/staff empty states");

  const source = seeded.activities[0]; await route(`marketing/activity/${source.id}`, source.name);
  await page.getByRole("button", { name: "复制活动", exact: true }).click();
  state = (await read())[2]; const copy = state.activities.find((activity) => activity.name === `${source.name} · 副本`);
  await page.getByRole("heading", { name: copy.name, exact: true }).waitFor();
  await route(`marketing/activity/${copy.id}/lottery`, copy.name);
  const pickup = copy.pool.find((prize) => prize.method === "PICKUP");
  const pickupRow = page.locator(".semi-table-row").filter({ hasText: pickup.name }); await pickupRow.getByRole("button", { name: "编辑奖品", exact: true }).click();
  await page.getByLabel("奖品配置数量", { exact: true }).fill("100"); await confirm();
  await page.getByRole("button", { name: "发布", exact: true }).click();
  const capacityError = page.getByRole("button", { name: /配置数量为 100 份，但可预约履约容量仅为 20.*至少 80/ }); await capacityError.waitFor();
  assert.equal(await page.getByRole("button", { name: "确认发布活动", exact: true }).isEnabled(), false); await shot("04-capacity-publish-review-100-20");
  await capacityError.click(); await page.locator(".semi-sidesheet:visible").getByRole("heading", { name: "当前活动奖品", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "配置奖品", exact: true }).count(), 4);
  await page.locator(".semi-sidesheet:visible").getByRole("button", { name: "取消", exact: true }).click();
  await pickupRow.getByRole("button", { name: "编辑奖品", exact: true }).click(); await page.getByLabel("奖品配置数量", { exact: true }).fill("20"); await confirm();
  await page.getByRole("button", { name: "发布", exact: true }).click();
  const review = page.locator(".semi-modal:visible"); await review.getByText("✓ 预约型奖品履约容量", { exact: true }).waitFor();
  assert.equal((await review.innerText()).includes("履约容量仅为"), false); await shot("05-capacity-20-20-check-passed");
  await review.getByRole("button", { name: "取消", exact: true }).click();
  pass("Publish review blocks quantity100/capacity20, names deficit80, error navigates to prize step; quantity20/capacity20 passes same check");

  const codePrize = copy.pool.find((prize) => prize.method === "REDEMPTION_CODE"), codeRow = page.locator(".semi-table-row").filter({ hasText: codePrize.name });
  await codeRow.getByRole("button", { name: "导入兑换码", exact: true }).click(); await importCodes(" V21-CODE001 \nV21-CODE001\nBAD CODE\nV21-CODE002\nV21-CODE003");
  await page.getByText("成功导入：3，重复：1，非法：1，忽略空值：0", { exact: true }).waitFor();
  await page.getByText("查看导入失败明细（2）", { exact: true }).click(); await page.getByText("批次内或已有库存中重复", { exact: true }).waitFor();
  await shot("06-partial-import-failure-details"); await page.locator(".semi-modal:visible").getByRole("button", { name: "完成", exact: true }).click();
  assert.equal((await page.locator(".semi-tabs-content").innerText()).includes("V21-CODE001"), false);
  await codeRow.getByRole("button", { name: "查看兑换码", exact: true }).click(); const codesSheet = page.locator(".semi-sidesheet:visible");
  await codesSheet.getByText("V21-CODE001", { exact: true }).waitFor();
  await codesSheet.locator(".semi-table-row").filter({ hasText: "V21-CODE001" }).getByRole("button", { name: "删除", exact: true }).click(); await confirm();
  assert.equal((await read())[2].activities.find((activity) => activity.id === copy.id).pool.find((prize) => prize.id === codePrize.id).codes.length, 2);
  await codesSheet.getByRole("button", { name: "清空AVAILABLE兑换码", exact: true }).click(); await confirm(); await codesSheet.getByText("暂无兑换码", { exact: true }).waitFor();
  await shot("07-draft-clear-available"); await page.keyboard.press("Escape"); await codesSheet.waitFor({ state: "hidden" });
  await codeRow.getByRole("button", { name: "导入兑换码", exact: true }).click(); await importCodes("V21-CODE001\nV21-CODE002");
  await page.getByText("成功导入：2，重复：0，非法：0，忽略空值：0", { exact: true }).waitFor();
  await page.locator(".semi-modal:visible").getByRole("button", { name: "完成", exact: true }).click();
  pass("Code management hides full codes in normal list; partial import counts and failure detail; draft single delete/clear/reimport persisted");

  const ended = seeded.activities[3], publishedCode = ended.pool.find((prize) => prize.method === "REDEMPTION_CODE"), assigned = publishedCode.codes.find((code) => code.assignedAwardId), surplus = publishedCode.codes.find((code) => !code.assignedAwardId);
  await route(`marketing/activity/${ended.id}/lottery`, ended.name); const publishedRow = page.locator(".semi-table-row").filter({ hasText: publishedCode.name });
  await publishedRow.getByRole("button", { name: "增加配额", exact: true }).click(); await page.getByLabel("追加配额", { exact: true }).fill("9"); await confirm();
  await publishedRow.getByRole("button", { name: "查看兑换码", exact: true }).click();
  const publishedSheet = page.locator(".semi-sidesheet:visible");
  const assignedRow = publishedSheet.locator(".semi-table-row").filter({ has: page.getByText(assigned.code, { exact: true }) });
  assert.equal(await assignedRow.getByRole("button", { name: "删除", exact: true }).isEnabled(), false);
  await assignedRow.getByText("ASSIGNED · 已分配", { exact: true }).waitFor();
  const assignedAward = seeded.awards.find((award) => award.id === assigned.assignedAwardId), assignedParticipant = seeded.participations.find((participant) => participant.id === assignedAward.participationId);
  const assignedTime = new Date(Date.parse(assigned.assignedAt) + 8 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
  await assignedRow.getByText(assignedTime, { exact: true }).waitFor();
  for (const ref of assignedParticipant.identities) { const profile = members.userProfiles.find((profile) => profile.user_id === ref.userId); const name = [profile?.last_name, profile?.first_name].filter(Boolean).join(" ") || ref.userId; assert.ok((await assignedRow.innerText()).includes(name)); }
  await shot("08a-assigned-status-time-and-user");
  await publishedSheet.locator(".semi-table-row").filter({ has: page.getByText(surplus.code, { exact: true }) }).getByRole("button", { name: "删除", exact: true }).click(); await confirm();
  await publishedSheet.getByText("删除后剩余兑换码不足以覆盖当前剩余奖品配额。", { exact: true }).waitFor();
  assert.equal((await read())[2].activities.find((activity) => activity.id === ended.id).pool.find((prize) => prize.id === publishedCode.id).codes.length, 10);
  await shot("08-assigned-protected-published-quota-delete-rejected"); await page.keyboard.press("Escape"); await publishedSheet.waitFor({ state: "hidden" });
  await publishedRow.getByRole("button", { name: "导入兑换码", exact: true }).click(); await importCodes("V21-SURPLUS"); await page.locator(".semi-modal:visible").getByRole("button", { name: "完成", exact: true }).click();
  await publishedRow.getByRole("button", { name: "查看兑换码", exact: true }).click(); await publishedSheet.locator(".semi-table-row").filter({ has: page.getByText(surplus.code, { exact: true }) }).getByRole("button", { name: "删除", exact: true }).click(); await confirm();
  const afterDelete = (await read())[2], kept = afterDelete.activities.find((activity) => activity.id === ended.id).pool.find((prize) => prize.id === publishedCode.id);
  assert.equal(kept.codes.length, 10); assert.ok(!kept.codes.some((code) => code.code === surplus.code)); assert.deepEqual(kept.codes.find((code) => code.code === assigned.code), assigned);
  await page.keyboard.press("Escape"); await publishedSheet.waitFor({ state: "hidden" }); await page.reload({ waitUntil: "networkidle" });
  assert.deepEqual((await read())[2].awards, afterDelete.awards);
  pass("Assigned status/time/user shown only in manager; assigned delete disabled; published quota protects removal; append then safe surplus deletion and refresh");

  const user = members.brandUsers.find((user) => user.brand === source.brand && user.is_deleted === 0);
  await route(`marketing/preview/${source.id}/${user.id}`, "用户流程预览");
  assert.equal(await page.getByRole("button", { name: /工作人员现场报名/ }).count(), 0);
  await route("redemption", "核销端"); await select("现场报名活动", `${source.name} · Girard-Perregaux`); await select("现场报名品牌用户", user.id);
  await page.getByRole("button", { name: "确认现场报名", exact: true }).click();
  state = (await read())[2]; const participant = state.participations.find((participant) => participant.activityId === source.id && participant.identities.some((ref) => ref.userId === user.id));
  assert.ok(participant); assert.equal(state.bookings.find((booking) => booking.participationId === participant.id).source, "WALK_IN");
  await page.getByRole("button", { name: "确认现场报名", exact: true }).click();
  state = (await read())[2]; assert.equal(state.participations.filter((participant) => participant.activityId === source.id && participant.identities.some((ref) => ref.userId === user.id)).length, 1);
  assert.equal(state.bookings.filter((booking) => booking.participationId === participant.id).length, 1); assert.equal(state.chances.filter((chance) => chance.participationId === participant.id).length, 0);
  await page.getByRole("button", { name: "识别凭证 / 模拟扫码", exact: true }).click(); await page.getByRole("button", { name: "确认执行所选动作", exact: true }).click(); await confirm();
  await select("本次核验动作", "工作人员确认完成（不默认领奖）"); await page.getByRole("button", { name: "确认执行所选动作", exact: true }).click(); await confirm();
  state = (await read())[2]; assert.deepEqual(state.redemptions.filter((record) => record.participationId === participant.id).map((record) => record.type), ["CHECKIN", "COMPLETE"]);
  assert.equal(state.chances.filter((chance) => chance.participationId === participant.id).length, 1);
  await shot("09-staff-walkin-checkin-complete");
  await route(`marketing/activity/${source.id}/redemptions`, source.name); assert.equal(await page.getByRole("button", { name: /确认现场报名|确认执行所选动作/ }).count(), 0);
  await route("marketing", "营销活动"); const listRow = page.locator(".semi-table-row").filter({ has: page.getByRole("link", { name: source.name, exact: true }) });
  assert.deepEqual((await listRow.locator("td").allTextContents()).slice(5, 9), ["2", "1", "1", "0"]);
  assert.equal(await page.getByRole("columnheader", { name: "参与人数", exact: true }).count(), 0); await shot("10-precise-list-metrics");
  assert.equal((await raw())[0], originals[0]); assert.equal((await raw())[1], originals[1]);
  pass("Preview contains no staff walk-in; independent staff registration/checkin/complete is idempotent, list metrics show booked/checkin/completed/winners, CRM readonly and stores unchanged");

  for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) { await page.setViewportSize({ width, height }); await route(`marketing/activity/${copy.id}/lottery`, copy.name); await codeRow.getByRole("button", { name: "查看兑换码", exact: true }).click(); await shot(`11-code-manager-${width}`); await page.keyboard.press("Escape"); }
  for (const width of [375, 430]) { await page.setViewportSize({ width, height: 812 }); await route("redemption", "核销端"); await shot(`12-staff-walkin-${width}`); }
  pass("New code drawer at three desktop sizes and staff walk-in at 375/430 have no document horizontal overflow");
  assert.deepEqual(errors, []); assert.deepEqual(requests, []); pass("Console/runtime and failed requests: 0/0");
} catch (error) {
  results.push({ name: checkpoint, status: "FAIL", detail: error.stack || String(error) }); await page.screenshot({ path: resolve(root, "FAILED.png"), fullPage: true }).catch(() => {}); throw error;
} finally {
  await writeFile(resolve(root, "results.json"), JSON.stringify({ base, completedAt: new Date().toISOString(), results, errors, requests, evidence }, null, 2));
  await writeFile(resolve(root, "evidence.md"), `# 营销 V2.1 页面回归证据\n\nChrome隔离BrowserContext，虚构本地数据；仅空会员边界使用测试夹具。业务操作通过页面控件执行并核对持久结果，不触碰用户浏览器数据。\n\n${evidence.map((item) => `## ${item.step}. ${item.name}\n\n![${item.name}](./${item.name}.png)\n\n${item.layout.width}×${item.layout.height} · SHA256 ${item.sha256}\n`).join("\n")}`);
  process.stdout.write(`Evidence ${root}\n`); await browser.close();
}
