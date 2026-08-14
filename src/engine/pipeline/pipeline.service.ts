import { createLegalAiGateway } from "../gateway";
import { createIntentEngine } from "../intent";
import { createReasoningEngine } from "../reasoning";
import { createRetrievalEngine } from "../retrieval";
import { createVerificationEngine } from "../verification";
import {
  createPipelineContext,
  isLegalTurn,
  toReasoningRequest,
  toRetrievalRequest,
  toVerificationRequest,
} from "./pipeline.context";
import { InMemoryPipelineEventLog, pipelineEvent } from "./pipeline.events";
import { PipelineMetricsCollector } from "./pipeline.metrics";
import { buildPipelineResult } from "./pipeline.result";
import {
  PipelineStage,
  PipelineStatus,
  type IPipelineEventSink,
  type PipelineDependencies,
  type PipelineRequest,
  type PipelineResult,
} from "./types";

/**
 * Legal AI Pipeline orchestrator.
 *
 * Runs Gateway → Intent → Retrieval → Reasoning → Verification.
 * Does not classify law, retrieve knowledge, or call a model itself.
 */
export class PipelineService {
  constructor(private readonly dependencies: PipelineDependencies) {}

  async run(request: PipelineRequest): Promise<PipelineResult> {
    const events: IPipelineEventSink =
      this.dependencies.events ?? new InMemoryPipelineEventLog();
    const metrics = new PipelineMetricsCollector();
    const context = createPipelineContext(request);

    try {
      await this.runGateway(context, events, metrics);
      if (!isLegalTurn(context)) {
        context.status = PipelineStatus.REJECTED;
        context.stoppedAt = PipelineStage.GATEWAY;
        this.skipRemaining(PipelineStage.GATEWAY, events, metrics);
        return buildPipelineResult(context, events.list(), metrics.snapshot());
      }

      await this.runIntent(context, events, metrics);
      this.runRetrieval(context, events, metrics);
      this.runReasoning(context, events, metrics);
      this.runVerification(context, events, metrics);
      context.status = PipelineStatus.COMPLETED;
      return buildPipelineResult(context, events.list(), metrics.snapshot());
    } catch (error) {
      context.status = PipelineStatus.FAILED;
      context.error = error instanceof Error ? error.message : "pipeline_failed";
      if (context.stoppedAt) {
        metrics.end(context.stoppedAt);
      }
      events.emit(
        pipelineEvent(
          context.stoppedAt ?? PipelineStage.GATEWAY,
          "error",
          context.error,
        ),
      );
      return buildPipelineResult(context, events.list(), metrics.snapshot());
    }
  }

  private async runGateway(
    context: ReturnType<typeof createPipelineContext>,
    events: IPipelineEventSink,
    metrics: PipelineMetricsCollector,
  ): Promise<void> {
    const stage = PipelineStage.GATEWAY;
    context.stoppedAt = stage;
    events.emit(pipelineEvent(stage, "start"));
    metrics.start(stage);
    context.gateway = await this.dependencies.gateway.createTurn({
      message: context.request.message,
      userContext: context.request.userContext,
      conversationId: context.request.conversationId,
      metadata: context.request.metadata,
    });
    metrics.end(stage);
    events.emit(pipelineEvent(stage, "end"));
  }

  private async runIntent(
    context: ReturnType<typeof createPipelineContext>,
    events: IPipelineEventSink,
    metrics: PipelineMetricsCollector,
  ): Promise<void> {
    const stage = PipelineStage.INTENT;
    context.stoppedAt = stage;
    events.emit(pipelineEvent(stage, "start"));
    metrics.start(stage);
    context.intent = await this.dependencies.intent.classify(
      context.request.message,
    );
    metrics.end(stage);
    events.emit(pipelineEvent(stage, "end"));
  }

  private runRetrieval(
    context: ReturnType<typeof createPipelineContext>,
    events: IPipelineEventSink,
    metrics: PipelineMetricsCollector,
  ): void {
    const stage = PipelineStage.RETRIEVAL;
    context.stoppedAt = stage;
    events.emit(pipelineEvent(stage, "start"));
    metrics.start(stage);
    context.retrieval = this.dependencies.retrieval.retrieve(
      toRetrievalRequest(context),
    );
    metrics.end(stage);
    events.emit(pipelineEvent(stage, "end"));
  }

  private runReasoning(
    context: ReturnType<typeof createPipelineContext>,
    events: IPipelineEventSink,
    metrics: PipelineMetricsCollector,
  ): void {
    const stage = PipelineStage.REASONING;
    context.stoppedAt = stage;
    events.emit(pipelineEvent(stage, "start"));
    metrics.start(stage);
    context.reasoning = this.dependencies.reasoning.prepare(
      toReasoningRequest(context),
    );
    metrics.end(stage);
    events.emit(pipelineEvent(stage, "end"));
  }

  private runVerification(
    context: ReturnType<typeof createPipelineContext>,
    events: IPipelineEventSink,
    metrics: PipelineMetricsCollector,
  ): void {
    const stage = PipelineStage.VERIFICATION;
    context.stoppedAt = stage;
    events.emit(pipelineEvent(stage, "start"));
    metrics.start(stage);
    context.verification = this.dependencies.verification.verify(
      toVerificationRequest(context),
    );
    metrics.end(stage);
    events.emit(pipelineEvent(stage, "end"));
  }

  private skipRemaining(
    after: (typeof PipelineStage)[keyof typeof PipelineStage],
    events: IPipelineEventSink,
    metrics: PipelineMetricsCollector,
  ): void {
    const remaining = [
      PipelineStage.INTENT,
      PipelineStage.RETRIEVAL,
      PipelineStage.REASONING,
      PipelineStage.VERIFICATION,
    ].filter((stage) => stageOrder(stage) > stageOrder(after));
    for (const stage of remaining) {
      events.emit(pipelineEvent(stage, "skip"));
      metrics.end(stage, true);
    }
  }
}

function stageOrder(stage: (typeof PipelineStage)[keyof typeof PipelineStage]): number {
  switch (stage) {
    case PipelineStage.GATEWAY:
      return 1;
    case PipelineStage.INTENT:
      return 2;
    case PipelineStage.RETRIEVAL:
      return 3;
    case PipelineStage.REASONING:
      return 4;
    case PipelineStage.VERIFICATION:
      return 5;
  }
}

export function createLegalPipeline(
  overrides: Partial<PipelineDependencies> = {},
): PipelineService {
  return new PipelineService({
    gateway: overrides.gateway ?? createLegalAiGateway(),
    intent: overrides.intent ?? createIntentEngine(),
    retrieval: overrides.retrieval ?? createRetrievalEngine(),
    reasoning: overrides.reasoning ?? createReasoningEngine(),
    verification: overrides.verification ?? createVerificationEngine(),
    events: overrides.events,
  });
}
