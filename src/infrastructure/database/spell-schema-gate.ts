import type { Prisma } from "@/generated/prisma/client";

/**
 * Deploy-order safety for the TORE Spell columns.
 *
 * The build does not run migrations, so the code can reach production before `20261006120000_spell_purchase_fields` has been applied. A plain
 * Prisma read selects EVERY mapped column, so `invoices.spell_plan_code` would break all invoice queries of the existing products
 * (billing, bookings, admin payments) even though Spell is switched off. Until Spell is enabled (`TORE_SPELL_V1=1`, which the deployment checklist
 * allows only after the migrations), the column is therefore left out of every Prisma query (a client-level `omit`) and never written.
 *
 * Operators: apply the Spell migrations first, then set TORE_SPELL_V1=1. With the flag on, the column is read and written as usual.
 */
export function spellColumnsOmit(spellEnabled: boolean): Prisma.GlobalOmitConfig {
  return { invoice: { spellPlanCode: !spellEnabled } };
}
