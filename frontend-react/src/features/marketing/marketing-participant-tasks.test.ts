import { describe, expect, it } from "vitest";
import type { MarketingParticipation } from "@/types/marketing";
import { participantTaskClues, participantTaskCompleted } from "./marketing-participant-tasks";

const participant = (patch: Partial<MarketingParticipation> = {}): MarketingParticipation => ({
  id: "participant-1", activityId: "activity-1", subjectKey: "participant:1", identities: [],
  credential: "ACT-1", registeredAt: "2026-09-20T08:00:00.000Z", ruleVersion: 1, ...patch,
});

describe("marketing participant task progress", () => {
  it("marks the participant complete only when all four clues are complete", () => {
    const incomplete = participant();
    expect(participantTaskClues(incomplete).map((clue) => clue.completed)).toEqual([true, true, false, true]);
    expect(participantTaskCompleted(incomplete)).toBe(false);
    const complete = participant({ taskClues: participantTaskClues(incomplete).map((clue) => ({ ...clue, completed: true })) });
    expect(participantTaskCompleted(complete)).toBe(true);
  });
});
