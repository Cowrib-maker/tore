import type {
  IReasoningPlanner,
  ReasoningAuthority,
  ReasoningContext,
  ReasoningPlan,
  ReasoningStep,
} from "./types";
import { ReasoningStepId, ReasoningStepStatus } from "./types";

const STEP_TITLES: Record<ReasoningStepId, string> = {
  [ReasoningStepId.VERIFY_CITATIONS]: "Verify citation exists.",
  [ReasoningStepId.COLLECT_PROVISIONS]:
    "Collect all referenced legal provisions.",
  [ReasoningStepId.COLLECT_COURT_DECISIONS]:
    "Collect related Supreme Court decisions.",
  [ReasoningStepId.COLLECT_GUIDELINES]: "Collect prosecutor guidelines.",
  [ReasoningStepId.COLLECT_GRAPH_NEIGHBORS]: "Collect neighboring graph nodes.",
  [ReasoningStepId.IDENTIFY_MISSING_FACTS]: "Identify missing facts.",
  [ReasoningStepId.PREPARE_PROMPT_CONTEXT]:
    "Prepare structured context for Prompt Engine.",
};

const STEP_ORDER: ReasoningStepId[] = [
  ReasoningStepId.VERIFY_CITATIONS,
  ReasoningStepId.COLLECT_PROVISIONS,
  ReasoningStepId.COLLECT_COURT_DECISIONS,
  ReasoningStepId.COLLECT_GUIDELINES,
  ReasoningStepId.COLLECT_GRAPH_NEIGHBORS,
  ReasoningStepId.IDENTIFY_MISSING_FACTS,
  ReasoningStepId.PREPARE_PROMPT_CONTEXT,
];

/**
 * Deterministic planner. Produces a JSON {@link ReasoningPlan} only.
 */
export class DefaultReasoningPlanner implements IReasoningPlanner {
  plan(context: ReasoningContext): ReasoningPlan {
    const steps = STEP_ORDER.map((id, index) =>
      buildStep(id, index + 1, context),
    );
    const promptReady = steps
      .slice(0, 6)
      .every((step) => step.status !== ReasoningStepStatus.BLOCKED);
    const last = steps[6];
    if (last) {
      last.status = promptReady
        ? ReasoningStepStatus.READY
        : ReasoningStepStatus.BLOCKED;
      last.notes = promptReady
        ? ["structured_context_ready"]
        : ["blocked_by_prior_steps"];
    }

    return {
      userIntent: context.intent.type,
      legalIssue: context.legalIssue,
      relevantAuthorities: context.authorities,
      requiredEvidence: requiredEvidence(context),
      relatedArticles: context.articles,
      relatedCases: context.cases,
      missingInformation: context.missingInformation,
      reasoningSteps: steps,
      confidenceRequirements: {
        minimumIntentConfidence: 0.5,
        requireVerifiedCitation: context.citations.length > 0,
        requirePrimaryAuthority: true,
        requireCourtAuthority: context.missingInformation.includes(
          "court_authority",
        )
          ? true
          : /CASE|COURT|LITIGATION/i.test(context.intent.type),
        blockingGaps: context.missingInformation.filter((gap) =>
          BLOCKING_GAPS.has(gap),
        ),
      },
    };
  }
}

const BLOCKING_GAPS = new Set([
  "question",
  "unresolved_citations",
  "primary_authority",
]);

function requiredEvidence(context: ReasoningContext): string[] {
  const evidence = ["material_facts", "primary_authority"];
  if (context.citations.length > 0) {
    evidence.push("verified_citation");
  }
  if (
    /CASE|COURT|LITIGATION/i.test(context.intent.type) ||
    context.cases.length > 0
  ) {
    evidence.push("court_decision");
  }
  if (context.guidelines.length > 0 || /CRIMINAL|PROSECUT/i.test(context.intent.type)) {
    evidence.push("prosecutor_guideline");
  }
  evidence.push("graph_neighbors");
  return evidence;
}

function buildStep(
  id: ReasoningStepId,
  order: number,
  context: ReasoningContext,
): ReasoningStep {
  const title = STEP_TITLES[id];
  switch (id) {
    case ReasoningStepId.VERIFY_CITATIONS:
      return citationStep(order, title, context);
    case ReasoningStepId.COLLECT_PROVISIONS:
      return collectStep(
        order,
        id,
        title,
        context.articles,
        context.articles.length === 0 && context.documents.length === 0
          ? ReasoningStepStatus.BLOCKED
          : context.articles.length === 0
            ? ReasoningStepStatus.SKIPPED
            : ReasoningStepStatus.READY,
        context.articles.length === 0 && context.documents.length === 0
          ? ["no_provisions"]
          : [],
      );
    case ReasoningStepId.COLLECT_COURT_DECISIONS:
      return collectStep(
        order,
        id,
        title,
        context.cases,
        context.cases.length === 0
          ? ReasoningStepStatus.SKIPPED
          : ReasoningStepStatus.READY,
        context.cases.length === 0 ? ["no_court_decisions"] : [],
      );
    case ReasoningStepId.COLLECT_GUIDELINES:
      return collectStep(
        order,
        id,
        title,
        context.guidelines,
        context.guidelines.length === 0
          ? ReasoningStepStatus.SKIPPED
          : ReasoningStepStatus.READY,
        context.guidelines.length === 0 ? ["no_guidelines"] : [],
      );
    case ReasoningStepId.COLLECT_GRAPH_NEIGHBORS:
      return {
        order,
        id,
        title,
        status:
          context.graphNeighbors.length === 0
            ? ReasoningStepStatus.SKIPPED
            : ReasoningStepStatus.READY,
        collectedIds: context.graphNeighbors.map((item) => item.nodeId),
        notes:
          context.graphNeighbors.length === 0 ? ["no_graph_neighbors"] : [],
      };
    case ReasoningStepId.IDENTIFY_MISSING_FACTS:
      return {
        order,
        id,
        title,
        status:
          context.missingInformation.length > 0
            ? ReasoningStepStatus.BLOCKED
            : ReasoningStepStatus.READY,
        collectedIds: [],
        notes: context.missingInformation,
      };
    case ReasoningStepId.PREPARE_PROMPT_CONTEXT:
      return {
        order,
        id,
        title,
        status: ReasoningStepStatus.READY,
        collectedIds: context.authorities.map((item) => item.id),
        notes: [],
      };
  }
}

function citationStep(
  order: number,
  title: string,
  context: ReasoningContext,
): ReasoningStep {
  if (context.citations.length === 0) {
    return {
      order,
      id: ReasoningStepId.VERIFY_CITATIONS,
      title,
      status: ReasoningStepStatus.SKIPPED,
      collectedIds: [],
      notes: ["no_citations_supplied"],
    };
  }
  if (context.unresolvedCitations.length > 0) {
    return {
      order,
      id: ReasoningStepId.VERIFY_CITATIONS,
      title,
      status: ReasoningStepStatus.BLOCKED,
      collectedIds: context.verifiedCitations
        .map((item) => item.nodeId)
        .filter((id): id is string => Boolean(id)),
      notes: context.unresolvedCitations.map(
        (item) => `unresolved:${item.query}`,
      ),
    };
  }
  return {
    order,
    id: ReasoningStepId.VERIFY_CITATIONS,
    title,
    status: ReasoningStepStatus.READY,
    collectedIds: context.verifiedCitations
      .map((item) => item.nodeId)
      .filter((id): id is string => Boolean(id)),
    notes: ["all_citations_verified"],
  };
}

function collectStep(
  order: number,
  id: ReasoningStepId,
  title: string,
  authorities: ReasoningAuthority[],
  status: ReasoningStep["status"],
  notes: string[],
): ReasoningStep {
  return {
    order,
    id,
    title,
    status,
    collectedIds: authorities.map((item) => item.id),
    notes,
  };
}
