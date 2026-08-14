import type { PipelineContext, PipelineEvent, PipelineMetrics, PipelineResult } from "./types";

export function buildPipelineResult(
  context: PipelineContext,
  events: PipelineEvent[],
  metrics: PipelineMetrics,
): PipelineResult {
  return { context, events, metrics };
}
