/**
 * TORE Retrieval Engine.
 *
 * Collects the most relevant legal knowledge before reasoning.
 * Does not call LLMs, create embeddings, or access the network.
 */

export type {
  IRetrievalPlanner,
  IRetrievalRanker,
  IRetrievalResultBuilder,
  IRetrievalStrategy,
  RetrievalCitationInput,
  RetrievalGraphPort,
  RetrievalHit,
  RetrievalIntentInput,
  RetrievalPlan,
  RetrievalRequest,
  RetrievalServiceDependencies,
  RetrievalStrategySpec,
  RetrievedAuthority,
  RetrievedNeighbor,
} from "./types";
export { RetrievalStrategyId } from "./types";

export { DefaultRetrievalPlanner } from "./retrieval-plan";
export { DefaultRetrievalRanker } from "./retrieval-ranking";
export { DefaultRetrievalResultBuilder } from "./retrieval-result";
export {
  ExactCitationStrategy,
  defaultRetrievalStrategies,
} from "./retrieval-strategy";
export { RetrievalService, createRetrievalEngine } from "./retrieval.service";
