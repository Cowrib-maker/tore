"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  revokeDeviceSessionAction,
  revokeOtherDeviceSessionsAction,
} from "@/application/actions/session.actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AccountSharingRiskState } from "@/domain/enums";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";
import { formatDateTimeUtc } from "@/lib/format-labels";
import type { Locale } from "@/i18n/config";

type SessionRow = {
  id: string;
  isCurrent: boolean;
  deviceLabel: string;
  lastSeenAt: string;
  firstSeenAt: string;
  status: string;
};

type PendingInvoice = {
  invoiceId: string;
  amountMnt: number;
  currency: string;
  status: string;
  qrText: string | null;
  qrImage: string | null;
  shortUrl: string | null;
  deeplinks: Array<{ name: string; description: string; logo: string; link: string }>;
};

type BillingPayload = {
  planCode: string;
  planName: string;
  priceMnt: number;
  seatLimit: number;
  billingRequired: boolean;
  subscriptionStatus: string;
  expiresAt: string | null;
  pendingInvoice: PendingInvoice | null;
  usage: {
    caseAnalysis: { used: number; limit: number };
    documentAnalysis: { used: number; limit: number };
    legalAiQueries: { used: number; limit: number };
  };
  riskState: AccountSharingRiskState;
  warning: string | null;
  sessions: SessionRow[];
  currentSessionId: string;
};

function quotaLine(label: string, used: number, limit: number): string {
  return `${label}: ${used} / ${limit}`;
}

function qrSrc(qrImage: string | null): string | null {
  if (!qrImage) return null;
  return qrImage.startsWith("data:")
    ? qrImage
    : `data:image/png;base64,${qrImage}`;
}

function statusCopy(
  status: string,
  copy: MarketplaceDictionary["account"],
): string {
  switch (status) {
    case "ACTIVE":
      return copy.statusActive;
    case "EXPIRED":
      return copy.statusExpired;
    case "CANCELED":
      return copy.statusCancelled;
    default:
      return copy.statusPending;
  }
}

export function BillingAndSessionsPanel({
  copy,
  locale,
  supportEmail,
}: {
  copy: MarketplaceDictionary["account"];
  locale: Locale;
  supportEmail: string;
}) {
  const [data, setData] = useState<BillingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [paymentState, setPaymentState] = useState<
    "idle" | "waiting" | "success" | "failure"
  >("idle");
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/lawyer/billing", {
      credentials: "same-origin",
    });
    if (!response.ok) {
      throw new Error(copy.sessionsLoadError);
    }
    const payload = (await response.json()) as BillingPayload;
    setData({
      ...payload,
      sessions: payload.sessions.map((session) => ({
        ...session,
        lastSeenAt:
          typeof session.lastSeenAt === "string"
            ? session.lastSeenAt
            : new Date(session.lastSeenAt).toISOString(),
        firstSeenAt:
          typeof session.firstSeenAt === "string"
            ? session.firstSeenAt
            : new Date(session.firstSeenAt).toISOString(),
      })),
    });
    if (payload.subscriptionStatus === "ACTIVE" && !payload.billingRequired) {
      setPaymentState("success");
    }
    return payload;
  }, [copy.sessionsLoadError]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollInvoice = useCallback(
    (invoiceId: string) => {
      stopPolling();
      pollRef.current = window.setInterval(() => {
        void fetch(`/api/lawyer/billing/invoices/${invoiceId}`, {
          credentials: "same-origin",
        })
          .then(async (response) => {
            if (!response.ok) return;
            const payload = (await response.json()) as {
              paid?: boolean;
              invoiceStatus?: string;
              subscriptionStatus?: string;
            };
            if (payload.paid || payload.subscriptionStatus === "ACTIVE") {
              setPaymentState("success");
              stopPolling();
              await load();
              return;
            }
            if (payload.invoiceStatus === "FAILED") {
              setPaymentState("failure");
              stopPolling();
            }
          })
          .catch(() => undefined);
      }, 3000);
    },
    [load, stopPolling],
  );

  useEffect(() => {
    void load()
      .then((payload) => {
        if (payload.pendingInvoice?.invoiceId && payload.billingRequired) {
          setPaymentState("waiting");
          pollInvoice(payload.pendingInvoice.invoiceId);
        }
      })
      .catch(() => setError(copy.sessionsLoadError));
    return () => stopPolling();
  }, [copy.sessionsLoadError, load, pollInvoice, stopPolling]);

  const startCheckout = async () => {
    setCheckoutPending(true);
    setPaymentState("waiting");
    try {
      const response = await fetch("/api/lawyer/billing/checkout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) {
        setPaymentState("failure");
        return;
      }
      const invoice = (await response.json()) as PendingInvoice;
      setData((current) =>
        current ? { ...current, pendingInvoice: invoice } : current,
      );
      pollInvoice(invoice.invoiceId);
    } catch {
      setPaymentState("failure");
    } finally {
      setCheckoutPending(false);
    }
  };

  const current = data?.sessions.find((session) => session.isCurrent);
  const others =
    data?.sessions.filter((session) => !session.isCurrent) ?? [];
  const invoice = data?.pendingInvoice;
  const qr = qrSrc(invoice?.qrImage ?? null);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{copy.billingTitle}</CardTitle>
          <CardDescription>{copy.billingDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {data ? (
            <>
              <p>
                <span className="text-muted-foreground">{copy.planLabel}: </span>
                {data.planName}
              </p>
              <p>
                <span className="text-muted-foreground">{copy.priceLabel}: </span>
                {data.priceMnt.toLocaleString()}₮ / month
              </p>
              <p>
                <span className="text-muted-foreground">{copy.statusLabel}: </span>
                {statusCopy(data.subscriptionStatus, copy)}
              </p>
              {data.expiresAt ? (
                <p>
                  <span className="text-muted-foreground">
                    {copy.expiresAtLabel}:{" "}
                  </span>
                  {formatDateTimeUtc(new Date(data.expiresAt), locale)}
                </p>
              ) : null}
              <ul className="list-inside list-disc space-y-1">
                <li>
                  {quotaLine(
                    copy.quotaCaseAnalysis,
                    data.usage.caseAnalysis.used,
                    data.usage.caseAnalysis.limit,
                  )}
                </li>
                <li>
                  {quotaLine(
                    copy.quotaDocumentAnalysis,
                    data.usage.documentAnalysis.used,
                    data.usage.documentAnalysis.limit,
                  )}
                </li>
                <li>
                  {quotaLine(
                    copy.quotaLegalAi,
                    data.usage.legalAiQueries.used,
                    data.usage.legalAiQueries.limit,
                  )}
                </li>
              </ul>
              {paymentState === "waiting" ? (
                <p>{copy.paymentWaiting}</p>
              ) : null}
              {paymentState === "success" && !data.billingRequired ? (
                <p>{copy.paymentSuccess}</p>
              ) : null}
              {paymentState === "failure" ? (
                <p className="text-destructive">{copy.paymentFailure}</p>
              ) : null}
              {data.billingRequired ? (
                <Button
                  type="button"
                  disabled={checkoutPending}
                  onClick={() => void startCheckout()}
                >
                  {copy.payButton}
                </Button>
              ) : null}
              {invoice && data.billingRequired ? (
                <div className="space-y-3 rounded-lg border p-3">
                  {qr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qr}
                      alt={copy.qrLabel}
                      className="h-40 w-40 bg-white p-2"
                    />
                  ) : null}
                  {invoice.shortUrl ? (
                    <a
                      href={invoice.shortUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {copy.openPaymentLink}
                    </a>
                  ) : null}
                  {invoice.deeplinks.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-muted-foreground">{copy.deeplinkLabel}</p>
                      {invoice.deeplinks.map((link) => (
                        <a
                          key={link.link}
                          href={link.link}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-primary underline-offset-4 hover:underline"
                        >
                          {link.name}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <p className="text-muted-foreground">{copy.upgradeTeamHint}</p>
              <a
                href={`mailto:${supportEmail}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {copy.contactSupport}
              </a>
            </>
          ) : error ? (
            <p className="text-destructive">{error}</p>
          ) : (
            <p className="text-muted-foreground">{copy.sessionsDescription}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{copy.sessionsTitle}</CardTitle>
          <CardDescription>{copy.sessionsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {data?.warning ? (
            <div
              role="status"
              className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2"
            >
              {copy.sharingWarning}
              {data.riskState === AccountSharingRiskState.HIGH_RISK ? (
                <p className="mt-1 text-muted-foreground">
                  {copy.sharingHighRiskHint}
                </p>
              ) : null}
            </div>
          ) : null}

          {current ? (
            <div className="rounded-lg border px-3 py-2">
              <p className="font-medium">{copy.currentDevice}</p>
              <p>{current.deviceLabel}</p>
              <p className="text-muted-foreground">
                {copy.lastActive}:{" "}
                {formatDateTimeUtc(new Date(current.lastSeenAt), locale)}
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{copy.otherDevices}</p>
              {others.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await revokeOtherDeviceSessionsAction();
                      if (result.error) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success(copy.revokedOthersToast);
                      await load();
                    });
                  }}
                >
                  {pending ? copy.revoking : copy.revokeOthers}
                </Button>
              ) : null}
            </div>
            {others.length === 0 ? (
              <p className="text-muted-foreground">{copy.noOtherSessions}</p>
            ) : (
              others.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                >
                  <div>
                    <p>{session.deviceLabel}</p>
                    <p className="text-muted-foreground">
                      {copy.lastActive}:{" "}
                      {formatDateTimeUtc(new Date(session.lastSeenAt), locale)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await revokeDeviceSessionAction(
                          session.id,
                        );
                        if (result.error) {
                          toast.error(result.error);
                          return;
                        }
                        toast.success(copy.revokedToast);
                        await load();
                      });
                    }}
                  >
                    {copy.revokeSession}
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
