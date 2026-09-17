import { LegalAiError } from "@/application/ai/legal-ai.errors";
import type {
  LegalAiCompletionInput,
  LegalAiCompletionPort,
  LegalAiCompletionResult,
  LegalAiProvider,
} from "@/application/ai/legal-ai.types";

/**
 * Deterministic, network-free LegalAiCompletionPort implementation for
 * tests and local latency measurement. Never calls a real provider — used
 * to verify streaming event ordering/abort/error handling and to compare
 * streaming vs non-streaming latency (time-to-first-token, time-to-first-
 * N-chars, total time) without touching OpenAI/Anthropic credentials.
 *
 * Deliberately NOT wired into create-legal-ai-service.ts's production
 * composition — it exists purely as an alternate LegalAiCompletionPort
 * implementation (same pattern as the OpenAI/Anthropic/Fallback adapters),
 * not a parallel service.
 */
export type FakeStreamingScript = {
  /** Text pieces emitted in order via onDelta (or all at once if no onDelta
   * is provided, matching real providers' non-streaming behavior). */
  chunks: string[];
  /** Delay before each chunk, in ms. 0 (default) for fast deterministic
   * tests; set higher to make time-to-first-token measurements meaningful. */
  chunkDelayMs?: number;
  model?: string;
  provider?: LegalAiProvider;
  inputTokens?: number;
  outputTokens?: number;
  /** Throw a provider failure after this many chunks have been emitted
   * (1-indexed) — 0 means fail before emitting anything. */
  failAfterChunks?: number;
  failureMessage?: string;
};

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export class FakeStreamingLegalAiCompletion implements LegalAiCompletionPort {
  constructor(private readonly script: FakeStreamingScript) {}

  isConfigured(): boolean {
    return true;
  }

  async complete(input: LegalAiCompletionInput): Promise<LegalAiCompletionResult> {
    let content = "";
    let emitted = 0;

    try {
      if (this.script.failAfterChunks === 0) {
        throw new LegalAiError(
          this.script.failureMessage ?? "Fake provider failure",
          503,
          "AI_UNAVAILABLE",
        );
      }
      for (const chunk of this.script.chunks) {
        if (input.signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        await delay(this.script.chunkDelayMs ?? 0, input.signal);

        emitted += 1;
        content += chunk;
        input.onDelta?.(chunk);

        if (this.script.failAfterChunks != null && emitted >= this.script.failAfterChunks) {
          throw new LegalAiError(
            this.script.failureMessage ?? "Fake provider failure",
            503,
            "AI_UNAVAILABLE",
          );
        }
      }
    } catch (error) {
      if (error instanceof LegalAiError) {
        throw error;
      }
      if (input.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        throw new LegalAiError("Цуцлагдсан.", 503, "AI_ABORTED");
      }
      throw error;
    }

    return {
      content: content.trim(),
      model: this.script.model ?? "fake-streaming-model",
      provider: this.script.provider ?? "OPENAI",
      inputTokens: this.script.inputTokens ?? 0,
      outputTokens: this.script.outputTokens ?? 0,
    };
  }
}
