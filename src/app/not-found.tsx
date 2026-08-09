import Link from "next/link";

import { BrandLink } from "@/components/layout/brand-link";
import { buttonVariants } from "@/components/ui/button";
import { getDictionary } from "@/i18n/get-dictionary";
import { cn } from "@/lib/utils";

export default async function NotFound() {
  const dict = await getDictionary();
  const c = dict.marketplace.common;

  return (
    <div className="flex min-h-svh flex-col bg-[#FAFBFA]">
      <header className="border-b border-[#0F3D33]/10 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-5 sm:px-8">
          <BrandLink brand={dict.common.brand} />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-16 text-center sm:px-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-[#5A6B64] uppercase">
          404
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0A0F14]">
          {c.notFoundTitle}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#5A6B64]">
          {c.notFoundBody}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className={cn(buttonVariants(), "bg-[#0F3D33] text-white")}
          >
            {c.notFoundHome}
          </Link>
          <Link
            href="/lawyers"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            {dict.nav.lawyers}
          </Link>
        </div>
      </main>
    </div>
  );
}
