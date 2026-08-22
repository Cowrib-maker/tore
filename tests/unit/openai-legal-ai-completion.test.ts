import { describe, expect, it, vi } from "vitest";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import {
  OpenAiLegalAiCompletion,
  isOpenAiApiKeyConfigured,
} from "@/infrastructure/ai/openai-legal-ai-completion";

describe("isOpenAiApiKeyConfigured", () => {
  it("treats missing, empty, and whitespace keys as unconfigured", () => {
    expect(isOpenAiApiKeyConfigured(undefined)).toBe(false);
    expect(isOpenAiApiKeyConfigured("")).toBe(false);
    expect(isOpenAiApiKeyConfigured("   ")).toBe(false);
  });

  it("accepts a trimmed non-empty key", () => {
    expect(isOpenAiApiKeyConfigured("sk-test")).toBe(true);
    expect(isOpenAiApiKeyConfigured(" sk-test ")).toBe(true);
  });
});

describe("OpenAiLegalAiCompletion", () => {
  it("throws AI_NOT_CONFIGURED for a blank key without calling the SDK", async () => {
    const create = vi.fn();
    const completion = new OpenAiLegalAiCompletion("  ", {
      chat: { completions: { create } },
    });

    expect(completion.isConfigured()).toBe(false);
    await expect(
      completion.complete({ systemPrompt: "sys", messages: [] }),
    ).rejects.toMatchObject({
      message: "AI үйлчилгээний тохиргоо хийгдээгүй байна.",
      statusCode: 503,
      code: "AI_NOT_CONFIGURED",
    } satisfies Partial<LegalAiError>);
    expect(create).not.toHaveBeenCalled();
  });

  it("wraps SDK failures as AI_UNAVAILABLE without leaking internals", async () => {
    const completion = new OpenAiLegalAiCompletion("sk-test", {
      chat: {
        completions: {
          create: async () => {
            throw new Error("Incorrect API key provided: sk-secret-value");
          },
        },
      },
    });

    await expect(
      completion.complete({ systemPrompt: "sys", messages: [] }),
    ).rejects.toMatchObject({
      message: "AI үйлчилгээтэй холбогдоход алдаа гарлаа.",
      statusCode: 503,
      code: "AI_UNAVAILABLE",
    } satisfies Partial<LegalAiError>);
  });
});
