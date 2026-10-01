import type { ReactNode } from "react";

import { requirePageSession } from "@/application/common/session";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { UserRole } from "@/domain/enums";
import { canActAsLawyer, getProfilePath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import { notificationRepository } from "@/infrastructure/repositories";

/**
 * TORE Matter Workspace V1 — Matter is a generic, any-role container (not
 * lawyer-only), so it deliberately has no route-scoped layout.tsx of its
 * own (unlike /client/layout.tsx and /lawyer/layout.tsx, each gated to one
 * role): a shared layout at /matters would force every nested route,
 * including /matters/[matterId]/ai, to inherit the same chrome, but the AI
 * page renders LegalAiChat's own full-page chrome and must not be wrapped
 * in DashboardShell at all. This component is used explicitly by the three
 * pages that DO want the shared shell (list, new, overview); the AI page
 * simply never imports it.
 */
export async function MattersShell({ children }: { children: ReactNode }) {
  const session = await requirePageSession();
  const role = session.user.role as UserRole;
  const shellRole = canActAsLawyer(role) ? "lawyer" : "client";

  const [i18n, unread] = await Promise.all([
    getShellI18n(shellRole),
    notificationRepository.findByUserId(session.user.id, true),
  ]);

  return (
    <DashboardShell
      user={session.user}
      nav={i18n.nav}
      profileHref={getProfilePath(role)}
      notificationsHref={shellRole === "lawyer" ? "/lawyer/notifications" : "/client/notifications"}
      unreadNotificationsCount={unread.items.length}
      notificationsLabel={i18n.dict.dashboard.navNotifications}
      {...i18n.shellProps}
    >
      {children}
    </DashboardShell>
  );
}
