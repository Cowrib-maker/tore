/**
 * Rejects or flags conclusions that lack source-backed support.
 * A legal conclusion must never rest solely on LLM generation.
 */

import { LegalConflictKind } from "../types";
import type {
  ILegalReasoningValidator,
  LegalReasoningRequest,
  LegalReasoningValidation,
  SourceBackedSupportReport,
} from "./types";
import type { LegalConflict } from "../conflict";

const ACCEPTABLE = new Set(["SOURCE_BACKED", "PARTIAL"]);

export class DefaultLegalReasoningValidator
  implements ILegalReasoningValidator
{
  validate(
    request: LegalReasoningRequest,
    support: SourceBackedSupportReport,
    conflicts: readonly LegalConflict[],
  ): LegalReasoningValidation {
    const rejected: string[] = [];
    const flags: string[] = [];

    if (request.proposedConclusion?.llmGeneratedAlone) {
      rejected.push(
        "unsupported_conclusion:llm_only — reasoning engine must never accept a legal conclusion solely because an LLM generated it",
      );
    }

    if (
      request.proposedConclusion &&
      !ACCEPTABLE.has(support.conclusion.status)
    ) {
      rejected.push(
        `unsupported_conclusion:${support.conclusion.status.toLowerCase()}`,
      );
    }

    if (
      request.proposedConclusion &&
      request.legalRule &&
      !ACCEPTABLE.has(support.legalRule.status)
    ) {
      rejected.push(
        `unsupported_legal_rule:${support.legalRule.status.toLowerCase()}`,
      );
    }

    if (
      request.proposedConclusion &&
      request.applicableDoctrine &&
      !ACCEPTABLE.has(support.doctrine.status)
    ) {
      rejected.push(
        `unsupported_doctrine:${support.doctrine.status.toLowerCase()}`,
      );
    }

    if (
      request.interpretation &&
      !ACCEPTABLE.has(support.interpretation.status)
    ) {
      rejected.push(
        `unsupported_interpretation:${support.interpretation.status.toLowerCase()}`,
      );
    }

    if (request.proposedConclusion && !request.legalRule) {
      rejected.push("incomplete_reasoning:missing_legal_rule");
    }

    if (request.proposedConclusion && !request.applicableDoctrine) {
      rejected.push("incomplete_reasoning:missing_doctrine");
    }

    if (request.issue.unresolved) {
      flags.push("unresolved_issue");
      rejected.push("unresolved_issue:cannot_accept_conclusion");
    }

    for (const conflict of conflicts) {
      if (conflict.kind === LegalConflictKind.UNRESOLVED_ISSUE) {
        rejected.push(`conflict:${conflict.id}`);
      } else if (conflict.unresolved) {
        flags.push(`conflict:${conflict.kind.toLowerCase()}:${conflict.id}`);
        if (request.proposedConclusion) {
          rejected.push(
            `conflict_blocks_conclusion:${conflict.kind.toLowerCase()}:${conflict.id}`,
          );
        }
      }
    }

    if (support.conclusion.status === "INCOMPLETE") {
      flags.push("incomplete_conclusion_support");
    }
    if (support.doctrine.status === "INCOMPLETE") {
      flags.push("incomplete_doctrine_support");
    }
    if (support.legalRule.status === "INCOMPLETE") {
      flags.push("incomplete_legal_rule_support");
    }

    return {
      ok: rejected.length === 0,
      rejected: [...new Set(rejected)],
      flags: [...new Set(flags)],
    };
  }
}
