import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getClientProfileForSession } from "@/application/actions/profile.actions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ProfileMissingState } from "@/components/profiles/profile-missing-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
} from "@/infrastructure/repositories";
import {
  formatBookingStatus,
  formatDateTimeUtc,
} from "@/lib/format-labels";
import { cn } from "@/lib/utils";

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

export default async function ClientBookingsPage() {
  const session = await getSessionUser();
  if (!session?.user) redirect("/login");
  if (session.user.role !== UserRole.CLIENT) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const data = await getClientProfileForSession();
  if (data.status === "unauthenticated") redirect("/login");

  const i18n = await getShellI18n("client");
  const m = i18n.dict.marketplace;
  const locale = i18n.locale;
  const nav = i18n.nav;
  const pageTitle = i18n.pages.bookings;
  const b = m.clientBookings;

  if (data.status === "profile_missing") {
    return (
      <DashboardShell
        user={session.user}
        title={pageTitle}
        nav={nav}
        {...i18n.shellProps}
      >
        <ProfileMissingState
          dashboardHref="/client/dashboard"
          roleLabel="client"
          copy={m.profileMissing}
        />
      </DashboardShell>
    );
  }

  const { items: bookings } = await bookingRepository.findByClientUserId(
    session.user.id,
  );
  const lawyerSlugs = new Map<string, string>();
  await Promise.all(
    bookings.map(async (booking) => {
      if (lawyerSlugs.has(booking.lawyerProfileId)) return;
      const profile = await lawyerProfileRepository.findById(
        booking.lawyerProfileId,
      );
      lawyerSlugs.set(booking.lawyerProfileId, profile?.slug ?? "");
    }),
  );

  return (
    <DashboardShell
      user={session.user}
      title={pageTitle}
      nav={nav}
      {...i18n.shellProps}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{b.intro}</p>
        <Link
          href="/lawyers"
          className={cn(buttonVariants({ size: "sm" }))}
        >
          {m.common.browseLawyers}
        </Link>
      </div>
      <div className="space-y-4">
        {bookings.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{b.emptyTitle}</CardTitle>
              <CardDescription>{b.emptyBody}</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          bookings.map((booking) => {
            const slug = lawyerSlugs.get(booking.lawyerProfileId);
            return (
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
                    {formatDateTimeUtc(booking.scheduledStartAt, locale)}{" "}
                    {m.common.utc}
                    {slug ? (
                      <>
                        {" · "}
                        <Link
                          href={`/lawyers/${slug}`}
                          className="underline underline-offset-4"
                        >
                          {b.lawyerProfile}
                        </Link>
                      </>
                    ) : null}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {booking.issueSummary}
                  </p>
                  {booking.declineReason && (
                    <p className="text-sm text-destructive">
                      {b.declined} {booking.declineReason}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </DashboardShell>
  );
}
