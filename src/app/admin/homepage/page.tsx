import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getAdminHomepageSections } from "@/application/actions/admin-homepage.actions";
import { AdminHomepageSectionRow } from "@/components/admin/admin-homepage-section-row";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HOMEPAGE_SECTION_KEYS } from "@/domain/entities/homepage-section";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";

export default async function AdminHomepagePage() {
  const session = await getSessionUser();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== UserRole.ADMIN) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const [i18n, result] = await Promise.all([
    getShellI18n("admin"),
    getAdminHomepageSections(),
  ]);
  const ah = i18n.dict.marketplace.adminHomepage;
  const imageByKey = new Map(
    result.status === "ok"
      ? result.sections.map((section) => [section.key, section.imageUrl])
      : [],
  );

  return (
    <>
      <DashboardPageHeading>{ah.pageTitle}</DashboardPageHeading>
      <Card>
        <CardHeader>
          <CardTitle>{ah.pageTitle}</CardTitle>
          <CardDescription>{ah.pageHelp}</CardDescription>
        </CardHeader>
        <CardContent>
          {HOMEPAGE_SECTION_KEYS.map((key) => (
            <AdminHomepageSectionRow
              key={key}
              sectionKey={key}
              imageUrl={imageByKey.get(key) ?? null}
              copy={ah}
            />
          ))}
        </CardContent>
      </Card>
    </>
  );
}
