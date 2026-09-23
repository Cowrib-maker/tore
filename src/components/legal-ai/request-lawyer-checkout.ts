import type {
  LegalAiCheckoutMethod,
  LegalAiCheckoutView,
} from "@/components/legal-ai/legal-ai-checkout";

type CheckoutResponse = {
  error?: string;
  invoiceId?: string;
  qrImage?: string | null;
  shortUrl?: string | null;
  amountMnt?: number;
  planCode?: string;
  method?: LegalAiCheckoutMethod;
  status?: string;
  reference?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  qrAssetUrl?: string | null;
};

export async function requestLawyerCheckout(input?: {
  method?: LegalAiCheckoutMethod;
}): Promise<{
  view: LegalAiCheckoutView | null;
  error?: string;
}> {
  const method = input?.method ?? "QPAY";
  try {
    const response = await fetch("/api/lawyer/billing/checkout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(method === "QPAY" ? {} : { method }),
    });
    const data = (await response.json()) as CheckoutResponse;
    if (!response.ok) {
      return {
        view: null,
        error: data.error ?? "Төлбөрийн нэхэмжлэл үүсгэж чадсангүй.",
      };
    }
    return {
      view: {
        invoiceId: data.invoiceId,
        qrImage: data.qrImage ?? null,
        shortUrl: data.shortUrl ?? null,
        amountMnt: data.amountMnt ?? 49_000,
        planCode: data.planCode ?? "SOLO",
        audience: "lawyer",
        method,
        status: data.status,
        reference: data.reference ?? null,
        bankName: data.bankName ?? null,
        bankAccountNumber: data.bankAccountNumber ?? null,
        bankAccountName: data.bankAccountName ?? null,
        qrAssetUrl: data.qrAssetUrl ?? null,
      },
    };
  } catch {
    return { view: null, error: "Төлбөрийн нэхэмжлэл үүсгэж чадсангүй." };
  }
}
