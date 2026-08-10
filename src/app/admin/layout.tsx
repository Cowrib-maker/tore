import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== UserRole.ADMIN) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const i18n = await getShellI18n("admin");

  return (
    <DashboardShell
      user={session.user}
      nav={i18n.nav}
      {...i18n.shellProps}
    >
      {children}
    </DashboardShell>
  );
}
