import type { LegalAiCheckoutView } from "@/components/legal-ai/legal-ai-checkout";

export async function requestLawyerCheckout(): Promise<{
  view: LegalAiCheckoutView | null;
  error?: string;
}> {
  try {
    const response = await fetch("/api/lawyer/billing/checkout", {
      method: "POST",
      credentials: "include",
    });
    const data = (await response.json()) as {
      error?: string;
      invoiceId?: string;
      qrImage?: string | null;
      shortUrl?: string | null;
      amountMnt?: number;
      planCode?: string;
    };
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
      },
    };
  } catch {
    return { view: null, error: "Төлбөрийн нэхэмжлэл үүсгэж чадсангүй." };
  }
}
