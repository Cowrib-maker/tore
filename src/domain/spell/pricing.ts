import { getSpellPlan, isSpellPlanCode } from "./plans";
import { SpellPlanCode } from "./enums";

/**
 * The ONE server-side source of TORE Spell prices (MNT, whole tugrik).
 *
 * The repository deliberately contains no price (see plans.ts): prices are
 * configuration, set per environment as JSON in `SPELL_PRICES_MNT`, e.g.
 *   SPELL_PRICES_MNT={"SPELL_1M":0,"SPELL_3M":0,"SPELL_6M":0,"SPELL_12M":0}
 * (substitute the real amounts). A plan with a missing/invalid price is
 * "not for sale": it is shown as «Үнэ удахгүй» and the server refuses to
 * create an invoice for it. The browser never supplies a price.
 */
export const SPELL_PRICES_ENV = "SPELL_PRICES_MNT";
const PLAN_ORDER = [SpellPlanCode.SPELL_1M, SpellPlanCode.SPELL_3M, SpellPlanCode.SPELL_6M, SpellPlanCode.SPELL_12M];
const MAX_PRICE_MNT = 100_000_000;

export type SpellPlanPrice = {
  code: SpellPlanCode;
  durationMonths: number;
  /** Null = no price configured: not purchasable. */
  priceMnt: number | null;
};

export function parseSpellPrices(raw: string | undefined | null): Partial<Record<SpellPlanCode, number>> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: Partial<Record<SpellPlanCode, number>> = {};
  for (const [code, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isSpellPlanCode(code)) continue;
    if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_PRICE_MNT) {
      out[code] = value;
    }
  }
  return out;
}

export function getSpellPriceList(env: Record<string, string | undefined> = process.env): SpellPlanPrice[] {
  const prices = parseSpellPrices(env[SPELL_PRICES_ENV]);
  return PLAN_ORDER.map((code) => ({
    code,
    durationMonths: getSpellPlan(code).durationMonths,
    priceMnt: prices[code] ?? null,
  }));
}

export function getSpellPriceMnt(code: SpellPlanCode, env: Record<string, string | undefined> = process.env): number | null {
  return getSpellPriceList(env).find((p) => p.code === code)?.priceMnt ?? null;
}
