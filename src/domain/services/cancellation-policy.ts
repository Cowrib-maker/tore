export type CancellationActor = "CLIENT" | "LAWYER" | "ADMIN" | "SYSTEM";

export interface CancellationPolicyConfig {
  /** Hours before start when client gets full refund. */
  fullRefundHoursBefore: number;
  /** Hours before start when partial refund applies. */
  partialRefundHoursBefore: number;
  /** Partial refund percentage (0–100). */
  partialRefundPercent: number;
}

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicyConfig = {
  fullRefundHoursBefore: 24,
  partialRefundHoursBefore: 2,
  partialRefundPercent: 50,
};

export interface CancellationRefundDecision {
  eligible: boolean;
  refundPercent: number;
  reason: string;
}

export function evaluateCancellationRefund(
  scheduledStartAt: Date,
  cancelledAt: Date,
  actor: CancellationActor,
  policy: CancellationPolicyConfig = DEFAULT_CANCELLATION_POLICY,
): CancellationRefundDecision {
  if (actor === "ADMIN" || actor === "SYSTEM") {
    return {
      eligible: true,
      refundPercent: 100,
      reason: "Administrative cancellation",
    };
  }

  if (actor === "LAWYER") {
    return {
      eligible: true,
      refundPercent: 100,
      reason: "Lawyer-initiated cancellation",
    };
  }

  const hoursUntilStart =
    (scheduledStartAt.getTime() - cancelledAt.getTime()) / (1000 * 60 * 60);

  if (hoursUntilStart >= policy.fullRefundHoursBefore) {
    return {
      eligible: true,
      refundPercent: 100,
      reason: `Cancelled at least ${policy.fullRefundHoursBefore} hours before start`,
    };
  }

  if (hoursUntilStart >= policy.partialRefundHoursBefore) {
    return {
      eligible: true,
      refundPercent: policy.partialRefundPercent,
      reason: `Cancelled within partial refund window (${policy.partialRefundHoursBefore}–${policy.fullRefundHoursBefore} hours)`,
    };
  }

  return {
    eligible: false,
    refundPercent: 0,
    reason: "Cancelled too close to consultation start",
  };
}

export function calculateRefundAmount(
  paidAmountMnt: number,
  refundPercent: number,
): number {
  if (refundPercent <= 0) {
    return 0;
  }

  if (refundPercent >= 100) {
    return paidAmountMnt;
  }

  return Math.round((paidAmountMnt * refundPercent) / 100);
}
