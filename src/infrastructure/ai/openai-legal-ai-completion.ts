import OpenAI from "openai";

import type {
  LegalAiCompletionPort,
  LegalAiCompletionResult,
} from "@/application/ai/legal-ai.types";

const DEFAULT_MODEL = "gpt-5.6-luna";

export class OpenAiLegalAiCompletion implements LegalAiCompletionPort {
  constructor(
    private readonly client: OpenAI = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    }),
    private readonly model: string = DEFAULT_MODEL,
  ) {}

  isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async complete(input: {
    systemPrompt: string;
    messages: Array<{
      role: "user" | "assistant" | "system";
      content: string;
    }>;
  }): Promise<LegalAiCompletionResult> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: input.systemPrompt },
        ...input.messages,
      ],
    });

    return {
      content:
        completion.choices[0]?.message?.content?.trim() ??
        "Хариу боловсруулах явцад алдаа гарлаа.",
      model: completion.model,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    };
  }
}
