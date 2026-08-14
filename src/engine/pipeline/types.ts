/**
 * Contracts for the TORE Legal AI Pipeline.
 *
 * Orchestrates existing engines. Contains no legal business logic,
 * prompts, or model calls.
 */

import type { CitationIndex } from "../citation/types";
import type { GatewayRequest, GatewayTurn } from "../gateway/types";
import type { IntentClassification } from "../intent/intent.types";
import type { LegalDocument } from "../knowledge/schema";
import type { ReasoningPlan, ReasoningRequest } from "../reasoning/types";
import type {
  RetrievalCitationInput,
  RetrievalGraphPort,
  RetrievalPlan,
  RetrievalRequest,
} from "../retrieval/types";
import type {
  VerificationReport,
  VerificationRequest,
} from "../verification/types";

export const PipelineStage = {
  GATEWAY: "gateway",
  INTENT: "intent",
  RETRIEVAL: "retrieval",
  REASONING: "reasoning",
  VERIFICATION: "verification",
} as const;

export type PipelineStage = (typeof PipelineStage)[keyof typeof PipelineStage];

export const PipelineStatus = {
  COMPLETED: "COMPLETED",
  REJECTED: "REJECTED",
  FAILED: "FAILED",
} as const;

export type PipelineStatus =
  (typeof PipelineStatus)[keyof typeof PipelineStatus];

export type PipelineRequest = {
  message: string;
  userContext?: GatewayRequest["userContext"];
  conversationId?: string;
  metadata?: Record<string, unknown>;
  citations?: RetrievalCitationInput[];
  documents: readonly LegalDocument[];
  citationIndex: CitationIndex | readonly CitationIndex[];
  graph: RetrievalGraphPort;
};

export type PipelineContext = {
  status: PipelineStatus;
  stoppedAt: PipelineStage | null;
  error: string | null;
  request: PipelineRequest;
  gateway: GatewayTurn | null;
  intent: IntentClassification | null;
  retrieval: RetrievalPlan | null;
  reasoning: ReasoningPlan | null;
  verification: VerificationReport | null;
};

export type PipelineEventType = "start" | "end" | "skip" | "error";

export type PipelineEvent = {
  stage: PipelineStage;
  type: PipelineEventType;
  at: number;
  detail?: string;
};

export type PipelineStageMetric = {
  stage: PipelineStage;
  durationMs: number;
  skipped: boolean;
};

export type PipelineMetrics = {
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  stages: PipelineStageMetric[];
};

export type PipelineResult = {
  context: PipelineContext;
  events: PipelineEvent[];
  metrics: PipelineMetrics;
};

export interface IPipelineGateway {
  createTurn(request: GatewayRequest): Promise<GatewayTurn>;
}

export interface IPipelineIntent {
  classify(message: string): IntentClassification | Promise<IntentClassification>;
}

export interface IPipelineRetrieval {
  retrieve(request: RetrievalRequest): RetrievalPlan;
}

export interface IPipelineReasoning {
  prepare(request: ReasoningRequest): ReasoningPlan;
}

export interface IPipelineVerification {
  verify(request: VerificationRequest): VerificationReport;
}

export interface IPipelineEventSink {
  emit(event: PipelineEvent): void;
  list(): PipelineEvent[];
}

export type PipelineDependencies = {
  gateway: IPipelineGateway;
  intent: IPipelineIntent;
  retrieval: IPipelineRetrieval;
  reasoning: IPipelineReasoning;
  verification: IPipelineVerification;
  events?: IPipelineEventSink;
};
