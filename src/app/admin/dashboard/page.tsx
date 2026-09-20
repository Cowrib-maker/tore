import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getAdminDashboardOverview } from "@/application/actions/admin-dashboard.actions";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import { formatAuditAction, formatBookingStatus, formatDateTimeUtc } from "@/lib/format-labels";
import { cn } from "@/lib/utils";
import Link from "next/link";

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export default async function AdminDashboardPage() {
  const session = await getSessionUser();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== UserRole.ADMIN) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const [i18n, overview] = await Promise.all([
    getShellI18n("admin"),
    getAdminDashboardOverview(),
  ]);
  const m = i18n.dict.marketplace;
  const a = m.admin;
  const ad = m.adminDashboard;
  const au = m.adminUsers;

  const { userCounts, pendingVerifications, bookingCounts, recentActivity } = overview;

  return (
    <>
      <DashboardPageHeading>{i18n.title}</DashboardPageHeading>

      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        {ad.overviewTitle}
      </h2>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={ad.totalUsers} value={userCounts.total} />
        <KpiCard label={au.roleClient} value={userCounts.byRole[UserRole.CLIENT]} />
        <KpiCard label={au.roleLawyer} value={userCounts.byRole[UserRole.LAWYER]} />
        <KpiCard label={au.roleAdmin} value={userCounts.byRole[UserRole.ADMIN]} />
        <KpiCard label={ad.activeUsers} value={userCounts.byStatus.ACTIVE} />
        <KpiCard label={ad.suspendedUsers} value={userCounts.byStatus.SUSPENDED} />
        <KpiCard label={ad.pendingVerifications} value={pendingVerifications} />
        <KpiCard label={ad.recentActivityTitle} value={recentActivity.last24hCount} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{ad.bookingsTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.values(bookingCounts).every((count) => count === 0) ? (
              <p className="text-sm text-muted-foreground">{ad.bookingsEmpty}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                {Object.entries(bookingCounts).map(([status, count]) => (
                  <li key={status} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {formatBookingStatus(status, i18n.locale)}
                    </span>
                    <span className="tabular-nums font-medium">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

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
              <ul className="space-y-2 text-sm">
                {recentActivity.items.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-b border-border/60 pb-2 last:border-0 last:pb-0">
                    <span>
                      <span className="font-medium">
                        {entry.actorEmail ?? entry.actorName ?? "—"}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {formatAuditAction(entry.action, i18n.locale)} {entry.entityType}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTimeUtc(entry.createdAt, i18n.locale)}
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
            <Link
              href="/admin/lawyers"
              className={cn(buttonVariants({ size: "sm" }), "mt-2 w-fit")}
            >
              {a.openQueue}
            </Link>
          </CardHeader>
        </Card>
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
