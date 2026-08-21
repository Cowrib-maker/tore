/**
 * Builds the ordered legal reasoning trace.
 * issue → doctrine → rule → elements → facts → evidence → subsumption → conclusion
 */

import {
  LegalReasoningStepKind,
  LegalReasoningStepStatus,
  SubsumptionMatchStatus,
  emptyTemporal,
} from "../types";
import type {
  ILegalReasoningTraceBuilder,
  LegalReasoningRequest,
  LegalReasoningStep,
  LegalReasoningTrace,
  SourceBackedSupportReport,
  SubsumptionAssessment,
} from "./types";

function statusFromSupport(
  supportStatus: string | undefined,
  present: boolean,
): LegalReasoningStepStatus {
  if (!present) {
    return LegalReasoningStepStatus.INCOMPLETE;
  }
  if (supportStatus === "UNSUPPORTED") {
    return LegalReasoningStepStatus.UNSUPPORTED;
  }
  if (supportStatus === "CONFLICTED") {
    return LegalReasoningStepStatus.CONFLICTED;
  }
  if (supportStatus === "INCOMPLETE" || supportStatus === "PARTIAL") {
    return LegalReasoningStepStatus.INCOMPLETE;
  }
  return LegalReasoningStepStatus.COMPLETE;
}

export class DefaultLegalReasoningTraceBuilder
  implements ILegalReasoningTraceBuilder
{
  build(
    request: LegalReasoningRequest,
    support: SourceBackedSupportReport,
  ): LegalReasoningTrace {
    const steps: LegalReasoningStep[] = [];
    let order = 1;

    steps.push({
      order: order++,
      kind: LegalReasoningStepKind.ISSUE,
      status: request.issue.unresolved
        ? LegalReasoningStepStatus.INCOMPLETE
        : LegalReasoningStepStatus.COMPLETE,
      subjectIds: [request.issue.id],
      notes: request.issue.unresolved ? ["issue marked unresolved"] : [],
      support: null,
    });

    steps.push({
      order: order++,
      kind: LegalReasoningStepKind.APPLICABLE_DOCTRINE,
      status: statusFromSupport(
        support.doctrine.status,
        request.applicableDoctrine != null,
      ),
      subjectIds: request.applicableDoctrine
        ? [request.applicableDoctrine.id]
        : [],
      notes:
        request.applicableDoctrine == null
          ? ["no applicable doctrine supplied"]
          : [],
      support: support.doctrine,
    });

    steps.push({
      order: order++,
      kind: LegalReasoningStepKind.LEGAL_RULE,
      status: statusFromSupport(
        support.legalRule.status,
        request.legalRule != null,
      ),
      subjectIds: request.legalRule ? [request.legalRule.id] : [],
      notes: request.legalRule == null ? ["no legal rule supplied"] : [],
      support: support.legalRule,
    });

    const elements = request.legalTest?.elements ?? [];
    steps.push({
      order: order++,
      kind: LegalReasoningStepKind.ELEMENTS,
      status:
        elements.length > 0
          ? LegalReasoningStepStatus.COMPLETE
          : LegalReasoningStepStatus.INCOMPLETE,
      subjectIds: elements.map((el) => el.id),
      notes:
        elements.length === 0 ? ["no legal test elements supplied"] : [],
      support: null,
    });

    steps.push({
      order: order++,
      kind: LegalReasoningStepKind.FACTS,
      status:
        request.facts.length > 0
          ? LegalReasoningStepStatus.COMPLETE
          : LegalReasoningStepStatus.INCOMPLETE,
      subjectIds: request.facts.map((f) => f.id),
      notes: request.facts.length === 0 ? ["no facts supplied"] : [],
      support: null,
    });

    steps.push({
      order: order++,
      kind: LegalReasoningStepKind.EVIDENCE,
      status:
        request.evidence.length > 0
          ? LegalReasoningStepStatus.COMPLETE
          : LegalReasoningStepStatus.INCOMPLETE,
      subjectIds: request.evidence.map((e) => e.id),
      notes: request.evidence.length === 0 ? ["no evidence supplied"] : [],
      support: null,
    });

    const subsumptions = this.buildSubsumptions(request);
    const subsumptionIncomplete = subsumptions.some(
      (s) =>
        s.status === SubsumptionMatchStatus.MISSING_FACT ||
        s.status === SubsumptionMatchStatus.MISSING_EVIDENCE ||
        s.status === SubsumptionMatchStatus.INDETERMINATE,
    );
    steps.push({
      order: order++,
      kind: LegalReasoningStepKind.SUBSUMPTION,
      status:
        elements.length === 0
          ? LegalReasoningStepStatus.INCOMPLETE
          : subsumptionIncomplete
            ? LegalReasoningStepStatus.INCOMPLETE
            : LegalReasoningStepStatus.COMPLETE,
      subjectIds: subsumptions.map((s) => s.elementId),
      notes: [],
      support: null,
    });

    steps.push({
      order: order++,
      kind: LegalReasoningStepKind.CONCLUSION,
      status: statusFromSupport(
        support.conclusion.status,
        request.proposedConclusion != null,
      ),
      subjectIds: request.proposedConclusion
        ? [request.proposedConclusion.id]
        : [],
      notes: request.proposedConclusion?.llmGeneratedAlone
        ? ["proposed conclusion is LLM-only"]
        : [],
      support: support.conclusion,
    });

    return {
      issueId: request.issue.id,
      steps,
      subsumptions,
      temporal: emptyTemporal({
        applicableAt: request.applicableAt,
        sourceVersion:
          request.applicableDoctrine?.temporal.sourceVersion ??
          request.legalRule?.temporal.sourceVersion ??
          null,
        validFrom:
          request.applicableDoctrine?.temporal.validFrom ??
          request.legalRule?.temporal.validFrom ??
          null,
        validTo:
          request.applicableDoctrine?.temporal.validTo ??
          request.legalRule?.temporal.validTo ??
          null,
      }),
    };
  }

  private buildSubsumptions(
    request: LegalReasoningRequest,
  ): SubsumptionAssessment[] {
    const elements = request.legalTest?.elements ?? [];
    return elements.map((element) => {
      const factIds = request.facts
        .filter((f) => f.elementId === element.id)
        .map((f) => f.id);
      const evidenceIds = request.evidence
        .filter((e) => factIds.includes(e.factId))
        .map((e) => e.id);

      if (factIds.length === 0) {
        return {
          elementId: element.id,
          factIds,
          evidenceIds,
          status: element.required
            ? SubsumptionMatchStatus.MISSING_FACT
            : SubsumptionMatchStatus.INDETERMINATE,
          notes: ["no facts mapped to element"],
        };
      }
      if (evidenceIds.length === 0) {
        return {
          elementId: element.id,
          factIds,
          evidenceIds,
          status: SubsumptionMatchStatus.MISSING_EVIDENCE,
          notes: ["facts present without linked evidence"],
        };
      }
      const disputed = request.facts.some(
        (f) => f.elementId === element.id && f.disputed,
      );
      return {
        elementId: element.id,
        factIds,
        evidenceIds,
        status: disputed
          ? SubsumptionMatchStatus.INDETERMINATE
          : SubsumptionMatchStatus.SATISFIED,
        notes: disputed ? ["mapped facts are disputed"] : [],
      };
    });
  }
}
