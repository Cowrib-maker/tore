export const DEFAULT_CURRENCY = "MNT" as const;

export type Currency = typeof DEFAULT_CURRENCY;

export interface Money {
  amountMnt: number;
  currency: Currency;
}

export function money(amountMnt: number, currency: Currency = DEFAULT_CURRENCY): Money {
  return { amountMnt, currency };
}

export function assertPositiveAmount(amountMnt: number): void {
  if (!Number.isInteger(amountMnt) || amountMnt <= 0) {
    throw new Error("Amount must be a positive integer in MNT");
  }
}
