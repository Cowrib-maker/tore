import { SpellPlanCode, SpellProduct } from "./enums";

/**
 * Server-side Spell plan catalog (same pattern as `subscription-plans.ts`).
 * Issued licenses snapshot `durationMonths`, so editing this catalog never
 * changes a license that already exists. Prices are intentionally absent:
 * pricing arrives with the QPay phase.
 */
export type SpellPlanDefinition = {
  code: SpellPlanCode;
  product: SpellProduct;
  name: string;
  durationMonths: number;
};

const PLANS: Record<SpellPlanCode, SpellPlanDefinition> = {
  [SpellPlanCode.SPELL_1M]: {
    code: SpellPlanCode.SPELL_1M,
    product: SpellProduct.TORE_SPELL,
    name: "TORE Spell · 1 сар",
    durationMonths: 1,
  },
  [SpellPlanCode.SPELL_3M]: {
    code: SpellPlanCode.SPELL_3M,
    product: SpellProduct.TORE_SPELL,
    name: "TORE Spell · 3 сар",
    durationMonths: 3,
  },
  [SpellPlanCode.SPELL_6M]: {
    code: SpellPlanCode.SPELL_6M,
    product: SpellProduct.TORE_SPELL,
    name: "TORE Spell · 6 сар",
    durationMonths: 6,
  },
  [SpellPlanCode.SPELL_12M]: {
    code: SpellPlanCode.SPELL_12M,
    product: SpellProduct.TORE_SPELL,
    name: "TORE Spell · 12 сар",
    durationMonths: 12,
  },
};

export function getSpellPlan(code: SpellPlanCode): SpellPlanDefinition {
  const plan = PLANS[code];
  if (!plan) {
    throw new Error(`Unknown Spell plan: ${String(code)}`);
  }
  return plan;
}

export function isSpellPlanCode(value: unknown): value is SpellPlanCode {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PLANS, value)
  );
}
