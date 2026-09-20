import { LegalCorpusSource, type LegalCorpusRetriever } from "@/application/ai/legal-corpus";
import { TieredLegalCorpusRetriever } from "@/application/ai/tiered-legal-corpus-retriever";
import { OfficialWebLegalCorpusRetriever } from "@/infrastructure/legal-web-research/official-web-legal-corpus-retriever";
import { createLegalArchiveStack } from "@/infrastructure/archive";
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
import { AnthropicLegalAiCompletion } from "@/infrastructure/ai/anthropic-legal-ai-completion";
import { FallbackLegalAiCompletion } from "@/infrastructure/ai/fallback-legal-ai-completion";
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
  unpaidCitizenLegalQuestionUsageRepository,
  userRepository,
} from "@/infrastructure/repositories";
import { env } from "@/lib/env";

let singleton: LegalAiService | undefined;

/**
 * OpenAI stays the default, tested primary provider. Claude is wired in
 * only as an automatic fallback, and only when ANTHROPIC_API_KEY is set —
 * with no key configured, this returns the exact same OpenAI-only
 * completion port as before this function existed, so existing behavior
 * is unchanged unless an operator opts in.
 */
export function createCompletion() {
  const openAi = new OpenAiLegalAiCompletion(env.OPENAI_API_KEY);
  if (!env.ANTHROPIC_API_KEY) {
    return openAi;
  }
  const anthropic = new AnthropicLegalAiCompletion(env.ANTHROPIC_API_KEY);
  return new FallbackLegalAiCompletion(openAi, anthropic);
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

/**
 * Third (last-resort) tier: an exact citation local + the internal engine
 * both missed is looked up live on legalinfo.mn, verified, and — best
 * effort — cached back into the same corpus tables the local tier reads,
 * via the shared read repository (writes through it succeed once a real
 * ArchiveService is supplied; only the placeholder archive used
 * elsewhere for reads refuses writes — see read-only-knowledge-repository.ts).
 */
function createOfficialWebCorpusRetriever(): LegalCorpusRetriever {
  return new OfficialWebLegalCorpusRetriever({
    timeoutMs: env.LEGAL_WEB_RETRIEVAL_TIMEOUT_MS,
    maxDiscoveryPages: env.LEGAL_WEB_RETRIEVAL_MAX_DISCOVERY_PAGES,
    overallDeadlineMs: env.LEGAL_WEB_RETRIEVAL_OVERALL_DEADLINE_MS,
    rateLimitPerMinute: env.LEGAL_WEB_RETRIEVAL_RATE_LIMIT_PER_MINUTE,
    cache: async () => ({
      archive: (await createLegalArchiveStack({ env, usePostgresMetadata: true })).archive,
      repository: createReadOnlyKnowledgeRepository(),
    }),
  });
}

export function createCorpusRetriever(): LegalCorpusRetriever {
  const local = new KnowledgeLegalCorpusRetriever(
    createReadOnlyKnowledgeRepository(),
  );
  return new TieredLegalCorpusRetriever([
    { retriever: local, source: LegalCorpusSource.LOCAL_CORPUS },
    { retriever: createRemoteCorpusRetriever(), source: LegalCorpusSource.LEGAL_DATA_ENGINE },
    { retriever: createOfficialWebCorpusRetriever(), source: LegalCorpusSource.OFFICIAL_WEB },
  ]);
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
    completion: createCompletion(),
    corpusRetriever: createCorpusRetriever(),
    legalQuestionAccess: createLegalQuestionAccess({
      guestSessions: prismaGuestSessionStore,
      conversations: prismaConversationBillingStore,
      subscriptionRepository,
      entitlementUsageRepository,
      unpaidCitizenUsage: unpaidCitizenLegalQuestionUsageRepository,
      userRepository,
    }),
    caseContextLoader: createOwnedCaseContextLoader(caseFileRepository),
  });
}

export function getLegalAiService(): LegalAiService {
  singleton ??= createLegalAiService();
  return singleton;
}
