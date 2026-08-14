import { DefaultRetrievalPlanner } from "./retrieval-plan";
import { DefaultRetrievalRanker } from "./retrieval-ranking";
import { DefaultRetrievalResultBuilder } from "./retrieval-result";
import { defaultRetrievalStrategies } from "./retrieval-strategy";
import type {
  IRetrievalPlanner,
  IRetrievalRanker,
  IRetrievalResultBuilder,
  IRetrievalStrategy,
  RetrievalPlan,
  RetrievalRequest,
  RetrievalServiceDependencies,
  RetrievalStrategyId,
} from "./types";

/**
 * Retrieval Engine facade.
 *
 * Collects authorities for a later Reasoning Engine.
 * Does not call models, embed text, or fetch websites.
 */
export class RetrievalService {
  private readonly planner: IRetrievalPlanner;
  private readonly strategies: Map<RetrievalStrategyId, IRetrievalStrategy>;
  private readonly ranker: IRetrievalRanker;
  private readonly resultBuilder: IRetrievalResultBuilder;

  constructor(dependencies: RetrievalServiceDependencies) {
    this.planner = dependencies.planner;
    this.strategies = new Map(
      dependencies.strategies.map((strategy) => [strategy.id, strategy]),
    );
    this.ranker = dependencies.ranker;
    this.resultBuilder = dependencies.resultBuilder;
  }

  retrieve(request: RetrievalRequest): RetrievalPlan {
    const specs = this.planner.plan(request);
    const hits = specs.flatMap((spec) => {
      if (!spec.enabled) {
        return [];
      }
      return this.strategies.get(spec.id)?.execute(request) ?? [];
    });
    return this.resultBuilder.build(specs, this.ranker.rank(hits), request);
  }
}

export function createRetrievalEngine(
  overrides: Partial<RetrievalServiceDependencies> = {},
): RetrievalService {
  return new RetrievalService({
    planner: overrides.planner ?? new DefaultRetrievalPlanner(),
    strategies: overrides.strategies ?? defaultRetrievalStrategies(),
    ranker: overrides.ranker ?? new DefaultRetrievalRanker(),
    resultBuilder: overrides.resultBuilder ?? new DefaultRetrievalResultBuilder(),
  });
}
