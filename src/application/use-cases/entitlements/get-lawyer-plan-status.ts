import type { ActorContext } from "@/application/common/actor-context";
import { assertLawyerEntitlementActor } from "@/application/use-cases/entitlements/ensure-lawyer-solo-subscription";
import { findActiveManualInvoice } from "@/application/use-cases/billing/billing-center-view";
import { SOLO_PLAN, getPlanDefinition } from "@/domain/constants/subscription-plans";
import type { InvoiceRepository } from "@/domain/repositories/invoice-repository";
import type { SubscriptionRepository } from "@/domain/repositories/subscription-repository";
import {
  resolveBillingDisplayStatus,
  type BillingDisplayStatus,
} from "@/domain/services/billing-display-status";
import { isSubscriptionActive } from "@/domain/services/entitlement";

export type LawyerPlanStatusDeps = {
  subscriptionRepository: Pick<SubscriptionRepository, "findLatestOwnedByUserId">;
  invoiceRepository: Pick<InvoiceRepository, "listByUserId">;
};

export type LawyerPlanStatus = {
  planName: string;
  billingRequired: boolean;
  subscriptionStatus: BillingDisplayStatus;
  expiresAt: Date | null;
  /** Only the status of the open invoice; no payment details. */
  pendingInvoice: { status: string } | null;
};

/**
 * Read-only plan status for the workspace sidebar. Uses the same lookups and
 * display rules as getLawyerBillingSnapshot (latest owned subscription,
 * resolveBillingDisplayStatus, the open-invoice rule the billing page uses) but
 * performs no writes: it does not touch or create device sessions, does not
 * persist an expiry, does not create a usage row and does not provision demo
 * subscriptions. It grants nothing and reports no usage counters.
 */
export async function getLawyerPlanStatus(
  actor: ActorContext,
  deps: LawyerPlanStatusDeps,
  now: Date = new Date(),
): Promise<LawyerPlanStatus> {
  assertLawyerEntitlementActor(actor);

  const [subscription, history] = await Promise.all([
    deps.subscriptionRepository.findLatestOwnedByUserId(actor.userId, SOLO_PLAN.code),
    deps.invoiceRepository.listByUserId(actor.userId),
  ]);
  const pending = findActiveManualInvoice(history, now);
  const active = subscription ? isSubscriptionActive(subscription, now) : false;
  const plan = subscription ? getPlanDefinition(subscription.planCode) : SOLO_PLAN;

  return {
    planName: plan.name,
    billingRequired: !active,
    subscriptionStatus: resolveBillingDisplayStatus({
      now,
      subscription,
      hasPendingInvoice: Boolean(pending),
    }),
    expiresAt: subscription?.currentPeriodEnd ?? null,
    pendingInvoice: pending ? { status: pending.status } : null,
  };
}
