/**
 * TORE Legal AI Pipeline.
 *
 * Coordinates Gateway, Intent, Retrieval, Reasoning, and Verification.
 * Does not implement legal logic, build prompts, or call a model.
 */

export type {
  IPipelineEventSink,
  IPipelineGateway,
  IPipelineIntent,
  IPipelineReasoning,
  IPipelineRetrieval,
  IPipelineVerification,
  PipelineContext,
  PipelineDependencies,
  PipelineEvent,
  PipelineMetrics,
  PipelineRequest,
  PipelineResult,
  PipelineStageMetric,
} from "./types";
export { PipelineStage, PipelineStatus } from "./types";

export {
  createPipelineContext,
  isLegalTurn,
  toReasoningRequest,
  toRetrievalRequest,
  toVerificationRequest,
} from "./pipeline.context";
export { InMemoryPipelineEventLog } from "./pipeline.events";
export { PipelineMetricsCollector } from "./pipeline.metrics";
export { buildPipelineResult } from "./pipeline.result";
export { PipelineService, createLegalPipeline } from "./pipeline.service";
