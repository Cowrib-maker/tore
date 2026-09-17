import { LegalAiError } from "@/application/ai/legal-ai.errors";
import type {
  LegalAiCompletionInput,
  LegalAiCompletionPort,
  LegalAiCompletionResult,
} from "@/application/ai/legal-ai.types";

/**
 * Second Legal AI completion provider (Anthropic Claude), implementing the
 * same LegalAiCompletionPort as OpenAiLegalAiCompletion so it is a drop-in
 * alternative or fallback — see FallbackLegalAiCompletion.
 *
 * Uses the Anthropic Messages API directly over fetch (no SDK dependency),
 * matching this adapter's isolated, dependency-light style.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_MAX_TOKENS = 4096;
const UNAVAILABLE_MESSAGE = "AI үйлчилгээтэй холбогдоход алдаа гарлаа.";
const NOT_CONFIGURED_MESSAGE = "AI үйлчилгээний тохиргоо хийгдээгүй байна.";

export function isAnthropicApiKeyConfigured(key: string | undefined): boolean {
  return Boolean(key?.trim());
}

type AnthropicMessageRole = "user" | "assistant";

type AnthropicCreateMessageResponse = {
  content?: Array<{ type: string; text?: string }>;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};

type AnthropicFetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<AnthropicCreateMessageResponse>;
  /** Present (and read) only for streamed requests. */
  body?: ReadableStream<Uint8Array> | null;
};

/** Minimal fetch-shaped client so tests can inject a fake without hitting the network. */
type AnthropicFetchClient = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<AnthropicFetchResponse>;

/**
 * A system-role entry inside `messages` has no equivalent in the Anthropic
 * Messages API (system content is a separate top-level field) — fold any
 * such entries into the system prompt instead of dropping them silently.
 */
function splitSystemAndTurns(input: {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
}): { system: string; turns: Array<{ role: AnthropicMessageRole; content: string }> } {
  const extraSystem: string[] = [];
  const turns: Array<{ role: AnthropicMessageRole; content: string }> = [];

  for (const message of input.messages) {
    if (message.role === "system") {
      extraSystem.push(message.content);
      continue;
    }
    turns.push({ role: message.role, content: message.content });
  }

  const system = [input.systemPrompt, ...extraSystem].filter(Boolean).join("\n\n");
  return { system, turns };
}

type AnthropicStreamEvent =
  | { type: "message_start"; message?: { model?: string; usage?: { input_tokens?: number; output_tokens?: number } } }
  | { type: "content_block_delta"; delta?: { type?: string; text?: string } }
  | { type: "message_delta"; usage?: { output_tokens?: number } }
  | { type: string };

/**
 * Parses one SSE byte stream from the Anthropic Messages API
 * (`event: ...\ndata: {...}\n\n` frames) into the sequence of parsed JSON
 * event payloads. Exported for unit testing without a real network stream.
 */
export async function* parseAnthropicEventStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AnthropicStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of rawEvent.split("\n")) {
          if (line.startsWith("data:")) {
            const json = line.slice("data:".length).trim();
            if (json) {
              try {
                yield JSON.parse(json) as AnthropicStreamEvent;
              } catch {
                // Malformed frame — skip rather than aborting the whole turn.
              }
            }
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export class AnthropicLegalAiCompletion implements LegalAiCompletionPort {
  constructor(
    private readonly apiKey: string | undefined = undefined,
    private readonly fetchClient: AnthropicFetchClient = fetch as unknown as AnthropicFetchClient,
    private readonly model: string = DEFAULT_MODEL,
    private readonly maxTokens: number = DEFAULT_MAX_TOKENS,
  ) {}

  isConfigured(): boolean {
    return isAnthropicApiKeyConfigured(this.apiKey);
  }

  async complete(input: LegalAiCompletionInput): Promise<LegalAiCompletionResult> {
    if (!this.isConfigured()) {
      throw new LegalAiError(NOT_CONFIGURED_MESSAGE, 503, "AI_NOT_CONFIGURED");
    }

    const { system, turns } = splitSystemAndTurns(input);

    try {
      if (input.onDelta) {
        return await this.completeStreaming(system, turns, input.onDelta, input.signal);
      }

      const response = await this.fetchClient(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey!.trim(),
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          system,
          messages: turns,
        }),
        signal: input.signal,
      });

      if (!response.ok) {
        console.error("Anthropic completion failed with status", response.status);
        throw new LegalAiError(UNAVAILABLE_MESSAGE, 503, "AI_UNAVAILABLE");
      }

      const body = await response.json();
      const text = body.content
        ?.filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
        .join("")
        .trim();

      return {
        content: text && text.length > 0 ? text : UNAVAILABLE_MESSAGE,
        model: body.model ?? this.model,
        provider: "CLAUDE",
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
      };
    } catch (error) {
      if (error instanceof LegalAiError) {
        throw error;
      }
      if (input.signal?.aborted) {
        throw new LegalAiError("Цуцлагдсан.", 503, "AI_ABORTED");
      }
      console.error("Anthropic completion failed");
      throw new LegalAiError(UNAVAILABLE_MESSAGE, 503, "AI_UNAVAILABLE");
    }
  }

  private async completeStreaming(
    system: string,
    turns: Array<{ role: AnthropicMessageRole; content: string }>,
    onDelta: (delta: string) => void,
    signal: AbortSignal | undefined,
  ): Promise<LegalAiCompletionResult> {
    const response = await this.fetchClient(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey!.trim(),
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        system,
        messages: turns,
        stream: true,
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      console.error("Anthropic completion failed with status", response.status);
      throw new LegalAiError(UNAVAILABLE_MESSAGE, 503, "AI_UNAVAILABLE");
    }

    let content = "";
    let model = this.model;
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of parseAnthropicEventStream(response.body)) {
      if (event.type === "message_start" && "message" in event) {
        model = event.message?.model ?? model;
        inputTokens = event.message?.usage?.input_tokens ?? inputTokens;
        outputTokens = event.message?.usage?.output_tokens ?? outputTokens;
      } else if (event.type === "content_block_delta" && "delta" in event) {
        const text = event.delta?.type === "text_delta" ? event.delta.text : undefined;
        if (text) {
          content += text;
          onDelta(text);
        }
      } else if (event.type === "message_delta" && "usage" in event) {
        outputTokens = event.usage?.output_tokens ?? outputTokens;
      }
    }

    return {
      content: content.trim() || UNAVAILABLE_MESSAGE,
      model,
      provider: "CLAUDE",
      inputTokens,
      outputTokens,
    };
  }
}
