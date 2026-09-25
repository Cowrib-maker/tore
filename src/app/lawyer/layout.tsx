import { redirect } from "next/navigation";

import { requirePageSession } from "@/application/common/session";
import { LawyerAppChrome } from "@/components/layout/lawyer-app-chrome";
import { AccountSharingBanner } from "@/components/account/account-sharing-banner";
import { DeviceSessionBeacon } from "@/components/account/device-session-beacon";
import { UserRole } from "@/domain/enums";
import {
  canActAsLawyer,
  getDashboardPath,
  getProfilePath,
} from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import { notificationRepository } from "@/infrastructure/repositories";

export default async function LawyerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePageSession();
  if (!canActAsLawyer(session.user.role as UserRole)) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const [i18n, unread] = await Promise.all([
    getShellI18n("lawyer"),
    notificationRepository.findByUserId(session.user.id, true),
  ]);

  return (
    <LawyerAppChrome
      user={session.user}
      nav={i18n.nav}
      profileHref={getProfilePath(session.user.role as UserRole)}
      notificationsHref="/lawyer/notifications"
      unreadNotificationsCount={unread.items.length}
      notificationsLabel={i18n.dict.dashboard.navNotifications}
      {...i18n.shellProps}
    >
      <DeviceSessionBeacon />
      <AccountSharingBanner copy={i18n.dict.marketplace.account} />
      {children}
    </LawyerAppChrome>
  );
}
