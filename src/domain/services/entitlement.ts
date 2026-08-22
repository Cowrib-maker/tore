import {
  FEATURE_QUOTA_EXCEEDED_MESSAGES,
  TOKEN_CEILING_USER_MESSAGE,
  getPlanDefinition,
  type SubscriptionPlanDefinition,
} from "@/domain/constants/subscription-plans";
import type { EntitlementUsage, Subscription } from "@/domain/entities/subscription";
import {
  EntitlementFeature,
  SubscriptionPlanCode,
  SubscriptionStatus,
} from "@/domain/enums";

export type LawyerEntitlement = {
  subscriptionId: string;
  planCode: SubscriptionPlanCode;
  status: SubscriptionStatus;
  seatLimit: number;
  quotas: SubscriptionPlanDefinition["quotas"];
  tokenCeilings: SubscriptionPlanDefinition["tokenCeilings"];
  periodStart: Date;
  periodEnd: Date;
};

export type PublicUsageSnapshot = {
  caseAnalysis: { used: number; limit: number };
  documentAnalysis: { used: number; limit: number };
  legalAiQueries: { used: number; limit: number };
};

export type QuotaDecision =
  | { ok: true }
  | { ok: false; kind: "FEATURE"; feature: EntitlementFeature; message: string }
  | { ok: false; kind: "TOKEN"; message: string };

export function utcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function utcMonthEnd(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export function isSubscriptionActive(
  subscription: Pick<Subscription, "status" | "currentPeriodEnd">,
  now: Date,
): boolean {
  if (subscription.status !== SubscriptionStatus.ACTIVE) {
    return false;
  }
  return subscription.currentPeriodEnd.getTime() > now.getTime();
}

/**
 * Server-authoritative entitlement. Plan quotas and seatLimit come from the
 * catalog keyed by subscription.planCode — never from client input.
 * Stored seatLimit is used when it is a positive integer so future TEAM
 * subscriptions can raise the cap without a catalog-only deploy.
 */
export function resolveLawyerEntitlement(
  subscription: Subscription,
  now: Date,
): LawyerEntitlement {
  const plan = getPlanDefinition(subscription.planCode);
  const seatLimit =
    Number.isInteger(subscription.seatLimit) && subscription.seatLimit >= 1
      ? subscription.seatLimit
      : plan.seatLimit;

  return {
    subscriptionId: subscription.id,
    planCode: subscription.planCode,
    status: subscription.status,
    seatLimit,
    quotas: plan.quotas,
    tokenCeilings: plan.tokenCeilings,
    periodStart: utcMonthStart(now),
    periodEnd: utcMonthEnd(now),
  };
}

export function emptyUsageCounts(): Pick<
  EntitlementUsage,
  | "caseAnalysisCount"
  | "documentAnalysisCount"
  | "legalAiQueryCount"
  | "inputTokens"
  | "outputTokens"
> {
  return {
    caseAnalysisCount: 0,
    documentAnalysisCount: 0,
    legalAiQueryCount: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
}

export function toPublicUsageSnapshot(
  entitlement: LawyerEntitlement,
  usage: Pick<
    EntitlementUsage,
    "caseAnalysisCount" | "documentAnalysisCount" | "legalAiQueryCount"
  > | null,
): PublicUsageSnapshot {
  return {
    caseAnalysis: {
      used: usage?.caseAnalysisCount ?? 0,
      limit: entitlement.quotas.caseAnalysis,
    },
    documentAnalysis: {
      used: usage?.documentAnalysisCount ?? 0,
      limit: entitlement.quotas.documentAnalysis,
    },
    legalAiQueries: {
      used: usage?.legalAiQueryCount ?? 0,
      limit: entitlement.quotas.legalAiQueries,
    },
  };
}

function usedForFeature(
  feature: EntitlementFeature,
  usage: ReturnType<typeof emptyUsageCounts>,
): number {
  switch (feature) {
    case EntitlementFeature.CASE_ANALYSIS:
      return usage.caseAnalysisCount;
    case EntitlementFeature.DOCUMENT_ANALYSIS:
      return usage.documentAnalysisCount;
    case EntitlementFeature.LEGAL_AI_QUERY:
      return usage.legalAiQueryCount;
  }
}

function limitForFeature(
  feature: EntitlementFeature,
  entitlement: LawyerEntitlement,
): number {
  switch (feature) {
    case EntitlementFeature.CASE_ANALYSIS:
      return entitlement.quotas.caseAnalysis;
    case EntitlementFeature.DOCUMENT_ANALYSIS:
      return entitlement.quotas.documentAnalysis;
    case EntitlementFeature.LEGAL_AI_QUERY:
      return entitlement.quotas.legalAiQueries;
  }
}

export function evaluateFeatureQuota(input: {
  feature: EntitlementFeature;
  entitlement: LawyerEntitlement;
  usage: ReturnType<typeof emptyUsageCounts> | null;
}): QuotaDecision {
  const usage = input.usage ?? emptyUsageCounts();

  if (
    usage.inputTokens >= input.entitlement.tokenCeilings.inputTokens ||
    usage.outputTokens >= input.entitlement.tokenCeilings.outputTokens
  ) {
    return { ok: false, kind: "TOKEN", message: TOKEN_CEILING_USER_MESSAGE };
  }

  const used = usedForFeature(input.feature, usage);
  const limit = limitForFeature(input.feature, input.entitlement);
  if (used >= limit) {
    return {
      ok: false,
      kind: "FEATURE",
      feature: input.feature,
      message: FEATURE_QUOTA_EXCEEDED_MESSAGES[input.feature],
    };
  }

  return { ok: true };
}
