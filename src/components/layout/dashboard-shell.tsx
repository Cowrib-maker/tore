import Link from "next/link";

import { logoutAction } from "@/application/actions/auth.actions";
import { BRAND_LOGO_SHELL, BRAND_NAME } from "@/components/brand/tokens";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { BrandLink } from "@/components/layout/brand-link";
import { DashboardMobileNav } from "@/components/layout/dashboard-mobile-nav";
import { DashboardNavLinks } from "@/components/layout/dashboard-nav-links";
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
  /** Page title rendered above children. Omit when the page supplies its own heading. */
  title?: string;
  nav?: DashboardNavItem[];
  locale: Locale;
  languageLabel: string;
  signOutLabel: string;
  brand?: string;
  navAriaLabel?: string;
  mobileNavLabel?: string;
  /** Self-service profile page. When set, the header name links there. */
  profileHref?: string | null;
}

export function DashboardPageHeading({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <h1 className="mb-5 text-xl font-semibold tracking-tight sm:mb-6 sm:text-2xl">
      {children}
    </h1>
  );
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
  profileHref,
}: DashboardShellProps) {
  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-6">
            <BrandLink brand={brand} logo={BRAND_LOGO_SHELL} />
            {nav && nav.length > 0 && (
              <>
                <nav
                  className="hidden min-w-0 flex-1 items-center gap-1.5 overflow-x-auto sm:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  aria-label={navAriaLabel}
                >
                  <DashboardNavLinks items={nav} />
                </nav>
                <DashboardMobileNav items={nav} label={mobileNavLabel} />
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <LanguageSwitcher locale={locale} label={languageLabel} />
            {profileHref ? (
              <Link
                href={profileHref}
                className="hidden max-w-[10rem] truncate text-sm text-muted-foreground hover:text-foreground hover:underline md:inline"
              >
                {user.name ?? user.email}
              </Link>
            ) : (
              <span className="hidden max-w-[10rem] truncate text-sm text-muted-foreground md:inline">
                {user.name ?? user.email}
              </span>
            )}
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
        {title ? <DashboardPageHeading>{title}</DashboardPageHeading> : null}
        {children}
      </main>
    </div>
  );
}
