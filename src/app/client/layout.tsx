import { redirect } from "next/navigation";

import { requirePageSession } from "@/application/common/session";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { UserRole } from "@/domain/enums";
import {
  canActAsClient,
  getDashboardPath,
  getProfilePath,
} from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import { notificationRepository } from "@/infrastructure/repositories";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePageSession();
  if (!canActAsClient(session.user.role as UserRole)) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const [i18n, unread] = await Promise.all([
    getShellI18n("client"),
    notificationRepository.findByUserId(session.user.id, true),
  ]);

  return (
    <DashboardShell
      user={session.user}
      nav={i18n.nav}
      profileHref={getProfilePath(session.user.role as UserRole)}
      notificationsHref="/client/notifications"
      unreadNotificationsCount={unread.items.length}
      notificationsLabel={i18n.dict.dashboard.navNotifications}
      {...i18n.shellProps}
    >
      {children}
    </DashboardShell>
  );
}
