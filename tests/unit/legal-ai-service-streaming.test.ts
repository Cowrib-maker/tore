import { describe, expect, it, vi } from "vitest";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import { CitationVerificationStatus } from "@/application/ai/legal-corpus";
import { FakeStreamingLegalAiCompletion } from "@/infrastructure/ai/fake-streaming-legal-ai-completion";
import {
  createRetriever,
  createService,
  paidLegalQuestionAccess,
  sampleAuthority,
  sampleVerdict,
} from "./support/legal-ai-service-fixtures";

/**
 * Sprint 14 P0 — real Legal AI token streaming, service-layer behavior.
 * Uses FakeStreamingLegalAiCompletion (never a real provider) to verify:
 * delta ordering, quota reserve/release, billing on success/failure,
 * citation integrity, exactly-once persistence, and abort handling —
 * exactly the guarantees createTurn already made for the non-streaming
 * path, now proven to hold when onDelta/signal are supplied too.
 */
function streamingCompletion(
  overrides?: Partial<ConstructorParameters<typeof FakeStreamingLegalAiCompletion>[0]>,
) {
  return new FakeStreamingLegalAiCompletion({
    chunks: ["Сайн ", "байна", "."],
    provider: "OPENAI",
    model: "fake-stream-model",
    inputTokens: 9,
    outputTokens: 4,
    ...overrides,
  });
}

const LEGAL_QUESTION = "Хөдөлмөрийн гэрээг хэрхэн цуцлах вэ?";

describe("LegalAiService — streaming", () => {
  it("delivers deltas via onDelta in order and the final result matches the accumulated content", async () => {
    const { service, store } = createService({ completion: streamingCompletion() });

    const deltas: string[] = [];
    const result = await service.createTurn({
      userId: "user-1",
      message: LEGAL_QUESTION,
      onDelta: (delta) => deltas.push(delta),
    });

    expect(deltas).toEqual(["Сайн ", "байна", "."]);
    expect(result.message.content).toBe("Сайн байна.");
    expect(store.assistantMessages).toEqual(["Сайн байна."]);
  });

  it("persists the final assistant message exactly once per turn", async () => {
    const { service, store } = createService({ completion: streamingCompletion() });

    await service.createTurn({
      userId: "user-1",
      message: LEGAL_QUESTION,
      onDelta: () => {},
    });

    expect(store.assistantMessages).toHaveLength(1);
    expect(store.usageCount).toBe(1);
  });

  it("does not persist anything when the stream fails partway through", async () => {
    const failing = new FakeStreamingLegalAiCompletion({
      chunks: ["partial ", "text"],
      failAfterChunks: 1,
      failureMessage: "provider exploded",
    });
    const { service, store } = createService({ completion: failing });

    const deltas: string[] = [];
    await expect(
      service.createTurn({
        userId: "user-1",
        message: LEGAL_QUESTION,
        onDelta: (d) => deltas.push(d),
      }),
    ).rejects.toBeTruthy();

    expect(deltas).toEqual(["partial "]);
    expect(store.assistantMessages).toEqual([]);
    expect(store.usageCount).toBe(0);
  });

  it("releases the quota reservation (does not bill) on a mid-stream provider failure", async () => {
    const releaseNewLegalQuestion = vi.fn(async () => {});
    const consumeNewLegalQuestion = vi.fn();
    const failing = new FakeStreamingLegalAiCompletion({ chunks: ["oops"], failAfterChunks: 1 });
    const { service, store } = createService({
      completion: failing,
      legalQuestionAccess: paidLegalQuestionAccess({
        releaseNewLegalQuestion,
        consumeNewLegalQuestion,
      }),
    });

    await expect(
      service.createTurn({ userId: "user-1", message: LEGAL_QUESTION, onDelta: () => {} }),
    ).rejects.toBeTruthy();

    expect(consumeNewLegalQuestion).not.toHaveBeenCalled();
    expect(releaseNewLegalQuestion).toHaveBeenCalledOnce();
    expect(
      [...store.conversations.values()].every((row) => row.billedQuestionCount === 0),
    ).toBe(true);
  });

  it("bills successfully (consumes quota) once a streamed turn completes", async () => {
    const consumeNewLegalQuestion = vi.fn();
    const { service } = createService({
      completion: streamingCompletion(),
      legalQuestionAccess: paidLegalQuestionAccess({ consumeNewLegalQuestion }),
    });

    await service.createTurn({ userId: "user-1", message: LEGAL_QUESTION, onDelta: () => {} });

    expect(consumeNewLegalQuestion).toHaveBeenCalledOnce();
  });

  it("releases the reservation, does not bill, and does not persist on client abort mid-stream", async () => {
    const releaseNewLegalQuestion = vi.fn(async () => {});
    const consumeNewLegalQuestion = vi.fn(async () => {});
    const controller = new AbortController();
    const abortingProvider = new FakeStreamingLegalAiCompletion({
      chunks: ["one", "two", "three"],
      chunkDelayMs: 5,
    });
    const { service, store } = createService({
      completion: abortingProvider,
      legalQuestionAccess: paidLegalQuestionAccess({
        releaseNewLegalQuestion,
        consumeNewLegalQuestion,
      }),
    });

    const deltas: string[] = [];
    const promise = service.createTurn({
      userId: "user-1",
      message: LEGAL_QUESTION,
      onDelta: (d) => deltas.push(d),
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 2);

    await expect(promise).rejects.toMatchObject({
      code: "AI_ABORTED",
    } satisfies Partial<LegalAiError>);

    expect(consumeNewLegalQuestion).not.toHaveBeenCalled();
    expect(releaseNewLegalQuestion).toHaveBeenCalledOnce();
    expect(store.assistantMessages).toEqual([]);
  });

  it("does not double-charge across two independent streamed turns", async () => {
    const consumeNewLegalQuestion = vi.fn();
    const { service } = createService({
      completion: streamingCompletion(),
      legalQuestionAccess: paidLegalQuestionAccess({ consumeNewLegalQuestion }),
    });

    await service.createTurn({ userId: "user-1", message: LEGAL_QUESTION, onDelta: () => {} });
    await service.createTurn({ userId: "user-1", message: LEGAL_QUESTION, onDelta: () => {} });

    expect(consumeNewLegalQuestion).toHaveBeenCalledTimes(2);
  });

  it("handles an empty stream (no chunks) without crashing and without a spurious success message", async () => {
    const empty = new FakeStreamingLegalAiCompletion({ chunks: [] });
    const { service, store } = createService({ completion: empty });

    const deltas: string[] = [];
    const result = await service.createTurn({
      userId: "user-1",
      message: LEGAL_QUESTION,
      onDelta: (d) => deltas.push(d),
    });

    expect(deltas).toEqual([]);
    // legal-ai.service.ts's own fallback for blank content.
    expect(result.message.content).toBe("Хариу боловсруулах явцад алдаа гарлаа.");
    expect(store.assistantMessages).toHaveLength(1);
  });

  it("preserves verified citation integrity for a streamed exact-citation turn", async () => {
    const corpusRetriever = createRetriever(
      async () => ({
        kind: "retrieved",
        status: "ok",
        retrievedAt: "2026-08-17T00:00:00.000Z",
        authorities: [sampleAuthority()],
      }),
      async () => ({ ok: true, verdict: sampleVerdict(CitationVerificationStatus.VALID) }),
    );
    const { service, store } = createService({
      completion: streamingCompletion(),
      corpusRetriever,
    });

    const deltas: string[] = [];
    const result = await service.createTurn({
      userId: "user-1",
      message: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
      onDelta: (d) => deltas.push(d),
    });

    expect(result.message.citations).toEqual([
      expect.objectContaining({
        title: "Эрүүгийн хууль",
        article: "17.1",
        sourceType: "legal-data-engine",
      }),
    ]);
    expect(store.citations).toHaveLength(1);
  });

  it("never treats LLM-generated citation-shaped text as authoritative — citations come only from verifiedAuthorities, never from streamed content", async () => {
    // The fake provider's streamed content includes citation-looking text.
    // Nothing in createTurn parses model output for citations — they are
    // only ever built from resolveLegalAuthorities' verified result.
    const injected = new FakeStreamingLegalAiCompletion({
      chunks: [
        "Эрүүгийн хуулийн 99.9 дүгээр зүйлд заасны дагуу",
        " (эх сурвалж: fake-injected-citation.example)",
      ],
    });
    const corpusRetriever = createRetriever(); // no exact citation configured
    const { service, store } = createService({ completion: injected, corpusRetriever });

    const result = await service.createTurn({
      userId: "user-1",
      message: "Хөдөлмөрийн эрх зүйн ерөнхий асуулт",
      onDelta: () => {},
    });

    expect(result.message.citations).toEqual([]);
    expect(store.citations).toEqual([]);
  });

  it("does not stream (onDelta never called) for a clarification-answer turn, even when onDelta is provided", async () => {
    const streaming = streamingCompletion();
    const { service } = createService({ completion: streaming });

    const deltas: string[] = [];
    // A first-person, POSSIBLY_LEGAL narrative ("my boss fired me") triggers
    // the citizen-intake clarification path, not the main legal-answer
    // path — deliberately non-streaming (see legal-ai.service.ts's comment
    // on why). Note this is unrelated to (and unaffected by) NON_LEGAL
    // questions now getting a real, streamed general answer instead of a
    // refusal — clarification is a different, still-non-streaming path.
    await service.createTurn({
      userId: "user-1",
      message: "Манай дарга намайг ажлаас гаргасан",
      onDelta: (d) => deltas.push(d),
    });

    expect(deltas).toEqual([]);
  });
});
