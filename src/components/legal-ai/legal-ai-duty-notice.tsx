"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

export function LegalAiDutyNotice({
  variant,
  className,
}: {
  variant: "citizen" | "lawyer";
  className?: string;
}) {
  if (variant === "lawyer") {
    return (
      <p
        className={cn(
          "text-[12px] leading-5 text-[#66717D]",
          className,
        )}
      >
        TORE Legal AI танд зөвхөн туслах, цаг хэмнэх зориулалттай. Энэ нь
        таны мэргэжлийн зөвлөгөө, дүгнэлтийг орлохгүй. Эх сурвалжийг нягталж,
        эцсийн шийдвэрийг өөрөө гаргана уу.
      </p>
    );
  }

  return (
    <p
      className={cn(
        "text-[12px] leading-5 text-[#66717D]",
        className,
      )}
    >
      TORE Chat мэргэжлийн хуульч, өмгөөлөгчийн зөвлөгөөг орлохгүй. Таны
      тулгарсан асуудлыг шийдвэрлүүлэхийн тулд{" "}
      <Link
        href="/lawyers"
        className="font-medium text-[#0B1F3A] underline-offset-2 hover:underline"
      >
        баталгаажсан хуульч, өмгөөлөгчтэй холбогдоно уу
      </Link>
      .
    </p>
  );
}
