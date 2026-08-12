import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { lawyerCredentialRepository } from "@/infrastructure/repositories";

export default async function AdminDashboardPage() {
  const session = await getSessionUser();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== UserRole.ADMIN) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const [i18n, { items: pending }] = await Promise.all([
    getShellI18n("admin"),
    lawyerCredentialRepository.findPendingReview(),
  ]);
  const m = i18n.dict.marketplace;
  const a = m.admin;

  return (
    <>
      <DashboardPageHeading>{i18n.title}</DashboardPageHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{a.queueTitle}</CardTitle>
            <CardDescription>
              {pending.length === 0
                ? a.nonePending
                : pending.length === 1
                  ? a.pendingOne
                  : a.pendingMany.replace("{n}", String(pending.length))}
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
