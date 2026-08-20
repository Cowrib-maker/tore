/**
 * Source-backed support evaluation for legal_rule, doctrine,
 * interpretation, and conclusion claims.
 */

import { evaluateSourceBackedSupport } from "../provenance";
import { LegalAuthorityKind } from "../types";
import type {
  ILegalReasoningSupportEvaluator,
  LegalReasoningRequest,
  SourceBackedSupportReport,
} from "./types";

function isTemporallyApplicable(
  validFrom: string | null,
  validTo: string | null,
  applicableAt: string,
): boolean {
  if (validFrom && applicableAt < validFrom) {
    return false;
  }
  if (validTo && applicableAt > validTo) {
    return false;
  }
  return true;
}

export class DefaultLegalReasoningSupportEvaluator
  implements ILegalReasoningSupportEvaluator
{
  evaluate(request: LegalReasoningRequest): SourceBackedSupportReport {
    const doctrine = request.applicableDoctrine;
    const rule = request.legalRule;
    const interpretation = request.interpretation;
    const conclusion = request.proposedConclusion;

    const doctrineSupport = evaluateSourceBackedSupport(
      "doctrine",
      doctrine?.provenance ?? [],
      {
        required: doctrine != null || conclusion != null,
        conflicted: false,
      },
    );

    if (
      doctrine &&
      !isTemporallyApplicable(
        doctrine.temporal.validFrom,
        doctrine.temporal.validTo,
        request.applicableAt,
      )
    ) {
      doctrineSupport.status = "INCOMPLETE";
      doctrineSupport.notes = [
        ...doctrineSupport.notes,
        "doctrine outside temporal applicability window",
      ];
    }

    const legalRuleSupport = evaluateSourceBackedSupport(
      "legal_rule",
      rule?.provenance ?? [],
      { required: rule != null || conclusion != null },
    );

    if (
      rule &&
      !isTemporallyApplicable(
        rule.temporal.validFrom,
        rule.temporal.validTo,
        request.applicableAt,
      )
    ) {
      legalRuleSupport.status = "INCOMPLETE";
      legalRuleSupport.notes = [
        ...legalRuleSupport.notes,
        "legal rule outside temporal applicability window",
      ];
    }

    // Reject rules that are backed only by AI_INFERENCE.
    if (
      rule &&
      rule.provenance.every(
        (p) => p.sourceKind === LegalAuthorityKind.AI_INFERENCE,
      )
    ) {
      legalRuleSupport.status = "UNSUPPORTED";
      legalRuleSupport.llmGeneratedAlone = true;
      legalRuleSupport.notes = [
        ...legalRuleSupport.notes,
        "legal rule cannot rest solely on AI_INFERENCE",
      ];
    }

    const interpretationSupport = evaluateSourceBackedSupport(
      "interpretation",
      interpretation?.provenance ?? [],
      { required: interpretation != null },
    );

    const conclusionProvenance = conclusion?.provenance ?? [];
    const conclusionSupport = evaluateSourceBackedSupport(
      "conclusion",
      conclusionProvenance,
      { required: conclusion != null },
    );

    if (conclusion?.llmGeneratedAlone) {
      conclusionSupport.status = "UNSUPPORTED";
      conclusionSupport.llmGeneratedAlone = true;
      conclusionSupport.notes = [
        ...conclusionSupport.notes,
        "conclusion marked llmGeneratedAlone — rejected as legal conclusion",
      ];
    }

    const requiredOk = (status: string): boolean =>
      status === "SOURCE_BACKED" || status === "PARTIAL";

    const needsDoctrine = doctrine != null;
    const needsRule = rule != null || conclusion != null;
    const needsInterpretation = interpretation != null;
    const needsConclusion = conclusion != null;

    const allRequiredSupported =
      (!needsDoctrine || requiredOk(doctrineSupport.status)) &&
      (!needsRule || requiredOk(legalRuleSupport.status)) &&
      (!needsInterpretation || requiredOk(interpretationSupport.status)) &&
      (!needsConclusion || requiredOk(conclusionSupport.status)) &&
      !(conclusion?.llmGeneratedAlone ?? false);

    return {
      legalRule: legalRuleSupport,
      doctrine: doctrineSupport,
      interpretation: interpretationSupport,
      conclusion: conclusionSupport,
      allRequiredSupported,
    };
  }
}
