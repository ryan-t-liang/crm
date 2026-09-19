import type { MarketingActivity } from "@/types/marketing";
import { needsReservation, type MarketingPublishCheck } from "./marketing-model";

export const activityEditorSteps = ["基本信息", "参与设置", "抽奖规则", "奖品设置", "发布检查"] as const;
const checkTitles: Record<string, string> = { basic: "基本信息", booking: "参与设置", lottery: "抽奖规则", inventory: "实体奖品", fulfillment: "领奖安排", virtual: "虚拟奖品", codes: "兑换码" };
function completedSummary(check: MarketingPublishCheck, activity?: MarketingActivity) {
  if (!activity) return "已完成";
  if (check.key === "basic") return "活动内容、品牌与时间已填写";
  if (check.key === "booking") return activity.bookingEnabled ? `已配置 ${activity.slots.filter((slot) => !slot.disabled && !slot.deleted).length} 个活动场次` : "直接参与，无需预约场次";
  if (check.key === "lottery") return activity.lotteryEnabled ? `完成后发放 ${activity.grantCount} 次抽奖机会，累计上限 ${activity.drawLimit} 次` : "本活动不启用抽奖";
  if (!activity.lotteryEnabled) return "本活动不启用抽奖，无需配置";
  if (check.key === "inventory") return `已配置 ${activity.pool.filter((prize) => prize.prizeType === "PHYSICAL").length} 个实体奖品`;
  if (check.key === "fulfillment") return activity.pool.some(needsReservation) ? "预约领奖时段与容量已配置" : "奖品直接领取，无需预约安排";
  if (check.key === "virtual") return `已配置 ${activity.pool.filter((prize) => prize.prizeType === "VIRTUAL").length} 个虚拟奖品`;
  if (check.key === "codes") return activity.pool.some((prize) => prize.method === "REDEMPTION_CODE") ? "可用兑换码数量满足可发放数量" : "本活动无需兑换码";
  return "已完成";
}
// This is presentation only: original validation errors and their authoritative
// step targets are retained, including future checks unknown to this UI version.
export function buildPublishReadiness(checks: MarketingPublishCheck[], activity?: MarketingActivity) {
  const rows = checks.map((check) => ({ ...check, title: checkTitles[check.key] || check.label, pending: check.errors.length > 0, summary: check.errors[0] || completedSummary(check, activity) }));
  const pending = rows.filter((row) => row.pending).length;
  return { rows, pending, completed: rows.length - pending, total: rows.length, ready: rows.length > 0 && pending === 0 };
}
export function editorStepComplete(checks: MarketingPublishCheck[], step: number) {
  if (step === 4) return buildPublishReadiness(checks).ready;
  const rows = checks.filter((check) => check.step === step);
  return rows.length > 0 && rows.every((check) => !check.errors.length);
}
