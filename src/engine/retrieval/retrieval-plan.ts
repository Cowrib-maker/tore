import { RetrievalStrategyId, type IRetrievalPlanner, type RetrievalRequest, type RetrievalStrategySpec } from "./types";

const ALL_STRATEGIES: RetrievalStrategyId[] = [
  RetrievalStrategyId.EXACT_CITATION,
  RetrievalStrategyId.EXACT_PROVISION,
  RetrievalStrategyId.GRAPH_NEIGHBOR,
  RetrievalStrategyId.RELATED_AUTHORITY,
  RetrievalStrategyId.RELATED_CASE,
  RetrievalStrategyId.RELATED_GUIDELINE,
  RetrievalStrategyId.RELATED_LEGISLATION,
];

/**
 * Chooses which retrieval strategies to run. Deterministic and country-agnostic.
 */
export class DefaultRetrievalPlanner implements IRetrievalPlanner {
  plan(request: RetrievalRequest): RetrievalStrategySpec[] {
    const hasCitations = request.citations.length > 0;
    const hasQuestion = request.question.trim().length > 0;
    const hasGraphSeeds =
      hasCitations || request.documents.length > 0 || hasQuestion;

    return ALL_STRATEGIES.map((id) => ({
      id,
      enabled: isEnabled(id, { hasCitations, hasQuestion, hasGraphSeeds }),
    }));
  }
}

function isEnabled(
  id: RetrievalStrategyId,
  flags: { hasCitations: boolean; hasQuestion: boolean; hasGraphSeeds: boolean },
): boolean {
  switch (id) {
    case RetrievalStrategyId.EXACT_CITATION:
      return flags.hasCitations;
    case RetrievalStrategyId.EXACT_PROVISION:
      return flags.hasQuestion || flags.hasCitations;
    default:
      return flags.hasGraphSeeds;
  }
}
