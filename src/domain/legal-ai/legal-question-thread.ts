import { LegalQuestionStatus } from "@/domain/enums";
import { LegalRelevance } from "@/engine/relevance";

export type LegalQuestionThreadAction =
  | { type: "ANSWER_NON_LEGAL"; nextStatus: LegalQuestionStatus }
  | { type: "CONTINUE"; nextStatus: LegalQuestionStatus }
  | { type: "START_NEW"; nextStatus: LegalQuestionStatus };

/**
 * Persisted thread state + relevance → whether this turn is a new billable
 * legal question, a clarification continuation, or a non-legal question
 * answered outside the legal-question status machine. Does not use message
 * index.
 *
 * NON_LEGAL never advances/consumes `LegalQuestionStatus` (nextStatus stays
 * whatever it already was) — that state machine exists for legal-question
 * follow-up detection (clarification loops, substantive-follow-up checks)
 * and a general question shouldn't perturb it. It IS still a topic-blind
 * consumer of the one-question entitlement, same as START_NEW — see
 * {@link threadReservesEntitlement}, which callers must use instead of
 * comparing `type === "START_NEW"` directly, so a general question still
 * counts against the free-question/paid-plan quota exactly like a legal
 * one. It deliberately does NOT bump AIConversation.billedQuestionCount
 * (an audit trail scoped to legal questions specifically) — callers keep
 * checking `type === "START_NEW"` for that one field only.
 */
export function decideLegalQuestionThreadAction(input: {
  status: LegalQuestionStatus;
  relevance: LegalRelevance;
}): LegalQuestionThreadAction {
  if (input.relevance === LegalRelevance.NON_LEGAL) {
    return { type: "ANSWER_NON_LEGAL", nextStatus: input.status };
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

/**
 * Whether this turn is a topic-blind consumer of the one-question
 * entitlement (reserve a new question up front, and — on success — count
 * it against the free-question/paid-plan quota). True for both a legal
 * START_NEW and a general ANSWER_NON_LEGAL turn; false only for CONTINUE
 * (a clarification follow-up within an already-reserved question).
 */
export function threadReservesEntitlement(
  thread: LegalQuestionThreadAction,
): boolean {
  return thread.type === "START_NEW" || thread.type === "ANSWER_NON_LEGAL";
}
