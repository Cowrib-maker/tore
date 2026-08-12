"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";

import { BRAND_LOGO_LANDING } from "@/components/brand/tokens";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { BrandLink } from "@/components/layout/brand-link";
import { buttonVariants } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

type LandingNavProps = {
  dict: Dictionary;
  locale: Locale;
};

export function LandingNav({ dict, locale }: LandingNavProps) {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#platform", label: dict.nav.platform },
    { href: "#citizens", label: dict.nav.forCitizens },
    { href: "#businesses", label: dict.nav.forBusinesses },
    { href: "#workspace", label: dict.nav.forLawyers },
    { href: "#government", label: dict.nav.forGovernment },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[#0B1F3A]/8 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-5 sm:h-[4.25rem] sm:px-8">
        <BrandLink brand={dict.common.brand} logo={BRAND_LOGO_LANDING} />

        <nav
          className="hidden items-center gap-5 xl:flex"
          aria-label="Primary"
        >
          {links.map((item) => (
            <a key={`${item.href}-${item.label}`} href={item.href} className="landing-nav-link">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher locale={locale} label={dict.common.language} />
          <Link
            href="/login"
            className="hidden h-9 items-center rounded-lg px-3 text-[13px] font-medium text-[#5C6570] transition-colors hover:bg-[#0B1F3A]/5 hover:text-[#0B1F3A] sm:inline-flex"
          >
            {dict.common.signIn}
          </Link>
          <Link
            href="/register/client"
            className={cn(
              buttonVariants({ size: "sm" }),
              "hidden h-9 rounded-lg bg-[#0B1F3A] px-3.5 text-[13px] font-semibold text-white hover:bg-[#0B1F3A]/92 sm:inline-flex",
            )}
          >
            {dict.landing.ctaStart}
          </Link>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-[#0B1F3A]/12 text-[#0B1F3A] xl:hidden"
            aria-expanded={open}
            aria-controls="landing-mobile-nav"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
            <span className="sr-only">Menu</span>
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="landing-mobile-nav"
          className="border-t border-[#0B1F3A]/8 bg-white px-5 py-3 xl:hidden"
          aria-label="Mobile"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-0.5">
            {links.map((item) => (
              <a
                key={`${item.href}-${item.label}`}
                href={item.href}
                className="rounded-lg px-2 py-2 text-sm font-medium text-[#0A0F14] hover:bg-[#F4F6F8]"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <Link
              href="/login"
              className="rounded-lg px-2 py-2 text-sm font-medium text-[#5C6570]"
              onClick={() => setOpen(false)}
            >
              {dict.common.signIn}
            </Link>
            <Link
              href="/register/client"
              className="mt-2 inline-flex h-10 items-center justify-center rounded-lg bg-[#0B1F3A] px-4 text-sm font-semibold text-white"
              onClick={() => setOpen(false)}
            >
              {dict.landing.ctaStart}
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
