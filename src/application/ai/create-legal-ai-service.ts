import { FallbackLegalCorpusRetriever } from "@/application/ai/fallback-legal-corpus-retriever";
import type { LegalCorpusRetriever } from "@/application/ai/legal-corpus";
import { LegalAiService } from "@/application/ai/legal-ai.service";
import { createOwnedCaseContextLoader } from "@/application/ai/load-owned-legal-ai-case-context";
import {
  PromptBuilderService,
  RuleBasedDomainFilter,
  UserTypeService,
} from "@/engine/gateway";
import { createIntentEngine } from "@/engine/intent";
import { createReasoningEngine } from "@/engine/reasoning";
import { createLegalRelevanceEngine } from "@/engine/relevance";
import { KnowledgeLegalCorpusRetriever } from "@/infrastructure/ai/knowledge-legal-corpus-retriever";
import { createReadOnlyKnowledgeRepository } from "@/infrastructure/ai/read-only-knowledge-repository";
import { OpenAiLegalAiCompletion } from "@/infrastructure/ai/openai-legal-ai-completion";
import { PrismaLegalAiStore } from "@/infrastructure/ai/prisma-legal-ai-store";
import { LegalDataEngineClient } from "@/infrastructure/legal-data-engine/legal-data-engine-client";
import {
  HttpLegalCorpusRetriever,
  UnavailableLegalCorpusRetriever,
} from "@/infrastructure/legal-data-engine/http-legal-corpus-retriever";
import { createLegalQuestionAccess } from "@/application/legal-ai/legal-question-access";
import {
  prismaConversationBillingStore,
  prismaGuestSessionStore,
} from "@/infrastructure/legal-ai/prisma-guest-session-store";
import {
  caseFileRepository,
  entitlementUsageRepository,
  subscriptionRepository,
  userRepository,
} from "@/infrastructure/repositories";
import { env } from "@/lib/env";

let singleton: LegalAiService | undefined;

function createRemoteCorpusRetriever(): LegalCorpusRetriever {
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

function createCorpusRetriever(): LegalCorpusRetriever {
  const local = new KnowledgeLegalCorpusRetriever(
    createReadOnlyKnowledgeRepository(),
  );
  return new FallbackLegalCorpusRetriever(local, createRemoteCorpusRetriever());
}

/**
 * Production composition root for Legal AI chat.
 * Routes must call this instead of wiring engine internals.
 */
export function createLegalAiService(): LegalAiService {
  const domainFilter = new RuleBasedDomainFilter();
  const intent = createIntentEngine();
  return new LegalAiService({
    domainFilter,
    userTypeService: new UserTypeService(),
    promptBuilder: new PromptBuilderService(),
    intent,
    reasoning: createReasoningEngine(),
    legalRelevance: createLegalRelevanceEngine({ domainFilter, intent }),
    store: new PrismaLegalAiStore(),
    completion: new OpenAiLegalAiCompletion(env.OPENAI_API_KEY),
    corpusRetriever: createCorpusRetriever(),
    legalQuestionAccess: createLegalQuestionAccess({
      guestSessions: prismaGuestSessionStore,
      conversations: prismaConversationBillingStore,
      subscriptionRepository,
      entitlementUsageRepository,
      userRepository,
    }),
    caseContextLoader: createOwnedCaseContextLoader(caseFileRepository),
  });
}

export function getLegalAiService(): LegalAiService {
  singleton ??= createLegalAiService();
  return singleton;
}
