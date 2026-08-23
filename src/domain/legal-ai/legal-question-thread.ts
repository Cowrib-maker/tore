import { LegalQuestionStatus } from "@/domain/enums";
import { LegalRelevance } from "@/engine/relevance";

export type LegalQuestionThreadAction =
  | { type: "REFUSE_NON_LEGAL"; nextStatus: LegalQuestionStatus }
  | { type: "CONTINUE"; nextStatus: LegalQuestionStatus }
  | { type: "START_NEW"; nextStatus: LegalQuestionStatus };

/**
 * Persisted thread state + relevance → whether this turn is a new billable
 * legal question, a clarification continuation, or a non-legal refusal.
 * Does not use message index.
 */
export function decideLegalQuestionThreadAction(input: {
  status: LegalQuestionStatus;
  relevance: LegalRelevance;
}): LegalQuestionThreadAction {
  if (input.relevance === LegalRelevance.NON_LEGAL) {
    return { type: "REFUSE_NON_LEGAL", nextStatus: input.status };
  }

  const nextStatus =
    input.relevance === LegalRelevance.POSSIBLY_LEGAL
      ? LegalQuestionStatus.CLARIFYING
      : LegalQuestionStatus.ANSWERED;

  if (input.status === LegalQuestionStatus.CLARIFYING) {
    return { type: "CONTINUE", nextStatus };
  }

  if (input.status === LegalQuestionStatus.ANSWERED) {
    return { type: "START_NEW", nextStatus };
  }

  return { type: "START_NEW", nextStatus };
}
