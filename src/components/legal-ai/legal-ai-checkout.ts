import { isInvoicePaymentConfirmed } from "@/domain/services/invoice-payment-confirmation";

export type LegalAiCheckoutAudience = "citizen" | "lawyer";
export type LegalAiCheckoutMethod = "QPAY" | "BANK_TRANSFER" | "QR";

export type LegalAiCheckoutView = {
  invoiceId?: string;
  qrImage: string | null;
  shortUrl: string | null;
  amountMnt: number;
  planCode: string;
  audience: LegalAiCheckoutAudience;
  /** Defaults to "QPAY" when absent — every pre-existing checkout view stays QPay. */
  method?: LegalAiCheckoutMethod;
  /** Invoice status string (e.g. "PENDING" | "AWAITING_VERIFICATION" | "PAID") — only set for manual methods. */
  status?: string;
  /** The "Гүйлгээний утга" to enter with a manual transfer. */
  reference?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  qrAssetUrl?: string | null;
};

export function qrImageSrc(qrImage: string | null): string | null {
  if (!qrImage) return null;
  return qrImage.startsWith("data:")
    ? qrImage
    : `data:image/png;base64,${qrImage}`;
}

/**
 * @deprecated Use isInvoicePaymentConfirmed. Kept as a thin alias so there is one payment rule:
 * only the server's `paid` verdict counts; `subscriptionStatus` alone never does.
 */
export function isLawyerInvoicePaid(payload: {
  paid?: boolean;
  subscriptionStatus?: string;
}): boolean {
  return isInvoicePaymentConfirmed(payload);
}

export function isEntitlementReadyToContinue(snapshot: {
  remainingLegalQuestions?: number;
}): boolean {
  return (snapshot.remainingLegalQuestions ?? 0) > 0;
}
