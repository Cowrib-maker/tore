import { redirect } from "next/navigation";
import {
  Building2,
  CreditCard,
  Globe,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldCheck,
  Tags,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { requirePageSession } from "@/application/common/session";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import {
  WorkspaceShell,
  type WorkspaceNavItem,
} from "@/components/workspace/workspace-shell";

/**
 * Icon-per-route is a WorkspaceShell (sidebar) concern only — the shared
 * nav item list from getShellI18n stays {href,label}, unchanged, so
 * Lawyer/Student (still on DashboardShell) are unaffected.
 */
const ADMIN_NAV_ICONS: Record<string, LucideIcon> = {
  "/admin/dashboard": LayoutDashboard,
  "/admin/lawyers": ShieldCheck,
  "/admin/users": Users,
  "/admin/taxonomy": Tags,
  "/admin/settings": Settings,
  "/admin/homepage": Globe,
  "/admin/audit": ScrollText,
  "/admin/payments": CreditCard,
  "/admin/dev": Wrench,
  "/organizations": Building2,
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePageSession();
  if (session.user.role !== UserRole.ADMIN) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const i18n = await getShellI18n("admin");
  const items: WorkspaceNavItem[] = (i18n.nav ?? []).map((item) => ({
    href: item.href,
    label: item.label,
    icon: ADMIN_NAV_ICONS[item.href],
  }));

  return (
    <WorkspaceShell
      context="admin"
      user={session.user}
      navGroups={[{ items }]}
      locale={i18n.shellProps.locale}
      languageLabel={i18n.shellProps.languageLabel}
      signOutLabel={i18n.shellProps.signOutLabel}
      brand={i18n.shellProps.brand}
      navAriaLabel={i18n.shellProps.navAriaLabel}
    >
      {children}
    </WorkspaceShell>
  );
}
