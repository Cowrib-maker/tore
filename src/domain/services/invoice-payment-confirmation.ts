/**
 * The ONE client-side rule for "this invoice has been paid".
 *
 * Source of truth is the server: GET /api/{lawyer,citizen}/billing/invoices/:id returns
 * InvoicePaymentStatusView (get-invoice-payment-status.ts), whose `paid` is computed AFTER the
 * server verified the payment (QPay payment/check for QPay invoices; an admin decision for manual
 * ones): the invoice is PAID and, for a plan invoice, the subscription it activated is active
 * (a consultation-booking invoice only needs PAID).
 *
 * `subscriptionStatus` in that payload is the ACCOUNT's latest subscription, not a verdict on this
 * invoice, so it can read ACTIVE while the invoice is still pending (renewal, an admin-granted or
 * demo subscription). `invoiceStatus` alone is not enough either: PAID without the activated
 * subscription is not yet usable access. So neither is ever treated as proof of payment.
 *
 * A client-side "paid" only changes what the page SAYS; server-side entitlement checks are
 * independent and unchanged.
 */
export type InvoicePaymentStatusPayload = {
  paid?: unknown;
  invoiceStatus?: unknown;
  subscriptionStatus?: unknown;
};

export function isInvoicePaymentConfirmed(
  payload: InvoicePaymentStatusPayload | null | undefined,
): boolean {
  return payload?.paid === true;
}
