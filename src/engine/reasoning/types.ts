/**
 * Contracts for the TORE Reasoning Engine.
 *
 * Prepares a deterministic workflow before any model is called.
 * No prompts, embeddings, or inference live here.
 */

export const ReasoningStepId = {
  VERIFY_CITATIONS: "verify-citations",
  COLLECT_PROVISIONS: "collect-provisions",
  COLLECT_COURT_DECISIONS: "collect-court-decisions",
  COLLECT_GUIDELINES: "collect-guidelines",
  COLLECT_GRAPH_NEIGHBORS: "collect-graph-neighbors",
  IDENTIFY_MISSING_FACTS: "identify-missing-facts",
  PREPARE_PROMPT_CONTEXT: "prepare-prompt-context",
} as const;

export type ReasoningStepId =
  (typeof ReasoningStepId)[keyof typeof ReasoningStepId];

export const ReasoningStepStatus = {
  READY: "READY",
  BLOCKED: "BLOCKED",
  SKIPPED: "SKIPPED",
} as const;

export type ReasoningStepStatus =
  (typeof ReasoningStepStatus)[keyof typeof ReasoningStepStatus];

/** Detected intent as supplied by an upstream classifier. */
export type ReasoningIntentInput = {
  type: string;
  confidence: number;
};

/** One citation after the Citation Engine has attempted resolution. */
export type ResolvedCitationInput = {
  query: string;
  resolved: boolean;
  nodeId: string | null;
  documentId: string | null;
  canonical: string | null;
  kind: string | null;
};

/** A document retrieved for this question. */
export type RetrievedDocumentInput = {
  id: string;
  title: string;
  kind: string;
  jurisdiction?: string | null;
};

/** One neighboring authority from the Knowledge Graph. */
export type GraphNeighborInput = {
  nodeId: string;
  type: string;
  label: string;
  documentId: string | null;
  edgeType: string | null;
  direction?: "OUT" | "IN";
};

export type ReasoningRequest = {
  question: string;
  intent: ReasoningIntentInput;
  citations: ResolvedCitationInput[];
  documents: RetrievedDocumentInput[];
  graphNeighbors: GraphNeighborInput[];
};

export type ReasoningAuthority = {
  id: string;
  kind: string;
  label: string;
  source: "citation" | "document" | "graph";
};

export type ReasoningStep = {
  order: number;
  id: ReasoningStepId;
  title: string;
  status: ReasoningStepStatus;
  collectedIds: string[];
  notes: string[];
};

export type ConfidenceRequirements = {
  minimumIntentConfidence: number;
  requireVerifiedCitation: boolean;
  requirePrimaryAuthority: boolean;
  requireCourtAuthority: boolean;
  blockingGaps: string[];
};

/**
 * JSON-serializable plan for a later Prompt Engine.
 * Contains workflow and authorities only — never a prompt string.
 */
export type ReasoningPlan = {
  userIntent: string;
  legalIssue: string;
  relevantAuthorities: ReasoningAuthority[];
  requiredEvidence: string[];
  relatedArticles: ReasoningAuthority[];
  relatedCases: ReasoningAuthority[];
  missingInformation: string[];
  reasoningSteps: ReasoningStep[];
  confidenceRequirements: ConfidenceRequirements;
};

/** Normalized view used by the planner. Replaceable via DI. */
export type ReasoningContext = {
  question: string;
  intent: ReasoningIntentInput;
  legalIssue: string;
  citations: ResolvedCitationInput[];
  verifiedCitations: ResolvedCitationInput[];
  unresolvedCitations: ResolvedCitationInput[];
  documents: RetrievedDocumentInput[];
  graphNeighbors: GraphNeighborInput[];
  authorities: ReasoningAuthority[];
  articles: ReasoningAuthority[];
  cases: ReasoningAuthority[];
  guidelines: ReasoningAuthority[];
  missingInformation: string[];
};

export type ReasoningValidation = {
  ok: boolean;
  issues: string[];
};

export interface IReasoningContextBuilder {
  build(request: ReasoningRequest): ReasoningContext;
}

export interface IReasoningPlanner {
  plan(context: ReasoningContext): ReasoningPlan;
}

export interface IReasoningValidator {
  validate(plan: ReasoningPlan, context: ReasoningContext): ReasoningValidation;
}

export type ReasoningServiceDependencies = {
  contextBuilder: IReasoningContextBuilder;
  planner: IReasoningPlanner;
  validator: IReasoningValidator;
};
