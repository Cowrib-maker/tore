import { describe, expect, it } from "vitest";

import {
  IntentType,
  RuleBasedIntentClassifier,
  createIntentEngine,
  createIntentTermRules,
} from "@/engine/intent";

describe("IntentService", () => {
  const engine = createIntentEngine();

  it("returns UNKNOWN for empty or unmatched text", async () => {
    await expect(engine.classify("   ")).resolves.toEqual({
      intent: IntentType.UNKNOWN,
      confidence: 0,
      matchedRules: [],
    });
    const unknown = await engine.classify("What's the weather today?");
    expect(unknown.intent).toBe(IntentType.UNKNOWN);
    expect(unknown.matchedRules).toEqual([]);
  });

  it("classifies practice-area and work-product intents", async () => {
    await expect(
      engine.classify("Хөдөлмөрийн маргаантай ажилтнаа халсан"),
    ).resolves.toMatchObject({ intent: IntentType.EMPLOYMENT_DISPUTE });
    await expect(
      engine.classify("Please review this contract for risk"),
    ).resolves.toMatchObject({ intent: IntentType.CONTRACT_REVIEW });
    await expect(
      engine.classify("ХХК байгуулахдаа юу бүртгүүлэх вэ?"),
    ).resolves.toMatchObject({ intent: IntentType.COMPANY_FORMATION });
    await expect(
      engine.classify("Гэрлэлт цуцлах, хүүхдийн тэтгэлэг"),
    ).resolves.toMatchObject({ intent: IntentType.FAMILY_LAW });
    await expect(
      engine.classify("This is a criminal charge under the code"),
    ).resolves.toMatchObject({ intent: IntentType.CRIMINAL_LAW });
  });

  it("exposes confidence and matchedRules on the public result", async () => {
    const result = await engine.classify("review this contract");
    expect(result.intent).toBe(IntentType.CONTRACT_REVIEW);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.matchedRules.length).toBeGreaterThan(0);
    expect(result.matchedRules.every((id) => id.includes("contract-review"))).toBe(
      true,
    );
  });

  it("allows injecting a replacement classifier without changing classify()", async () => {
    const engineWithModel = createIntentEngine({
      classifier: {
        classify: () => ({
          intent: IntentType.LEGAL_RESEARCH,
          confidence: 0.93,
          matchedRules: ["model:legal-research"],
        }),
      },
    });

    await expect(engineWithModel.classify("anything")).resolves.toEqual({
      intent: IntentType.LEGAL_RESEARCH,
      confidence: 0.93,
      matchedRules: ["model:legal-research"],
    });
  });
});

describe("RuleBasedIntentClassifier", () => {
  it("extends the catalog without mutating the original", () => {
    const base = new RuleBasedIntentClassifier();
    const extended = base.withRules(
      createIntentTermRules(IntentType.LEGAL_RESEARCH, ["гаалийн судалгаа"]),
    );

    expect(base.classify("гаалийн судалгаа").intent).toBe(IntentType.UNKNOWN);
    expect(extended.classify("гаалийн судалгаа").intent).toBe(
      IntentType.LEGAL_RESEARCH,
    );
  });
});
