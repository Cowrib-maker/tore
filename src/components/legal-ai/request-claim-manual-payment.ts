import type { LegalAiCheckoutAudience } from "@/components/legal-ai/legal-ai-checkout";

/** The user's "Төлбөр хийсэн" click — marks the invoice AWAITING_VERIFICATION, never PAID. */
export async function requestClaimManualPayment(
  invoiceId: string,
  audience: LegalAiCheckoutAudience,
): Promise<{ ok: boolean; error?: string }> {
  const path =
    audience === "lawyer"
      ? `/api/lawyer/billing/invoices/${invoiceId}/claim`
      : `/api/citizen/billing/invoices/${invoiceId}/claim`;
  try {
    const response = await fetch(path, { method: "POST", credentials: "include" });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      return { ok: false, error: data.error ?? "Хүсэлт биелэгдсэнгүй." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Хүсэлт биелэгдсэнгүй." };
  }
}
