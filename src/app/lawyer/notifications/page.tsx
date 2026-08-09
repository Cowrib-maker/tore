import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/actions/auth.actions";
import {
  MarkAllNotificationsReadButton,
  NotificationList,
} from "@/components/marketplace/notification-list";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import { notificationRepository } from "@/infrastructure/repositories";

export default async function LawyerNotificationsPage() {
  const session = await getSessionUser();
  if (!session?.user) redirect("/login");
  if (session.user.role !== UserRole.LAWYER) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const i18n = await getShellI18n("lawyer");
  const m = i18n.dict.marketplace;
  const locale = i18n.locale;
  const notifications = await notificationRepository.findByUserId(
    session.user.id,
  );
  const unread = notifications.filter((n) => !n.readAt).length;

  const copy = {
    ...m.notifications,
    saving: m.common.saving,
    updating: m.common.updating,
    utc: m.common.utc,
  };

  return (
    <DashboardShell
      user={session.user}
      title={i18n.pages.notifications}
      nav={i18n.nav}
      {...i18n.shellProps}
    >
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{m.notifications.title}</CardTitle>
            <CardDescription>
              {unread > 0
                ? unread === 1
                  ? m.notifications.unreadOne
                  : m.notifications.unreadMany.replace("{n}", String(unread))
                : m.notifications.upToDate}
            </CardDescription>
          </div>
          {unread > 0 ? <MarkAllNotificationsReadButton copy={copy} /> : null}
        </CardHeader>
        <CardContent>
          <NotificationList
            notifications={notifications}
            copy={copy}
            locale={locale}
          />
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
