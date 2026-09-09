import type {
  LegalAiCompletionPort,
  LegalAiCompletionResult,
} from "@/application/ai/legal-ai.types";

/**
 * Multi-provider resilience wrapper (Phase 7/11: multi-model + provider
 * health/fallback). Tries `primary` first; if it is unconfigured or its
 * call fails, falls back to `secondary`. Mirrors the existing
 * FallbackLegalCorpusRetriever local/remote pattern for consistency.
 *
 * If neither provider is configured, behaves exactly like an unconfigured
 * single provider (isConfigured() === false), so existing call sites that
 * check isConfigured() before calling complete() need no changes.
 *
 * Composition is the caller's choice — see create-legal-ai-service.ts,
 * which only wires this in when a second provider's API key is present;
 * otherwise the primary provider is used directly and behavior is
 * unchanged from before this file existed.
 */
export class FallbackLegalAiCompletion implements LegalAiCompletionPort {
  constructor(
    private readonly primary: LegalAiCompletionPort,
    private readonly secondary: LegalAiCompletionPort,
  ) {}

  isConfigured(): boolean {
    return this.primary.isConfigured() || this.secondary.isConfigured();
  }

  async complete(input: {
    systemPrompt: string;
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  }): Promise<LegalAiCompletionResult> {
    if (this.primary.isConfigured()) {
      try {
        return await this.primary.complete(input);
      } catch (error) {
        if (!this.secondary.isConfigured()) {
          throw error;
        }
        console.error(
          "Primary legal AI completion provider failed, falling back",
        );
        return this.secondary.complete(input);
      }
    }

    return this.secondary.complete(input);
  }
}
