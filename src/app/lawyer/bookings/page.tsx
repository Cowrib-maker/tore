import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getLawyerProfileForSession } from "@/application/actions/profile.actions";
import { LawyerBookingActions } from "@/components/marketplace/lawyer-booking-actions";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { ProfileMissingState } from "@/components/profiles/profile-missing-state";
import { Badge } from "@/components/ui/badge";
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
import {
  bookingRepository,
  userRepository,
} from "@/infrastructure/repositories";
import {
  formatBookingStatus,
  formatDateTimeUtc,
} from "@/lib/format-labels";

function statusVariant(
  status: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "CONFIRMED":
      return "default";
    case "PENDING_ACCEPTANCE":
      return "secondary";
    case "CANCELLED":
      return "destructive";
    default:
      return "outline";
  }
}

export default async function LawyerBookingsPage() {
  const session = await getSessionUser();
  if (!session?.user) redirect("/login");
  if (session.user.role !== UserRole.LAWYER) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const [data, i18n] = await Promise.all([
    getLawyerProfileForSession(),
    getShellI18n("lawyer"),
  ]);
  if (data.status === "unauthenticated") redirect("/login");

  const m = i18n.dict.marketplace;
  const locale = i18n.locale;
  const pageTitle = i18n.pages.bookings;
  const b = m.lawyerBookings;

  if (data.status === "profile_missing") {
    return (
      <>
        <DashboardPageHeading>{pageTitle}</DashboardPageHeading>
        <ProfileMissingState
          dashboardHref="/lawyer/dashboard"
          roleLabel="lawyer"
          copy={m.profileMissing}
        />
      </>
    );
  }

  const { items: bookings } = await bookingRepository.findByLawyerProfileId(
    data.profile.id,
  );

  const uniqueClientIds = [...new Set(bookings.map((b) => b.clientUserId))];
  const clients = await userRepository.findByIds(uniqueClientIds);
  const clientNames = new Map(
    clients.map((user) => [
      user.id,
      user.name ?? user.email ?? m.common.clientFallback,
    ]),
  );

  const actionsCopy = {
    ...m.bookingActions,
    saving: m.common.saving,
  };

  return (
    <>
      <DashboardPageHeading>{pageTitle}</DashboardPageHeading>
      <p className="mb-5 text-sm text-muted-foreground">
        {b.intro}{" "}
        <Link
          href="/lawyer/notifications"
          className="underline underline-offset-4"
        >
          {m.common.openNotifications}
        </Link>
      </p>
      <div className="space-y-4">
        {bookings.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{b.emptyTitle}</CardTitle>
              <CardDescription>{b.emptyBody}</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          bookings.map((booking) => (
            <Card key={booking.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {booking.bookingNumber}
                  </CardTitle>
                  <Badge variant={statusVariant(booking.status)}>
                    {formatBookingStatus(booking.status, locale)}
                  </Badge>
                </div>
                <CardDescription>
                  {clientNames.get(booking.clientUserId) ??
                    m.common.clientFallback}{" "}
                  · {formatDateTimeUtc(booking.scheduledStartAt, locale)} –{" "}
                  {formatDateTimeUtc(booking.scheduledEndAt, locale)}{" "}
                  {m.common.utc}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {booking.issueSummary}
                </p>
                {booking.declineReason && (
                  <p className="text-sm text-destructive">
                    {b.declineReason} {booking.declineReason}
                  </p>
                )}
                <LawyerBookingActions booking={booking} copy={actionsCopy} />
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
