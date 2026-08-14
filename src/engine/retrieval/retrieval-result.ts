import { RetrievalStrategyId, type IRetrievalResultBuilder, type RetrievedAuthority, type RetrievedNeighbor, type RetrievalHit, type RetrievalPlan, type RetrievalRequest, type RetrievalStrategySpec } from "./types";

const ARTICLE_KINDS = new Set([
  "ARTICLE",
  "PARAGRAPH",
  "SUBPARAGRAPH",
  "PROVISION",
  "ITEM",
]);

const CASE_KINDS = new Set([
  "COURT_DECISION",
  "SUPREME_COURT_RESOLUTION",
  "CASE",
]);

const GUIDELINE_KINDS = new Set(["PROSECUTOR_GUIDELINE", "GUIDELINE"]);

/**
 * Assembles the JSON {@link RetrievalPlan} from ranked hits.
 */
export class DefaultRetrievalResultBuilder implements IRetrievalResultBuilder {
  build(
    specs: readonly RetrievalStrategySpec[],
    hits: readonly RetrievalHit[],
    request: RetrievalRequest,
  ): RetrievalPlan {
    const authorities = hits.map(toAuthority);
    const enabledStrategies = specs.filter((spec) => spec.enabled).map((spec) => spec.id);
    const contributing = [...new Set(hits.map((hit) => hit.strategy))];

    return {
      retrievedAuthorities: authorities,
      retrievedArticles: authorities.filter((item) => ARTICLE_KINDS.has(item.kind)),
      relatedCases: authorities.filter((item) => CASE_KINDS.has(item.kind)),
      relatedGuidelines: authorities.filter((item) =>
        GUIDELINE_KINDS.has(item.kind),
      ),
      graphNeighbors: hits
        .filter((hit) => hit.strategy === RetrievalStrategyId.GRAPH_NEIGHBOR)
        .map(toNeighbor),
      retrievalStrategy: enabledStrategies,
      confidence: confidence(hits, request, contributing),
    };
  }
}

function toAuthority(hit: RetrievalHit): RetrievedAuthority {
  return {
    id: hit.id,
    kind: hit.kind,
    label: hit.label,
    documentId: hit.documentId,
    source: hit.source,
    score: hit.score,
  };
}

function toNeighbor(hit: RetrievalHit): RetrievedNeighbor {
  return {
    ...toAuthority(hit),
    edgeType: hit.edgeType ?? null,
    direction: hit.direction ?? null,
  };
}

function confidence(
  hits: readonly RetrievalHit[],
  request: RetrievalRequest,
  used: readonly RetrievalStrategyId[],
): number {
  if (hits.length === 0) {
    return 0;
  }
  let score = 0.35;
  if (used.includes(RetrievalStrategyId.EXACT_CITATION)) {
    score += 0.3;
  }
  if (used.includes(RetrievalStrategyId.EXACT_PROVISION)) {
    score += 0.15;
  }
  if (used.includes(RetrievalStrategyId.GRAPH_NEIGHBOR)) {
    score += 0.1;
  }
  score += Math.min(0.1, Math.max(0, request.intent.confidence) * 0.1);
  return Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
}
