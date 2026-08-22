import { SubscriptionPlanCode } from "@/domain/enums";

/**
 * Product catalog for lawyer subscriptions.
 *
 * Billing (QPay today, other adapters later) is a payment concern.
 * This catalog is the server-side source of truth for plan, seatLimit,
 * and feature quotas. Clients must never supply these values.
 *
 * Token ceilings are backend safety limits and must not be shown to users.
 */
export type SubscriptionPlanDefinition = {
  code: SubscriptionPlanCode;
  name: string;
  priceMnt: number;
  seatLimit: number;
  quotas: {
    caseAnalysis: number;
    documentAnalysis: number;
    legalAiQueries: number;
  };
  tokenCeilings: {
    inputTokens: number;
    outputTokens: number;
  };
};

export const SOLO_PLAN: SubscriptionPlanDefinition = {
  code: SubscriptionPlanCode.SOLO,
  name: "TORE SOLO",
  priceMnt: 49_000,
  seatLimit: 1,
  quotas: {
    caseAnalysis: 30,
    documentAnalysis: 100,
    legalAiQueries: 500,
  },
  tokenCeilings: {
    inputTokens: 1_000_000,
    outputTokens: 200_000,
  },
};

/** Future multi-seat plan. Product UI is not implemented in this slice. */
export const TEAM_PLAN: SubscriptionPlanDefinition = {
  code: SubscriptionPlanCode.TEAM,
  name: "TORE Team",
  priceMnt: 0,
  seatLimit: 5,
  quotas: {
    caseAnalysis: 150,
    documentAnalysis: 500,
    legalAiQueries: 2_500,
  },
  tokenCeilings: {
    inputTokens: 5_000_000,
    outputTokens: 1_000_000,
  },
};

const PLANS: Record<SubscriptionPlanCode, SubscriptionPlanDefinition> = {
  [SubscriptionPlanCode.SOLO]: SOLO_PLAN,
  [SubscriptionPlanCode.TEAM]: TEAM_PLAN,
};

export function getPlanDefinition(
  code: SubscriptionPlanCode,
): SubscriptionPlanDefinition {
  return PLANS[code];
}

export const FEATURE_QUOTA_EXCEEDED_MESSAGES: Record<
  "CASE_ANALYSIS" | "DOCUMENT_ANALYSIS" | "LEGAL_AI_QUERY",
  string
> = {
  CASE_ANALYSIS:
    "Та энэ сарын нарийн хэрэг шинжилгээний хязгаарт хүрсэн байна. Багцаа сунгана уу эсвэл TORE Team-д шилжинэ үү.",
  DOCUMENT_ANALYSIS:
    "Та энэ сарын баримт бичгийн шинжилгээний хязгаарт хүрсэн байна. Багцаа сунгана уу эсвэл TORE Team-д шилжинэ үү.",
  LEGAL_AI_QUERY:
    "Та энэ сарын хууль зүйн AI асуултын хязгаарт хүрсэн байна. Багцаа сунгана уу эсвэл TORE Team-д шилжинэ үү.",
};

export const TOKEN_CEILING_USER_MESSAGE =
  "Таны энэ сарын AI хэрэглээний хязгаарт хүрсэн байна.";

export const ACCOUNT_SHARING_RESTRICTED_MESSAGE =
  "AI үйлдлийг түр хязгаарлалаа. Бусад төхөөрөмжөөс гарч, нууц үгээ солих эсвэл TORE Team-д шилжинэ үү.";

export const BILLING_REQUIRED_MESSAGE =
  "Таны TORE SOLO багц идэвхгүй байна. Төлбөр төлж багцаа идэвхжүүлнэ үү.";
