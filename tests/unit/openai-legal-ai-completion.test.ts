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

  describe("streaming (onDelta provided)", () => {
    function asyncIterableFrom<T>(items: T[]): AsyncIterable<T> {
      return {
        [Symbol.asyncIterator]() {
          let index = 0;
          return {
            async next() {
              if (index >= items.length) return { value: undefined, done: true };
              return { value: items[index++]!, done: false };
            },
          };
        },
      };
    }

    it("calls onDelta once per chunk, in order, and accumulates the full content", async () => {
      const create = vi.fn(async () =>
        asyncIterableFrom([
          { choices: [{ delta: { content: "Сайн " } }] },
          { choices: [{ delta: { content: "байна" } }] },
          { choices: [{ delta: { content: "." } }], usage: { prompt_tokens: 12, completion_tokens: 3 } },
        ]),
      );
      const completion = new OpenAiLegalAiCompletion("sk-test", {
        chat: { completions: { create } },
      });

      const deltas: string[] = [];
      const result = await completion.complete({
        systemPrompt: "sys",
        messages: [],
        onDelta: (delta) => deltas.push(delta),
      });

      expect(deltas).toEqual(["Сайн ", "байна", "."]);
      expect(result.content).toBe("Сайн байна.");
      expect(result.inputTokens).toBe(12);
      expect(result.outputTokens).toBe(3);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ stream: true, stream_options: { include_usage: true } }),
        expect.anything(),
      );
    });

    it("does not call onDelta at all for an empty stream, and returns the unavailable fallback", async () => {
      const create = vi.fn(async () => asyncIterableFrom([]));
      const completion = new OpenAiLegalAiCompletion("sk-test", {
        chat: { completions: { create } },
      });

      const deltas: string[] = [];
      const result = await completion.complete({
        systemPrompt: "sys",
        messages: [],
        onDelta: (delta) => deltas.push(delta),
      });

      expect(deltas).toEqual([]);
      expect(result.content).toBe("AI үйлчилгээтэй холбогдоход алдаа гарлаа.");
    });

    it("does not stream when onDelta is omitted, even though the provider supports it", async () => {
      const create = vi.fn(async () => ({
        choices: [{ message: { content: "non-streamed" } }],
        model: "gpt-5.6-luna",
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }));
      const completion = new OpenAiLegalAiCompletion("sk-test", {
        chat: { completions: { create } },
      });

      const result = await completion.complete({ systemPrompt: "sys", messages: [] });

      expect(result.content).toBe("non-streamed");
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ stream: false }),
        expect.anything(),
      );
    });

    it("surfaces an aborted request as AI_ABORTED, not AI_UNAVAILABLE", async () => {
      const controller = new AbortController();
      const create = vi.fn(async () => {
        controller.abort();
        throw new DOMException("Aborted", "AbortError");
      });
      const completion = new OpenAiLegalAiCompletion("sk-test", {
        chat: { completions: { create } },
      });

      await expect(
        completion.complete({
          systemPrompt: "sys",
          messages: [],
          onDelta: () => {},
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ code: "AI_ABORTED" } satisfies Partial<LegalAiError>);
    });

    it("propagates a mid-stream provider failure without swallowing already-emitted deltas", async () => {
      const create = vi.fn(async () => ({
        [Symbol.asyncIterator]() {
          let index = 0;
          const chunks = [{ choices: [{ delta: { content: "partial" } }] }];
          return {
            async next() {
              if (index === 0) {
                index += 1;
                return { value: chunks[0]!, done: false };
              }
              throw new Error("connection reset");
            },
          };
        },
      }));
      const completion = new OpenAiLegalAiCompletion("sk-test", {
        chat: { completions: { create } },
      });

      const deltas: string[] = [];
      await expect(
        completion.complete({
          systemPrompt: "sys",
          messages: [],
          onDelta: (delta) => deltas.push(delta),
        }),
      ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" } satisfies Partial<LegalAiError>);
      expect(deltas).toEqual(["partial"]);
    });
  });
});
