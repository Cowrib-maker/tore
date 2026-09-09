import { describe, expect, it } from "vitest";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import {
  AnthropicLegalAiCompletion,
  isAnthropicApiKeyConfigured,
} from "@/infrastructure/ai/anthropic-legal-ai-completion";

describe("isAnthropicApiKeyConfigured", () => {
  it("treats missing, empty, and whitespace keys as unconfigured", () => {
    expect(isAnthropicApiKeyConfigured(undefined)).toBe(false);
    expect(isAnthropicApiKeyConfigured("")).toBe(false);
    expect(isAnthropicApiKeyConfigured("   ")).toBe(false);
  });

  it("accepts a trimmed non-empty key", () => {
    expect(isAnthropicApiKeyConfigured("sk-ant-test")).toBe(true);
    expect(isAnthropicApiKeyConfigured(" sk-ant-test ")).toBe(true);
  });
});

describe("AnthropicLegalAiCompletion", () => {
  it("throws AI_NOT_CONFIGURED for a blank key without calling fetch", async () => {
    const fetchClient = async () => {
      throw new Error("must not be called");
    };
    const completion = new AnthropicLegalAiCompletion("  ", fetchClient);

    expect(completion.isConfigured()).toBe(false);
    await expect(
      completion.complete({ systemPrompt: "sys", messages: [] }),
    ).rejects.toMatchObject({
      message: "AI үйлчилгээний тохиргоо хийгдээгүй байна.",
      statusCode: 503,
      code: "AI_NOT_CONFIGURED",
    } satisfies Partial<LegalAiError>);
  });

  it("wraps a non-ok response as AI_UNAVAILABLE without leaking internals", async () => {
    const fetchClient = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    const completion = new AnthropicLegalAiCompletion("sk-ant-test", fetchClient);

    await expect(
      completion.complete({ systemPrompt: "sys", messages: [] }),
    ).rejects.toMatchObject({
      message: "AI үйлчилгээтэй холбогдоход алдаа гарлаа.",
      statusCode: 503,
      code: "AI_UNAVAILABLE",
    } satisfies Partial<LegalAiError>);
  });

  it("folds system-role messages into the system prompt and parses text blocks", async () => {
    let capturedBody: string | undefined;
    const fetchClient = async (_url: string, init: { body: string }) => {
      capturedBody = init.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: "text", text: "Хариулт." }],
          model: "claude-sonnet-4-5",
          usage: { input_tokens: 12, output_tokens: 3 },
        }),
      };
    };
    const completion = new AnthropicLegalAiCompletion("sk-ant-test", fetchClient);

    const result = await completion.complete({
      systemPrompt: "base",
      messages: [
        { role: "system", content: "extra system note" },
        { role: "user", content: "асуулт" },
      ],
    });

    expect(result).toEqual({
      content: "Хариулт.",
      model: "claude-sonnet-4-5",
      provider: "CLAUDE",
      inputTokens: 12,
      outputTokens: 3,
    });

    const parsed = JSON.parse(capturedBody ?? "{}");
    expect(parsed.system).toBe("base\n\nextra system note");
    expect(parsed.messages).toEqual([{ role: "user", content: "асуулт" }]);
  });
});
