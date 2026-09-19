import type { MarketingActivity, MarketingState } from "@/types/marketing";
import { createDemoMarketingActivity } from "./marketing-demo-data";
import { appendMarketingIllustrations } from "./marketing-illustration-data";

/** Read-only presentation fixture. Never persist this view or use it for mutations,
 * inventory, dashboard statistics, membership matching or sales conversion. */
export function createMarketingRecordIllustrations(activity: MarketingActivity, now: number): MarketingState {
  const namespace = `${activity.id}:record-samples-v2`;
  const sample = createDemoMarketingActivity(activity.brand, now);
  sample.id = namespace; sample.name = activity.name; sample.mode = activity.mode; sample.location = activity.location || "示意活动场地";
  sample.bookingEnabled = activity.bookingEnabled; sample.lotteryEnabled = activity.lotteryEnabled;
  sample.slots = []; sample.sessionPrizes = []; sample.sessionPrizeConfigVersion = 1;
  sample.pool.forEach((prize, index) => {
    prize.id = `${namespace}:prize:${index}`; prize.activityId = namespace;
    prize.slots.forEach((slot, slotIndex) => { slot.id = `${prize.id}:slot:${slotIndex}`; });
    prize.codes.forEach((code, codeIndex) => { code.code = `DEMO-${namespace}-${codeIndex + 1}`; });
  });
  const state: MarketingState = { version: 2, revision: 0, seededAt: new Date(now).toISOString(), activities: [sample], participations: [], bookings: [], chances: [], draws: [], awards: [], audits: [], redemptions: [] };
  appendMarketingIllustrations(state, sample, now);
  // IDs retain a separate fixture namespace; activityId only scopes the current view.
  sample.id = activity.id;
  sample.pool.forEach(prize => { prize.activityId = activity.id; });
  for (const rows of [state.participations, state.bookings, state.chances, state.draws, state.awards, state.redemptions]) rows.forEach(row => { row.activityId = activity.id; });
  return state;
}

export function withMarketingRecordIllustrations(input: MarketingState, sample: MarketingState): MarketingState {
  const fixture = sample.activities[0];
  return {
    ...input,
    activities: input.activities.map(activity => activity.id === fixture.id ? { ...activity, slots: [...activity.slots, ...fixture.slots], pool: [...activity.pool, ...fixture.pool],
      sessionPrizes: [...(activity.sessionPrizes ?? []), ...(fixture.sessionPrizes ?? [])], sessionPrizeConfigVersion: Math.max(activity.sessionPrizeConfigVersion ?? 0, fixture.sessionPrizeConfigVersion ?? 0, 1) } : activity),
    participations: [...input.participations, ...sample.participations], bookings: [...input.bookings, ...sample.bookings],
    chances: [...input.chances, ...sample.chances], draws: [...input.draws, ...sample.draws], awards: [...input.awards, ...sample.awards], redemptions: [...input.redemptions, ...sample.redemptions],
  };
}
