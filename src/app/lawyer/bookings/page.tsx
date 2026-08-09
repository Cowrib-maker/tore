import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/actions/auth.actions";
import { getLawyerProfileForSession } from "@/application/actions/profile.actions";
import { LawyerBookingActions } from "@/components/marketplace/lawyer-booking-actions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
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
  lawyerProfileRepository,
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

  const data = await getLawyerProfileForSession();
  if (data.status === "unauthenticated") redirect("/login");

  const i18n = await getShellI18n("lawyer");
  const m = i18n.dict.marketplace;
  const locale = i18n.locale;
  const nav = i18n.nav;
  const pageTitle = i18n.pages.bookings;
  const b = m.lawyerBookings;

  if (data.status === "profile_missing") {
    return (
      <DashboardShell
        user={session.user}
        title={pageTitle}
        nav={nav}
        {...i18n.shellProps}
      >
        <ProfileMissingState
          dashboardHref="/lawyer/dashboard"
          roleLabel="lawyer"
          copy={m.profileMissing}
        />
      </DashboardShell>
    );
  }

  const profile = await lawyerProfileRepository.findByUserId(session.user.id);
  const bookings = profile
    ? await bookingRepository.findByLawyerProfileId(profile.id)
    : [];

  const clientNames = new Map<string, string>();
  await Promise.all(
    bookings.map(async (booking) => {
      if (clientNames.has(booking.clientUserId)) return;
      const user = await userRepository.findById(booking.clientUserId);
      clientNames.set(
        booking.clientUserId,
        user?.name ?? user?.email ?? m.common.clientFallback,
      );
    }),
  );

  const actionsCopy = {
    ...m.bookingActions,
    saving: m.common.saving,
  };

  return (
    <DashboardShell
      user={session.user}
      title={pageTitle}
      nav={nav}
      {...i18n.shellProps}
    >
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
                  {clientNames.get(booking.clientUserId)} ·{" "}
                  {formatDateTimeUtc(booking.scheduledStartAt, locale)} –{" "}
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
    </DashboardShell>
  );
}
