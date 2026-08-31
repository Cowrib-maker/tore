"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  isLawyerInvoicePaid,
  qrImageSrc,
} from "@/components/legal-ai/legal-ai-checkout";

export function ConsultationPaymentCard({
  invoiceId,
  amountMnt,
  qrImage,
  shortUrl,
}: {
  invoiceId: string;
  amountMnt: number;
  qrImage: string | null;
  shortUrl: string | null;
}) {
  const [waiting, setWaiting] = useState(true);
  const paidRef = useRef(false);

  useEffect(() => {
    paidRef.current = false;
    setWaiting(true);
    const timer = window.setInterval(() => {
      void fetch(`/api/citizen/billing/invoices/${invoiceId}`, {
        credentials: "include",
      })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = (await response.json()) as {
            paid?: boolean;
            subscriptionStatus?: string;
          };
          if (isLawyerInvoicePaid(payload) && !paidRef.current) {
            paidRef.current = true;
            setWaiting(false);
            window.location.reload();
          }
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [invoiceId]);

  const qr = qrImageSrc(qrImage);

  return (
    <div className="rounded-md border border-[#0B1F3A]/15 bg-[#F8FAFC] p-3 text-sm">
      <p className="font-medium text-[#0A0F14]">
        Зөвлөгөөний төлбөр · {amountMnt.toLocaleString("mn-MN")}₮
      </p>
      {waiting ? (
        <p className="mt-1 text-xs text-[#66717D]">
          QPay-ээр төлнө үү. Төлсний дараа өмгөөлөгч хүсэлтийг харна.
        </p>
      ) : (
        <p className="mt-1 text-xs text-emerald-800">Төлбөр амжилттай.</p>
      )}
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qr}
          alt="QPay QR"
          className="mt-3 h-36 w-36 rounded-md border border-[#D9DEE5]"
        />
      ) : null}
      {shortUrl ? (
        <a
          href={shortUrl}
          className="mt-2 inline-flex text-[#0B1F3A] underline"
          target="_blank"
          rel="noreferrer"
        >
          QPay-ээр төлөх
        </a>
      ) : null}
      <div className="mt-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => window.location.reload()}
        >
          Төлсөн — шинэчлэх
        </Button>
      </div>
    </div>
  );
}
