import type { Subscription } from "@/domain/entities/subscription";
import { SeatStatus, SubscriptionStatus, type SubscriptionPlanCode } from "@/domain/enums";
import type { BillingRepositories } from "@/domain/ports/billing-unit-of-work";
import { DuplicateActiveSoloError } from "@/domain/repositories/subscription-repository";
import { getPlanDefinition } from "@/domain/constants/subscription-plans";
import { decideSoloSubscriptionPeriod } from "@/domain/services/subscription-period";

/**
 * The single subscription-activation path for every payment provider
 * (QPay callback, manual bank-transfer/QR admin verification, and any
 * future provider). Creates the owner's first ACTIVE subscription+seat,
 * or extends/renews an existing one — never a second, provider-specific
 * activation routine. Must run inside the same billing transaction as
 * the invoice/payment-transaction write that establishes PAID, so a
 * payment can never be marked PAID without the entitlement it paid for
 * also being granted (or vice versa).
 */
export async function activateOrRenewPaidSubscription(input: {
  userId: string;
  planCode: SubscriptionPlanCode;
  providerInvoiceId: string;
  now: Date;
  repos: BillingRepositories;
}): Promise<Subscription> {
  const plan = getPlanDefinition(input.planCode);
  const existing = await input.repos.subscriptionRepository.findLatestOwnedByUserId(
    input.userId,
    input.planCode,
  );
  const decision = decideSoloSubscriptionPeriod({
    now: input.now,
    existing,
  });

  if (!existing) {
    try {
      const created = await input.repos.subscriptionRepository.create({
        ownerUserId: input.userId,
        planCode: plan.code,
        status: SubscriptionStatus.ACTIVE,
        seatLimit: plan.seatLimit,
        currentPeriodStart: decision.startsAt,
        currentPeriodEnd: decision.expiresAt,
        providerInvoiceId: input.providerInvoiceId,
      });
      await input.repos.subscriptionRepository.createSeat({
        subscriptionId: created.id,
        userId: input.userId,
        status: SeatStatus.ACTIVE,
      });
      return created;
    } catch (error) {
      if (error instanceof DuplicateActiveSoloError) {
        const raced = await input.repos.subscriptionRepository.findLatestOwnedByUserId(
          input.userId,
          input.planCode,
        );
        if (raced) {
          return applyPeriod(raced, input);
        }
      }
      throw error;
    }
  }

  return applyPeriod(existing, input);
}

async function applyPeriod(
  existing: Subscription,
  input: {
    now: Date;
    providerInvoiceId: string;
    repos: BillingRepositories;
  },
): Promise<Subscription> {
  const decision = decideSoloSubscriptionPeriod({
    now: input.now,
    existing,
  });
  const updated = await input.repos.subscriptionRepository.updatePeriod(existing.id, {
    status: SubscriptionStatus.ACTIVE,
    currentPeriodStart: decision.startsAt,
    currentPeriodEnd: decision.expiresAt,
    providerInvoiceId: input.providerInvoiceId,
  });
  const seats = await input.repos.subscriptionRepository.listSeats(updated.id);
  const hasSeat = seats.some(
    (seat) => seat.userId === existing.ownerUserId && seat.status === SeatStatus.ACTIVE,
  );
  if (!hasSeat) {
    await input.repos.subscriptionRepository.createSeat({
      subscriptionId: updated.id,
      userId: existing.ownerUserId,
      status: SeatStatus.ACTIVE,
    });
  }
  return updated;
}
