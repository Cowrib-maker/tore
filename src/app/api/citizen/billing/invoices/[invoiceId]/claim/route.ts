import { NextResponse } from "next/server";

import { manualBillingDeps } from "@/application/common/lawyer-billing-http";
import { requireActor } from "@/application/common/require-actor";
import { enforceRateLimit } from "@/application/common/rate-limit-action";
import { claimManualPayment } from "@/application/use-cases/billing/claim-manual-payment";
import { billingApiErrorResponse } from "@/application/use-cases/billing/qpay-callback-parse";
import { UserRole } from "@/domain/enums";
import { MANUAL_PAYMENT_CLAIM_RATE_LIMIT } from "@/infrastructure/security/rate-limiter";

export async function POST(
  _request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const actor = await requireActor(UserRole.CLIENT);
    const limited = await enforceRateLimit(
      `billing:manual-claim:${actor.userId}`,
      MANUAL_PAYMENT_CLAIM_RATE_LIMIT,
    );
    if (limited) {
      return NextResponse.json({ error: limited.error }, { status: 429 });
    }
    const { invoiceId } = await context.params;
    const invoice = await claimManualPayment(actor, invoiceId, manualBillingDeps());
    return NextResponse.json({ status: invoice.status });
  } catch (error) {
    return billingApiErrorResponse(error);
  }
}
