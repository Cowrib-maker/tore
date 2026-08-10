import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import {
  MarkAllNotificationsReadButton,
  NotificationList,
} from "@/components/marketplace/notification-list";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
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

export default async function ClientNotificationsPage() {
  const session = await getSessionUser();
  if (!session?.user) redirect("/login");
  if (session.user.role !== UserRole.CLIENT) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const [i18n, { items: notifications }] = await Promise.all([
    getShellI18n("client"),
    notificationRepository.findByUserId(session.user.id),
  ]);
  const m = i18n.dict.marketplace;
  const locale = i18n.locale;
  const unread = notifications.filter((n) => !n.readAt).length;

  const copy = {
    ...m.notifications,
    saving: m.common.saving,
    updating: m.common.updating,
    utc: m.common.utc,
  };

  return (
    <>
      <DashboardPageHeading>{i18n.pages.notifications}</DashboardPageHeading>
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
    </>
  );
}
