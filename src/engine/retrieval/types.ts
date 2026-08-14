/**
 * Contracts for the TORE Retrieval Engine.
 *
 * Collects relevant legal authorities before reasoning.
 * No prompts, embeddings, inference, or network I/O.
 */

import type { CitationIndex } from "../citation/types";
import type { KnowledgeGraph } from "../graph/knowledge-graph";
import type { LegalDocument } from "../knowledge/schema";

export const RetrievalStrategyId = {
  EXACT_CITATION: "exact-citation",
  EXACT_PROVISION: "exact-provision",
  GRAPH_NEIGHBOR: "graph-neighbor",
  RELATED_AUTHORITY: "related-authority",
  RELATED_CASE: "related-case",
  RELATED_GUIDELINE: "related-guideline",
  RELATED_LEGISLATION: "related-legislation",
} as const;

export type RetrievalStrategyId =
  (typeof RetrievalStrategyId)[keyof typeof RetrievalStrategyId];

export type RetrievalIntentInput = {
  type: string;
  confidence: number;
};

export type RetrievalCitationInput = {
  query: string;
  resolved: boolean;
  nodeId: string | null;
  documentId: string | null;
  canonical: string | null;
  kind: string | null;
};

export type RetrievalGraphPort = Pick<
  KnowledgeGraph,
  "findNode" | "neighbors" | "findRelated" | "findByType"
>;

export type RetrievalRequest = {
  question: string;
  intent: RetrievalIntentInput;
  citations: RetrievalCitationInput[];
  documents: readonly LegalDocument[];
  citationIndex: CitationIndex | readonly CitationIndex[];
  graph: RetrievalGraphPort;
};

export type RetrievalStrategySpec = {
  id: RetrievalStrategyId;
  enabled: boolean;
};

export type RetrievalHit = {
  id: string;
  kind: string;
  label: string;
  documentId: string | null;
  source: "citation" | "provision" | "graph";
  strategy: RetrievalStrategyId;
  score: number;
  edgeType?: string | null;
  direction?: "OUT" | "IN";
};

export type RetrievedAuthority = {
  id: string;
  kind: string;
  label: string;
  documentId: string | null;
  source: RetrievalHit["source"];
  score: number;
};

export type RetrievedNeighbor = RetrievedAuthority & {
  edgeType: string | null;
  direction: "OUT" | "IN" | null;
};

export type RetrievalPlan = {
  retrievedAuthorities: RetrievedAuthority[];
  retrievedArticles: RetrievedAuthority[];
  relatedCases: RetrievedAuthority[];
  relatedGuidelines: RetrievedAuthority[];
  graphNeighbors: RetrievedNeighbor[];
  retrievalStrategy: RetrievalStrategyId[];
  confidence: number;
};

export interface IRetrievalPlanner {
  plan(request: RetrievalRequest): RetrievalStrategySpec[];
}

export interface IRetrievalStrategy {
  readonly id: RetrievalStrategyId;
  execute(request: RetrievalRequest): RetrievalHit[];
}

export interface IRetrievalRanker {
  rank(hits: readonly RetrievalHit[]): RetrievalHit[];
}

export interface IRetrievalResultBuilder {
  build(
    specs: readonly RetrievalStrategySpec[],
    hits: readonly RetrievalHit[],
    request: RetrievalRequest,
  ): RetrievalPlan;
}

export type RetrievalServiceDependencies = {
  planner: IRetrievalPlanner;
  strategies: readonly IRetrievalStrategy[];
  ranker: IRetrievalRanker;
  resultBuilder: IRetrievalResultBuilder;
};
