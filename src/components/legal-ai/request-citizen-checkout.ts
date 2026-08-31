import type { LegalAiCheckoutView } from "@/components/legal-ai/legal-ai-checkout";
import {
  CITIZEN_BASIC_PLAN,
  CITIZEN_PLUS_PLAN,
} from "@/domain/constants/subscription-plans";
import { SubscriptionPlanCode } from "@/domain/enums";

export type CitizenCheckoutView = LegalAiCheckoutView;

export async function requestCitizenCheckout(input?: {
  enabled?: boolean;
  planCode?: "CITIZEN_BASIC" | "CITIZEN_PLUS";
}): Promise<{ view: CitizenCheckoutView | null; error?: string }> {
  if (input?.enabled === false) {
    return { view: null, error: "Төлбөр төлөхийн тулд нэвтэрнэ үү." };
  }

  const planCode =
    input?.planCode === SubscriptionPlanCode.CITIZEN_PLUS
      ? SubscriptionPlanCode.CITIZEN_PLUS
      : SubscriptionPlanCode.CITIZEN_BASIC;
  const catalog =
    planCode === SubscriptionPlanCode.CITIZEN_PLUS
      ? CITIZEN_PLUS_PLAN
      : CITIZEN_BASIC_PLAN;

  try {
    const response = await fetch("/api/citizen/billing/checkout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planCode }),
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
        amountMnt: data.amountMnt ?? catalog.priceMnt,
        planCode: data.planCode ?? planCode,
        audience: "citizen",
      },
    };
  } catch {
    return { view: null, error: "Төлбөрийн нэхэмжлэл үүсгэж чадсангүй." };
  }
}
