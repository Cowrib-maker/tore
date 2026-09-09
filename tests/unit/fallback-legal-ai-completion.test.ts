import { describe, expect, it } from "vitest";

import type {
  LegalAiCompletionPort,
  LegalAiCompletionResult,
} from "@/application/ai/legal-ai.types";
import { FallbackLegalAiCompletion } from "@/infrastructure/ai/fallback-legal-ai-completion";

const OK_RESULT: LegalAiCompletionResult = {
  content: "ok",
  model: "test-model",
  provider: "OPENAI",
  inputTokens: 1,
  outputTokens: 1,
};

function makePort(overrides: Partial<LegalAiCompletionPort> = {}): LegalAiCompletionPort {
  return {
    isConfigured: () => true,
    complete: async () => OK_RESULT,
    ...overrides,
  };
}

describe("FallbackLegalAiCompletion", () => {
  it("is unconfigured when neither provider is configured", () => {
    const fallback = new FallbackLegalAiCompletion(
      makePort({ isConfigured: () => false }),
      makePort({ isConfigured: () => false }),
    );
    expect(fallback.isConfigured()).toBe(false);
  });

  it("is configured when only the secondary provider is configured", () => {
    const fallback = new FallbackLegalAiCompletion(
      makePort({ isConfigured: () => false }),
      makePort({ isConfigured: () => true }),
    );
    expect(fallback.isConfigured()).toBe(true);
  });

  it("uses the primary provider when it succeeds", async () => {
    let secondaryCalled = false;
    const fallback = new FallbackLegalAiCompletion(
      makePort(),
      makePort({
        complete: async () => {
          secondaryCalled = true;
          return OK_RESULT;
        },
      }),
    );

    const result = await fallback.complete({ systemPrompt: "s", messages: [] });
    expect(result).toEqual(OK_RESULT);
    expect(secondaryCalled).toBe(false);
  });

  it("falls back to the secondary provider when the primary throws and secondary is configured", async () => {
    const fallback = new FallbackLegalAiCompletion(
      makePort({
        complete: async () => {
          throw new Error("primary down");
        },
      }),
      makePort(),
    );

    const result = await fallback.complete({ systemPrompt: "s", messages: [] });
    expect(result).toEqual(OK_RESULT);
  });

  it("rethrows the primary's error when the secondary is not configured", async () => {
    const primaryError = new Error("primary down");
    const fallback = new FallbackLegalAiCompletion(
      makePort({
        complete: async () => {
          throw primaryError;
        },
      }),
      makePort({ isConfigured: () => false }),
    );

    await expect(
      fallback.complete({ systemPrompt: "s", messages: [] }),
    ).rejects.toBe(primaryError);
  });

  it("calls only the secondary provider when the primary is not configured", async () => {
    let primaryCalled = false;
    const fallback = new FallbackLegalAiCompletion(
      makePort({
        isConfigured: () => false,
        complete: async () => {
          primaryCalled = true;
          return OK_RESULT;
        },
      }),
      makePort(),
    );

    const result = await fallback.complete({ systemPrompt: "s", messages: [] });
    expect(result).toEqual(OK_RESULT);
    expect(primaryCalled).toBe(false);
  });
});
