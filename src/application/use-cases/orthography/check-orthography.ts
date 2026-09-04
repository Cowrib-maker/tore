import type { ActorContext } from "@/application/common/actor-context";
import { createLegalQuestionAccess } from "@/application/legal-ai/legal-question-access";
import { BILLING_REQUIRED_MESSAGE } from "@/domain/constants/subscription-plans";
import { UserRole } from "@/domain/enums";
import { UnauthorizedError, ValidationError } from "@/domain/errors/domain-error";
import { EntitlementError } from "@/domain/errors/entitlement-error";
import type { EntitlementUsageRepository } from "@/domain/repositories/entitlement-usage-repository";
import type { SubscriptionRepository } from "@/domain/repositories/subscription-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import { buildHunspellWordSuggestions } from "@/domain/mongolian-orthography/hunspell-server";
import type { OrthographyCheckResult, OrthographySuggestion } from "@/domain/mongolian-orthography/suggestions";

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
    guestSessions: { getById: async () => null, incrementFreeLegalQuestionsUsed: async () => {} },
    conversations: { countBilledQuestionsForUser: async () => 0 },
    subscriptionRepository: deps.subscriptionRepository,
    entitlementUsageRepository: deps.entitlementUsageRepository,
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

  const wordSuggestions = buildHunspellWordSuggestions(trimmed);
  const suggestions: OrthographySuggestion[] = wordSuggestions.map((item) => ({
    kind: "SPELLING",
    sourceWord: item.sourceWord,
    suggestedWord: item.suggestedWord,
    suggestionLabel: `Зөв бичлэг: «${item.suggestedWord}»`,
    ruleIds: ["MONGOLIAN_HUNSPELL"],
    ruleTitle: "Монгол хэлний зөв бичлэг",
    start: item.start,
    end: item.end,
    candidates: item.candidates,
  }));

  const wordCount = trimmed.split(/\s+/u).filter(Boolean).length;
  return {
    suggestions,
    suggestionCount: suggestions.length,
    orthographyCount: 0,
    latinCount: 0,
    spellingCount: suggestions.length,
    wordCount,
    characterCount: trimmed.length,
    premium: true,
  };
}

export type { OrthographySuggestion };
