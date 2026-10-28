import { NextResponse } from "next/server";

import { lawyerBillingDeps } from "@/application/common/lawyer-billing-http";
import { getSpellRuntime, requireActor, spellErrorResponse, spellJson } from "@/application/common/spell-http";
import { billingApiErrorResponse } from "@/application/use-cases/billing/qpay-callback-parse";
import { getOwnSpellPurchaseStatus } from "@/application/use-cases/spell/purchase-status";
import { DomainError } from "@/domain/errors/domain-error";
import { SpellError } from "@/domain/spell/errors";

/** GET /api/spell/purchase/:invoiceId — own purchase status (verifies a pending QPay payment server-side). */
export async function GET(_request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  try {
    const runtime = getSpellRuntime();
    const actor = await requireActor();
    const { invoiceId } = await context.params;
    const view = await getOwnSpellPurchaseStatus(actor, invoiceId, lawyerBillingDeps(), runtime.deps);
    return spellJson(view);
  } catch (error) {
    if (error instanceof SpellError) return spellErrorResponse(error);
    if (error instanceof DomainError) return billingApiErrorResponse(error) as NextResponse;
    return spellErrorResponse(error);
  }
}
