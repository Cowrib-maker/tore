import type { ActorContext } from "@/application/common/actor-context";
import {
  CITIZEN_BILLING_REQUIRED_MESSAGE,
  CITIZEN_PLANS,
} from "@/domain/constants/subscription-plans";
import { EntitlementFeature, UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import { EntitlementError } from "@/domain/errors/entitlement-error";
import type { EntitlementUsageRepository } from "@/domain/repositories/entitlement-usage-repository";
import type { SubscriptionRepository } from "@/domain/repositories/subscription-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import {
  emptyUsageCounts,
  evaluateFeatureQuota,
  isSubscriptionActive,
  resolveLawyerEntitlement,
} from "@/domain/services/entitlement";
import { consumeLawyerFeatureUsage } from "@/application/use-cases/entitlements/assert-lawyer-ai-operation";
import {
  ensurePlatformDemoSubscription,
  isPlatformDemoUserId,
} from "@/application/use-cases/entitlements/ensure-platform-demo-subscription";

export type CitizenAiGuardDeps = {
  subscriptionRepository: SubscriptionRepository;
  entitlementUsageRepository: EntitlementUsageRepository;
  userRepository?: Pick<UserRepository, "findById">;
};

export type CitizenAiGuardResult = {
  usageId: string;
};

export async function assertCitizenAiOperation(
  actor: ActorContext,
  feature: EntitlementFeature,
  deps: CitizenAiGuardDeps,
  now: Date = new Date(),
): Promise<CitizenAiGuardResult> {
  if (actor.role !== UserRole.CLIENT) {
    throw new ForbiddenError();
  }

  if (deps.userRepository) {
    await ensurePlatformDemoSubscription(actor, {
      userRepository: deps.userRepository,
      subscriptionRepository: deps.subscriptionRepository,
    }, now);
  }

  const seated = await deps.subscriptionRepository.findActiveSeatForUser(
    actor.userId,
  );
  const owned =
    seated?.subscription ??
    (await deps.subscriptionRepository.findActiveOwnedByUserId(actor.userId));
  if (
    !owned ||
    !isSubscriptionActive(owned, now) ||
    !CITIZEN_PLANS.includes(owned.planCode)
  ) {
    throw new EntitlementError(
      CITIZEN_BILLING_REQUIRED_MESSAGE,
      "BILLING_REQUIRED",
      402,
    );
  }

  const entitlement = resolveLawyerEntitlement(owned, now);
  const usage = await deps.entitlementUsageRepository.getOrCreate({
    userId: actor.userId,
    subscriptionId: owned.id,
    periodStart: entitlement.periodStart,
  });

  const demoUser =
    deps.userRepository != null &&
    (await isPlatformDemoUserId(actor.userId, {
      userRepository: deps.userRepository,
    }));

  if (!demoUser) {
    const decision = evaluateFeatureQuota({
      feature,
      entitlement,
      usage: usage ?? emptyUsageCounts(),
    });
    if (!decision.ok) {
      throw new EntitlementError(
        decision.message,
        decision.kind === "TOKEN" ? "TOKEN_CEILING_REACHED" : "FEATURE_QUOTA_EXCEEDED",
      );
    }
  }

  return { usageId: usage.id };
}

export async function recordCitizenFeatureUsage(
  usageId: string,
  feature: EntitlementFeature,
  deps: Pick<CitizenAiGuardDeps, "entitlementUsageRepository">,
): Promise<void> {
  await consumeLawyerFeatureUsage(usageId, feature, deps);
}
