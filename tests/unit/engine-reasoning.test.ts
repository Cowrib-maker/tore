import { describe, expect, it } from "vitest";

import {
  DefaultReasoningPlanner,
  ReasoningStepId,
  ReasoningStepStatus,
  createReasoningEngine,
  type IReasoningPlanner,
  type ReasoningContext,
  type ReasoningPlan,
  type ReasoningRequest,
} from "@/engine/reasoning";

function request(
  overrides: Partial<ReasoningRequest> = {},
): ReasoningRequest {
  return {
    question: "Does article 17 apply to this charge?",
    intent: { type: "CRIMINAL_LAW", confidence: 0.82 },
    citations: [
      {
        query: "17.1",
        resolved: true,
        nodeId: "art-17-p-1",
        documentId: "criminal",
        canonical: "Criminal Code 17.1",
        kind: "PARAGRAPH",
      },
    ],
    documents: [
      { id: "criminal", title: "Criminal Code", kind: "LAW" },
    ],
    graphNeighbors: [
      {
        nodeId: "sc-1",
        type: "SUPREME_COURT_RESOLUTION",
        label: "Resolution 1",
        documentId: "sc-1",
        edgeType: "INTERPRETS",
        direction: "IN",
      },
      {
        nodeId: "pg-1",
        type: "PROSECUTOR_GUIDELINE",
        label: "Guideline 1",
        documentId: "pg-1",
        edgeType: "RELATED_TO",
        direction: "OUT",
      },
    ],
    ...overrides,
  };
}

describe("ReasoningService", () => {
  const engine = createReasoningEngine();

  it("produces a JSON-serializable plan with the seven workflow steps", () => {
    const plan = engine.prepare(request());
    const json = JSON.stringify(plan);
    const parsed = JSON.parse(json) as ReasoningPlan;

    expect(parsed.userIntent).toBe("CRIMINAL_LAW");
    expect(parsed.legalIssue).toBe("Does article 17 apply to this charge?");
    expect(parsed.reasoningSteps).toHaveLength(7);
    expect(parsed.reasoningSteps.map((step) => step.id)).toEqual([
      ReasoningStepId.VERIFY_CITATIONS,
      ReasoningStepId.COLLECT_PROVISIONS,
      ReasoningStepId.COLLECT_COURT_DECISIONS,
      ReasoningStepId.COLLECT_GUIDELINES,
      ReasoningStepId.COLLECT_GRAPH_NEIGHBORS,
      ReasoningStepId.IDENTIFY_MISSING_FACTS,
      ReasoningStepId.PREPARE_PROMPT_CONTEXT,
    ]);
    expect(parsed.reasoningSteps[0]?.title).toBe("Verify citation exists.");
    expect(parsed.reasoningSteps[6]?.title).toBe(
      "Prepare structured context for Prompt Engine.",
    );
    expect(parsed.relatedArticles.map((item) => item.id)).toContain("art-17-p-1");
    expect(parsed.relatedCases.map((item) => item.id)).toContain("sc-1");
    expect(parsed.relevantAuthorities.map((item) => item.kind)).toEqual(
      expect.arrayContaining([
        "PARAGRAPH",
        "LAW",
        "SUPREME_COURT_RESOLUTION",
        "PROSECUTOR_GUIDELINE",
      ]),
    );
    expect(parsed.requiredEvidence).toEqual(
      expect.arrayContaining([
        "verified_citation",
        "primary_authority",
        "court_decision",
        "prosecutor_guideline",
      ]),
    );
    expect(parsed).not.toHaveProperty("prompt");
    expect(json).not.toMatch(/openai|claude|gemini/i);
  });

  it("blocks citation verification when a citation does not resolve", () => {
    const plan = engine.prepare(
      request({
        citations: [
          {
            query: "99.9",
            resolved: false,
            nodeId: null,
            documentId: null,
            canonical: null,
            kind: null,
          },
        ],
      }),
    );
    expect(plan.reasoningSteps[0]?.status).toBe(ReasoningStepStatus.BLOCKED);
    expect(plan.missingInformation).toContain("unresolved_citations");
    expect(plan.confidenceRequirements.blockingGaps).toContain(
      "unresolved_citations",
    );
    expect(plan.reasoningSteps[6]?.status).toBe(ReasoningStepStatus.BLOCKED);
  });

  it("records missing facts when the question and authorities are absent", () => {
    const plan = engine.prepare({
      question: "   ",
      intent: { type: "UNKNOWN", confidence: 0 },
      citations: [],
      documents: [],
      graphNeighbors: [],
    });
    expect(plan.legalIssue).toBe("");
    expect(plan.missingInformation).toEqual(
      expect.arrayContaining(["question", "intent", "primary_authority"]),
    );
    expect(plan.reasoningSteps[0]?.status).toBe(ReasoningStepStatus.SKIPPED);
    expect(plan.reasoningSteps[5]?.status).toBe(ReasoningStepStatus.BLOCKED);
  });

  it("skips court and guideline collection when none are present", () => {
    const plan = engine.prepare(
      request({
        intent: { type: "LEGAL_INFORMATION", confidence: 0.9 },
        graphNeighbors: [],
      }),
    );
    expect(
      plan.reasoningSteps.find(
        (step) => step.id === ReasoningStepId.COLLECT_COURT_DECISIONS,
      )?.status,
    ).toBe(ReasoningStepStatus.SKIPPED);
    expect(
      plan.reasoningSteps.find(
        (step) => step.id === ReasoningStepId.COLLECT_GUIDELINES,
      )?.status,
    ).toBe(ReasoningStepStatus.SKIPPED);
    expect(plan.requiredEvidence).not.toContain("court_decision");
  });

  it("accepts injected planner replacements", () => {
    const planner: IReasoningPlanner = {
      plan(context: ReasoningContext): ReasoningPlan {
        return new DefaultReasoningPlanner().plan(context);
      },
    };
    const custom = createReasoningEngine({ planner });
    const plan = custom.prepare(request());
    expect(plan.userIntent).toBe("CRIMINAL_LAW");
  });
});
