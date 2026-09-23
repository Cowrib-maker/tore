import type {
  LegalAiCheckoutMethod,
  LegalAiCheckoutView,
} from "@/components/legal-ai/legal-ai-checkout";
import {
  CITIZEN_BASIC_PLAN,
  CITIZEN_PLUS_PLAN,
} from "@/domain/constants/subscription-plans";
import { SubscriptionPlanCode } from "@/domain/enums";

export type CitizenCheckoutView = LegalAiCheckoutView;

export async function requestCitizenCheckout(input?: {
  enabled?: boolean;
  planCode?: "CITIZEN_BASIC" | "CITIZEN_PLUS";
  method?: LegalAiCheckoutMethod;
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
  const method = input?.method ?? "QPAY";

  try {
    const response = await fetch("/api/citizen/billing/checkout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(method === "QPAY" ? { planCode } : { planCode, method }),
    });
    const data = (await response.json()) as {
      error?: string;
      invoiceId?: string;
      qrImage?: string | null;
      shortUrl?: string | null;
      amountMnt?: number;
      planCode?: string;
      status?: string;
      reference?: string | null;
      bankName?: string | null;
      bankAccountNumber?: string | null;
      bankAccountName?: string | null;
      qrAssetUrl?: string | null;
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
