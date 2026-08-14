import { DomainLabel } from "../gateway/types";
import type { ReasoningRequest } from "../reasoning/types";
import type { RetrievalRequest } from "../retrieval/types";
import type { VerificationRequest } from "../verification/types";
import {
  PipelineStatus,
  type PipelineContext,
  type PipelineRequest,
} from "./types";

export function createPipelineContext(request: PipelineRequest): PipelineContext {
  return {
    status: PipelineStatus.COMPLETED,
    stoppedAt: null,
    error: null,
    request,
    gateway: null,
    intent: null,
    retrieval: null,
    reasoning: null,
    verification: null,
  };
}

export function isLegalTurn(context: PipelineContext): boolean {
  return context.gateway?.domain === DomainLabel.LEGAL;
}

/** Maps pipeline + engine outputs into the Retrieval Engine request. */
export function toRetrievalRequest(context: PipelineContext): RetrievalRequest {
  const request = context.request;
  return {
    question: request.message,
    intent: {
      type: context.intent?.intent ?? "UNKNOWN",
      confidence: context.intent?.confidence ?? 0,
    },
    citations: request.citations ?? [],
    documents: request.documents,
    citationIndex: request.citationIndex,
    graph: request.graph,
  };
}

/** Maps retrieval output into the Reasoning Engine request. */
export function toReasoningRequest(context: PipelineContext): ReasoningRequest {
  const request = context.request;
  return {
    question: request.message,
    intent: {
      type: context.intent?.intent ?? "UNKNOWN",
      confidence: context.intent?.confidence ?? 0,
    },
    citations: request.citations ?? [],
    documents: request.documents.map((document) => ({
      id: document.identity.id,
      title: document.identity.title,
      kind: document.source.kind,
      jurisdiction: document.identity.jurisdiction,
    })),
    graphNeighbors: (context.retrieval?.graphNeighbors ?? []).map((neighbor) => ({
      nodeId: neighbor.id,
      type: neighbor.kind,
      label: neighbor.label,
      documentId: neighbor.documentId,
      edgeType: neighbor.edgeType,
      direction: neighbor.direction ?? undefined,
    })),
  };
}

/** Maps the reasoning plan into the Verification Engine request. */
export function toVerificationRequest(
  context: PipelineContext,
): VerificationRequest {
  if (!context.reasoning) {
    throw new Error("verification requires a reasoning plan");
  }
  return {
    plan: context.reasoning,
    documents: context.request.documents,
    citationIndex: context.request.citationIndex,
    graph: context.request.graph,
  };
}
