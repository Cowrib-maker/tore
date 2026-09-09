import { LegalAiError } from "@/application/ai/legal-ai.errors";
import type {
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

/** Minimal fetch-shaped client so tests can inject a fake without hitting the network. */
type AnthropicFetchClient = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<AnthropicCreateMessageResponse>;
}>;

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

  async complete(input: {
    systemPrompt: string;
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  }): Promise<LegalAiCompletionResult> {
    if (!this.isConfigured()) {
      throw new LegalAiError(NOT_CONFIGURED_MESSAGE, 503, "AI_NOT_CONFIGURED");
    }

    const { system, turns } = splitSystemAndTurns(input);

    try {
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
      console.error("Anthropic completion failed");
      throw new LegalAiError(UNAVAILABLE_MESSAGE, 503, "AI_UNAVAILABLE");
    }
  }
}
