import type { QpayCheckedPayment } from "@/domain/ports/qpay-gateway";
import { PaymentVerificationError } from "@/domain/errors/payment-verification-error";

export const SOLO_INVOICE_CURRENCY = "MNT";

export function roundMnt(value: number): number {
  return Math.round(Number(value));
}

/**
 * Accept a QPay payment/check payload only when a PAID row matches the
 * server-side catalog amount for the stored invoice's plan. Callers must
 * pass the catalog price — never a callback-supplied amount.
 */
export function verifyQpayCatalogPayment(input: {
  expectedProviderInvoiceId: string;
  expectedAmountMnt: number;
  checked: QpayCheckedPayment;
}): {
  paymentId: string;
  amountMnt: number;
  currency: string;
  safeMetadata: Record<string, unknown>;
} {
  if (!input.expectedProviderInvoiceId.trim()) {
    throw new PaymentVerificationError("Invoice was not found", "WRONG_INVOICE");
  }

  const catalogAmount = roundMnt(input.expectedAmountMnt);
  if (!Number.isFinite(catalogAmount) || catalogAmount <= 0) {
    throw new PaymentVerificationError(
      "Plan is not priced for payment",
      "UNPRICED_PLAN",
    );
  }

  const paidRows = input.checked.rows.filter((row) => row.status === "PAID");
  if (paidRows.length === 0) {
    throw new PaymentVerificationError(
      "Payment is not successful",
      "PAYMENT_NOT_SUCCESSFUL",
    );
  }

  const paidAmount = roundMnt(input.checked.paidAmountMnt);
  if (paidAmount !== catalogAmount) {
    throw new PaymentVerificationError(
      "Payment amount does not match",
      "WRONG_AMOUNT",
    );
  }

  const row = paidRows.find((item) => {
    const amount = roundMnt(item.amountMnt);
    const currency = item.currency.trim().toUpperCase();
    return (
      amount === catalogAmount &&
      Boolean(item.paymentId) &&
      (currency === SOLO_INVOICE_CURRENCY || currency === "")
    );
  });

  if (!row) {
    throw new PaymentVerificationError(
      "Payment amount does not match",
      "WRONG_AMOUNT",
    );
  }

  return {
    paymentId: row.paymentId,
    amountMnt: catalogAmount,
    currency: SOLO_INVOICE_CURRENCY,
    safeMetadata: {
      payment_id: row.paymentId,
      payment_status: row.status,
      payment_amount: row.amountMnt,
      payment_currency: row.currency,
      paid_amount: input.checked.paidAmountMnt,
      count: input.checked.count,
    },
  };
}
