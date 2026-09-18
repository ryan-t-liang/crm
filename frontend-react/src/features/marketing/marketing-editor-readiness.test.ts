import { describe, expect, it } from "vitest";
import { createDemoMarketingActivity } from "@/mock/marketing-demo-data";
import { buildPublishReadiness, editorStepComplete, activityEditorSteps } from "./marketing-editor-readiness";
import type { MarketingPublishCheck } from "./marketing-model";

const checks = (): MarketingPublishCheck[] => [
  { key: "basic", label: "基本信息", step: 0, errors: [] }, { key: "booking", label: "预约配置", step: 1, errors: [] },
  { key: "lottery", label: "抽奖概率", step: 2, errors: [] }, { key: "inventory", label: "库存", step: 3, errors: [] },
  { key: "fulfillment", label: "容量", step: 3, errors: [] }, { key: "virtual", label: "虚拟奖品", step: 3, errors: [] }, { key: "codes", label: "兑换码", step: 3, errors: [] },
];
describe("Activity Editor publish readiness presentation", () => {
  it.each(["basic", "booking", "lottery", "inventory", "fulfillment", "virtual", "codes"])("retains %s errors and the authoritative fix target", (key) => {
    const source = checks(); const check = source.find((row) => row.key === key)!; check.errors = ["First issue", "Another issue"];
    const before = JSON.stringify(source); const result = buildPublishReadiness(source); const row = result.rows.find((row) => row.key === key)!;
    expect(row.step).toBe(check.step); expect(row.errors).toEqual(check.errors); expect(row.summary).toBe("First issue"); expect(result).toMatchObject({ pending: 1, completed: 6, total: 7, ready: false }); expect(JSON.stringify(source)).toBe(before);
  });
  it("shows compact Ready after all seven original checks pass", () => { expect(buildPublishReadiness(checks())).toMatchObject({ ready: true, pending: 0, completed: 7, total: 7 }); });
  it("cannot call an absent check list ready", () => { expect(buildPublishReadiness([]).ready).toBe(false); });
  it("keeps future validation checks instead of silently discarding them", () => { const result = buildPublishReadiness([{ key: "future", label: "New requirement", step: 2, errors: ["Must fix"] }]); expect(result.rows[0]).toMatchObject({ title: "New requirement", summary: "Must fix", step: 2, pending: true }); });
  it("requires every prize check to pass before marking prize step complete", () => { const source = checks(); expect(editorStepComplete(source, 3)).toBe(true); source[6].errors = ["Code shortage"]; expect(editorStepComplete(source, 3)).toBe(false); expect(editorStepComplete(source, 0)).toBe(true); expect(editorStepComplete(source, 4)).toBe(false); });
  it("uses participation wording rather than a booking-only step name", () => { expect(activityEditorSteps).toEqual(["基本信息", "参与设置", "抽奖规则", "奖品设置", "发布检查"]); });
  it("labels Direct activity readiness without requiring activity sessions", () => { const activity = createDemoMarketingActivity("gp", Date.now()); activity.bookingEnabled = false; expect(buildPublishReadiness(checks(), activity).rows[1].summary).toBe("直接参与，无需预约场次"); });
  it("labels inactive Draw and prize checks without inventing a requirement", () => { const activity = createDemoMarketingActivity("gp", Date.now()); activity.lotteryEnabled = false; const result = buildPublishReadiness(checks(), activity); expect(result.rows[2].summary).toBe("本活动不启用抽奖"); expect(result.rows[3].summary).toBe("本活动不启用抽奖，无需配置"); });
});
