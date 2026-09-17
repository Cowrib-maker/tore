import { describe, expect, it } from "vitest";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import {
  AnthropicLegalAiCompletion,
  isAnthropicApiKeyConfigured,
  parseAnthropicEventStream,
} from "@/infrastructure/ai/anthropic-legal-ai-completion";

function sseStreamFrom(events: Array<{ type: string; [key: string]: unknown }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
        );
      }
      controller.close();
    },
  });
}

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

  describe("parseAnthropicEventStream", () => {
    it("parses message_start, content_block_delta, and message_delta frames in order", async () => {
      const stream = sseStreamFrom([
        {
          type: "message_start",
          message: { model: "claude-sonnet-5", usage: { input_tokens: 20, output_tokens: 1 } },
        },
        { type: "content_block_delta", delta: { type: "text_delta", text: "Сайн " } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "байна." } },
        { type: "message_delta", usage: { output_tokens: 8 } },
        { type: "message_stop" },
      ]);

      const events = [];
      for await (const event of parseAnthropicEventStream(stream)) {
        events.push(event.type);
      }
      expect(events).toEqual([
        "message_start",
        "content_block_delta",
        "content_block_delta",
        "message_delta",
        "message_stop",
      ]);
    });

    it("skips a malformed frame instead of throwing", async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("event: content_block_delta\ndata: {not json}\n\n"));
          controller.enqueue(
            encoder.encode(
              `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "ok" } })}\n\n`,
            ),
          );
          controller.close();
        },
      });

      const events = [];
      for await (const event of parseAnthropicEventStream(stream)) {
        events.push(event);
      }
      expect(events).toHaveLength(1);
      expect((events[0] as { delta?: { text?: string } }).delta?.text).toBe("ok");
    });
  });

  describe("streaming (onDelta provided)", () => {
    it("calls onDelta once per content_block_delta, in order, and accumulates the full content", async () => {
      const fetchClient = async () => ({
        ok: true,
        status: 200,
        json: async () => ({}),
        body: sseStreamFrom([
          {
            type: "message_start",
            message: { model: "claude-sonnet-5", usage: { input_tokens: 20, output_tokens: 1 } },
          },
          { type: "content_block_delta", delta: { type: "text_delta", text: "Сайн " } },
          { type: "content_block_delta", delta: { type: "text_delta", text: "байна." } },
          { type: "message_delta", usage: { output_tokens: 8 } },
          { type: "message_stop" },
        ]),
      });
      const completion = new AnthropicLegalAiCompletion("sk-ant-test", fetchClient);

      const deltas: string[] = [];
      const result = await completion.complete({
        systemPrompt: "sys",
        messages: [],
        onDelta: (delta) => deltas.push(delta),
      });

      expect(deltas).toEqual(["Сайн ", "байна."]);
      expect(result).toEqual({
        content: "Сайн байна.",
        model: "claude-sonnet-5",
        provider: "CLAUDE",
        inputTokens: 20,
        outputTokens: 8,
      });
    });

    it("throws AI_UNAVAILABLE (not a hang) when a streaming response has no body", async () => {
      const fetchClient = async () => ({ ok: true, status: 200, json: async () => ({}), body: null });
      const completion = new AnthropicLegalAiCompletion("sk-ant-test", fetchClient);

      await expect(
        completion.complete({ systemPrompt: "sys", messages: [], onDelta: () => {} }),
      ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" } satisfies Partial<LegalAiError>);
    });

    it("surfaces an aborted request as AI_ABORTED", async () => {
      const controller = new AbortController();
      const fetchClient = async () => {
        controller.abort();
        throw new DOMException("Aborted", "AbortError");
      };
      const completion = new AnthropicLegalAiCompletion("sk-ant-test", fetchClient);

      await expect(
        completion.complete({
          systemPrompt: "sys",
          messages: [],
          onDelta: () => {},
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ code: "AI_ABORTED" } satisfies Partial<LegalAiError>);
    });

    it("does not stream when onDelta is omitted, even against the same provider", async () => {
      const fetchClient = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: "text", text: "non-streamed" }],
          model: "claude-sonnet-5",
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      });
      const completion = new AnthropicLegalAiCompletion("sk-ant-test", fetchClient);

      const result = await completion.complete({ systemPrompt: "sys", messages: [] });
      expect(result.content).toBe("non-streamed");
    });
  });
});
