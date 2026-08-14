import { describe, expect, it } from "vitest";

import {
  DomainLabel,
  GatewayResponseType,
  UserType,
  type GatewayTurn,
} from "@/engine/gateway";
import { createKnowledgeGraph } from "@/engine/graph";
import { IntentType, type IntentClassification } from "@/engine/intent";
import type { ReasoningPlan } from "@/engine/reasoning";
import { ReasoningStepId, ReasoningStepStatus } from "@/engine/reasoning";
import type { RetrievalPlan } from "@/engine/retrieval";
import type { VerificationReport } from "@/engine/verification";
import {
  InMemoryPipelineEventLog,
  PipelineStage,
  PipelineStatus,
  createLegalPipeline,
  type IPipelineGateway,
  type IPipelineIntent,
  type IPipelineReasoning,
  type IPipelineRetrieval,
  type IPipelineVerification,
  type PipelineRequest,
} from "@/engine/pipeline";

function emptyIndex() {
  return {
    documentId: "none",
    documentTitle: "",
    jurisdiction: "XX",
    language: "en",
    grammarId: "generic",
    entries: [],
  };
}

function request(message: string): PipelineRequest {
  return {
    message,
    documents: [],
    citationIndex: emptyIndex(),
    graph: createKnowledgeGraph(),
  };
}

function legalTurn(): GatewayTurn {
  return {
    domain: DomainLabel.LEGAL,
    userType: UserType.PUBLIC,
    prompt: {
      systemPrompt: "unused-by-pipeline",
      userPrompt: "unused-by-pipeline",
      userType: UserType.PUBLIC,
      domain: DomainLabel.LEGAL,
    },
    response: {
      success: true,
      type: GatewayResponseType.LEGAL_INFORMATION,
      message: "",
      suggestions: [],
      citations: [],
      metadata: {},
    },
  };
}

function rejectedTurn(): GatewayTurn {
  return {
    domain: DomainLabel.NON_LEGAL,
    userType: UserType.PUBLIC,
    prompt: null,
    response: {
      success: true,
      type: GatewayResponseType.OUT_OF_DOMAIN,
      message: "out",
      suggestions: [],
      citations: [],
      metadata: {},
    },
  };
}

const intentResult: IntentClassification = {
  intent: IntentType.LEGAL_RESEARCH,
  confidence: 0.9,
  matchedRules: ["test"],
};

const retrievalPlan: RetrievalPlan = {
  retrievedAuthorities: [],
  retrievedArticles: [],
  relatedCases: [],
  relatedGuidelines: [],
  graphNeighbors: [
    {
      id: "n-1",
      kind: "ARTICLE",
      label: "17",
      documentId: "doc",
      source: "graph",
      score: 0.7,
      edgeType: "CONTAINS",
      direction: "OUT",
    },
  ],
  retrievalStrategy: [],
  confidence: 0.4,
};

const reasoningPlan: ReasoningPlan = {
  userIntent: IntentType.LEGAL_RESEARCH,
  legalIssue: "question",
  relevantAuthorities: [],
  requiredEvidence: ["primary_authority"],
  relatedArticles: [],
  relatedCases: [],
  missingInformation: [],
  reasoningSteps: [
    {
      order: 1,
      id: ReasoningStepId.VERIFY_CITATIONS,
      title: "Verify citation exists.",
      status: ReasoningStepStatus.SKIPPED,
      collectedIds: [],
      notes: [],
    },
  ],
  confidenceRequirements: {
    minimumIntentConfidence: 0.5,
    requireVerifiedCitation: false,
    requirePrimaryAuthority: true,
    requireCourtAuthority: false,
    blockingGaps: [],
  },
};

const verificationReport: VerificationReport = {
  success: true,
  errors: [],
  warnings: [],
  validatedAuthorities: [],
  validatedCitations: [],
  missingAuthorities: [],
  confidenceScore: 1,
};

function recordingEngines(order: string[], gatewayTurn: GatewayTurn) {
  const gateway: IPipelineGateway = {
    async createTurn() {
      order.push("gateway");
      return gatewayTurn;
    },
  };
  const intent: IPipelineIntent = {
    classify() {
      order.push("intent");
      return intentResult;
    },
  };
  const retrieval: IPipelineRetrieval = {
    retrieve() {
      order.push("retrieval");
      return retrievalPlan;
    },
  };
  const reasoning: IPipelineReasoning = {
    prepare() {
      order.push("reasoning");
      return reasoningPlan;
    },
  };
  const verification: IPipelineVerification = {
    verify() {
      order.push("verification");
      return verificationReport;
    },
  };
  return { gateway, intent, retrieval, reasoning, verification };
}

describe("PipelineService", () => {
  it("runs Gateway → Intent → Retrieval → Reasoning → Verification", async () => {
    const order: string[] = [];
    const events = new InMemoryPipelineEventLog();
    const pipeline = createLegalPipeline({
      ...recordingEngines(order, legalTurn()),
      events,
    });

    const result = await pipeline.run(request("How is article 17 applied?"));

    expect(order).toEqual([
      "gateway",
      "intent",
      "retrieval",
      "reasoning",
      "verification",
    ]);
    expect(result.context.status).toBe(PipelineStatus.COMPLETED);
    expect(result.context.gateway?.domain).toBe(DomainLabel.LEGAL);
    expect(result.context.intent).toEqual(intentResult);
    expect(result.context.retrieval).toEqual(retrievalPlan);
    expect(result.context.reasoning).toEqual(reasoningPlan);
    expect(result.context.verification).toEqual(verificationReport);
    expect(result.events.map((event) => `${event.stage}:${event.type}`)).toEqual([
      "gateway:start",
      "gateway:end",
      "intent:start",
      "intent:end",
      "retrieval:start",
      "retrieval:end",
      "reasoning:start",
      "reasoning:end",
      "verification:start",
      "verification:end",
    ]);
    expect(result.metrics.stages).toHaveLength(5);
    expect(result.metrics.stages.every((stage) => !stage.skipped)).toBe(true);
    expect(JSON.stringify(result.context)).not.toMatch(/openai|claude|gemini/i);
  });

  it("stops after Gateway when the turn is not legal", async () => {
    const order: string[] = [];
    const pipeline = createLegalPipeline(recordingEngines(order, rejectedTurn()));
    const result = await pipeline.run(request("What is the weather today?"));

    expect(order).toEqual(["gateway"]);
    expect(result.context.status).toBe(PipelineStatus.REJECTED);
    expect(result.context.stoppedAt).toBe(PipelineStage.GATEWAY);
    expect(result.context.intent).toBeNull();
    expect(result.context.retrieval).toBeNull();
    expect(result.context.reasoning).toBeNull();
    expect(result.context.verification).toBeNull();
    expect(result.events.some((event) => event.type === "skip")).toBe(true);
    expect(
      result.metrics.stages.filter((stage) => stage.skipped).map((stage) => stage.stage),
    ).toEqual([
      PipelineStage.INTENT,
      PipelineStage.RETRIEVAL,
      PipelineStage.REASONING,
      PipelineStage.VERIFICATION,
    ]);
  });

  it("records FAILED when an engine throws", async () => {
    const pipeline = createLegalPipeline({
      ...recordingEngines([], legalTurn()),
      intent: {
        classify() {
          throw new Error("intent_down");
        },
      },
    });
    const result = await pipeline.run(request("contract review"));
    expect(result.context.status).toBe(PipelineStatus.FAILED);
    expect(result.context.error).toBe("intent_down");
    expect(result.events.some((event) => event.type === "error")).toBe(true);
  });

  it("wires default engines without calling a model", async () => {
    const result = await createLegalPipeline().run(
      request("Do I need a lawyer for this contract?"),
    );
    expect(result.context.status).toBe(PipelineStatus.COMPLETED);
    expect(result.context.gateway?.domain).toBe(DomainLabel.LEGAL);
    expect(result.context.intent).not.toBeNull();
    expect(result.context.retrieval).not.toBeNull();
    expect(result.context.reasoning).not.toBeNull();
    expect(result.context.verification).not.toBeNull();
  });
});
