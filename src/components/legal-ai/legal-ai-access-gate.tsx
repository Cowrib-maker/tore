"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import type { LegalAiAccessGate } from "@/components/legal-ai/interpret-legal-ai-chat-access";
import type { LegalAiCheckoutView } from "@/components/legal-ai/legal-ai-checkout";
import {
  isEntitlementReadyToContinue,
  isLawyerInvoicePaid,
  qrImageSrc,
} from "@/components/legal-ai/legal-ai-checkout";
import { requestCitizenCheckout } from "@/components/legal-ai/request-citizen-checkout";
import {
  CITIZEN_BASIC_PLAN,
  CITIZEN_PLUS_PLAN,
} from "@/domain/constants/subscription-plans";
import {
  loginHrefForLegalAi,
  registerClientHrefForLegalAi,
} from "@/domain/services/rbac";
import { cn } from "@/lib/utils";

export function LegalAiAccessGateCard({
  gate,
  onPaid,
}: {
  gate: LegalAiAccessGate;
  onPaid?: () => void;
}) {
  const key = [
    gate.kind,
    gate.question,
    gate.checkout?.invoiceId ?? "",
    gate.checkoutError ?? "",
  ].join(":");
  return <LegalAiAccessGateCardContent key={key} gate={gate} onPaid={onPaid} />;
}

function LegalAiAccessGateCardContent({
  gate,
  onPaid,
}: {
  gate: LegalAiAccessGate;
  onPaid?: () => void;
}) {
  const loginHref = loginHrefForLegalAi(gate.question);
  const registerHref = registerClientHrefForLegalAi(gate.question);
  const paidRef = useRef(false);
  const [paid, setPaid] = useState(false);
  const waiting = gate.kind === "billing" && !paid;
  const [checkout, setCheckout] = useState<LegalAiCheckoutView | null>(
    gate.checkout ?? null,
  );
  const [checkoutError, setCheckoutError] = useState(gate.checkoutError);
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    if (gate.kind !== "billing") {
      return;
    }

    function finishPaid() {
      if (paidRef.current) {
        return;
      }
      paidRef.current = true;
      setPaid(true);
      onPaid?.();
    }

    const invoiceId = checkout?.invoiceId;
    const audience = checkout?.audience;

    const entitlementTimer = window.setInterval(() => {
      void fetch("/api/ai/entitlement", { credentials: "include" })
        .then(async (response) => {
          if (!response.ok) return;
          const snapshot = (await response.json()) as {
            remainingLegalQuestions?: number;
          };
          if (isEntitlementReadyToContinue(snapshot)) {
            finishPaid();
          }
        })
        .catch(() => undefined);
    }, 4000);

    let invoiceTimer: number | undefined;
    if (invoiceId && audience) {
      const path =
        audience === "lawyer"
          ? `/api/lawyer/billing/invoices/${invoiceId}`
          : `/api/citizen/billing/invoices/${invoiceId}`;
      invoiceTimer = window.setInterval(() => {
        void fetch(path, { credentials: "include" })
          .then(async (response) => {
            if (!response.ok) return;
            const payload = (await response.json()) as {
              paid?: boolean;
              subscriptionStatus?: string;
            };
            if (isLawyerInvoicePaid(payload)) {
              finishPaid();
            }
          })
          .catch(() => undefined);
      }, 3000);
    }

    return () => {
      window.clearInterval(entitlementTimer);
      if (invoiceTimer) {
        window.clearInterval(invoiceTimer);
      }
    };
  }, [gate.kind, checkout?.invoiceId, checkout?.audience, onPaid]);

  const qr = qrImageSrc(checkout?.qrImage ?? null);
  const amount = checkout?.amountMnt;
  const isLawyer = checkout?.audience === "lawyer";
  const showPlanPicker =
    gate.kind === "billing" && !isLawyer && !checkout && !checkoutError;

  async function selectCitizenPlan(planCode: "CITIZEN_BASIC" | "CITIZEN_PLUS") {
    setSelecting(true);
    setCheckoutError(undefined);
    const result = await requestCitizenCheckout({ planCode });
    setCheckout(result.view);
    setCheckoutError(result.error);
    setSelecting(false);
  }

  return (
    <div
      role="dialog"
      className="mt-5 rounded-xl border border-[#0B1F3A]/15 bg-white px-4 py-4 text-sm text-[#3F4852] shadow-[0_10px_24px_-20px_rgba(11,31,58,0.45)]"
    >
      <p className="font-medium text-[#0A0F14]">{gate.message}</p>
      {gate.kind === "auth" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={loginHref} className={cn(buttonVariants({ size: "sm" }))}>
            Нэвтрэх
          </Link>
          <Link
            href={registerHref}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            Бүртгүүлэх
          </Link>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {showPlanPicker ? (
            <div className="space-y-2">
              <p className="text-xs text-[#66717D]">Багцаа сонгоно уу.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={selecting}
                  onClick={() => void selectCitizenPlan("CITIZEN_BASIC")}
                >
                  {CITIZEN_BASIC_PLAN.name} ·{" "}
                  {CITIZEN_BASIC_PLAN.priceMnt.toLocaleString("mn-MN")}₮
                  <span className="mt-1 block text-[11px] font-normal text-[#66717D]">
                    {CITIZEN_BASIC_PLAN.quotas.legalAiQueries} асуулт ·{" "}
                    {CITIZEN_BASIC_PLAN.quotas.documentAnalysis} баримт
                  </span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={selecting}
                  onClick={() => void selectCitizenPlan("CITIZEN_PLUS")}
                >
                  {CITIZEN_PLUS_PLAN.name} ·{" "}
                  {CITIZEN_PLUS_PLAN.priceMnt.toLocaleString("mn-MN")}₮
                  <span className="mt-1 block text-[11px] font-normal text-white/80">
                    {CITIZEN_PLUS_PLAN.quotas.legalAiQueries} асуулт ·{" "}
                    {CITIZEN_PLUS_PLAN.quotas.documentAnalysis} баримт
                  </span>
                </Button>
              </div>
            </div>
          ) : null}
          {amount ? (
            <p>
              {isLawyer
                ? "TORE SOLO"
                : checkout?.planCode === "CITIZEN_PLUS"
                  ? CITIZEN_PLUS_PLAN.name
                  : CITIZEN_BASIC_PLAN.name}{" "}
              · {amount.toLocaleString("mn-MN")}₮
            </p>
          ) : null}
          {checkoutError ? (
            <p className="text-red-700">{checkoutError}</p>
          ) : null}
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt="QPay QR"
              className="h-40 w-40 rounded-md border border-[#D9DEE5]"
            />
          ) : null}
          {checkout?.shortUrl ? (
            <a
              href={checkout.shortUrl}
              className="inline-flex text-[#0B1F3A] underline"
              target="_blank"
              rel="noreferrer"
            >
              QPay-ээр төлөх
            </a>
          ) : null}
          {waiting && checkout ? (
            <p className="text-xs text-[#66717D]">
              Төлбөр хүлээгдэж байна. QR эсвэл холбоосоор төлнө үү. Төлсний
              дараа асуулт үргэлжилнэ.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {checkout ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  paidRef.current = false;
                  onPaid?.();
                }}
              >
                Төлсөн — үргэлжлүүлэх
              </Button>
            ) : null}
            {isLawyer ? (
              <Link
                href="/lawyer/profile"
                className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
              >
                Багц ба төхөөрөмж
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
