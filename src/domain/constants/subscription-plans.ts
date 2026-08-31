import { SubscriptionPlanCode } from "@/domain/enums";

/**
 * Product catalog for lawyer subscriptions.
 *
 * Billing (QPay today, other adapters later) is a payment concern.
 * This catalog is the server-side source of truth for plan, seatLimit,
 * and feature quotas. Clients must never supply these values.
 *
 * Token ceilings are backend safety limits and must not be shown to users.
 *
 * Quotas are sized so 49,000₮ SOLO stays profitable against TORE AI cost:
 * ~300 questions ≈ 10–20k ₮, ~700 ≈ 25–50k ₮. File/contract analysis is
 * counted separately because OCR + long context costs more than a chat turn.
 * documentAnalysis covers Legal AI attachments and case-review documents.
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
    caseAnalysis: 15,
    documentAnalysis: 25,
    legalAiQueries: 200,
  },
  tokenCeilings: {
    inputTokens: 600_000,
    outputTokens: 120_000,
  },
};

/** Future multi-seat plan. Product UI is not implemented in this slice. */
export const TEAM_PLAN: SubscriptionPlanDefinition = {
  code: SubscriptionPlanCode.TEAM,
  name: "TORE Team",
  priceMnt: 0,
  seatLimit: 5,
  quotas: {
    caseAnalysis: 75,
    documentAnalysis: 125,
    legalAiQueries: 1_000,
  },
  tokenCeilings: {
    inputTokens: 3_000_000,
    outputTokens: 600_000,
  },
};

/**
 * Citizen catalog entries. Price and LEGAL_AI_QUERY quota are product
 * configuration — not hard-coded in LegalAiService.
 */
export const CITIZEN_BASIC_PLAN: SubscriptionPlanDefinition = {
  code: SubscriptionPlanCode.CITIZEN_BASIC,
  name: "TORE Citizen Basic",
  priceMnt: 19_900,
  seatLimit: 1,
  quotas: {
    caseAnalysis: 0,
    documentAnalysis: 5,
    legalAiQueries: 20,
  },
  tokenCeilings: {
    inputTokens: 200_000,
    outputTokens: 40_000,
  },
};

export const CITIZEN_PLUS_PLAN: SubscriptionPlanDefinition = {
  code: SubscriptionPlanCode.CITIZEN_PLUS,
  name: "TORE Citizen Plus",
  priceMnt: 49_900,
  seatLimit: 1,
  quotas: {
    caseAnalysis: 0,
    documentAnalysis: 15,
    legalAiQueries: 60,
  },
  tokenCeilings: {
    inputTokens: 500_000,
    outputTokens: 100_000,
  },
};

/** One complete legal-question thread without a paid citizen plan. */
export const UNPAID_CITIZEN_FREE_LEGAL_QUESTIONS = 1;
export const GUEST_FREE_LEGAL_QUESTIONS = 1;
export const GUEST_FREE_LEGAL_QUESTION_LIMIT = GUEST_FREE_LEGAL_QUESTIONS;
/** Warn in Legal AI when the paid period ends within this window. */
export const SUBSCRIPTION_EXPIRY_WARNING_MS = 3 * 24 * 60 * 60 * 1000;

export const CITIZEN_PLANS: readonly SubscriptionPlanCode[] = [
  SubscriptionPlanCode.CITIZEN_BASIC,
  SubscriptionPlanCode.CITIZEN_PLUS,
];

export const LAWYER_PLANS: readonly SubscriptionPlanCode[] = [
  SubscriptionPlanCode.SOLO,
  SubscriptionPlanCode.TEAM,
];

const PLANS: Record<SubscriptionPlanCode, SubscriptionPlanDefinition> = {
  [SubscriptionPlanCode.SOLO]: SOLO_PLAN,
  [SubscriptionPlanCode.TEAM]: TEAM_PLAN,
  [SubscriptionPlanCode.CITIZEN_BASIC]: CITIZEN_BASIC_PLAN,
  [SubscriptionPlanCode.CITIZEN_PLUS]: CITIZEN_PLUS_PLAN,
};

export function getPlanDefinition(
  code: SubscriptionPlanCode,
): SubscriptionPlanDefinition {
  return PLANS[code];
}

/** Catalog price for QPay verification. Unknown and unpriced plans return null. */
export function getPricedPlanDefinition(
  code: SubscriptionPlanCode,
): SubscriptionPlanDefinition | null {
  const plan: SubscriptionPlanDefinition | undefined = PLANS[code];
  if (!plan || plan.priceMnt <= 0) return null;
  return plan;
}

export const FEATURE_QUOTA_EXCEEDED_MESSAGES: Record<
  "CASE_ANALYSIS" | "DOCUMENT_ANALYSIS" | "LEGAL_AI_QUERY",
  string
> = {
  CASE_ANALYSIS:
    "Та энэ сарын нарийн хэрэг шинжилгээний хязгаарт хүрсэн байна. Багцаа сунгана уу.",
  DOCUMENT_ANALYSIS:
    "Та энэ сарын баримт бичгийн шинжилгээний хязгаарт хүрсэн байна. Багцаа сунгана уу.",
  LEGAL_AI_QUERY:
    "Та энэ сарын хууль зүйн AI асуултын хязгаарт хүрсэн байна. Багцаа сунгана уу.",
};

export const TOKEN_CEILING_USER_MESSAGE =
  "Таны энэ сарын AI хэрэглээний хязгаарт хүрсэн байна.";

export const ACCOUNT_SHARING_RESTRICTED_MESSAGE =
  "AI үйлдлийг түр хязгаарлалаа. Бусад төхөөрөмжөөс гарч, нууц үгээ солих эсвэл TORE Team-д шилжинэ үү.";

export const BILLING_REQUIRED_MESSAGE =
  "Таны TORE SOLO багц идэвхгүй байна. Төлбөр төлж багцаа идэвхжүүлнэ үү.";

export const CITIZEN_BILLING_REQUIRED_MESSAGE =
  "Шинэ хууль зүйн асуулт асуухад төлбөртэй багц шаардлагатай. Үнэгүй тодруулга энэ асуултын хүрээнд үргэлжилнэ.";

export const LEGAL_AI_AUTHENTICATION_REQUIRED_MESSAGE =
  "Үнэгүй хууль зүйн асуултынхаа хариуг авсан тул шинэ асуултад нэвтэрч, багц идэвхжүүлнэ үү.";
