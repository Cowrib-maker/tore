import { FallbackLegalCorpusRetriever } from "@/application/ai/fallback-legal-corpus-retriever";
import type { LegalCorpusRetriever } from "@/application/ai/legal-corpus";
import { LegalAiService } from "@/application/ai/legal-ai.service";
import type { ArchiveService } from "@/engine/data/archive";
import {
  PromptBuilderService,
  RuleBasedDomainFilter,
  UserTypeService,
} from "@/engine/gateway";
import { createIntentEngine } from "@/engine/intent";
import { createReasoningEngine } from "@/engine/reasoning";
import { createLegalRelevanceEngine } from "@/engine/relevance";
import { KnowledgeLegalCorpusRetriever } from "@/infrastructure/ai/knowledge-legal-corpus-retriever";
import { OpenAiLegalAiCompletion } from "@/infrastructure/ai/openai-legal-ai-completion";
import { PrismaLegalAiStore } from "@/infrastructure/ai/prisma-legal-ai-store";
import { getPrismaClient } from "@/infrastructure/database/prisma-client";
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
  entitlementUsageRepository,
  subscriptionRepository,
} from "@/infrastructure/repositories";
import { PrismaKnowledgeRepository } from "@/infrastructure/repositories/prisma-legal-knowledge-repository";
import { env } from "@/lib/env";

let singleton: LegalAiService | undefined;

function readOnlyArchivePlaceholder(): ArchiveService {
  return {
    verifyArchiveIntegrity: async () => {
      throw new Error("Legal AI chat reads knowledge; it does not archive.");
    },
  } as unknown as ArchiveService;
}

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
    new PrismaKnowledgeRepository(
      readOnlyArchivePlaceholder(),
      getPrismaClient(),
    ),
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
    }),
  });
}

export function getLegalAiService(): LegalAiService {
  singleton ??= createLegalAiService();
  return singleton;
}
