import type { LegalAiCompletionPort } from "@/application/ai/legal-ai.types";
import { env } from "@/lib/env";
import { OpenAiLegalAiCompletion } from "@/infrastructure/ai/openai-legal-ai-completion";

export function createStudentProblemCompletion(): LegalAiCompletionPort {
  return new OpenAiLegalAiCompletion(env.OPENAI_API_KEY);
}
