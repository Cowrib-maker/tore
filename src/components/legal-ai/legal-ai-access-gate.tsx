"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import type { LegalAiAccessGate } from "@/components/legal-ai/interpret-legal-ai-chat-access";
import type {
  LegalAiCheckoutMethod,
  LegalAiCheckoutView,
} from "@/components/legal-ai/legal-ai-checkout";
import {
  isEntitlementReadyToContinue,
  isLawyerInvoicePaid,
  qrImageSrc,
} from "@/components/legal-ai/legal-ai-checkout";
import { requestCitizenCheckout } from "@/components/legal-ai/request-citizen-checkout";
import { requestLawyerCheckout } from "@/components/legal-ai/request-lawyer-checkout";
import { requestClaimManualPayment } from "@/components/legal-ai/request-claim-manual-payment";
import {
  CITIZEN_BASIC_PLAN,
  CITIZEN_PLUS_PLAN,
} from "@/domain/constants/subscription-plans";
import {
  loginHrefForLegalAi,
  registerClientHrefForLegalAi,
} from "@/domain/services/rbac";
import { cn } from "@/lib/utils";

type CitizenPlanCode = "CITIZEN_BASIC" | "CITIZEN_PLUS";

const METHOD_OPTIONS: Array<{ value: LegalAiCheckoutMethod; label: string; hint: string }> = [
  { value: "QR", label: "QR кодоор төлөх", hint: "Банкны апп-аар уншуулж төлнө." },
  { value: "BANK_TRANSFER", label: "Дансаар шилжүүлэх", hint: "Дансны дугаар руу шилжүүлнэ." },
  {
    value: "QPAY",
    label: "QPay / банкны апп",
    hint: "Одоогоор тохируулаагүй — QR код эсвэл дансаар төлнө үү.",
  },
];

export function LegalAiAccessGateCard({
  gate,
  onPaid,
}: {
  gate: LegalAiAccessGate;
  onPaid?: () => void;
}) {
  const audience = gate.audience ?? "citizen";
  const loginHref = loginHrefForLegalAi(gate.question);
  const registerHref = registerClientHrefForLegalAi(gate.question);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;
  const paidRef = useRef(false);
  const [waiting, setWaiting] = useState(gate.kind === "billing");
  const [checkout, setCheckout] = useState<LegalAiCheckoutView | null>(
    gate.checkout ?? null,
  );
  const [checkoutError, setCheckoutError] = useState(gate.checkoutError);
  const [selecting, setSelecting] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<CitizenPlanCode>("CITIZEN_BASIC");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCheckout(gate.checkout ?? null);
    setCheckoutError(gate.checkoutError);
  }, [gate.checkout, gate.checkoutError]);

  useEffect(() => {
    if (gate.kind !== "billing") {
      return;
    }
    paidRef.current = false;
    setWaiting(true);

    function finishPaid() {
      if (paidRef.current) {
        return;
      }
      paidRef.current = true;
      setWaiting(false);
      onPaidRef.current?.();
    }

    const invoiceId = checkout?.invoiceId;
    const checkoutAudience = checkout?.audience;

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
    if (invoiceId && checkoutAudience) {
      const path =
        checkoutAudience === "lawyer"
          ? `/api/lawyer/billing/invoices/${invoiceId}`
          : `/api/citizen/billing/invoices/${invoiceId}`;
      invoiceTimer = window.setInterval(() => {
        void fetch(path, { credentials: "include" })
          .then(async (response) => {
            if (!response.ok) return;
            const payload = (await response.json()) as {
              paid?: boolean;
              subscriptionStatus?: string;
              invoice?: { status?: string };
            };
            if (payload.invoice?.status) {
              setCheckout((prev) => (prev ? { ...prev, status: payload.invoice!.status } : prev));
            }
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
  }, [gate.kind, checkout?.invoiceId, checkout?.audience]);

  const qr = qrImageSrc(checkout?.qrImage ?? null);
  const amount = checkout?.amountMnt;
  const showMethodPicker = gate.kind === "billing" && !checkout && !checkoutError;

  async function chooseMethod(method: LegalAiCheckoutMethod) {
    setSelecting(true);
    setCheckoutError(undefined);
    const result =
      audience === "lawyer"
        ? await requestLawyerCheckout({ method })
        : await requestCitizenCheckout({ planCode: selectedPlan, method });
    setCheckout(result.view);
    setCheckoutError(result.error);
    setSelecting(false);
  }

  async function handleClaim() {
    if (!checkout?.invoiceId) return;
    setClaiming(true);
    setClaimError(undefined);
    const result = await requestClaimManualPayment(checkout.invoiceId, audience);
    if (result.ok) {
      setCheckout((prev) => (prev ? { ...prev, status: "AWAITING_VERIFICATION" } : prev));
    } else {
      setClaimError(result.error);
    }
    setClaiming(false);
  }

  function copyReference() {
    if (!checkout?.reference) return;
    void navigator.clipboard?.writeText(checkout.reference).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }

  const awaitingVerification = checkout?.status === "AWAITING_VERIFICATION";
  const manualRejected = checkout?.status === "FAILED";
  const isManual = checkout?.method === "BANK_TRANSFER" || checkout?.method === "QR";

  return (
    <div
      role="dialog"
      className="mt-5 rounded-xl border border-ai-border-strong bg-ai-surface px-4 py-4 text-sm text-ai-text-muted shadow-[0_10px_24px_-20px_rgba(11,31,58,0.45)]"
    >
      <p className="font-medium text-ai-text">{gate.message}</p>
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
          {showMethodPicker && audience === "citizen" ? (
            <div className="space-y-2">
              <p className="text-xs text-ai-text-subtle">Багцаа сонгоно уу.</p>
              <div
                role="radiogroup"
                aria-label="Багц сонгох"
                className="grid gap-2 sm:grid-cols-2"
              >
                {(
                  [
                    ["CITIZEN_BASIC", CITIZEN_BASIC_PLAN],
                    ["CITIZEN_PLUS", CITIZEN_PLUS_PLAN],
                  ] as const
                ).map(([code, plan]) => (
                  <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={selectedPlan === code}
                    disabled={selecting}
                    onClick={() => setSelectedPlan(code)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      selectedPlan === code
                        ? "border-ai-accent bg-ai-accent text-ai-accent-foreground"
                        : "border-ai-border bg-ai-surface text-ai-text hover:border-ai-border-strong",
                    )}
                  >
                    {plan.name} · {plan.priceMnt.toLocaleString("mn-MN")}₮
                    <span
                      className={cn(
                        "mt-1 block text-[11px] font-normal",
                        selectedPlan === code ? "text-ai-accent-foreground/80" : "text-ai-text-subtle",
                      )}
                    >
                      {plan.quotas.legalAiQueries} асуулт · {plan.quotas.documentAnalysis} баримт
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {showMethodPicker ? (
            <div className="space-y-2">
              <p className="text-xs text-ai-text-subtle">Төлбөрийн арга</p>
              <div role="radiogroup" aria-label="Төлбөрийн арга" className="grid gap-2">
                {METHOD_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={false}
                    disabled={selecting}
                    onClick={() => void chooseMethod(option.value)}
                    className="flex flex-col rounded-lg border border-ai-border bg-ai-surface px-3 py-2 text-left text-sm text-ai-text transition-colors hover:border-ai-accent-bright hover:bg-ai-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="font-medium">{option.label}</span>
                    <span className="text-[11px] font-normal text-ai-text-subtle">{option.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {amount && !showMethodPicker ? (
            <p className="text-ai-text">
              {audience === "lawyer"
                ? "TORE Lawyer"
                : checkout?.planCode === "CITIZEN_PLUS"
                  ? CITIZEN_PLUS_PLAN.name
                  : CITIZEN_BASIC_PLAN.name}{" "}
              · {amount.toLocaleString("mn-MN")}₮ / сар
            </p>
          ) : null}

          {checkoutError ? <p className="text-red-700">{checkoutError}</p> : null}

          {checkout?.method === "QPAY" ? (
            <>
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qr}
                  alt="QPay QR"
                  className="h-56 w-56 max-w-full rounded-md border border-ai-border bg-white object-contain p-2 sm:h-64 sm:w-64"
                />
              ) : null}
              {checkout?.shortUrl ? (
                <a
                  href={checkout.shortUrl}
                  className="inline-flex text-ai-accent underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  QPay-ээр төлөх
                </a>
              ) : null}
              {waiting && checkout ? (
                <p className="text-xs text-ai-text-subtle">
                  Төлбөр хүлээгдэж байна. QR эсвэл холбоосоор төлнө үү. Төлсний
                  дараа асуулт үргэлжилнэ.
                </p>
              ) : null}
            </>
          ) : null}

          {checkout?.method === "QR" ? (
            <div className="space-y-2">
              {checkout.qrAssetUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={checkout.qrAssetUrl}
                  alt="Төрийн банкны QPay QR"
                  className="h-56 w-56 max-w-full rounded-md border border-ai-border bg-white object-contain p-2 sm:h-64 sm:w-64"
                />
              ) : (
                <p className="text-red-700">Одоогоор QR код тохируулагдаагүй байна.</p>
              )}
              <div className="space-y-1.5 rounded-lg border border-ai-border bg-ai-surface-muted px-3 py-2.5">
                <FieldRow label="Банк" value={checkout.bankName ?? "Тохируулагдаагүй"} />
                <FieldRow
                  label="Дансны нэр"
                  value={checkout.bankAccountName ?? "Тохируулагдаагүй"}
                />
                <FieldRow
                  label="Данс"
                  value={checkout.bankAccountNumber ?? "Тохируулагдаагүй"}
                />
              </div>
              <ManualPaymentReference
                label="Гүйлгээний утга"
                value={checkout.reference}
                copied={copied}
                onCopy={copyReference}
              />
              <p className="text-xs text-ai-text-subtle">
                Дээрх QR кодоор эсвэл дансаар төлбөрөө хийнэ үү. Гүйлгээний
                утга хэсэгт дээрх 4 оронтой кодыг заавал оруулна уу. Төлбөрийн
                дүнг яг тааруулж шилжүүлнэ үү.
              </p>
            </div>
          ) : null}

          {checkout?.method === "BANK_TRANSFER" ? (
            <div className="space-y-2">
              <div className="space-y-1.5 rounded-lg border border-ai-border bg-ai-surface-muted px-3 py-2.5">
                <FieldRow label="Банк" value={checkout.bankName ?? "Тохируулагдаагүй"} />
                <FieldRow
                  label="Дансны нэр"
                  value={checkout.bankAccountName ?? "Тохируулагдаагүй"}
                />
                <FieldRow
                  label="Данс"
                  value={checkout.bankAccountNumber ?? "Тохируулагдаагүй"}
                />
                <FieldRow label="Дүн" value={`${amount?.toLocaleString("mn-MN")}₮`} />
              </div>
              <ManualPaymentReference
                label="Гүйлгээний утга"
                value={checkout.reference}
                copied={copied}
                onCopy={copyReference}
              />
              <p className="text-xs text-ai-text-subtle">
                Дээрх дансаар төлбөрөө хийнэ үү. Гүйлгээний утга хэсэгт дээрх 4
                оронтой кодыг заавал оруулна уу. Төлбөрийн дүнг яг тааруулж
                шилжүүлнэ үү.
              </p>
            </div>
          ) : null}

          {isManual && checkout ? (
            <div className="space-y-2">
              {manualRejected ? (
                <p className="text-xs font-medium text-red-700">
                  Төлбөрийн мэдээлэл баталгаажаагүй байна.
                </p>
              ) : awaitingVerification ? (
                <p className="text-xs font-medium text-ai-gold">
                  Таны төлбөрийн мэдээлэл хүлээн авлаа. Админ баталгаажуулсны
                  дараа эрх идэвхжинэ.
                </p>
              ) : (
                <p className="text-xs text-ai-text-subtle">
                  Дээрх мэдээллийн дагуу шилжүүлгээ хийсний дараа доорх товч
                  дээр дарна уу.
                </p>
              )}
              {claimError ? <p className="text-red-700">{claimError}</p> : null}
              {!awaitingVerification && !manualRejected ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={claiming}
                  onClick={() => void handleClaim()}
                  className="bg-ai-accent-bright text-ai-accent-bright-foreground hover:bg-ai-accent-bright/90"
                >
                  Төлбөр хийсэн
                </Button>
              ) : null}
            </div>
          ) : null}

          {checkout?.status === "PAID" ? (
            <p className="text-xs font-medium text-green-700">
              Төлбөр баталгаажлаа. Таны эрх идэвхжсэн.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {checkout && checkout.method === "QPAY" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  paidRef.current = false;
                  onPaidRef.current?.();
                }}
              >
                Төлсөн — үргэлжлүүлэх
              </Button>
            ) : null}
            {audience === "lawyer" ? (
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

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-ai-text-subtle">{label}</span>
      <span className="font-medium text-ai-text">{value}</span>
    </div>
  );
}

function ManualPaymentReference({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string | null | undefined;
  copied: boolean;
  onCopy: () => void;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-ai-text-subtle">{label}</span>
      <button
        type="button"
        onClick={onCopy}
        className="rounded-md border border-ai-border bg-ai-surface px-2 py-1 font-mono text-xs font-medium text-ai-text hover:border-ai-accent-bright"
      >
        {value} {copied ? "· хуулагдлаа" : ""}
      </button>
    </div>
  );
}
