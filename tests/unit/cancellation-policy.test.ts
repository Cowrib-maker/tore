import { describe, expect, it } from "vitest";

import {
  DEFAULT_CANCELLATION_POLICY,
  calculateRefundAmount,
  evaluateCancellationRefund,
} from "@/domain/services/cancellation-policy";

describe("evaluateCancellationRefund", () => {
  const start = new Date("2026-08-10T12:00:00.000Z");

  it("gives full refund for lawyer and admin actors", () => {
    const cancelledAt = new Date("2026-08-10T11:50:00.000Z");
    expect(
      evaluateCancellationRefund(start, cancelledAt, "LAWYER").refundPercent,
    ).toBe(100);
    expect(
      evaluateCancellationRefund(start, cancelledAt, "ADMIN").refundPercent,
    ).toBe(100);
  });

  it("gives full refund when client cancels early enough", () => {
    const cancelledAt = new Date("2026-08-09T11:00:00.000Z");
    const decision = evaluateCancellationRefund(start, cancelledAt, "CLIENT");
    expect(decision.eligible).toBe(true);
    expect(decision.refundPercent).toBe(100);
  });

  it("gives partial refund inside the partial window", () => {
    const cancelledAt = new Date("2026-08-10T09:00:00.000Z"); // 3h before
    const decision = evaluateCancellationRefund(
      start,
      cancelledAt,
      "CLIENT",
      DEFAULT_CANCELLATION_POLICY,
    );
    expect(decision.eligible).toBe(true);
    expect(decision.refundPercent).toBe(50);
  });

  it("denies refund when cancelled too late", () => {
    const cancelledAt = new Date("2026-08-10T11:30:00.000Z"); // 0.5h before
    const decision = evaluateCancellationRefund(start, cancelledAt, "CLIENT");
    expect(decision.eligible).toBe(false);
    expect(decision.refundPercent).toBe(0);
  });
});

describe("calculateRefundAmount", () => {
  it("computes percent of paid amount", () => {
    expect(calculateRefundAmount(10000, 50)).toBe(5000);
    expect(calculateRefundAmount(10000, 0)).toBe(0);
    expect(calculateRefundAmount(10000, 100)).toBe(10000);
  });
});
