import {
  PipelineStage,
  type PipelineMetrics,
  type PipelineStageMetric,
} from "./types";

const STAGE_ORDER: PipelineStage[] = [
  PipelineStage.GATEWAY,
  PipelineStage.INTENT,
  PipelineStage.RETRIEVAL,
  PipelineStage.REASONING,
  PipelineStage.VERIFICATION,
];

export class PipelineMetricsCollector {
  private readonly startedAt: number;
  private readonly stageStarted = new Map<PipelineStage, number>();
  private readonly stages: PipelineStageMetric[] = [];

  constructor(now: number = Date.now()) {
    this.startedAt = now;
  }

  start(stage: PipelineStage, now: number = Date.now()): void {
    this.stageStarted.set(stage, now);
  }

  end(stage: PipelineStage, skipped = false, now: number = Date.now()): void {
    const started = this.stageStarted.get(stage) ?? now;
    this.stages.push({
      stage,
      durationMs: skipped ? 0 : Math.max(0, now - started),
      skipped,
    });
  }

  snapshot(now: number = Date.now()): PipelineMetrics {
    const recorded = new Set(this.stages.map((item) => item.stage));
    const stages = [...this.stages];
    for (const stage of STAGE_ORDER) {
      if (!recorded.has(stage)) {
        stages.push({ stage, durationMs: 0, skipped: true });
      }
    }
    return {
      startedAt: this.startedAt,
      finishedAt: now,
      durationMs: Math.max(0, now - this.startedAt),
      stages,
    };
  }
}
