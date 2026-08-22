import type { SubscriptionStatus } from "@/domain/enums";

export function addUtcCalendarMonth(from: Date): Date {
  const next = new Date(from.getTime());
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export type SoloPeriodDecision = {
  kind: "create" | "renew-active" | "restart";
  startsAt: Date;
  expiresAt: Date;
};

/**
 * First payment: starts now, +1 month.
 * Renewal while still ACTIVE and unexpired: extend from current expiresAt.
 * Renewal after expiry / cancelled / pending: restart from confirmation time.
 */
export function decideSoloSubscriptionPeriod(input: {
  now: Date;
  existing: {
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  } | null;
}): SoloPeriodDecision {
  const { now, existing } = input;
  if (!existing) {
    return {
      kind: "create",
      startsAt: now,
      expiresAt: addUtcCalendarMonth(now),
    };
  }

  if (
    existing.status === "ACTIVE" &&
    existing.currentPeriodEnd.getTime() > now.getTime()
  ) {
    return {
      kind: "renew-active",
      startsAt: existing.currentPeriodStart,
      expiresAt: addUtcCalendarMonth(existing.currentPeriodEnd),
    };
  }

  return {
    kind: "restart",
    startsAt: now,
    expiresAt: addUtcCalendarMonth(now),
  };
}
