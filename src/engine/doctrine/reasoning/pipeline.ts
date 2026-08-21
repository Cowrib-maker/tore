/**
 * Legal reasoning pipeline orchestration.
 * Builds support → trace → validation; never calls an LLM.
 */

import type { LegalConflict } from "../conflict";
import { DefaultLegalReasoningSupportEvaluator } from "./support";
import { DefaultLegalReasoningTraceBuilder } from "./trace";
import type {
  ILegalReasoningPipeline,
  LegalReasoningPipelineDependencies,
  LegalReasoningRequest,
  LegalReasoningResult,
} from "./types";
import { DefaultLegalReasoningValidator } from "./validator";

export class DefaultLegalReasoningPipeline implements ILegalReasoningPipeline {
  private readonly supportEvaluator: LegalReasoningPipelineDependencies["supportEvaluator"];
  private readonly traceBuilder: LegalReasoningPipelineDependencies["traceBuilder"];
  private readonly validator: LegalReasoningPipelineDependencies["validator"];

  constructor(dependencies: LegalReasoningPipelineDependencies) {
    this.supportEvaluator = dependencies.supportEvaluator;
    this.traceBuilder = dependencies.traceBuilder;
    this.validator = dependencies.validator;
  }

  run(request: LegalReasoningRequest): LegalReasoningResult {
    const conflicts: LegalConflict[] = [...(request.conflicts ?? [])];
    const support = this.supportEvaluator.evaluate(request);
    const trace = this.traceBuilder.build(request, support);
    const validation = this.validator.validate(request, support, conflicts);

    const conclusion =
      validation.ok &&
      request.proposedConclusion &&
      support.allRequiredSupported &&
      !request.proposedConclusion.llmGeneratedAlone
        ? {
            ...request.proposedConclusion,
            accepted: true,
            temporal: {
              ...request.proposedConclusion.temporal,
              applicableAt: request.applicableAt,
            },
          }
        : null;

    return {
      trace,
      conclusion,
      support,
      conflicts,
      validation,
    };
  }
}

export function createLegalReasoningPipeline(
  overrides: Partial<LegalReasoningPipelineDependencies> = {},
): DefaultLegalReasoningPipeline {
  return new DefaultLegalReasoningPipeline({
    supportEvaluator:
      overrides.supportEvaluator ??
      new DefaultLegalReasoningSupportEvaluator(),
    traceBuilder:
      overrides.traceBuilder ?? new DefaultLegalReasoningTraceBuilder(),
    validator: overrides.validator ?? new DefaultLegalReasoningValidator(),
  });
}
