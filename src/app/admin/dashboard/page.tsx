import { redirect } from "next/navigation";
import { Banknote, CalendarClock, Scale, Users } from "lucide-react";
import Link from "next/link";

import { getSessionUser } from "@/application/common/session";
import { getAdminDashboardOverview } from "@/application/actions/admin-dashboard.actions";
import { getAdminPaymentDashboard } from "@/application/actions/admin-payment-center.actions";
import { AdminBookingStatusChart } from "@/components/admin/admin-booking-status-chart";
import { AdminKpiTile } from "@/components/admin/admin-kpi-tile";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import { formatAuditAction, formatDateTimeUlaanbaatar } from "@/lib/format-labels";
import { cn } from "@/lib/utils";

function formatMnt(amount: number): string {
  return `${amount.toLocaleString("mn-MN")}₮`;
}

export default async function AdminDashboardPage() {
  const session = await getSessionUser();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== UserRole.ADMIN) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const [i18n, overview, paymentTotals] = await Promise.all([
    getShellI18n("admin"),
    getAdminDashboardOverview(),
    getAdminPaymentDashboard(),
  ]);
  const m = i18n.dict.marketplace;
  const a = m.admin;
  const ad = m.adminDashboard;
  const au = m.adminUsers;

  const { userCounts, pendingVerifications, bookingCounts, recentActivity } = overview;
  const totalBookings = Object.values(bookingCounts).reduce(
    (sum, count) => sum + count,
    0,
  );

  return (
    <>
      <h1 className="text-2xl font-bold text-ink sm:text-[1.75rem]">
        Сайн байна уу, {session.user.name ?? au.roleAdmin} 👋
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{ad.overviewTitle}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminKpiTile icon={Users} label={ad.totalUsers} value={String(userCounts.total)} />
        <AdminKpiTile
          icon={Scale}
          label={au.roleLawyer}
          value={String(userCounts.byRole[UserRole.LAWYER])}
        />
        <AdminKpiTile
          icon={CalendarClock}
          label="Нийт захиалга"
          value={String(totalBookings)}
        />
        <AdminKpiTile
          icon={Banknote}
          label="Нийт орлого"
          value={formatMnt(paymentTotals.totalRevenueMnt)}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          {/* The Stitch reference's primary chart is a 30-day user-growth
              trend. No daily/time-bucketed history exists anywhere in the
              repository (see P0 Step 2 report) — an honest unavailable
              state is shown instead of a fabricated trend. */}
          <EmptyState
            className="flex h-full min-h-52 flex-col items-center justify-center"
            title="Хэрэглэгчийн өсөлт"
            description="Түүхэн статистик одоогоор бүртгэгдэхгүй байна."
          />
        </div>
        <div className="lg:col-span-5">
          <AdminBookingStatusChart
            bookingCounts={bookingCounts}
            locale={i18n.locale}
            title={ad.bookingsTitle}
            totalLabel="нийт захиалга"
            emptyLabel={ad.bookingsEmpty}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{ad.recentActivityTitle}</CardTitle>
            <CardDescription>
              {ad.recentActivityCount.replace(
                "{n}",
                String(recentActivity.last24hCount),
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {ad.recentActivityEmpty}
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {recentActivity.items.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-workspace-accent/10 text-xs font-semibold text-workspace-accent">
                      {(entry.actorName ?? entry.actorEmail ?? "?")
                        .charAt(0)
                        .toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-ink">
                        {entry.actorEmail ?? entry.actorName ?? "—"}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {formatAuditAction(entry.action, i18n.locale)}{" "}
                        {entry.entityType}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatDateTimeUlaanbaatar(entry.createdAt, i18n.locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/admin/audit"
              className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline"
            >
              {ad.viewAuditLog}
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{a.queueTitle}</CardTitle>
            <CardDescription>
              {pendingVerifications === 0
                ? a.nonePending
                : pendingVerifications === 1
                  ? a.pendingOne
                  : a.pendingMany.replace("{n}", String(pendingVerifications))}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/admin/lawyers"
              className={cn(buttonVariants({ size: "sm" }), "w-fit")}
            >
              {a.openQueue}
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{a.adminTitle}</CardTitle>
            <CardDescription>{a.adminHelp}</CardDescription>
          </CardHeader>
        </Card>
        {process.env.NODE_ENV !== "production" ? (
          <Card>
            <CardHeader>
              <CardTitle>Developer tools</CardTitle>
              <CardDescription>
                Impersonation, bulk verification, and lifecycle toggles for
                local testing. Disabled in production.
              </CardDescription>
              <Link
                href="/admin/dev"
                className={cn(buttonVariants({ size: "sm" }), "mt-2 w-fit")}
              >
                Open dev console
              </Link>
            </CardHeader>
          </Card>
        ) : null}
      </div>
    </>
  );
}
