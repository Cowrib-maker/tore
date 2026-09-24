import { describe, expect, it } from "vitest";

import { generateManualPaymentCode } from "@/domain/services/manual-payment-code";

describe("generateManualPaymentCode", () => {
  it("is always exactly 4 digits, zero-padded, in range 0000-9999", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateManualPaymentCode();
      expect(code).toMatch(/^\d{4}$/);
      const value = Number(code);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(9999);
    }
  });

  it("does not always return the same code (uses real randomness, not a fixed value)", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateManualPaymentCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
