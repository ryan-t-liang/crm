import type { MarketingActivity, MarketingState } from "@/types/marketing";
import { parseCreatedAt } from "@/features/dashboard/dashboard-model";

const codeDate = (value: string) => Number.isFinite(parseCreatedAt(value))
  ? new Date(parseCreatedAt(value) + 8 * 3_600_000).toISOString().slice(0, 10).replaceAll("-", "") : "00000000";
function legacyCode(activity: MarketingActivity) {
  let hash = 2166136261;
  for (const character of activity.id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `ACT${codeDate(activity.createdAt)}${(hash >>> 0).toString(36).toUpperCase().padStart(7, "0")}`;
}
/** Read-only compatibility: no UUID in the UI and no loader/storage backfill. */
export function activityCodes(state: Pick<MarketingState, "activities">) {
  const codes = new Map(state.activities.filter(row => row.activityCode).map(row => [row.id, row.activityCode!]));
  const used = new Set(codes.values());
  for (const row of state.activities.filter(row => !row.activityCode).sort((a, b) => a.id.localeCompare(b.id))) {
    const base = legacyCode(row);
    let code = base, suffix = 1;
    while (used.has(code)) code = `${base}-${suffix++}`;
    used.add(code); codes.set(row.id, code);
  }
  return codes;
}
/** Allocate against the entire marketing namespace, not only a filtered brand. */
export function nextActivityCode(state: Pick<MarketingState, "activities">, createdAt: string) {
  const used = new Set(activityCodes(state).values()), prefix = `ACT${codeDate(createdAt)}`;
  let sequence = 1;
  while (used.has(`${prefix}${String(sequence).padStart(4, "0")}`)) sequence++;
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

export type ActivityLifecycle = "UPCOMING" | "ONGOING" | "ENDED";
export const lifecycleLabels = { UPCOMING: "待开始", ONGOING: "进行中", ENDED: "已结束" };
export function activityLifecycle(activity: MarketingActivity, now: number): ActivityLifecycle {
  const start = parseCreatedAt(activity.startAt), end = parseCreatedAt(activity.endAt);
  if (activity.status === "CANCELED" || Number.isFinite(end) && now >= end) return "ENDED";
  if (activity.status === "DRAFT" || !Number.isFinite(start) || !Number.isFinite(end) || now < start) return "UPCOMING";
  return "ONGOING"; // PAUSED is an operational control, not a fourth lifecycle.
}
