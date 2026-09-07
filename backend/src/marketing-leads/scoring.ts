export type ScoreLevel = "LOW" | "MEDIUM" | "HIGH";

export function clampLeadScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function leadScoreLevel(value: number): ScoreLevel {
  return value >= 70 ? "HIGH" : value >= 40 ? "MEDIUM" : "LOW";
}

export function leadTemperature(fitScore: number, engagementScore: number): "COLD" | "WARM" | "HOT" {
  if (fitScore >= 70 && engagementScore >= 70) return "HOT";
  if (fitScore >= 40 && engagementScore >= 40) return "WARM";
  return "COLD";
}
