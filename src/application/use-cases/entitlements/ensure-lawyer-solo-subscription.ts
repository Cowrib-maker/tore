import type { ActorContext } from "@/application/common/actor-context";
import {
  BILLING_REQUIRED_MESSAGE,
  SOLO_PLAN,
} from "@/domain/constants/subscription-plans";
import type { Subscription } from "@/domain/entities/subscription";
import { SubscriptionStatus, UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import { EntitlementError } from "@/domain/errors/entitlement-error";
import type { SubscriptionRepository } from "@/domain/repositories/subscription-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import {
  isSubscriptionActive,
  resolveLawyerEntitlement,
  type LawyerEntitlement,
} from "@/domain/services/entitlement";
import { ensurePlatformDemoSubscription } from "@/application/use-cases/entitlements/ensure-platform-demo-subscription";

export type EntitlementDeps = {
  subscriptionRepository: SubscriptionRepository;
  userRepository?: Pick<UserRepository, "findById">;
};

export function assertLawyerEntitlementActor(actor: ActorContext): void {
  if (actor.role !== UserRole.LAWYER) {
    throw new ForbiddenError();
  }
}

/**
 * Resolve an already-paid, unexpired lawyer subscription.
 * Does not create or activate access — QPay verification does that.
 */
export async function requireActiveLawyerEntitlement(
  actor: ActorContext,
  deps: EntitlementDeps,
  now: Date = new Date(),
): Promise<{ subscription: Subscription; entitlement: LawyerEntitlement }> {
  assertLawyerEntitlementActor(actor);

  const seated = await deps.subscriptionRepository.findActiveSeatForUser(
    actor.userId,
  );
  if (seated && isSubscriptionActive(seated.subscription, now)) {
    return {
      subscription: seated.subscription,
      entitlement: resolveLawyerEntitlement(seated.subscription, now),
    };
  }

  const owned = await deps.subscriptionRepository.findActiveOwnedByUserId(
    actor.userId,
  );
  if (owned && isSubscriptionActive(owned, now)) {
    return {
      subscription: owned,
      entitlement: resolveLawyerEntitlement(owned, now),
    };
  }

  if (deps.userRepository) {
    const demo = await ensurePlatformDemoSubscription(actor, {
      userRepository: deps.userRepository,
      subscriptionRepository: deps.subscriptionRepository,
    }, now);
    if (demo) {
      return {
        subscription: demo,
        entitlement: resolveLawyerEntitlement(demo, now),
      };
    }
  }

  const latest = await deps.subscriptionRepository.findLatestOwnedByUserId(
    actor.userId,
    SOLO_PLAN.code,
  );
  if (latest?.status === SubscriptionStatus.PENDING) {
    throw new EntitlementError(BILLING_REQUIRED_MESSAGE, "BILLING_REQUIRED", 402);
  }

  throw new EntitlementError(BILLING_REQUIRED_MESSAGE, "BILLING_REQUIRED", 402);
}

/** @deprecated Use requireActiveLawyerEntitlement. Never auto-provisions. */
export async function ensureLawyerSoloSubscription(
  actor: ActorContext,
  deps: EntitlementDeps,
  now: Date = new Date(),
): Promise<{ subscription: Subscription; entitlement: LawyerEntitlement }> {
  return requireActiveLawyerEntitlement(actor, deps, now);
}
