/**
 * Legal reasoning (subsumption) contracts — distinct from the pre-prompt
 * Reasoning Engine in `@/engine/reasoning`.
 *
 * Trace order:
 *   issue → applicable doctrine → legal rule → elements → facts →
 *   evidence → subsumption → conclusion
 */

import type { LegalConflict } from "../conflict";
import type {
  LegalConclusion,
  LegalDoctrine,
  LegalEvidence,
  LegalFact,
  LegalInterpretation,
  LegalIssue,
  LegalRule,
  LegalTest,
} from "../models";
import type { DoctrineProvenance, SourceBackedSupport } from "../provenance";
import {
  LegalAuthorityKind,
  type LegalReasoningStepKind,
  type LegalReasoningStepStatus,
  type SubsumptionMatchStatus,
  type TemporalApplicability,
} from "../types";

export type SubsumptionAssessment = {
  elementId: string;
  factIds: string[];
  evidenceIds: string[];
  status: SubsumptionMatchStatus;
  notes: string[];
};

export type LegalReasoningStep = {
  order: number;
  kind: LegalReasoningStepKind;
  status: LegalReasoningStepStatus;
  /** Referenced entity ids for this step. */
  subjectIds: string[];
  notes: string[];
  support: SourceBackedSupport | null;
};

/**
 * Full reasoning trace. Always present even when the conclusion is rejected.
 */
export type LegalReasoningTrace = {
  issueId: string;
  steps: LegalReasoningStep[];
  subsumptions: SubsumptionAssessment[];
  temporal: TemporalApplicability;
};

export type SourceBackedSupportReport = {
  legalRule: SourceBackedSupport;
  doctrine: SourceBackedSupport;
  interpretation: SourceBackedSupport;
  conclusion: SourceBackedSupport;
  /** True when all required claim kinds are SOURCE_BACKED (or PARTIAL with non-AI). */
  allRequiredSupported: boolean;
};

export type LegalReasoningValidation = {
  ok: boolean;
  /** Hard failures — conclusion must not be accepted. */
  rejected: string[];
  /** Soft flags — incomplete / conflicted but recorded. */
  flags: string[];
};

export type LegalReasoningRequest = {
  issue: LegalIssue;
  applicableDoctrine: LegalDoctrine | null;
  legalRule: LegalRule | null;
  legalTest: LegalTest | null;
  facts: readonly LegalFact[];
  evidence: readonly LegalEvidence[];
  interpretation: LegalInterpretation | null;
  /** Candidate conclusion; may be rejected by the validator. */
  proposedConclusion: LegalConclusion | null;
  conflicts?: readonly LegalConflict[];
  /** Evaluation instant for temporal checks. */
  applicableAt: string;
};

export type LegalReasoningResult = {
  trace: LegalReasoningTrace;
  /**
   * Accepted conclusion only when validation ok and support is source-backed.
   * Otherwise null — unsupported conclusions are never returned as accepted.
   */
  conclusion: LegalConclusion | null;
  support: SourceBackedSupportReport;
  conflicts: LegalConflict[];
  validation: LegalReasoningValidation;
};

export interface ILegalReasoningSupportEvaluator {
  evaluate(request: LegalReasoningRequest): SourceBackedSupportReport;
}

export interface ILegalReasoningTraceBuilder {
  build(
    request: LegalReasoningRequest,
    support: SourceBackedSupportReport,
  ): LegalReasoningTrace;
}

export interface ILegalReasoningValidator {
  validate(
    request: LegalReasoningRequest,
    support: SourceBackedSupportReport,
    conflicts: readonly LegalConflict[],
  ): LegalReasoningValidation;
}

/**
 * Orchestration contract for the doctrine → reasoning pipeline.
 * Does not call LLMs. Does not scrape. Does not mutate knowledge stores.
 */
export interface ILegalReasoningPipeline {
  run(request: LegalReasoningRequest): LegalReasoningResult;
}

export type LegalReasoningPipelineDependencies = {
  supportEvaluator: ILegalReasoningSupportEvaluator;
  traceBuilder: ILegalReasoningTraceBuilder;
  validator: ILegalReasoningValidator;
};

/** Helper to build AI-only provenance for negative tests. */
export function aiInferenceProvenance(
  sourceId = "llm:hypothesis",
): DoctrineProvenance {
  return {
    sourceId,
    sourceKind: LegalAuthorityKind.AI_INFERENCE,
    citation: null,
    locator: null,
  };
}
