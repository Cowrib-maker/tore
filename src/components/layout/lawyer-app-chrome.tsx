"use client";

import { usePathname } from "next/navigation";
import {
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  CreditCard,
  FolderOpen,
  LayoutDashboard,
  LayoutGrid,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { LawyerWorkspaceFrame } from "@/components/case-review/lawyer-workspace-frame";
import type { DashboardNavItem } from "@/components/layout/dashboard-shell";
import {
  WorkspaceShell,
  type WorkspaceNavItem,
} from "@/components/workspace/workspace-shell";
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
  notificationsHref?: string | null;
  unreadNotificationsCount?: number;
  notificationsLabel?: string;
  /** Server-computed "YYYY.MM.DD Weekday" label — see lawyer/layout.tsx. */
  todayLabel?: string;
};

/**
 * Icon-per-route is a WorkspaceShell (sidebar) concern only — the shared
 * nav item list from getShellI18n("lawyer") stays {href,label}, unchanged.
 * /lawyer/workspace keeps its own icon here too even though clicking it
 * navigates to a route rendered by LawyerWorkspaceFrame, not WorkspaceShell
 * — it's still a real outbound link from every other lawyer page.
 */
const LAWYER_NAV_ICONS: Record<string, LucideIcon> = {
  "/lawyer/dashboard": LayoutDashboard,
  "/lawyer/workspace": LayoutGrid,
  "/lawyer/workspace/cases": FolderOpen,
  "/lawyer/offerings": Briefcase,
  "/lawyer/bookings": CalendarClock,
  "/billing": CreditCard,
  "/lawyer/notifications": Bell,
  "/legal-ai": Sparkles,
  "/organizations": Building2,
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
  profileHref,
  notificationsHref,
  unreadNotificationsCount,
  todayLabel,
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
        unreadNotificationsCount={unreadNotificationsCount}
        todayLabel={todayLabel}
      >
        {children}
      </LawyerWorkspaceFrame>
    );
  }

  const items: WorkspaceNavItem[] = (nav ?? []).map((item) => ({
    href: item.href,
    label: item.label,
    icon: LAWYER_NAV_ICONS[item.href],
    badge:
      item.href === notificationsHref ? unreadNotificationsCount : undefined,
  }));

  return (
    <WorkspaceShell
      context="lawyer"
      user={user}
      navGroups={[{ items }]}
      locale={locale}
      languageLabel={languageLabel}
      signOutLabel={signOutLabel}
      brand={brand}
      navAriaLabel={navAriaLabel}
      profileHref={profileHref}
    >
      {children}
    </WorkspaceShell>
  );
}
