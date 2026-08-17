import { LegalAiService } from "@/application/ai/legal-ai.service";
import {
  PromptBuilderService,
  RuleBasedDomainFilter,
  UserTypeService,
} from "@/engine/gateway";
import { createIntentEngine } from "@/engine/intent";
import { createReasoningEngine } from "@/engine/reasoning";
import { OpenAiLegalAiCompletion } from "@/infrastructure/ai/openai-legal-ai-completion";
import { PrismaLegalAiStore } from "@/infrastructure/ai/prisma-legal-ai-store";

let singleton: LegalAiService | undefined;

/**
 * Production composition root for Legal AI chat.
 * Routes must call this instead of wiring engine internals.
 */
export function createLegalAiService(): LegalAiService {
  return new LegalAiService({
    domainFilter: new RuleBasedDomainFilter(),
    userTypeService: new UserTypeService(),
    promptBuilder: new PromptBuilderService(),
    intent: createIntentEngine(),
    reasoning: createReasoningEngine(),
    store: new PrismaLegalAiStore(),
    completion: new OpenAiLegalAiCompletion(),
  });
}

export function getLegalAiService(): LegalAiService {
  singleton ??= createLegalAiService();
  return singleton;
}
