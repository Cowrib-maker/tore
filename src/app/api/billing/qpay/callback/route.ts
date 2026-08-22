import { NextResponse } from "next/server";

import { lawyerBillingDeps } from "@/application/common/lawyer-billing-http";
import { processQpayInvoicePayment } from "@/application/use-cases/billing/process-qpay-payment";
import { parseQpayCallbackInvoiceId } from "@/application/use-cases/billing/qpay-callback-parse";
import { PaymentVerificationError } from "@/domain/errors/payment-verification-error";

/**
 * QPay POSTs { invoice_id }. Never trust this payload to activate access.
 * Always payment/check server-side before Invoice/Subscription mutation.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const invoiceId = parseQpayCallbackInvoiceId(rawBody, new URL(request.url));
  if (!invoiceId) {
    return NextResponse.json({ ok: false, code: "WRONG_INVOICE" }, { status: 200 });
  }

  try {
    const result = await processQpayInvoicePayment(
      invoiceId,
      lawyerBillingDeps(),
    );
    return NextResponse.json({
      ok: true,
      alreadyProcessed: result.alreadyProcessed,
    });
  } catch (error) {
    if (error instanceof PaymentVerificationError) {
      const serviceUnavailable =
        error.code === "QPAY_UNAVAILABLE" ||
        error.code === "BILLING_PROVIDER_NOT_CONFIGURED" ||
        error.code === "QPAY_NOT_CONFIGURED";
      return NextResponse.json(
        { ok: false, code: error.code },
        { status: serviceUnavailable ? 503 : 200 },
      );
    }
    console.error(error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
