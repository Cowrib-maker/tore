import { DefaultReasoningContextBuilder } from "./reasoning-context";
import { DefaultReasoningPlanner } from "./reasoning-plan";
import { DefaultReasoningValidator } from "./reasoning-validator";
import type {
  IReasoningContextBuilder,
  IReasoningPlanner,
  IReasoningValidator,
  ReasoningPlan,
  ReasoningRequest,
  ReasoningServiceDependencies,
} from "./types";

/**
 * Reasoning Engine facade.
 *
 * Builds a deterministic {@link ReasoningPlan} for a later Prompt Engine.
 * Does not call models, emit prompts, or perform inference.
 */
export class ReasoningService {
  private readonly contextBuilder: IReasoningContextBuilder;
  private readonly planner: IReasoningPlanner;
  private readonly validator: IReasoningValidator;

  constructor(dependencies: ReasoningServiceDependencies) {
    this.contextBuilder = dependencies.contextBuilder;
    this.planner = dependencies.planner;
    this.validator = dependencies.validator;
  }

  prepare(request: ReasoningRequest): ReasoningPlan {
    const context = this.contextBuilder.build(request);
    const plan = this.planner.plan(context);
    const validation = this.validator.validate(plan, context);
    if (validation.ok) {
      return plan;
    }
    return {
      ...plan,
      missingInformation: unique([
        ...plan.missingInformation,
        ...validation.issues,
      ]),
      confidenceRequirements: {
        ...plan.confidenceRequirements,
        blockingGaps: unique([
          ...plan.confidenceRequirements.blockingGaps,
          ...validation.issues,
        ]),
      },
    };
  }
}

export function createReasoningEngine(
  overrides: Partial<ReasoningServiceDependencies> = {},
): ReasoningService {
  return new ReasoningService({
    contextBuilder:
      overrides.contextBuilder ?? new DefaultReasoningContextBuilder(),
    planner: overrides.planner ?? new DefaultReasoningPlanner(),
    validator: overrides.validator ?? new DefaultReasoningValidator(),
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
