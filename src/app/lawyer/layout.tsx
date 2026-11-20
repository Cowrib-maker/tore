import { redirect } from "next/navigation";

import { requirePageSession } from "@/application/common/session";
import { loadLawyerLicenseState } from "@/application/use-cases/lawyers/load-lawyer-license-state";
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
import {
  lawyerProfileRepository,
  notificationRepository,
} from "@/infrastructure/repositories";
import { formatTodayLabelMn } from "@/lib/format-labels";

export default async function LawyerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePageSession();
  if (!canActAsLawyer(session.user.role as UserRole)) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  // canActAsLawyer also admits ADMIN, who has no lawyer plan: the plan card (and its
  // LAWYER-only status endpoint) is for lawyer accounts only. `undefined` hides the card.
  const isLawyer = session.user.role === UserRole.LAWYER;

  const [i18n, unread, lawyerProfile, licenseState] = await Promise.all([
    getShellI18n("lawyer"),
    notificationRepository.findByUserId(session.user.id, true),
    lawyerProfileRepository.findByUserId(session.user.id),
    isLawyer ? loadLawyerLicenseState(session.user.id) : Promise.resolve(undefined),
  ]);

  // Computed once, server-side, and rendered verbatim by the client — never
  // recomputed in the browser — so the workspace header's date chip can
  // never hydration-mismatch. See lawyer-workspace-frame.tsx TodayChip.
  // Uses the lawyer's own configured timezone (falling back to UTC only if
  // no profile exists yet), matching the calendar day loadLawyerWorkspaceHome
  // computes for the booking counts shown in the same workspace.
  const todayLabel = formatTodayLabelMn(
    new Date(),
    lawyerProfile?.timezone ?? "UTC",
    i18n.locale,
  );

  return (
    <LawyerAppChrome
      user={session.user}
      nav={i18n.nav}
      profileHref={getProfilePath(session.user.role as UserRole)}
      notificationsHref="/lawyer/notifications"
      unreadNotificationsCount={unread.items.length}
      notificationsLabel={i18n.dict.dashboard.navNotifications}
      todayLabel={todayLabel}
      licenseState={licenseState}
      {...i18n.shellProps}
    >
      <DeviceSessionBeacon />
      <AccountSharingBanner copy={i18n.dict.marketplace.account} />
      {children}
    </LawyerAppChrome>
  );
}
