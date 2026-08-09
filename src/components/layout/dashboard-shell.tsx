import Link from "next/link";

import { logoutAction } from "@/application/actions/auth.actions";
import { BRAND_LOGO_SHELL, BRAND_NAME } from "@/components/brand/tokens";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { BrandLink } from "@/components/layout/brand-link";
import { DashboardMobileNav } from "@/components/layout/dashboard-mobile-nav";
import { buttonVariants } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

export type DashboardNavItem = {
  href: string;
  label: string;
};

interface DashboardShellProps {
  children: React.ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
  };
  title: string;
  nav?: DashboardNavItem[];
  locale: Locale;
  languageLabel: string;
  signOutLabel: string;
  brand?: string;
  navAriaLabel?: string;
  mobileNavLabel?: string;
}

export function DashboardShell({
  children,
  user,
  title,
  nav,
  locale,
  languageLabel,
  signOutLabel,
  brand = BRAND_NAME,
  navAriaLabel = "Main navigation",
  mobileNavLabel = "Navigate",
}: DashboardShellProps) {
  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 sm:gap-6">
            <BrandLink brand={brand} logo={BRAND_LOGO_SHELL} />
            {nav && nav.length > 0 && (
              <>
                <nav
                  className="hidden items-center gap-4 sm:flex"
                  aria-label={navAriaLabel}
                >
                  {nav.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
                <DashboardMobileNav items={nav} label={mobileNavLabel} />
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <LanguageSwitcher locale={locale} label={languageLabel} />
            <span className="hidden max-w-[10rem] truncate text-sm text-muted-foreground md:inline">
              {user.name ?? user.email}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "cursor-pointer",
                )}
              >
                {signOutLabel}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
        <h1 className="mb-5 text-xl font-semibold tracking-tight sm:mb-6 sm:text-2xl">
          {title}
        </h1>
        {children}
      </main>
    </div>
  );
}
