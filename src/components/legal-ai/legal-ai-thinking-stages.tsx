"use client";

import { useEffect, useState } from "react";

/**
 * Honest status labels for the legal AI "loading" state.
 *
 * These describe the real, ordered stages TORE Legal AI's pipeline runs
 * for every question — intent classification, then verified-source
 * retrieval/citation checking, then response generation — never a
 * fabricated per-item count ("N заалт уншлаа" and similar), since a
 * single non-streaming request gives the client no real intermediate
 * counts to report truthfully.
 */
const THINKING_STAGES = [
  "Асуултыг ойлгож байна...",
  "Баталгаатай эх сурвалж хайж байна...",
  "Хариулт бэлтгэж байна...",
] as const;

const STAGE_INTERVAL_MS = 1700;

/**
 * Cycles through {@link THINKING_STAGES} on a timer while `active` is
 * true, holding on the final stage rather than looping (a real request
 * finishes, it doesn't repeat). Resets to the first stage once `active`
 * goes false so the next question starts the sequence over.
 */
export function useThinkingStageLabel(active: boolean): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setIndex((current) =>
        current < THINKING_STAGES.length - 1 ? current + 1 : current,
      );
    }, STAGE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active]);

  return THINKING_STAGES[index];
}
