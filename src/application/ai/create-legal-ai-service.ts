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
import { LegalDataEngineClient } from "@/infrastructure/legal-data-engine/legal-data-engine-client";
import {
  HttpLegalCorpusRetriever,
  UnavailableLegalCorpusRetriever,
} from "@/infrastructure/legal-data-engine/http-legal-corpus-retriever";
import { env } from "@/lib/env";

let singleton: LegalAiService | undefined;

function createCorpusRetriever() {
  if (!env.ENGINE_BASE_URL || !env.ENGINE_SERVICE_TOKEN) {
    return new UnavailableLegalCorpusRetriever("not_configured");
  }

  return new HttpLegalCorpusRetriever(
    new LegalDataEngineClient({
      baseUrl: env.ENGINE_BASE_URL,
      serviceToken: env.ENGINE_SERVICE_TOKEN,
      timeoutMs: env.ENGINE_TIMEOUT_MS,
    }),
  );
}

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
    corpusRetriever: createCorpusRetriever(),
  });
}

export function getLegalAiService(): LegalAiService {
  singleton ??= createLegalAiService();
  return singleton;
}
