/**
 * Element-by-element subsumption:
 * FACTS + MAPPINGS + RULE ELEMENTS → SATISFIED | NOT_SATISFIED | UNCERTAIN | NOT_EVALUATED
 */

import type { LegalElement, LegalEvidence, LegalFact, LegalTest } from "../models";
import { SubsumptionMatchStatus } from "../types";
import {
  evaluateElementMappings,
  type FactElementMapping,
} from "./fact-element-mapping";

export type ElementApplicationResult =
  | typeof SubsumptionMatchStatus.SATISFIED
  | typeof SubsumptionMatchStatus.NOT_SATISFIED
  | typeof SubsumptionMatchStatus.UNCERTAIN
  | typeof SubsumptionMatchStatus.NOT_EVALUATED;

export type ElementApplication = {
  element: LegalElement;
  supportingFactIds: string[];
  supportingEvidenceIds: string[];
  counterEvidenceIds: string[];
  mappingIds: string[];
  result: ElementApplicationResult;
  explanation: string;
};

export type SubsumptionEngineResult = {
  applications: ElementApplication[];
  allRequiredSatisfied: boolean;
  hasInsufficientFacts: boolean;
  hasUncertainRequired: boolean;
  hasNotEvaluatedRequired: boolean;
};

export interface ISubsumptionEngine {
  apply(input: {
    legalTest: LegalTest | null;
    facts: readonly LegalFact[];
    evidence: readonly LegalEvidence[];
    mappings?: readonly FactElementMapping[];
  }): SubsumptionEngineResult;
}

export class DefaultSubsumptionEngine implements ISubsumptionEngine {
  apply(input: {
    legalTest: LegalTest | null;
    facts: readonly LegalFact[];
    evidence: readonly LegalEvidence[];
    mappings?: readonly FactElementMapping[];
  }): SubsumptionEngineResult {
    const elements = input.legalTest?.elements ?? [];
    const mappings = input.mappings ?? [];
    const applications = elements
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((element) => {
        const evaluation = evaluateElementMappings(
          element,
          mappings,
          input.facts,
        );
        return {
          element,
          supportingFactIds: evaluation.supportingFactIds,
          supportingEvidenceIds: evaluation.supportingEvidenceIds,
          counterEvidenceIds: evaluation.counterEvidenceIds,
          mappingIds: evaluation.mappingIds,
          result: evaluation.status as ElementApplicationResult,
          explanation: evaluation.explanation,
        };
      });

    const required = applications.filter((a) => a.element.required);
    const allRequiredSatisfied =
      required.length > 0 &&
      required.every((a) => a.result === SubsumptionMatchStatus.SATISFIED);
    const hasNotEvaluatedRequired = required.some(
      (a) => a.result === SubsumptionMatchStatus.NOT_EVALUATED,
    );
    const hasUncertainRequired = required.some(
      (a) => a.result === SubsumptionMatchStatus.UNCERTAIN,
    );
    const hasInsufficientFacts =
      hasNotEvaluatedRequired ||
      required.some(
        (a) =>
          a.result === SubsumptionMatchStatus.UNCERTAIN &&
          a.supportingFactIds.length === 0,
      );

    return {
      applications,
      allRequiredSatisfied,
      hasInsufficientFacts,
      hasUncertainRequired,
      hasNotEvaluatedRequired,
    };
  }
}
