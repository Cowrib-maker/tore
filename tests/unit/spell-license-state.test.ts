import { describe, expect, it } from "vitest";

import {
  SpellEffectiveLicenseStatus as S,
  SpellLicenseStatus,
} from "@/domain/spell/enums";
import {
  addDays,
  addUtcMonths,
  deriveLicenseState,
} from "@/domain/spell/license-state";
import {
  DEFAULT_SPELL_POLICY,
  validateSpellPolicy,
} from "@/domain/spell/policy";
import { getSpellPlan, isSpellPlanCode } from "@/domain/spell/plans";
import { SpellPlanCode } from "@/domain/spell/enums";

const d = (s: string) => new Date(s);

describe("deriveLicenseState (server-authoritative, time-derived)", () => {
  const redeemBy = d("2026-12-01T00:00:00Z");
  const startsAt = d("2026-10-01T00:00:00Z");
  const expiresAt = d("2026-11-01T00:00:00Z");

  const cases: {
    name: string;
    license: Parameters<typeof deriveLicenseState>[0];
    now: string;
    status: S;
    redeemed: boolean;
    because?: string | null;
  }[] = [
    { name: "unredeemed, inside window", license: { status: SpellLicenseStatus.ACTIVE, redeemBy, startsAt: null, expiresAt: null }, now: "2026-11-30T23:59:59.999Z", status: S.ACTIVE, redeemed: false },
    { name: "unredeemed, exactly at redeemBy → expired", license: { status: SpellLicenseStatus.ACTIVE, redeemBy, startsAt: null, expiresAt: null }, now: "2026-12-01T00:00:00.000Z", status: S.EXPIRED, redeemed: false, because: "REDEEM_WINDOW_CLOSED" },
    { name: "redeemed, before expiry", license: { status: SpellLicenseStatus.ACTIVE, redeemBy, startsAt, expiresAt }, now: "2026-10-31T23:59:59.999Z", status: S.ACTIVE, redeemed: true },
    { name: "redeemed, exactly at expiry → expired", license: { status: SpellLicenseStatus.ACTIVE, redeemBy, startsAt, expiresAt }, now: "2026-11-01T00:00:00.000Z", status: S.EXPIRED, redeemed: true, because: "TERM_ENDED" },
    { name: "redeemed, past expiry", license: { status: SpellLicenseStatus.ACTIVE, redeemBy, startsAt, expiresAt }, now: "2027-01-01T00:00:00Z", status: S.EXPIRED, redeemed: true, because: "TERM_ENDED" },
    { name: "revoked before redeem", license: { status: SpellLicenseStatus.REVOKED, redeemBy, startsAt: null, expiresAt: null }, now: "2026-10-02T00:00:00Z", status: S.REVOKED, redeemed: false },
    { name: "revoked mid-term", license: { status: SpellLicenseStatus.REVOKED, redeemBy, startsAt, expiresAt }, now: "2026-10-15T00:00:00Z", status: S.REVOKED, redeemed: true },
    { name: "revoked wins over expired", license: { status: SpellLicenseStatus.REVOKED, redeemBy, startsAt, expiresAt }, now: "2027-06-01T00:00:00Z", status: S.REVOKED, redeemed: true },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const state = deriveLicenseState(c.license, d(c.now));
      expect(state.status).toBe(c.status);
      expect(state.redeemed).toBe(c.redeemed);
      if (c.because !== undefined) expect(state.expiredBecause).toBe(c.because);
    });
  }
});

describe("addUtcMonths", () => {
  it("adds calendar months and clamps to month end", () => {
    expect(addUtcMonths(d("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addUtcMonths(d("2028-01-31T10:00:00Z"), 1).toISOString()).toBe("2028-02-29T10:00:00.000Z");
    expect(addUtcMonths(d("2026-10-05T09:00:00Z"), 3).toISOString()).toBe("2027-01-05T09:00:00.000Z");
    expect(addUtcMonths(d("2026-10-05T09:00:00Z"), 12).toISOString()).toBe("2027-10-05T09:00:00.000Z");
    expect(addUtcMonths(d("2026-08-31T00:00:00Z"), 6).toISOString()).toBe("2027-02-28T00:00:00.000Z");
  });
  it("rejects non-positive or fractional durations", () => {
    expect(() => addUtcMonths(new Date(), 0)).toThrow();
    expect(() => addUtcMonths(new Date(), 1.5)).toThrow();
  });
  it("addDays is exact", () => {
    expect(addDays(d("2026-10-05T00:00:00Z"), 90).toISOString()).toBe("2027-01-03T00:00:00.000Z");
  });
});

describe("plans", () => {
  it("offers exactly 1/3/6/12 month plans", () => {
    expect(Object.values(SpellPlanCode).map((c) => getSpellPlan(c).durationMonths)).toEqual([1, 3, 6, 12]);
    expect(isSpellPlanCode("SPELL_12M")).toBe(true);
    expect(isSpellPlanCode("SPELL_2M")).toBe(false);
    expect(isSpellPlanCode("toString")).toBe(false);
  });
});

describe("policy limits (no silent weakening of revocation)", () => {
  it("defaults match the approved business rules", () => {
    expect(DEFAULT_SPELL_POLICY.redeemByDays).toBe(90);
    expect(DEFAULT_SPELL_POLICY.transferCooldownDays).toBe(30);
    expect(DEFAULT_SPELL_POLICY.tokenMaxOfflineSeconds).toBe(24 * 3600);
    expect(DEFAULT_SPELL_POLICY.tokenRefreshIntervalSeconds).toBe(12 * 3600);
    expect(validateSpellPolicy(DEFAULT_SPELL_POLICY)).toEqual([]);
  });
  it("rejects offline windows outside 1h..7d and refresh >= offline", () => {
    const p = DEFAULT_SPELL_POLICY;
    expect(validateSpellPolicy({ ...p, tokenMaxOfflineSeconds: 8 * 86400 })).not.toEqual([]);
    expect(validateSpellPolicy({ ...p, tokenMaxOfflineSeconds: 60 })).not.toEqual([]);
    expect(validateSpellPolicy({ ...p, tokenRefreshIntervalSeconds: p.tokenMaxOfflineSeconds })).not.toEqual([]);
    expect(validateSpellPolicy({ ...p, tokenRefreshIntervalSeconds: 10 })).not.toEqual([]);
    expect(validateSpellPolicy({ ...p, requestSkewSeconds: 3600 })).not.toEqual([]);
    expect(validateSpellPolicy({ ...p, redeemByDays: 0 })).not.toEqual([]);
    expect(validateSpellPolicy({ ...p, transferCooldownDays: 0 })).toEqual([]);
  });
});
