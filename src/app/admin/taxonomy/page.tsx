import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { AdminCreateLanguageForm } from "@/components/admin/admin-create-language-form";
import { AdminCreatePracticeAreaForm } from "@/components/admin/admin-create-practice-area-form";
import { AdminLanguageRow } from "@/components/admin/admin-language-row";
import { AdminPracticeAreaRow } from "@/components/admin/admin-practice-area-row";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PillTopTabs } from "@/components/ui/pill-top-tabs";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import {
  languageRepository,
  practiceAreaRepository,
} from "@/infrastructure/repositories";

export default async function AdminTaxonomyPage() {
  const session = await getSessionUser();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== UserRole.ADMIN) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const [i18n, practiceAreas, languages] = await Promise.all([
    getShellI18n("admin"),
    practiceAreaRepository.findAll(),
    languageRepository.findAll(),
  ]);
  const m = i18n.dict.marketplace;
  const at = m.adminTaxonomy;
  const copy = { ...at, saving: m.common.saving };

  return (
    <>
      <DashboardPageHeading>{at.pageTitle}</DashboardPageHeading>
      <PillTopTabs
        defaultValue="practice-areas"
        items={[
          {
            value: "practice-areas",
            label: at.practiceAreasTitle,
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>{at.practiceAreasTitle}</CardTitle>
                  <CardDescription>{at.practiceAreasHelp}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <AdminCreatePracticeAreaForm copy={copy} />
                  <div>
                    {practiceAreas.map((area) => (
                      <AdminPracticeAreaRow
                        key={area.id}
                        area={area}
                        copy={copy}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            value: "languages",
            label: at.languagesTitle,
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>{at.languagesTitle}</CardTitle>
                  <CardDescription>{at.languagesHelp}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <AdminCreateLanguageForm copy={copy} />
                  <div>
                    {languages.map((language) => (
                      <AdminLanguageRow
                        key={language.id}
                        language={language}
                        copy={copy}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ),
          },
        ]}
      />
    </>
  );
}
