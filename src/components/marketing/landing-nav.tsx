"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";

import { logoutAction } from "@/application/actions/auth.actions";
import { BRAND_LOGO_LANDING } from "@/components/brand/tokens";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { BrandLink } from "@/components/layout/brand-link";
import { buttonVariants } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

export type LandingAuthUser = {
  displayName: string;
  dashboardHref: string;
};

type LandingNavProps = {
  dict: Dictionary;
  locale: Locale;
  authUser?: LandingAuthUser | null;
};

export function LandingNav({ dict, locale, authUser }: LandingNavProps) {
  const [open, setOpen] = useState(false);
  const home = dict.publicHome;
  const links = [
    { href: "#chat", label: home.products.chat.name },
    { href: "#products", label: home.navProducts },
    { href: "#intelligence", label: home.navIntelligence },
    { href: "#feedback", label: home.navFeedback },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[#0B1F3A]/8 bg-[#F7F6F2]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 sm:h-[4.25rem] sm:px-8">
        <BrandLink brand={dict.common.brand} logo={BRAND_LOGO_LANDING} />

        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label="Primary"
        >
          {links.map((item) => (
            <a key={item.href} href={item.href} className="landing-nav-link">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher locale={locale} label={dict.common.language} />
          {authUser ? (
            <>
              <Link
                href={authUser.dashboardHref}
                className="hidden max-w-[10rem] truncate text-[13px] font-medium text-[#0B1F3A] sm:inline"
              >
                {authUser.displayName}
              </Link>
              <form action={logoutAction} className="hidden sm:block">
                <button
                  type="submit"
                  className="h-9 cursor-pointer rounded-full px-4 text-[13px] font-medium text-[#5C6570] transition-colors hover:bg-[#0B1F3A]/5 hover:text-[#0B1F3A]"
                >
                  {dict.common.signOut}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden h-9 items-center rounded-full px-4 text-[13px] font-medium text-[#5C6570] transition-colors hover:bg-[#0B1F3A]/5 hover:text-[#0B1F3A] sm:inline-flex"
              >
                {dict.common.signIn}
              </Link>
              <Link
                href="/register/client"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "hidden h-9 rounded-full bg-[#0B1F3A] px-4 text-[13px] font-semibold text-white hover:bg-[#0B1F3A]/92 sm:inline-flex",
                )}
              >
                {dict.common.getStarted}
              </Link>
            </>
          )}
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-full border border-[#0B1F3A]/12 text-[#0B1F3A] md:hidden"
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
          className="border-t border-[#0B1F3A]/8 bg-[#F7F6F2] px-5 py-3 md:hidden"
          aria-label="Mobile"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-0.5">
            {links.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full px-4 py-2 text-sm font-medium text-[#0A0F14] hover:bg-white/80"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ))}
            {authUser ? (
              <>
                <Link
                  href={authUser.dashboardHref}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-[#0B1F3A]"
                  onClick={() => setOpen(false)}
                >
                  {authUser.displayName}
                </Link>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="w-full rounded-lg px-4 py-2 text-left text-sm font-medium text-[#5C6570]"
                  >
                    {dict.common.signOut}
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-[#5C6570]"
                  onClick={() => setOpen(false)}
                >
                  {dict.common.signIn}
                </Link>
                <Link
                  href="/register/client"
                  className="mt-2 inline-flex h-10 items-center justify-center rounded-full bg-[#0B1F3A] px-4 text-sm font-semibold text-white"
                  onClick={() => setOpen(false)}
                >
                  {dict.common.getStarted}
                </Link>
              </>
            )}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
