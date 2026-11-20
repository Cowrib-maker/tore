import {
  SpellEffectiveLicenseStatus,
  SpellLicenseStatus,
} from "./enums";
import type { SpellLicense } from "./entities";

export type DerivedLicenseState = {
  status: SpellEffectiveLicenseStatus;
  /** True once the term clock has started (first activation happened). */
  redeemed: boolean;
  /** Why an EXPIRED license is expired. */
  expiredBecause: "TERM_ENDED" | "REDEEM_WINDOW_CLOSED" | null;
};

type LicenseTimes = Pick<
  SpellLicense,
  "status" | "redeemBy" | "startsAt" | "expiresAt"
>;

/**
 * Server-authoritative license state. `EXPIRED` is always derived from the
 * clock, never read from a stored column and never trusted from a client.
 * Boundaries are exclusive on the upper side: at `expiresAt` the license is
 * already expired.
 */
export function deriveLicenseState(
  license: LicenseTimes,
  now: Date,
): DerivedLicenseState {
  const redeemed = license.startsAt !== null && license.expiresAt !== null;

  if (license.status === SpellLicenseStatus.REVOKED) {
    return {
      status: SpellEffectiveLicenseStatus.REVOKED,
      redeemed,
      expiredBecause: null,
    };
  }
  if (!redeemed) {
    return now.getTime() >= license.redeemBy.getTime()
      ? {
          status: SpellEffectiveLicenseStatus.EXPIRED,
          redeemed,
          expiredBecause: "REDEEM_WINDOW_CLOSED",
        }
      : {
          status: SpellEffectiveLicenseStatus.ACTIVE,
          redeemed,
          expiredBecause: null,
        };
  }
  return now.getTime() >= license.expiresAt!.getTime()
    ? {
        status: SpellEffectiveLicenseStatus.EXPIRED,
        redeemed,
        expiredBecause: "TERM_ENDED",
      }
    : {
        status: SpellEffectiveLicenseStatus.ACTIVE,
        redeemed,
        expiredBecause: null,
      };
}

/**
 * Add calendar months in UTC, clamping to the last day of the target month
 * (Jan 31 + 1 month = Feb 28/29), preserving time of day.
 */
export function addUtcMonths(from: Date, months: number): Date {
  if (!Number.isInteger(months) || months < 1) {
    throw new Error("months must be a positive integer");
  }
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(from.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
