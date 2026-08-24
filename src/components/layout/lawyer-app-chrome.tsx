"use client";

import { usePathname } from "next/navigation";

import { LawyerWorkspaceFrame } from "@/components/case-review/lawyer-workspace-frame";
import {
  DashboardShell,
  type DashboardNavItem,
} from "@/components/layout/dashboard-shell";
import type { Locale } from "@/i18n/config";

type Props = {
  children: React.ReactNode;
  user: { name?: string | null; email?: string | null };
  nav?: DashboardNavItem[];
  locale: Locale;
  languageLabel: string;
  signOutLabel: string;
  brand?: string;
  navAriaLabel?: string;
  mobileNavLabel?: string;
  profileHref?: string | null;
};

export function LawyerAppChrome({
  children,
  user,
  nav,
  locale,
  languageLabel,
  signOutLabel,
  brand,
  navAriaLabel,
  mobileNavLabel,
  profileHref,
}: Props) {
  const pathname = usePathname();

  if (pathname === "/lawyer/workspace") {
    return (
      <LawyerWorkspaceFrame
        user={user}
        profileHref={profileHref || "/lawyer/profile"}
        locale={locale}
        languageLabel={languageLabel}
        signOutLabel={signOutLabel}
      >
        {children}
      </LawyerWorkspaceFrame>
    );
  }

  return (
    <DashboardShell
      user={user}
      nav={nav}
      locale={locale}
      languageLabel={languageLabel}
      signOutLabel={signOutLabel}
      brand={brand}
      navAriaLabel={navAriaLabel}
      mobileNavLabel={mobileNavLabel}
      profileHref={profileHref}
    >
      {children}
    </DashboardShell>
  );
}
