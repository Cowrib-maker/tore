import OpenAI from "openai";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import type {
  LegalAiCompletionPort,
  LegalAiCompletionResult,
} from "@/application/ai/legal-ai.types";

const DEFAULT_MODEL = "gpt-5.6-luna";
const UNAVAILABLE_MESSAGE = "AI үйлчилгээтэй холбогдоход алдаа гарлаа.";
const NOT_CONFIGURED_MESSAGE = "AI үйлчилгээний тохиргоо хийгдээгүй байна.";

export function isOpenAiApiKeyConfigured(key: string | undefined): boolean {
  return Boolean(key?.trim());
}

type OpenAiCompletionClient = {
  chat: {
    completions: {
      create: (input: {
        model: string;
        messages: Array<{
          role: "user" | "assistant" | "system";
          content: string;
        }>;
      }) => Promise<{
        choices?: Array<{ message?: { content?: string | null } | null } | null>;
        model?: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      }>;
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

  async complete(input: {
    systemPrompt: string;
    messages: Array<{
      role: "user" | "assistant" | "system";
      content: string;
    }>;
  }): Promise<LegalAiCompletionResult> {
    if (!this.isConfigured()) {
      throw new LegalAiError(NOT_CONFIGURED_MESSAGE, 503, "AI_NOT_CONFIGURED");
    }

    try {
      const completion = await this.getClient().chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: input.systemPrompt },
          ...input.messages,
        ],
      });

      return {
        content:
          completion.choices?.[0]?.message?.content?.trim() ??
          UNAVAILABLE_MESSAGE,
        model: completion.model ?? this.model,
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      };
    } catch (error) {
      if (error instanceof LegalAiError) {
        throw error;
      }
      console.error("OpenAI completion failed");
      throw new LegalAiError(UNAVAILABLE_MESSAGE, 503, "AI_UNAVAILABLE");
    }
  }

  private getClient(): OpenAiCompletionClient {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: this.apiKey?.trim() });
    }
    return this.client;
  }
}
