import type { MarketingParticipantClue, MarketingParticipation } from "@/types/marketing";

export const participantClueLabels = ["线索一", "线索二", "线索三", "线索四"] as const;

/** Legacy records receive a deterministic read adapter; stored history is not rewritten. */
export function participantTaskClues(participant: MarketingParticipation): MarketingParticipantClue[] {
  if (participant.taskClues?.length === participantClueLabels.length) return participant.taskClues;
  const allCompleted = Boolean(participant.completedAt);
  return participantClueLabels.map((label, index) => ({
    id: `${participant.id}:clue-${index + 1}`,
    label,
    completed: allCompleted || index !== 2,
    ...(allCompleted && participant.completedAt ? { completedAt: participant.completedAt } : {}),
  }));
}

export function participantTaskCompleted(participant: MarketingParticipation) {
  const clues = participantTaskClues(participant);
  return clues.length === participantClueLabels.length && clues.every((clue) => clue.completed);
}
