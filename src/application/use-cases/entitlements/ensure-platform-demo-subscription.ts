import type { ActorContext } from "@/application/common/actor-context";
import {
  CITIZEN_PLUS_PLAN,
  SOLO_PLAN,
} from "@/domain/constants/subscription-plans";
import {
  PLATFORM_DEMO_PROVIDER_INVOICE_ID,
  isPlatformDemoEmail,
} from "@/domain/constants/platform-demo-accounts";
import type { Subscription } from "@/domain/entities/subscription";
import {
  SeatStatus,
  SubscriptionStatus,
  UserRole,
} from "@/domain/enums";
import {
  DuplicateActiveSoloError,
  type SubscriptionRepository,
} from "@/domain/repositories/subscription-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import { isSubscriptionActive } from "@/domain/services/entitlement";

export type PlatformDemoSubscriptionDeps = {
  userRepository: Pick<UserRepository, "findById">;
  subscriptionRepository: SubscriptionRepository;
};

const DEMO_PERIOD_YEARS = 10;

/**
 * If the user is a hardcoded founder demo email, ensure an ACTIVE paid-tier
 * subscription exists (no QPay). Returns null for everyone else.
 */
export async function ensurePlatformDemoSubscription(
  actor: Pick<ActorContext, "userId" | "role">,
  deps: PlatformDemoSubscriptionDeps,
  now: Date = new Date(),
): Promise<Subscription | null> {
  const user = await deps.userRepository.findById(actor.userId);
  if (!isPlatformDemoEmail(user?.email)) {
    return null;
  }

  const active = await deps.subscriptionRepository.findActiveOwnedByUserId(
    actor.userId,
  );
  if (active && isSubscriptionActive(active, now)) {
    return active;
  }

  const plan =
    actor.role === UserRole.LAWYER ? SOLO_PLAN : CITIZEN_PLUS_PLAN;
  const periodEnd = new Date(now);
  periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + DEMO_PERIOD_YEARS);

  try {
    const created = await deps.subscriptionRepository.create({
      ownerUserId: actor.userId,
      planCode: plan.code,
      status: SubscriptionStatus.ACTIVE,
      seatLimit: plan.seatLimit,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      providerInvoiceId: PLATFORM_DEMO_PROVIDER_INVOICE_ID,
    });
    await deps.subscriptionRepository.createSeat({
      subscriptionId: created.id,
      userId: actor.userId,
      status: SeatStatus.ACTIVE,
    });
    return created;
  } catch (error) {
    if (!(error instanceof DuplicateActiveSoloError)) {
      throw error;
    }
    const raced = await deps.subscriptionRepository.findActiveOwnedByUserId(
      actor.userId,
    );
    if (raced && isSubscriptionActive(raced, now)) {
      return raced;
    }
    throw error;
  }
}

export async function isPlatformDemoUserId(
  userId: string,
  deps: Pick<PlatformDemoSubscriptionDeps, "userRepository">,
): Promise<boolean> {
  const user = await deps.userRepository.findById(userId);
  return isPlatformDemoEmail(user?.email);
}
