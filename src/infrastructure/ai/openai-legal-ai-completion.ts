import OpenAI from "openai";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import type {
  LegalAiCompletionInput,
  LegalAiCompletionPort,
  LegalAiCompletionResult,
} from "@/application/ai/legal-ai.types";

const DEFAULT_MODEL = "gpt-5.6-luna";
const UNAVAILABLE_MESSAGE = "AI үйлчилгээтэй холбогдоход алдаа гарлаа.";
const NOT_CONFIGURED_MESSAGE = "AI үйлчилгээний тохиргоо хийгдээгүй байна.";

export function isOpenAiApiKeyConfigured(key: string | undefined): boolean {
  return Boolean(key?.trim());
}

/** Distinguishes the two possible `create()` return shapes at runtime — a
 * streaming result has no `choices[].message`, only `choices[].delta`. */
function isNonStreamResult(
  value: OpenAiNonStreamResult | AsyncIterable<OpenAiStreamChunk>,
): value is OpenAiNonStreamResult {
  return !(Symbol.asyncIterator in Object(value));
}

type OpenAiMessage = { role: "user" | "assistant" | "system"; content: string };

type OpenAiNonStreamResult = {
  choices?: Array<{ message?: { content?: string | null } | null } | null>;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
};

type OpenAiStreamChunk = {
  choices?: Array<{ delta?: { content?: string | null } | null } | null>;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
};

/**
 * Minimal fetch-shaped client so tests can inject a fake without hitting the
 * network. `create`'s return type is a union rather than an overload keyed
 * on the literal `stream` value: overloads require the call SITE to pick a
 * branch statically, which a single mock/fake implementation (same
 * function regardless of input) can never satisfy for both branches at
 * once. The caller narrows at runtime instead (see completeStreaming,
 * which knows — because it passed `stream: true` — that the result is the
 * async-iterable branch).
 */
type OpenAiCompletionClient = {
  chat: {
    completions: {
      create(
        input: {
          model: string;
          messages: OpenAiMessage[];
          stream?: boolean;
          stream_options?: { include_usage?: boolean };
        },
        options?: { signal?: AbortSignal },
      ): Promise<OpenAiNonStreamResult | AsyncIterable<OpenAiStreamChunk>>;
    };
  };
};

export class OpenAiLegalAiCompletion implements LegalAiCompletionPort {
  private client: OpenAiCompletionClient | undefined;

  constructor(
    private readonly apiKey: string | undefined = undefined,
    client?: OpenAiCompletionClient,
    private readonly model: string = DEFAULT_MODEL,
  ) {
    this.client = client;
  }

  isConfigured(): boolean {
    return isOpenAiApiKeyConfigured(this.apiKey);
  }

  async complete(input: LegalAiCompletionInput): Promise<LegalAiCompletionResult> {
    if (!this.isConfigured()) {
      throw new LegalAiError(NOT_CONFIGURED_MESSAGE, 503, "AI_NOT_CONFIGURED");
    }

    const messages: OpenAiMessage[] = [
      { role: "system", content: input.systemPrompt },
      ...input.messages,
    ];

    try {
      if (input.onDelta) {
        return await this.completeStreaming(messages, input.onDelta, input.signal);
      }

      const completion = await this.getClient().chat.completions.create(
        { model: this.model, messages, stream: false },
        { signal: input.signal },
      );
      if (!isNonStreamResult(completion)) {
        throw new Error("expected a non-streaming completion result");
      }

      return {
        content:
          completion.choices?.[0]?.message?.content?.trim() ??
          UNAVAILABLE_MESSAGE,
        model: completion.model ?? this.model,
        provider: "OPENAI",
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      };
    } catch (error) {
      if (error instanceof LegalAiError) {
        throw error;
      }
      if (input.signal?.aborted) {
        // Caller cancelled (client disconnect / Stop button) — not a
        // provider failure. Distinguished so callers release quota
        // silently instead of logging noise or surfacing a scary error.
        throw new LegalAiError("Цуцлагдсан.", 503, "AI_ABORTED");
      }
      console.error("OpenAI completion failed");
      throw new LegalAiError(UNAVAILABLE_MESSAGE, 503, "AI_UNAVAILABLE");
    }
  }

  private async completeStreaming(
    messages: OpenAiMessage[],
    onDelta: (delta: string) => void,
    signal: AbortSignal | undefined,
  ): Promise<LegalAiCompletionResult> {
    const result = await this.getClient().chat.completions.create(
      {
        model: this.model,
        messages,
        stream: true,
        // Without this, streamed responses never carry a usage block —
        // recordUsage would silently log 0 tokens for every streamed turn.
        stream_options: { include_usage: true },
      },
      { signal },
    );
    if (isNonStreamResult(result)) {
      throw new Error("expected a streaming completion result");
    }
    const stream = result;

    let content = "";
    let model = this.model;
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        content += delta;
        onDelta(delta);
      }
      if (chunk.model) {
        model = chunk.model;
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
        outputTokens = chunk.usage.completion_tokens ?? outputTokens;
      }
    }

    return {
      content: content.trim() || UNAVAILABLE_MESSAGE,
      model,
      provider: "OPENAI",
      inputTokens,
      outputTokens,
    };
  }

  private getClient(): OpenAiCompletionClient {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.apiKey?.trim(),
      }) as unknown as OpenAiCompletionClient;
    }
    return this.client;
  }
}
