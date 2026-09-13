import type { ActorContext } from "@/application/common/actor-context";
import { createLegalQuestionAccess } from "@/application/legal-ai/legal-question-access";
import { BILLING_REQUIRED_MESSAGE } from "@/domain/constants/subscription-plans";
import { UserRole } from "@/domain/enums";
import { UnauthorizedError, ValidationError } from "@/domain/errors/domain-error";
import { EntitlementError } from "@/domain/errors/entitlement-error";
import type { EntitlementUsageRepository } from "@/domain/repositories/entitlement-usage-repository";
import type { SubscriptionRepository } from "@/domain/repositories/subscription-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import {
  buildOrthographySuggestions,
  type OrthographyCheckResult,
  type OrthographySuggestion,
} from "@/domain/mongolian-orthography";
import { initializeGeneratedVocabularyIfEnabled } from "@/domain/mongolian-orthography/generated-vocabulary-activation";

// Runs once when this server-only module is first loaded (Next.js loads
// route/use-case modules once per server process, not per request) — a
// deterministic, flag-gated activation point with no separate bootstrap
// file to remember to wire up. A no-op when
// TORE_GENERATED_LEGAL_VOCABULARY_V1 is unset (the default): the
// hand-curated dictionary alone stays authoritative. See
// generated-vocabulary-activation.ts for what "enabled" actually does.
initializeGeneratedVocabularyIfEnabled();

export type OrthographyCheckDeps = {
  subscriptionRepository: SubscriptionRepository;
  entitlementUsageRepository: EntitlementUsageRepository;
  userRepository: Pick<UserRepository, "findById">;
};

const MAX_CHARS = 20_000;
export type OrthographyCheckResponse = OrthographyCheckResult & { premium: true };
export type OrthographyCheckInput = { text: string; includeLatinToCyrillic?: boolean };

/** Paid, strict word-level spelling only. No sentence meaning or semantic rewriting. */
export async function checkOrthographyForPaidUser(
  actor: ActorContext | null,
  input: OrthographyCheckInput,
  deps: OrthographyCheckDeps,
): Promise<OrthographyCheckResponse> {
  if (!actor) throw new UnauthorizedError("Зөв бичгийн алдаа шалгагч ашиглахын тулд нэвтэрнэ үү.");

  const access = createLegalQuestionAccess({
    guestSessions: {
      getById: async () => null,
      incrementFreeLegalQuestionsUsed: async () => {},
      tryConsumeFreeLegalQuestion: async () => false,
      releaseFreeLegalQuestion: async () => {},
    },
    conversations: { countBilledQuestionsForUser: async () => 0 },
    subscriptionRepository: deps.subscriptionRepository,
    entitlementUsageRepository: deps.entitlementUsageRepository,
    unpaidCitizenUsage: {
      tryReserve: async () => false,
      release: async () => {},
      getUsedCount: async () => 0,
    },
    userRepository: deps.userRepository,
  });

  const paid = await access.hasPaidLegalAiAccess({ kind: "user", userId: actor.userId, role: actor.role });
  if (!paid) {
    throw new EntitlementError(
      actor.role === UserRole.LAWYER ? BILLING_REQUIRED_MESSAGE : "Зөв бичгийн алдаа шалгагч зөвхөн төлбөртэй багцад нээлттэй. Багцаа идэвхжүүлнэ үү.",
      "BILLING_REQUIRED",
      402,
    );
  }

  const trimmed = input.text.trim();
  if (!trimmed) return { suggestions: [], suggestionCount: 0, orthographyCount: 0, latinCount: 0, spellingCount: 0, wordCount: 0, characterCount: 0, premium: true };
  if (trimmed.length > MAX_CHARS) throw new ValidationError(`Текст хэт урт байна (дээд тал ${MAX_CHARS} тэмдэгт).`);

  // Self-contained Mongolian vowel-harmony/suffix-rule engine + curated
  // dictionary — no external hunspell dictionary dependency required.
  const result = buildOrthographySuggestions(trimmed, {
    includeLatinToCyrillic: input.includeLatinToCyrillic,
  });

  return { ...result, premium: true };
}

export type { OrthographySuggestion };
