/**
 * Provenance for doctrine, tests, concepts, interpretations, and conclusions.
 *
 * Every doctrine artifact must be able to point at a source.
 * AI inference is recorded when present but never counts as sole legal support.
 */

import {
  LegalAuthorityKind,
  type LegalAuthorityKind as LegalAuthorityKindType,
} from "./types";

/**
 * Pointer to the material that backs a doctrine or reasoning claim.
 * Distinct from knowledge-layer {@link LegalProvenance} (archived bytes).
 */
export type DoctrineProvenance = {
  /** Stable id of the backing source record (catalog, archive, cite key). */
  sourceId: string;
  /**
   * Kind of authority. {@link LegalAuthorityKind.AI_INFERENCE} may be recorded
   * for audit but cannot alone support a legal conclusion.
   */
  sourceKind: LegalAuthorityKindType;
  /** Human-readable citation or bibliographic locator. */
  citation: string | null;
  /** Pinpoint (page, §, paragraph) within the source. */
  locator: string | null;
  /** Optional archive / blob reference (not legal meaning). */
  archivedRef?: string;
  checksum?: string;
  retrievedAt?: string | null;
  /** Recorder identity — not itself a legal authority. */
  recordedBy?: string | null;
};

export type SourceBackedSupport = {
  claimKind: "legal_rule" | "doctrine" | "interpretation" | "conclusion";
  status:
    | "SOURCE_BACKED"
    | "PARTIAL"
    | "UNSUPPORTED"
    | "INCOMPLETE"
    | "CONFLICTED";
  /** Provenance entries that are not AI_INFERENCE. */
  supportingSourceIds: string[];
  /** True when the only backing is AI_INFERENCE (or none). */
  llmGeneratedAlone: boolean;
  notes: string[];
};

export function isNonAiProvenance(entry: DoctrineProvenance): boolean {
  return entry.sourceKind !== LegalAuthorityKind.AI_INFERENCE;
}

export function collectNonAiSourceIds(
  entries: readonly DoctrineProvenance[],
): string[] {
  return [
    ...new Set(
      entries.filter(isNonAiProvenance).map((entry) => entry.sourceId),
    ),
  ];
}

/**
 * Evaluate whether provenance adequately backs a claim.
 * AI_INFERENCE alone → UNSUPPORTED with llmGeneratedAlone.
 */
export function evaluateSourceBackedSupport(
  claimKind: SourceBackedSupport["claimKind"],
  provenance: readonly DoctrineProvenance[],
  options: { required?: boolean; conflicted?: boolean } = {},
): SourceBackedSupport {
  const required = options.required ?? true;
  const nonAi = provenance.filter(isNonAiProvenance);
  const supportingSourceIds = collectNonAiSourceIds(provenance);
  const onlyAi =
    provenance.length > 0 &&
    provenance.every((p) => p.sourceKind === LegalAuthorityKind.AI_INFERENCE);
  const llmGeneratedAlone = onlyAi || (provenance.length === 0 && required);

  if (options.conflicted) {
    return {
      claimKind,
      status: "CONFLICTED",
      supportingSourceIds,
      llmGeneratedAlone: false,
      notes: ["conflicting sources recorded"],
    };
  }

  if (supportingSourceIds.length > 0) {
    const hasAi = provenance.some(
      (p) => p.sourceKind === LegalAuthorityKind.AI_INFERENCE,
    );
    return {
      claimKind,
      status: hasAi && nonAi.length > 0 ? "PARTIAL" : "SOURCE_BACKED",
      supportingSourceIds,
      llmGeneratedAlone: false,
      notes: hasAi
        ? ["includes AI_INFERENCE alongside non-AI sources"]
        : [],
    };
  }

  if (!required && provenance.length === 0) {
    return {
      claimKind,
      status: "INCOMPLETE",
      supportingSourceIds: [],
      llmGeneratedAlone: false,
      notes: ["no provenance supplied; claim not required"],
    };
  }

  return {
    claimKind,
    status: "UNSUPPORTED",
    supportingSourceIds: [],
    llmGeneratedAlone,
    notes: onlyAi
      ? ["only AI_INFERENCE provenance — insufficient for legal conclusion"]
      : ["missing non-AI provenance"],
  };
}
