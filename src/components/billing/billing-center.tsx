"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Clock, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SOLO_PLAN } from "@/domain/constants/subscription-plans";
import { formatDateTimeUtc } from "@/lib/format-labels";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

type Role = "citizen" | "lawyer";
type CheckoutMethod = "QR" | "BANK_TRANSFER" | "QPAY";
type CitizenPlanCode = "CITIZEN_BASIC" | "CITIZEN_PLUS";

type PendingInvoice = {
  invoiceId: string;
  planCode: string | null;
  amountMnt: number;
  status: string;
  method: CheckoutMethod;
  reference: string | null;
  paymentCode: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  qrAssetUrl: string | null;
  qrImage: string | null;
  shortUrl: string | null;
};

type HistoryRow = {
  id: string;
  planCode: string | null;
  planName: string | null;
  amountMnt: number;
  status: string;
  provider: string;
  method: CheckoutMethod;
  paymentCode: string | null;
  createdAt: string;
};

type CitizenPayload = {
  audience: string;
  planName: string | null;
  statusLabel: string;
  remainingLegalQuestions: number;
  currentPeriodEnd: string | null;
  billingRequired: boolean;
  availablePlans: Array<{ code: string; name: string; priceMnt: number; quotas: { legalAiQueries: number; documentAnalysis: number } }>;
  pendingInvoice: PendingInvoice | null;
  history: HistoryRow[];
};

type LawyerPayload = {
  planName: string;
  priceMnt: number;
  billingRequired: boolean;
  subscriptionStatus: string;
  expiresAt: string | null;
  pendingInvoice: PendingInvoice | null;
  history: HistoryRow[];
};

const PLAN_NAME_MN: Record<string, string> = {
  PENDING: "Хүлээгдэж байна",
  AWAITING_VERIFICATION: "Шалгагдаж байна",
  PAID: "Баталгаажсан",
  FAILED: "Амжилтгүй",
  EXPIRED: "Хугацаа дууссан",
  CANCELLED: "Цуцлагдсан",
  ACTIVE: "Идэвхтэй",
};

function statusLabelMn(status: string): string {
  return PLAN_NAME_MN[status] ?? status;
}

function methodLabelMn(method: CheckoutMethod): string {
  if (method === "QR") return "QR кодоор";
  if (method === "BANK_TRANSFER") return "Дансаар";
  return "QPay";
}

export function BillingCenter({ role, backHref, locale }: { role: Role; backHref: string; locale: Locale }) {
  const endpoint = role === "citizen" ? "/api/citizen/billing" : "/api/lawyer/billing";
  const [data, setData] = useState<CitizenPayload | LawyerPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<CitizenPlanCode>("CITIZEN_BASIC");
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(endpoint, { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error("load_failed");
    }
    const payload = (await response.json()) as CitizenPayload | LawyerPayload;
    setData(payload);
    return payload;
  }, [endpoint]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollInvoice = useCallback(
    (invoiceId: string) => {
      stopPolling();
      const statusPath =
        role === "lawyer"
          ? `/api/lawyer/billing/invoices/${invoiceId}`
          : `/api/citizen/billing/invoices/${invoiceId}`;
      pollRef.current = window.setInterval(() => {
        void fetch(statusPath, { credentials: "same-origin" })
          .then(async (response) => {
            if (!response.ok) return;
            const payload = (await response.json()) as {
              paid?: boolean;
              subscriptionStatus?: string;
              invoiceStatus?: string;
              invoice?: { status?: string };
            };
            const paid = payload.paid === true || payload.subscriptionStatus === "ACTIVE";
            if (paid) {
              stopPolling();
              await load();
              return;
            }
            const status = payload.invoiceStatus ?? payload.invoice?.status;
            if (status) {
              setData((current) =>
                current?.pendingInvoice
                  ? { ...current, pendingInvoice: { ...current.pendingInvoice, status } }
                  : current,
              );
            }
          })
          .catch(() => undefined);
      }, 3000);
    },
    [load, role, stopPolling],
  );

  useEffect(() => {
    void load()
      .then((payload) => {
        if (payload.pendingInvoice) {
          pollInvoice(payload.pendingInvoice.invoiceId);
        }
      })
      .catch(() => setLoadError("Ачаалж чадсангүй. Дахин ачаална уу."));
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCheckout(planCode: CitizenPlanCode | null, method: CheckoutMethod) {
    setCheckoutPending(true);
    setCheckoutError(null);
    try {
      const response = await fetch(
        role === "citizen" ? "/api/citizen/billing/checkout" : "/api/lawyer/billing/checkout",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            role === "citizen"
              ? { planCode, method: method === "QPAY" ? undefined : method }
              : { method: method === "QPAY" ? undefined : method },
          ),
        },
      );
      const view = (await response.json()) as {
        error?: string;
        invoiceId?: string;
        planCode?: string;
        amountMnt?: number;
        status?: string;
        reference?: string | null;
        paymentCode?: string | null;
        bankName?: string | null;
        bankAccountNumber?: string | null;
        bankAccountName?: string | null;
        qrAssetUrl?: string | null;
        qrImage?: string | null;
        shortUrl?: string | null;
      };
      if (!response.ok || !view.invoiceId) {
        setCheckoutError(view.error ?? "Төлбөрийн нэхэмжлэл үүсгэж чадсангүй.");
        return;
      }
      const pendingInvoice: PendingInvoice = {
        invoiceId: view.invoiceId,
        planCode: view.planCode ?? planCode,
        amountMnt: view.amountMnt ?? 0,
        status: view.status ?? "PENDING",
        method,
        reference: view.reference ?? null,
        paymentCode: view.paymentCode ?? null,
        bankName: view.bankName ?? null,
        bankAccountNumber: view.bankAccountNumber ?? null,
        bankAccountName: view.bankAccountName ?? null,
        qrAssetUrl: view.qrAssetUrl ?? null,
        qrImage: view.qrImage ?? null,
        shortUrl: view.shortUrl ?? null,
      };
      setData((current) => (current ? { ...current, pendingInvoice } : current));
      pollInvoice(pendingInvoice.invoiceId);
    } catch {
      setCheckoutError("Төлбөрийн нэхэмжлэл үүсгэж чадсангүй.");
    } finally {
      setCheckoutPending(false);
    }
  }

  async function handleClaim(invoiceId: string) {
    setClaiming(true);
    setClaimError(null);
    const path =
      role === "lawyer"
        ? `/api/lawyer/billing/invoices/${invoiceId}/claim`
        : `/api/citizen/billing/invoices/${invoiceId}/claim`;
    try {
      const response = await fetch(path, { method: "POST", credentials: "same-origin" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setClaimError(result.error ?? "Хүсэлт биелэгдсэнгүй.");
      } else {
        setData((current) =>
          current?.pendingInvoice
            ? { ...current, pendingInvoice: { ...current.pendingInvoice, status: "AWAITING_VERIFICATION" } }
            : current,
        );
      }
    } catch {
      setClaimError("Хүсэлт биелэгдсэнгүй.");
    } finally {
      setClaiming(false);
    }
  }

  function copyReference(reference: string) {
    void navigator.clipboard?.writeText(reference).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loadError) {
    return <p className="text-sm text-red-700">{loadError}</p>;
  }
  if (!data) {
    return <p className="text-sm text-[#7B8490]">Ачааллаж байна…</p>;
  }

  const isCitizen = role === "citizen";
  const citizenData = isCitizen ? (data as CitizenPayload) : null;
  const lawyerData = !isCitizen ? (data as LawyerPayload) : null;
  const invoice = data.pendingInvoice;
  const hasActivePlan = isCitizen
    ? !citizenData!.billingRequired
    : !lawyerData!.billingRequired;
  const currentPlanName = isCitizen ? citizenData!.planName : lawyerData!.planName;
  const expiresAt = isCitizen ? citizenData!.currentPeriodEnd : lawyerData!.expiresAt;
  const availablePlans = isCitizen
    ? citizenData!.availablePlans
    : [{ code: SOLO_PLAN.code, name: SOLO_PLAN.name, priceMnt: SOLO_PLAN.priceMnt, quotas: SOLO_PLAN.quotas }];

  return (
    <div className="space-y-6">
      {/* MY CURRENT PLAN */}
      <section className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#0B5CFF] uppercase">
              Миний багц
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[#0B1F3A]">
              {hasActivePlan ? currentPlanName : "Багц идэвхгүй байна"}
            </h2>
          </div>
          <Badge variant={hasActivePlan ? "default" : "outline"} className="shrink-0">
            {hasActivePlan ? "Идэвхтэй" : "Идэвхгүй"}
          </Badge>
        </div>
        {isCitizen ? (
          <p className="mt-3 text-sm text-[#5C6570]">
            Энэ сард үлдсэн хууль зүйн AI асуулт: {citizenData!.remainingLegalQuestions}
          </p>
        ) : null}
        {expiresAt ? (
          <p className="mt-1 text-sm text-[#5C6570]">
            Дуусах хугацаа: {formatDateTimeUtc(new Date(expiresAt), locale)}
          </p>
        ) : null}
      </section>

      {/* AVAILABLE PLANS */}
      {!hasActivePlan && !invoice ? (
        <section className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-5 sm:p-6">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#0B5CFF] uppercase">
            Багц сонгох
          </p>
          <div className={cn("mt-4 grid gap-4", isCitizen ? "sm:grid-cols-2" : "")}>
            {availablePlans.map((plan) => {
              const selected = !isCitizen || selectedPlan === plan.code;
              return (
                <button
                  key={plan.code}
                  type="button"
                  onClick={() => isCitizen && setSelectedPlan(plan.code as CitizenPlanCode)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors",
                    selected
                      ? "border-[#0B5CFF] bg-[#F7FAFF]"
                      : "border-[#0B1F3A]/10 hover:border-[#0B5CFF]/40",
                  )}
                >
                  <p className="text-[15px] font-semibold text-[#0B1F3A]">{plan.name}</p>
                  <p className="mt-1 text-2xl font-semibold text-[#0B1F3A]">
                    {plan.priceMnt.toLocaleString("mn-MN")}₮
                    <span className="text-sm font-normal text-[#7B8490]"> / сар</span>
                  </p>
                  <ul className="mt-3 space-y-1 text-[13px] text-[#5C6570]">
                    <li className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-[#1F9D5C]" /> {plan.quotas.legalAiQueries} хууль зүйн AI асуулт/сар
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-[#1F9D5C]" /> {plan.quotas.documentAnalysis} баримт бичиг шинжилгээ/сар
                    </li>
                  </ul>
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-[#5C6570]">Төлбөрийн арга</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={checkoutPending}
                onClick={() => void startCheckout(isCitizen ? selectedPlan : null, "QR")}
                className="rounded-lg border border-[#0B1F3A]/15 px-3 py-2 text-left text-sm font-medium text-[#0B1F3A] transition-colors hover:border-[#0B5CFF] disabled:opacity-60"
              >
                QR кодоор төлөх
              </button>
              <button
                type="button"
                disabled={checkoutPending}
                onClick={() => void startCheckout(isCitizen ? selectedPlan : null, "BANK_TRANSFER")}
                className="rounded-lg border border-[#0B1F3A]/15 px-3 py-2 text-left text-sm font-medium text-[#0B1F3A] transition-colors hover:border-[#0B5CFF] disabled:opacity-60"
              >
                Дансаар шилжүүлэх
              </button>
            </div>
            {checkoutError ? <p className="text-sm text-red-700">{checkoutError}</p> : null}
          </div>
        </section>
      ) : null}

      {/* PENDING PAYMENT */}
      {invoice ? (
        <section className="rounded-2xl border border-[#0B5CFF]/25 bg-[#F7FAFF] p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-[#0B5CFF]" />
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#0B5CFF] uppercase">
              {invoice.status === "AWAITING_VERIFICATION"
                ? "Төлбөр шалгагдаж байна"
                : "Төлбөр хүлээгдэж байна"}
            </p>
          </div>

          <p className="mt-3 text-2xl font-semibold text-[#0B1F3A]">
            {invoice.amountMnt.toLocaleString("mn-MN")}₮
          </p>

          {invoice.method === "QR" ? (
            invoice.qrAssetUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={invoice.qrAssetUrl}
                alt="Төлбөрийн QR"
                className="mt-3 h-56 w-56 max-w-full rounded-md border border-[#0B1F3A]/10 bg-white object-contain p-2"
              />
            ) : (
              <p className="mt-3 text-sm text-red-700">Одоогоор QR код тохируулагдаагүй байна.</p>
            )
          ) : null}

          {invoice.method === "QR" || invoice.method === "BANK_TRANSFER" ? (
            <div className="mt-3 space-y-1.5 rounded-lg border border-[#0B1F3A]/10 bg-white px-3 py-2.5 text-sm">
              <FieldRow label="Банк" value={invoice.bankName ?? "Тохируулагдаагүй"} />
              <FieldRow label="Дансны нэр" value={invoice.bankAccountName ?? "Тохируулагдаагүй"} />
              <FieldRow label="Данс" value={invoice.bankAccountNumber ?? "Тохируулагдаагүй"} />
            </div>
          ) : null}

          {invoice.reference ? (
            <div className="mt-3 flex items-center justify-between gap-2 text-sm">
              <span className="text-[#5C6570]">Гүйлгээний утга (4 оронтой код)</span>
              <button
                type="button"
                onClick={() => copyReference(invoice.reference!)}
                className="rounded-md border border-[#0B1F3A]/15 bg-white px-2.5 py-1 font-mono text-sm font-semibold text-[#0B1F3A] hover:border-[#0B5CFF]"
              >
                {invoice.reference} {copied ? "· хуулагдлаа" : ""}
              </button>
            </div>
          ) : null}

          {invoice.method !== "QPAY" ? (
            <ol className="mt-4 list-decimal space-y-1 pl-4 text-[13px] leading-6 text-[#5C6570]">
              <li>QR код эсвэл дээрх дансаар төлбөрөө хийнэ үү.</li>
              <li>Төлөх дүнг яг тааруулж шилжүүлнэ үү.</li>
              <li>Гүйлгээний утгад дээрх 4 оронтой кодыг оруулна уу.</li>
              <li>Төлбөрийн баримтаа илгээнэ үү.</li>
              <li>Админ баталгаажуулсны дараа багц идэвхжинэ.</li>
            </ol>
          ) : invoice.shortUrl ? (
            <a
              href={invoice.shortUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex text-sm font-medium text-[#0B5CFF] underline underline-offset-4"
            >
              QPay-ээр төлөх
            </a>
          ) : null}

          {invoice.status === "AWAITING_VERIFICATION" ? (
            <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-amber-700">
              <ShieldCheck className="size-4" />
              Багц идэвхжих хүртэл төлбөрийн баримт болон гүйлгээний мэдээллийг хадгална уу.
            </p>
          ) : invoice.status === "FAILED" ? (
            <p className="mt-4 text-sm font-medium text-red-700">
              Төлбөр баталгаажаагүй. Дахин оролдоно уу.
            </p>
          ) : invoice.method !== "QPAY" ? (
            <>
              {claimError ? <p className="mt-3 text-sm text-red-700">{claimError}</p> : null}
              <Button
                type="button"
                size="sm"
                className="mt-4"
                disabled={claiming}
                onClick={() => void handleClaim(invoice.invoiceId)}
              >
                Төлбөр хийсэн
              </Button>
            </>
          ) : null}
        </section>
      ) : null}

      {/* PAYMENT HISTORY */}
      <section className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-5 sm:p-6">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-[#0B5CFF] uppercase">
          Төлбөрийн түүх
        </p>
        {data.history.length === 0 ? (
          <p className="mt-3 text-sm text-[#7B8490]">Одоогоор төлбөрийн түүх алга байна.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#0B1F3A]/8 text-[11px] tracking-wide text-[#8A939D] uppercase">
                  <th className="py-2 pr-3 font-medium">Багц</th>
                  <th className="py-2 pr-3 font-medium">Дүн</th>
                  <th className="py-2 pr-3 font-medium">Арга</th>
                  <th className="py-2 pr-3 font-medium">Төлөв</th>
                  <th className="py-2 pr-3 font-medium">Огноо</th>
                  <th className="py-2 font-medium">Код</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((row) => (
                  <tr key={row.id} className="border-b border-[#0B1F3A]/6 last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-[#0B1F3A]">{row.planName ?? "—"}</td>
                    <td className="py-2.5 pr-3">{row.amountMnt.toLocaleString("mn-MN")}₮</td>
                    <td className="py-2.5 pr-3">{methodLabelMn(row.method)}</td>
                    <td className="py-2.5 pr-3">{statusLabelMn(row.status)}</td>
                    <td className="py-2.5 pr-3 text-[#7B8490]">
                      {formatDateTimeUtc(new Date(row.createdAt), locale)}
                    </td>
                    <td className="py-2.5 font-mono text-[#7B8490]">{row.paymentCode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Link href={backHref} className="inline-flex text-sm font-medium text-[#0B5CFF] underline underline-offset-4">
        ← Буцах
      </Link>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[#7B8490]">{label}</span>
      <span className="font-medium text-[#0B1F3A]">{value}</span>
    </div>
  );
}
