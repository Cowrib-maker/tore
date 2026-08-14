import type {
  IReasoningValidator,
  ReasoningContext,
  ReasoningPlan,
  ReasoningValidation,
} from "./types";
import { ReasoningStepId } from "./types";

const REQUIRED_STEP_IDS: ReasoningStepId[] = [
  ReasoningStepId.VERIFY_CITATIONS,
  ReasoningStepId.COLLECT_PROVISIONS,
  ReasoningStepId.COLLECT_COURT_DECISIONS,
  ReasoningStepId.COLLECT_GUIDELINES,
  ReasoningStepId.COLLECT_GRAPH_NEIGHBORS,
  ReasoningStepId.IDENTIFY_MISSING_FACTS,
  ReasoningStepId.PREPARE_PROMPT_CONTEXT,
];

/**
 * Structural validator. Rejects incomplete plans; never calls a model.
 */
export class DefaultReasoningValidator implements IReasoningValidator {
  validate(
    plan: ReasoningPlan,
    context: ReasoningContext,
  ): ReasoningValidation {
    const issues: string[] = [];

    if (!plan.userIntent) {
      issues.push("missing_user_intent");
    }
    if (plan.userIntent !== context.intent.type) {
      issues.push("intent_mismatch");
    }
    if (plan.legalIssue !== context.legalIssue) {
      issues.push("legal_issue_mismatch");
    }
    if (!Array.isArray(plan.relevantAuthorities)) {
      issues.push("missing_relevant_authorities");
    }
    if (!Array.isArray(plan.requiredEvidence) || plan.requiredEvidence.length === 0) {
      issues.push("missing_required_evidence");
    }
    if (!Array.isArray(plan.relatedArticles)) {
      issues.push("missing_related_articles");
    }
    if (!Array.isArray(plan.relatedCases)) {
      issues.push("missing_related_cases");
    }
    if (!Array.isArray(plan.missingInformation)) {
      issues.push("missing_missing_information");
    }
    if (!plan.confidenceRequirements) {
      issues.push("missing_confidence_requirements");
    }

    if (plan.reasoningSteps.length !== REQUIRED_STEP_IDS.length) {
      issues.push("step_count");
    }
    REQUIRED_STEP_IDS.forEach((id, index) => {
      const step = plan.reasoningSteps[index];
      if (!step || step.id !== id || step.order !== index + 1) {
        issues.push(`step_order:${id}`);
      }
    });

    try {
      JSON.stringify(plan);
    } catch {
      issues.push("not_json_serializable");
    }

    return { ok: issues.length === 0, issues };
  }
}
