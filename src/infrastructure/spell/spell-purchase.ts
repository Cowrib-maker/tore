import type { Invoice } from "@/domain/entities/invoice";
import { fulfillSpellPurchase } from "@/application/use-cases/spell/purchase";
import { getSpellRuntime } from "./spell-runtime";

/**
 * Composition-root adapter used by the QPay processing path. Throws (and the
 * caller defers) when Spell is disabled or not configured; fulfilment is
 * idempotent and simply happens on the next callback / poll / visit.
 */
export async function fulfillSpellPurchaseFromRuntime(invoice: Invoice) {
  return fulfillSpellPurchase(invoice, getSpellRuntime().deps);
}
