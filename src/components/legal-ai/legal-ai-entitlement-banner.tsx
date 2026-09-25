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

export function LegalAiEntitlementBanner({
  hideForAudiences,
}: {
  /**
   * Audiences this instance should render nothing for. Used only by the
   * public marketing-page composer: an authenticated paid_citizen/lawyer
   * (including the platform-demo "TORE Founder (demo)" account, which
   * resolves to exactly these audiences) is already past the anonymous
   * marketing experience and belongs in their real dashboard/`/legal-ai`,
   * not the public hero -- so a normal anonymous visitor is architecturally
   * guaranteed to never see this state (isPlatformDemoEmail requires a real
   * authenticated session), and an authenticated tester checking the public
   * page sees the same generic experience a real visitor would. The
   * `/legal-ai` page itself never passes this prop, so its behavior for
   * every audience (including the legitimate demo account) is unchanged.
   */
  hideForAudiences?: LegalAiEntitlementView["audience"][];
}) {
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
  if (hideForAudiences?.includes(view.audience)) {
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
    <div className="rounded-xl border border-ai-border bg-ai-surface-muted px-3 py-3 text-left text-sm text-ai-text">
      <p className="font-medium text-ai-text">{view.statusLabel}</p>
      <p className="mt-1">{view.remainingLabel}</p>
      <p className="mt-1 text-xs text-ai-text-subtle">{view.exhaustedLabel}</p>
      {view.expiresSoon && view.expiryWarningLabel ? (
        <p className="mt-2 text-xs font-medium text-ai-accent">
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
        <p className="mt-2 text-xs text-ai-accent">
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
