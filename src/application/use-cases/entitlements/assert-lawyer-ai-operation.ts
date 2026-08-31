import type { ActorContext } from "@/application/common/actor-context";
import type { SessionProtectionPolicy } from "@/domain/constants/session-protection-policy";
import {
  ACCOUNT_SHARING_RESTRICTED_MESSAGE,
} from "@/domain/constants/subscription-plans";
import type { DeviceSession } from "@/domain/entities/subscription";
import { EntitlementFeature } from "@/domain/enums";
import { EntitlementError } from "@/domain/errors/entitlement-error";
import type { DeviceSessionRepository } from "@/domain/repositories/device-session-repository";
import type { EntitlementUsageRepository } from "@/domain/repositories/entitlement-usage-repository";
import type { SubscriptionRepository } from "@/domain/repositories/subscription-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import {
  evaluateAccountSharingRisk,
  shouldRestrictExpensiveOps,
  type AccountSharingRiskResult,
} from "@/domain/services/account-sharing-risk";
import {
  evaluateFeatureQuota,
  emptyUsageCounts,
  type LawyerEntitlement,
} from "@/domain/services/entitlement";
import { requireActiveLawyerEntitlement } from "@/application/use-cases/entitlements/ensure-lawyer-solo-subscription";
import { isPlatformDemoUserId } from "@/application/use-cases/entitlements/ensure-platform-demo-subscription";
import { touchDeviceSession } from "@/application/use-cases/sessions/touch-device-session";

export type LawyerAiGuardDeps = {
  subscriptionRepository: SubscriptionRepository;
  deviceSessionRepository: DeviceSessionRepository;
  entitlementUsageRepository: EntitlementUsageRepository;
  userRepository?: Pick<UserRepository, "findById">;
};

export type LawyerAiGuardContext = {
  actor: ActorContext;
  sessionIdFromCookie?: string | null;
  userAgent?: string | null;
  ipHash?: string | null;
  now?: Date;
  policy: SessionProtectionPolicy;
  feature: EntitlementFeature;
  checkQuota?: boolean;
};

export type LawyerAiGuardResult = {
  entitlement: LawyerEntitlement;
  session: DeviceSession;
  risk: AccountSharingRiskResult;
  usageId: string;
};

export async function assertLawyerAiOperation(
  input: LawyerAiGuardContext,
  deps: LawyerAiGuardDeps,
): Promise<LawyerAiGuardResult> {
  const now = input.now ?? new Date();
  const { subscription, entitlement } = await requireActiveLawyerEntitlement(
    input.actor,
    deps,
    now,
  );

  const session = await touchDeviceSession(
    {
      userId: input.actor.userId,
      subscriptionId: subscription.id,
      sessionIdFromCookie: input.sessionIdFromCookie,
      userAgent: input.userAgent,
      ipHash: input.ipHash,
      now,
      policy: input.policy,
    },
    deps,
  );

  const activeSessions = await deps.deviceSessionRepository.listActiveByUserId(
    input.actor.userId,
  );
  const risk = evaluateAccountSharingRisk({
    now,
    policy: input.policy,
    sessions: activeSessions,
  });

  const demoUser =
    deps.userRepository != null &&
    (await isPlatformDemoUserId(input.actor.userId, {
      userRepository: deps.userRepository,
    }));

  if (!demoUser && shouldRestrictExpensiveOps(risk, input.policy)) {
    throw new EntitlementError(
      ACCOUNT_SHARING_RESTRICTED_MESSAGE,
      "ACCOUNT_SHARING_RESTRICTED",
    );
  }

  const usage = await deps.entitlementUsageRepository.getOrCreate({
    userId: input.actor.userId,
    subscriptionId: subscription.id,
    periodStart: entitlement.periodStart,
  });
  if (input.checkQuota !== false && !demoUser) {
    const decision = evaluateFeatureQuota({
      feature: input.feature,
      entitlement,
      usage: usage ?? emptyUsageCounts(),
    });
    if (!decision.ok) {
      throw new EntitlementError(
        decision.message,
        decision.kind === "TOKEN"
          ? "TOKEN_CEILING_REACHED"
          : "FEATURE_QUOTA_EXCEEDED",
      );
    }
  }

  return { entitlement, session, risk, usageId: usage.id };
}

export async function consumeLawyerFeatureUsage(
  usageId: string,
  feature: EntitlementFeature,
  deps: Pick<LawyerAiGuardDeps, "entitlementUsageRepository">,
  tokens?: { inputTokens?: number; outputTokens?: number },
): Promise<void> {
  await deps.entitlementUsageRepository.increment(usageId, {
    caseAnalysisCount: feature === EntitlementFeature.CASE_ANALYSIS ? 1 : 0,
    documentAnalysisCount:
      feature === EntitlementFeature.DOCUMENT_ANALYSIS ? 1 : 0,
    legalAiQueryCount: feature === EntitlementFeature.LEGAL_AI_QUERY ? 1 : 0,
    inputTokens: tokens?.inputTokens ?? 0,
    outputTokens: tokens?.outputTokens ?? 0,
  });
}
