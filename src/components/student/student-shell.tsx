import Link from "next/link";
import type { ReactNode } from "react";

import { BRAND_LOGO_LANDING } from "@/components/brand/tokens";
import { BrandLink } from "@/components/layout/brand-link";
import type { Dictionary } from "@/i18n/types";

export function StudentShell({
  brand,
  backHref,
  backLabel,
  children,
}: {
  brand: Dictionary["common"]["brand"];
  backHref: string;
  backLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#0A0F14]">
      <header className="border-b border-[#0B1F3A]/8 bg-[#F7F6F2]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <BrandLink brand={brand} logo={BRAND_LOGO_LANDING} />
          <Link
            href={backHref}
            className="text-[13px] font-medium text-[#5C6570] transition hover:text-[#0B1F3A]"
          >
            {backLabel}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        {children}
      </main>
    </div>
  );
}
