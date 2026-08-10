import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { DashboardShell } from "@/components/layout/dashboard-shell";
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

  const i18n = await getShellI18n("admin");
  const m = i18n.dict.marketplace;
  const a = m.admin;
  const nav = i18n.nav;

  const { items: pending } =
    await lawyerCredentialRepository.findPendingReview();

  return (
    <DashboardShell
      user={session.user}
      title={i18n.title}
      nav={nav}
      {...i18n.shellProps}
    >
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
      </div>
    </DashboardShell>
  );
}
