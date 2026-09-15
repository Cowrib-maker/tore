/**
 * Sprint 13 Phase 9 — deterministic case timeline. Entries are produced by
 * regex-based date/event detection over CaseEvidence.extractedText only —
 * never by an LLM — so a date can never be hallucinated: every entry is
 * traceable to an exact substring of a specific document's extracted text.
 */
export const CaseTimelineConfidence = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  UNCERTAIN: "UNCERTAIN",
} as const;

export type CaseTimelineConfidence =
  (typeof CaseTimelineConfidence)[keyof typeof CaseTimelineConfidence];

export type CaseTimelineEntry = {
  id: string;
  caseFileId: string;
  caseEvidenceId: string;
  /** The exact date substring as it appeared in the source text. */
  rawDateText: string;
  /** Parsed calendar date when the match was unambiguous; null when the
   * raw text names a date-like phrase that could not be resolved to a
   * concrete day (e.g. a bare year) — confidence is UNCERTAIN in that case. */
  parsedDate: Date | null;
  eventText: string;
  sourceExcerpt: string;
  confidence: CaseTimelineConfidence;
  createdAt: Date;
};

export type CreateCaseTimelineEntryInput = Omit<CaseTimelineEntry, "id" | "createdAt">;
