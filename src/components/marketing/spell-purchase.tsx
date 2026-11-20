"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { SpellCopy } from "@/i18n/types";

export type SpellPlanOption = {
  code: string;
  label: string;
  /** Null = no price configured → shown as «Үнэ удахгүй», not purchasable. */
  priceMnt: number | null;
};

type Checkout = {
  invoiceId: string;
  qrImage: string | null;
  shortUrl: string | null;
  deeplinks: { name: string; link: string }[];
  amountMnt: number;
};

const POLL_MS = 4000;

function qrSrc(qr: string | null): string | null {
  if (!qr) return null;
  return qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`;
}

/**
 * Licence picker + QPay checkout. The browser sends ONLY a plan code; the
 * amount shown comes back from the server, which is also what it charges.
 */
export function SpellPurchase({
  plans,
  loggedIn,
  available,
  copy,
}: {
  plans: SpellPlanOption[];
  loggedIn: boolean;
  /** Spell enabled + QPay configured on the server. */
  available: boolean;
  copy: SpellCopy["pricing"];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const poll = useCallback(
    (invoiceId: string) => {
      stop();
      timer.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/spell/purchase/${encodeURIComponent(invoiceId)}`, { cache: "no-store" });
          if (!res.ok) return;
          const view = (await res.json()) as { paid: boolean };
          if (view.paid) {
            stop();
            setPaid(true);
          }
        } catch {
          /* transient: keep polling */
        }
      }, POLL_MS);
    },
    [stop],
  );

  async function buy(code: string) {
    setError(null);
    setBusy(code);
    try {
      const res = await fetch("/api/spell/purchase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planCode: code }),
      });
      if (!res.ok) {
        setError(copy.checkout.error);
        return;
      }
      const v = (await res.json()) as {
        invoiceId: string;
        qrImage: string | null;
        shortUrl: string | null;
        deeplinks: { name: string; link: string }[];
        amountMnt: number;
      };
      setCheckout(v);
      poll(v.invoiceId);
    } catch {
      setError(copy.checkout.error);
    } finally {
      setBusy(null);
    }
  }

  function cancel() {
    stop();
    setCheckout(null);
  }

  if (paid) {
    return (
      <div role="status" className="mx-auto mt-8 max-w-xl rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <p className="text-lg font-bold text-emerald-900">{copy.checkout.paid}</p>
        <p className="mt-2 text-sm text-emerald-900/80">{copy.checkout.paidNote}</p>
        <Link href="/spell/license" className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-[#1B63FF] px-6 text-[15px] font-bold text-white hover:bg-blue-700">
          {copy.checkout.myLicense}
        </Link>
      </div>
    );
  }

  if (checkout) {
    const img = qrSrc(checkout.qrImage);
    return (
      <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-lg font-bold text-slate-900">{copy.checkout.title}</p>
        <p className="mt-1 text-2xl font-extrabold text-slate-900">{checkout.amountMnt.toLocaleString("mn-MN")} ₮</p>
        <p className="mt-2 text-sm text-slate-500">{copy.checkout.scan}</p>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="QPay QR" className="mx-auto mt-4 size-56 rounded-lg border border-slate-200" />
        ) : null}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {checkout.shortUrl ? (
            <a href={checkout.shortUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {copy.checkout.openApp}
            </a>
          ) : null}
        </div>
        <p className="mt-4 text-sm text-slate-500" aria-live="polite">{copy.checkout.waiting}</p>
        <button type="button" onClick={cancel} className="mt-3 text-sm font-semibold text-slate-500 underline-offset-4 hover:underline">
          {copy.checkout.cancel}
        </button>
      </div>
    );
  }

  return (
    <div>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const canBuy = available && p.priceMnt !== null;
          return (
            <li key={p.code} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <p className="text-lg font-bold text-slate-900">{p.label}</p>
              <p className="mt-2 min-h-8 text-2xl font-extrabold text-slate-900">
                {p.priceMnt !== null ? `${p.priceMnt.toLocaleString("mn-MN")} ₮` : <span className="text-base font-semibold text-slate-400">{copy.soon}</span>}
              </p>
              <div className="mt-4 flex-1" />
              {canBuy ? (
                loggedIn ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => buy(p.code)}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-[#1B63FF] px-5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {copy.buy}
                  </button>
                ) : (
                  <Link
                    href={`/login?callbackUrl=${encodeURIComponent("/spell#pricing")}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-[#1B63FF] px-5 text-sm font-bold text-white transition hover:bg-blue-700"
                  >
                    {copy.loginToBuy}
                  </Link>
                )
              ) : (
                <span className="text-sm text-slate-400">{available ? copy.soon : copy.unavailable}</span>
              )}
            </li>
          );
        })}
      </ul>
      {error ? <p role="alert" className="mt-4 text-center text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
