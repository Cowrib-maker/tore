/**
 * Structured, PII-free telemetry for the legal-corpus retrieval boundary
 * (exact-citation lookups against tore-legal-data-engine, with local-corpus
 * fallback). Exists so P0-2A activation can actually be observed — until
 * this, LegalCorpusSource was stamped on results but never read anywhere.
 *
 * SECURITY: this module and its callers must NEVER pass user questions,
 * prompts, legal document/citation text, uploaded document contents,
 * access tokens, ENGINE_SERVICE_TOKEN, authorization headers, or raw
 * personal data into a log event. Only the fields on LegalCorpusLogEvent
 * are accepted — internal enum labels (source/outcome/reason/status) and
 * a latency number. This is a closed shape specifically so a future
 * caller can't accidentally widen it into logging sensitive content.
 *
 * Uses the same plain `console.*` + structured-second-argument convention
 * already used in legal-data-engine-client.ts — no new logging dependency.
 */

export type LegalCorpusLogOperation =
  | "retrieveExactCitation"
  | "retrieveLegalQuestion"
  | "verifyCitation";

export type LegalCorpusLogOutcome =
  | "engine_success"
  | "engine_failure"
  | "timeout"
  | "local_fallback"
  | "official_web_success"
  | "as_of_unavailable"
  | "not_found"
  | "not_configured"
  | "verification_result";

export type LegalCorpusLogEvent = {
  operation: LegalCorpusLogOperation;
  outcome: LegalCorpusLogOutcome;
  /** LegalCorpusSource value ("LEGAL_DATA_ENGINE" | "LOCAL_CORPUS" | "FALLBACK_LOCAL_CORPUS"), when known. */
  source?: string;
  /** LegalCorpusUnavailableReason value, when the outcome is a failure/miss. */
  reason?: string;
  /** CitationVerificationStatus value, only for verifyCitation events. */
  verificationStatus?: string;
  latencyMs: number;
};

export function logLegalCorpusEvent(event: LegalCorpusLogEvent): void {
  console.log("legal_corpus_event", event);
}

/** Times an async operation and returns both its result and the elapsed ms. */
export async function withLatency<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; latencyMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, latencyMs: Date.now() - start };
}
