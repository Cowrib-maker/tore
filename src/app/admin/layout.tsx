import { redirect } from "next/navigation";

import { requirePageSession } from "@/application/common/session";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import {
  WorkspaceShell,
  type WorkspaceNavItem,
} from "@/components/workspace/workspace-shell";
import type { WorkspaceIconKey } from "@/components/workspace/workspace-icons";

/**
 * Icon-per-route is a WorkspaceShell (sidebar) concern only — the shared
 * nav item list from getShellI18n stays {href,label}, unchanged. Values
 * here are WORKSPACE_ICONS registry keys, not component references —
 * this map lives in a Server Component, and a component reference can't
 * cross the Server->Client boundary into WorkspaceNavLink. See
 * workspace-icons.ts.
 */
const ADMIN_NAV_ICONS: Record<string, WorkspaceIconKey> = {
  "/admin/dashboard": "layout-dashboard",
  "/admin/lawyers": "shield-check",
  "/admin/users": "users",
  "/admin/taxonomy": "tags",
  "/admin/settings": "settings",
  "/admin/homepage": "globe",
  "/admin/content": "globe",
  "/admin/preview": "layout-dashboard",
  "/admin/audit": "scroll-text",
  "/admin/payments": "credit-card",
  "/admin/dev": "wrench",
  "/organizations": "building-2",
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
  const isMn = i18n.locale === "mn";
  const controlCenterItems = [
    { href: "/admin/content", label: isMn ? "Сайтын агуулга" : "Site content" },
    { href: "/admin/preview", label: isMn ? "Дүрээр урьдчилан харах" : "Role preview" },
  ];
  const items: WorkspaceNavItem[] = [...(i18n.nav ?? []), ...controlCenterItems].map((item) => ({
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
