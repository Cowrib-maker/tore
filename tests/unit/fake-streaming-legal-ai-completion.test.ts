import { describe, expect, it } from "vitest";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import { FakeStreamingLegalAiCompletion } from "@/infrastructure/ai/fake-streaming-legal-ai-completion";

/**
 * The deterministic, network-free provider used for streaming tests and
 * local latency measurement (Sprint 14 P0). Tested directly since every
 * other streaming test in this suite depends on it behaving exactly as
 * documented — never touches OpenAI/Anthropic/the network.
 */
describe("FakeStreamingLegalAiCompletion", () => {
  it("is always configured", () => {
    expect(new FakeStreamingLegalAiCompletion({ chunks: [] }).isConfigured()).toBe(true);
  });

  it("emits chunks via onDelta in order and accumulates the full content", async () => {
    const provider = new FakeStreamingLegalAiCompletion({
      chunks: ["Сайн ", "байна", "."],
      provider: "OPENAI",
      model: "fake-1",
      inputTokens: 5,
      outputTokens: 3,
    });

    const deltas: string[] = [];
    const result = await provider.complete({
      systemPrompt: "sys",
      messages: [],
      onDelta: (d) => deltas.push(d),
    });

    expect(deltas).toEqual(["Сайн ", "байна", "."]);
    expect(result).toEqual({
      content: "Сайн байна.",
      model: "fake-1",
      provider: "OPENAI",
      inputTokens: 5,
      outputTokens: 3,
    });
  });

  it("still returns the full content when onDelta is omitted (non-streaming callers unaffected)", async () => {
    const provider = new FakeStreamingLegalAiCompletion({ chunks: ["a", "b", "c"] });
    const result = await provider.complete({ systemPrompt: "sys", messages: [] });
    expect(result.content).toBe("abc");
  });

  it("fails after N chunks when failAfterChunks is set, having already emitted those chunks", async () => {
    const provider = new FakeStreamingLegalAiCompletion({
      chunks: ["one", "two", "three"],
      failAfterChunks: 2,
      failureMessage: "boom",
    });

    const deltas: string[] = [];
    await expect(
      provider.complete({
        systemPrompt: "sys",
        messages: [],
        onDelta: (d) => deltas.push(d),
      }),
    ).rejects.toMatchObject({ message: "boom", code: "AI_UNAVAILABLE" } satisfies Partial<LegalAiError>);
    expect(deltas).toEqual(["one", "two"]);
  });

  it("fails before emitting anything when failAfterChunks is 0", async () => {
    const provider = new FakeStreamingLegalAiCompletion({
      chunks: ["one", "two"],
      failAfterChunks: 0,
    });

    const deltas: string[] = [];
    await expect(
      provider.complete({ systemPrompt: "sys", messages: [], onDelta: (d) => deltas.push(d) }),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(deltas).toEqual([]);
  });

  it("honors an aborted signal before the next chunk and throws AI_ABORTED", async () => {
    const provider = new FakeStreamingLegalAiCompletion({
      chunks: ["one", "two", "three"],
      chunkDelayMs: 10,
    });
    const controller = new AbortController();

    const deltas: string[] = [];
    const promise = provider.complete({
      systemPrompt: "sys",
      messages: [],
      onDelta: (d) => deltas.push(d),
      signal: controller.signal,
    });
    // Abort shortly after the first chunk would have been scheduled but
    // before it fires — deterministic via the delay, no real timers needed
    // beyond vitest's real clock here since the delay is tiny.
    setTimeout(() => controller.abort(), 1);

    await expect(promise).rejects.toMatchObject({
      code: "AI_ABORTED",
    } satisfies Partial<LegalAiError>);
  });

  it("produces empty content for an empty chunk list without calling onDelta", async () => {
    const provider = new FakeStreamingLegalAiCompletion({ chunks: [] });
    const deltas: string[] = [];
    const result = await provider.complete({
      systemPrompt: "sys",
      messages: [],
      onDelta: (d) => deltas.push(d),
    });
    expect(deltas).toEqual([]);
    expect(result.content).toBe("");
  });
});
