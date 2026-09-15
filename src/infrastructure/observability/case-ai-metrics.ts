/**
 * Sprint 13 Phase 14 — structured, PII-free telemetry for the Case AI
 * surfaces (document extraction, case-document retrieval, grounded
 * analysis, timeline extraction, draft generation). Mirrors the closed-shape
 * convention in legal-corpus-metrics.ts: only enum labels, counts, and
 * latency numbers are accepted — never case titles, document text, OCR
 * output, prompts, or model responses. A caller cannot accidentally widen
 * this into logging sensitive content because the type only has room for
 * safe fields.
 */

export type CaseAiLogOperation =
  | "documentExtraction"
  | "caseDocumentRetrieval"
  | "caseAiAnalysis"
  | "caseTimelineExtraction"
  | "caseDraftGeneration";

export type CaseAiLogOutcome =
  | "ok"
  | "empty"
  | "failed"
  | "needs_ocr"
  | "not_configured"
  | "invalid_model_output"
  | "not_implemented";

export type CaseAiLogEvent = {
  operation: CaseAiLogOperation;
  outcome: CaseAiLogOutcome;
  /** Result/row count, when meaningful (excerpts returned, entries
   * extracted, citations grounded) — never the content of those rows. */
  count?: number;
  latencyMs?: number;
};

export function logCaseAiEvent(event: CaseAiLogEvent): void {
  console.log("case_ai_event", event);
}

/** Times an async operation and returns both its result and the elapsed ms. */
export async function withCaseAiLatency<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; latencyMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, latencyMs: Date.now() - start };
}
