import { describe, expect, it } from "vitest";

import {
  calculateFeeBreakdown,
  calculatePlatformFee,
  parsePlatformFeePercent,
} from "@/domain/services/fee-calculator";

describe("calculatePlatformFee", () => {
  it("rounds the default 15% fee", () => {
    expect(calculatePlatformFee(10000)).toBe(1500);
  });

  it("rejects invalid fee percents", () => {
    expect(() => calculatePlatformFee(1000, -1)).toThrow();
    expect(() => calculatePlatformFee(1000, 101)).toThrow();
  });
});

describe("calculateFeeBreakdown", () => {
  it("splits amount into fee and lawyer net", () => {
    expect(calculateFeeBreakdown(10000, 15)).toEqual({
      amountMnt: 10000,
      platformFeeMnt: 1500,
      lawyerNetMnt: 8500,
    });
  });
});

describe("parsePlatformFeePercent", () => {
  it("returns default for missing or invalid values", () => {
    expect(parsePlatformFeePercent(undefined)).toBe(15);
    expect(parsePlatformFeePercent("abc")).toBe(15);
    expect(parsePlatformFeePercent("150")).toBe(15);
  });

  it("parses a valid integer percent", () => {
    expect(parsePlatformFeePercent("20")).toBe(20);
  });
});
