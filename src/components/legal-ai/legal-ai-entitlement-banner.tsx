"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LegalAiEntitlementView = {
  audience?: "guest" | "unpaid_citizen" | "paid_citizen" | "lawyer";
  remainingLegalQuestions?: number;
  exhaustedNextStep?: "login" | "billing" | "wait_period";
  statusLabel: string;
  remainingLabel: string;
  exhaustedLabel: string;
  expiresSoon?: boolean;
  expiryWarningLabel?: string | null;
};

export function LegalAiEntitlementBanner() {
  const [view, setView] = useState<LegalAiEntitlementView | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ai/entitlement", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as LegalAiEntitlementView;
      })
      .then((data) => {
        if (!cancelled && data?.statusLabel) {
          setView(data);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!view) {
    return null;
  }

  const exhausted = (view.remainingLegalQuestions ?? 1) <= 0;
  const showBillingCta =
    exhausted &&
    view.exhaustedNextStep === "billing" &&
    view.audience === "lawyer";
  const showLoginCta =
    exhausted && view.exhaustedNextStep === "login";

  return (
    <div className="rounded-xl border border-[#0B1F3A]/10 bg-[#F8FAFC] px-3 py-3 text-left text-sm text-[#3F4852]">
      <p className="font-medium text-[#0A0F14]">{view.statusLabel}</p>
      <p className="mt-1">{view.remainingLabel}</p>
      <p className="mt-1 text-xs text-[#66717D]">{view.exhaustedLabel}</p>
      {view.expiresSoon && view.expiryWarningLabel ? (
        <p className="mt-2 text-xs font-medium text-[#0B1F3A]">
          {view.expiryWarningLabel}
        </p>
      ) : null}
      {showBillingCta ? (
        <Link
          href="/lawyer/profile"
          className={cn(buttonVariants({ size: "sm" }), "mt-3")}
        >
          Багц идэвхжүүлэх
        </Link>
      ) : null}
      {exhausted &&
      view.exhaustedNextStep === "billing" &&
      view.audience !== "lawyer" ? (
        <p className="mt-2 text-xs text-[#0B1F3A]">
          Дараагийн асуулт илгээхэд төлбөрийн QR энд гарна.
        </p>
      ) : null}
      {showLoginCta ? (
        <Link
          href="/login?callbackUrl=%2Flegal-ai"
          className={cn(buttonVariants({ size: "sm" }), "mt-3")}
        >
          Нэвтрэх
        </Link>
      ) : null}
    </div>
  );
}
