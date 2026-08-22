import type { Subscription } from "@/domain/entities/subscription";
import { SubscriptionStatus } from "@/domain/enums";
import { isSubscriptionActive } from "@/domain/services/entitlement";

export type BillingDisplayStatus =
  | "NONE"
  | "PENDING"
  | "ACTIVE"
  | "EXPIRED"
  | "CANCELED"
  | "PAST_DUE";

export function resolveBillingDisplayStatus(input: {
  now: Date;
  subscription: Subscription | null;
  hasPendingInvoice: boolean;
}): BillingDisplayStatus {
  const { subscription, now, hasPendingInvoice } = input;
  if (!subscription) {
    return hasPendingInvoice ? "PENDING" : "NONE";
  }

  if (isSubscriptionActive(subscription, now)) {
    return "ACTIVE";
  }

  if (subscription.status === SubscriptionStatus.ACTIVE) {
    return "EXPIRED";
  }
  if (subscription.status === SubscriptionStatus.PENDING) {
    return "PENDING";
  }
  if (subscription.status === SubscriptionStatus.CANCELED) {
    return "CANCELED";
  }
  if (subscription.status === SubscriptionStatus.PAST_DUE) {
    return "PAST_DUE";
  }
  if (subscription.status === SubscriptionStatus.EXPIRED) {
    return "EXPIRED";
  }

  return hasPendingInvoice ? "PENDING" : "NONE";
}

export function shouldPersistExpired(
  subscription: Subscription,
  now: Date,
): boolean {
  return (
    subscription.status === SubscriptionStatus.ACTIVE &&
    subscription.currentPeriodEnd.getTime() <= now.getTime()
  );
}
