export type LegalAiCheckoutAudience = "citizen" | "lawyer";

export type LegalAiCheckoutView = {
  invoiceId?: string;
  qrImage: string | null;
  shortUrl: string | null;
  amountMnt: number;
  planCode: string;
  audience: LegalAiCheckoutAudience;
};

export function qrImageSrc(qrImage: string | null): string | null {
  if (!qrImage) return null;
  return qrImage.startsWith("data:")
    ? qrImage
    : `data:image/png;base64,${qrImage}`;
}

export function isLawyerInvoicePaid(payload: {
  paid?: boolean;
  subscriptionStatus?: string;
}): boolean {
  return payload.paid === true || payload.subscriptionStatus === "ACTIVE";
}

export function isEntitlementReadyToContinue(snapshot: {
  remainingLegalQuestions?: number;
}): boolean {
  return (snapshot.remainingLegalQuestions ?? 0) > 0;
}
