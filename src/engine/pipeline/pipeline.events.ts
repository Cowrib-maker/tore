import type { PipelineEvent, PipelineEventType, PipelineStage, IPipelineEventSink } from "./types";

export class InMemoryPipelineEventLog implements IPipelineEventSink {
  private readonly events: PipelineEvent[] = [];

  emit(event: PipelineEvent): void {
    this.events.push(event);
  }

  list(): PipelineEvent[] {
    return [...this.events];
  }
}

export function pipelineEvent(
  stage: PipelineStage,
  type: PipelineEventType,
  detail?: string,
): PipelineEvent {
  return {
    stage,
    type,
    at: Date.now(),
    detail,
  };
}
