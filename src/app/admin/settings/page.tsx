import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { AdminSettingRow } from "@/components/admin/admin-setting-row";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import { platformSettingRepository } from "@/infrastructure/repositories";

export default async function AdminSettingsPage() {
  const session = await getSessionUser();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== UserRole.ADMIN) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const [i18n, settings] = await Promise.all([
    getShellI18n("admin"),
    platformSettingRepository.findAll(),
  ]);
  const m = i18n.dict.marketplace;
  const as = m.adminSettings;
  const copy = { ...as, saving: m.common.saving };

  return (
    <>
      <DashboardPageHeading>{as.pageTitle}</DashboardPageHeading>
      <Card>
        <CardHeader>
          <CardTitle>{as.pageTitle}</CardTitle>
          <CardDescription>{as.pageHelp}</CardDescription>
        </CardHeader>
        <CardContent>
          {settings.map((setting) => (
            <AdminSettingRow key={setting.key} setting={setting} copy={copy} />
          ))}
        </CardContent>
      </Card>
    </>
  );
}
