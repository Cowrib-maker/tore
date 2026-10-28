"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { BillingDisplayStatus } from "@/domain/services/billing-display-status";
import {
  deriveSubscriptionStage,
  LICENSE_STAGE_LABEL_MN,
  nextLawyerAction,
  OTHER_LEGAL_AI_ACCESS_NOTE_MN,
  showsOtherLegalAiAccessNote,
  SUBSCRIPTION_STAGE_LABEL_MN,
  type SubscriptionStage,
} from "@/domain/services/lawyer-access-stage";
import type { LawyerVerificationState } from "@/domain/services/lawyer-onboarding";
import { lawyerBillingHref } from "@/domain/services/safe-return-path";
import { cn } from "@/lib/utils";

/** Read-only response of GET /api/lawyer/billing/status (no usage counters, no session side effects). */
type PlanStatusPayload = {
  planName?: string;
  billingRequired?: boolean;
  subscriptionStatus?: unknown;
  expiresAt?: string | null;
  pendingInvoice?: { status?: string } | null;
};

const KNOWN_STATUSES = ["NONE", "PENDING", "ACTIVE", "EXPIRED", "CANCELED", "PAST_DUE"] as const satisfies readonly BillingDisplayStatus[];

function knownStatus(value: unknown): BillingDisplayStatus | null {
  return typeof value === "string" && (KNOWN_STATUSES as readonly string[]).includes(value) ? (value as BillingDisplayStatus) : null;
}

/** YYYY.MM.DD in Asia/Ulaanbaatar, matching the rest of the billing UI. */
function expiryLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return parts.replaceAll("-", ".");
}

/**
 * Compact "my plan" area for the lawyer workspace sidebar (desktop and the mobile drawer).
 * Reads the read-only `/api/lawyer/billing/status` endpoint (the full billing snapshot touches the
 * device session, which a navigation poll must not do), shows nothing it did not receive and
 * links to the billing page with the current page as the safe return destination.
 * `licenseState` is null for accounts without a licence flow (non-attorney positions): the plan
 * status is still shown, the licence line and licence action are not.
 */
export function LawyerPlanStatusCard({
  licenseState,
  tone = "dark",
  showHistoryLink = true,
  onNavigate,
}: {
  licenseState: LawyerVerificationState | null;
  tone?: "dark" | "light";
  /** False where the surrounding navigation already has its own "Төлбөрийн түүх" entry. */
  showHistoryLink?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [snapshot, setSnapshot] = useState<PlanStatusPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/lawyer/billing/status", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("load_failed");
        return (await response.json()) as PlanStatusPayload;
      })
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const dark = tone === "dark";
  const box = cn("rounded-xl border p-3 text-[12px] leading-5", dark ? "border-white/12 bg-white/[0.06] text-white/80" : "border-[#0B1F3A]/10 bg-[#F8FAFC] text-[#3F4852]");
  const strong = dark ? "text-white" : "text-[#0B1F3A]";
  const muted = dark ? "text-white/55" : "text-[#7B8490]";
  const link = dark ? "text-white underline-offset-4 hover:underline" : "text-[#0B5CFF] underline-offset-4 hover:underline";

  const billingHref = lawyerBillingHref(pathname);
  const historyHref = lawyerBillingHref(pathname, "history");

  if (failed) {
    return (
      <div className={box} data-testid="plan-status-card">
        <p className={cn("font-semibold", strong)}>Миний багц</p>
        <p className={muted}>Багцын төлөвийг ачаалж чадсангүй.</p>
        <Link href={billingHref} onClick={onNavigate} className={cn("mt-1 inline-block font-medium", link)}>
          Багц ба төлбөр нээх
        </Link>
      </div>
    );
  }
  if (!snapshot) {
    return (
      <div className={box} data-testid="plan-status-card" aria-busy="true">
        <p className={cn("font-semibold", strong)}>Миний багц</p>
        <p className={muted}>Ачааллаж байна…</p>
      </div>
    );
  }

  const billingStatus = knownStatus(snapshot.subscriptionStatus);
  const licenseLine = licenseState ? (
    <p data-testid="license-stage" className={cn("mt-1", muted)}>
      {LICENSE_STAGE_LABEL_MN[licenseState]}
    </p>
  ) : null;

  // A missing or unrecognised status is UNKNOWN, never "inactive": telling a paying lawyer to activate a plan
  // because a field was absent would be a made-up fact.
  if (!billingStatus) {
    return (
      <div className={box} data-testid="plan-status-card">
        <p className={cn("font-semibold", strong)}>Миний багц</p>
        <p data-testid="plan-unknown" className={muted}>Багцын төлөв тодорхойгүй байна.</p>
        {licenseLine}
        <Link href={billingHref} onClick={onNavigate} className={cn("mt-1 inline-block font-medium", link)}>
          Багц ба төлбөр нээх
        </Link>
      </div>
    );
  }

  const stage: SubscriptionStage = deriveSubscriptionStage({ billingStatus, pendingInvoiceStatus: snapshot.pendingInvoice?.status ?? null });
  const action = nextLawyerAction(licenseState, stage);
  const active = stage === "ACTIVE";
  const actionHref = action.target === "verification" ? "/lawyer/verification" : billingHref;

  return (
    <div className={box} data-testid="plan-status-card">
      <div className="flex items-center justify-between gap-2">
        <p className={cn("font-semibold", strong)}>Миний багц</p>
        <span
          data-testid="plan-stage"
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            active ? "bg-emerald-500/20 text-emerald-600" : dark ? "bg-amber-400/20 text-amber-200" : "bg-amber-100 text-amber-800",
          )}
        >
          {SUBSCRIPTION_STAGE_LABEL_MN[stage]}
        </span>
      </div>
      {snapshot.planName ? <p className={muted}>{snapshot.planName}</p> : null}
      {active && snapshot.expiresAt ? <p>Дуусах: {expiryLabel(snapshot.expiresAt)}</p> : null}
      {showsOtherLegalAiAccessNote(stage) ? (
        <p data-testid="plan-other-access-note" className={cn("mt-1", muted)}>
          {OTHER_LEGAL_AI_ACCESS_NOTE_MN}
        </p>
      ) : null}
      {licenseLine}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {action.kind !== "NONE" ? (
          <Link href={actionHref} onClick={onNavigate} className={cn("font-semibold", link)}>
            {action.label}
          </Link>
        ) : (
          <Link href={billingHref} onClick={onNavigate} className={cn("font-medium", link)}>
            Багц удирдах
          </Link>
        )}
        {showHistoryLink ? (
          <Link href={historyHref} onClick={onNavigate} className={cn("font-medium", link)}>
            Төлбөрийн түүх
          </Link>
        ) : null}
      </div>
    </div>
  );
}
