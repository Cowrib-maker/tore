import Link from "next/link";

import { BRAND_LOGO_SHELL } from "@/components/brand/tokens";
import { BrandLink } from "@/components/layout/brand-link";
import { buttonVariants } from "@/components/ui/button";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function NotFound() {
  const dict = await getDictionary();
  const c = dict.marketplace.common;

  return (
    <div className="ds-shell flex flex-col">
      <header className="ds-chrome">
        <div className="ds-chrome-inner">
          <BrandLink brand={dict.common.brand} logo={BRAND_LOGO_SHELL} />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-16 text-center sm:px-8">
        <p className="ds-eyebrow tracking-[0.14em]">404</p>
        <h1 className="ds-title mt-3">{c.notFoundTitle}</h1>
        <p className="ds-subtitle mt-3">{c.notFoundBody}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className={buttonVariants()}>
            {c.notFoundHome}
          </Link>
          <Link href="/lawyers" className={buttonVariants({ variant: "outline" })}>
            {dict.nav.lawyers}
          </Link>
        </div>
      </main>
    </div>
  );
}
