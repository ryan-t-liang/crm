export type EngagementFacts = {
  now: Date;
  lastInteractionAt: Date | null;
  interactionsLast30Days: number;
  hasActiveLead: boolean;
  hasRecentMeeting: boolean;
  hasOpenNextActionTask: boolean;
  hasOverdueTask: boolean;
  activeDays: number;
  dormantDays: number;
};

export type ScoreBand = "LOW" | "MEDIUM" | "HIGH";
export type EngagementState = "ACTIVE" | "COOLING" | "DORMANT";

export function scoreBand(score: number): ScoreBand {
  return score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";
}

export function wholeDaysBetween(earlier: Date, later: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 86_400_000));
}

export function engagementState(facts: Pick<EngagementFacts, "now" | "lastInteractionAt" | "hasActiveLead" | "activeDays" | "dormantDays">): EngagementState {
  if (facts.hasActiveLead) return "ACTIVE";
  if (!facts.lastInteractionAt) return "DORMANT";
  const age = wholeDaysBetween(facts.lastInteractionAt, facts.now);
  if (age <= facts.activeDays) return "ACTIVE";
  if (age <= facts.dormantDays) return "COOLING";
  return "DORMANT";
}

export function calculateEngagement(facts: EngagementFacts) {
  const breakdown: Array<{ key: string; label: string; points: number }> = [];
  const age = facts.lastInteractionAt ? wholeDaysBetween(facts.lastInteractionAt, facts.now) : null;
  const recencyPoints = age === null ? 0 : age <= 7 ? 35 : age <= 30 ? 25 : age <= 60 ? 10 : 0;
  breakdown.push({ key: "interactionRecency", label: "最近互动", points: recencyPoints });
  const interactionPoints = Math.min(20, facts.interactionsLast30Days * 5);
  breakdown.push({ key: "interactionFrequency", label: "30 天互动", points: interactionPoints });
  breakdown.push({ key: "activeLead", label: "活跃商机", points: facts.hasActiveLead ? 20 : 0 });
  breakdown.push({ key: "recentMeeting", label: "30 天内会议", points: facts.hasRecentMeeting ? 10 : 0 });
  breakdown.push({ key: "nextAction", label: "开放下一步任务", points: facts.hasOpenNextActionTask ? 10 : 0 });
  breakdown.push({ key: "overdue", label: "逾期任务", points: facts.hasOverdueTask ? -10 : 0 });
  const rawScore = breakdown.reduce((sum, item) => sum + item.points, 0);
  const score = Math.max(0, Math.min(100, rawScore));
  return {
    score,
    level: scoreBand(score),
    state: engagementState(facts),
    lastInteractionAgeDays: age,
    breakdown,
  };
}
