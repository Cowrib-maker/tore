import { NextResponse } from "next/server";

import { lawyerBillingDeps } from "@/application/common/lawyer-billing-http";
import { requireActor } from "@/application/common/require-actor";
import { getOwnInvoicePaymentStatus } from "@/application/use-cases/billing/get-invoice-payment-status";
import { billingApiErrorResponse } from "@/application/use-cases/billing/qpay-callback-parse";
import { UserRole } from "@/domain/enums";

export async function GET(
  _request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const actor = await requireActor(UserRole.CLIENT);
    const { invoiceId } = await context.params;
    const view = await getOwnInvoicePaymentStatus(
      actor,
      invoiceId,
      lawyerBillingDeps(),
    );
    return NextResponse.json(view);
  } catch (error) {
    return billingApiErrorResponse(error);
  }
}
