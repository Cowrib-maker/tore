import { assertPositiveAmount } from "@/domain/value-objects/money";

export interface FeeBreakdown {
  amountMnt: number;
  platformFeeMnt: number;
  lawyerNetMnt: number;
}

export const DEFAULT_PLATFORM_FEE_PERCENT = 15;

export function calculatePlatformFee(
  amountMnt: number,
  feePercent: number = DEFAULT_PLATFORM_FEE_PERCENT,
): number {
  assertPositiveAmount(amountMnt);

  if (feePercent < 0 || feePercent > 100) {
    throw new Error("Platform fee percent must be between 0 and 100");
  }

  return Math.round((amountMnt * feePercent) / 100);
}

export function calculateFeeBreakdown(
  amountMnt: number,
  feePercent: number = DEFAULT_PLATFORM_FEE_PERCENT,
): FeeBreakdown {
  assertPositiveAmount(amountMnt);

  const platformFeeMnt = calculatePlatformFee(amountMnt, feePercent);
  const lawyerNetMnt = amountMnt - platformFeeMnt;

  return { amountMnt, platformFeeMnt, lawyerNetMnt };
}

export function parsePlatformFeePercent(settingValue: string | undefined): number {
  if (!settingValue) {
    return DEFAULT_PLATFORM_FEE_PERCENT;
  }

  const parsed = Number.parseInt(settingValue, 10);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
    return DEFAULT_PLATFORM_FEE_PERCENT;
  }

  return parsed;
}
