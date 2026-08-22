import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getAdminHomepageSections } from "@/application/actions/admin-homepage.actions";
import { getAdminHomepageContentAction } from "@/application/actions/admin-homepage-content.actions";
import { AdminHomepageContentEditor } from "@/components/admin/admin-homepage-content-editor";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  HOMEPAGE_SECTION_KEYS,
  type HomepageSectionKey,
} from "@/domain/entities/homepage-section";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function AdminHomepagePage() {
  const session = await getSessionUser();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== UserRole.ADMIN) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const [i18n, result, contentResult, previewDict] = await Promise.all([
    getShellI18n("admin"),
    getAdminHomepageSections(),
    getAdminHomepageContentAction(),
    // Preview always renders the Mongolian layout — that's the version
    // being edited, regardless of the admin's own UI language.
    getDictionary("mn"),
  ]);
  const ah = i18n.dict.marketplace.adminHomepage;
  const imageByKey = new Map(
    result.status === "ok"
      ? result.sections.map((section) => [section.key, section.imageUrl])
      : [],
  );
  const sectionImages = Object.fromEntries(
    HOMEPAGE_SECTION_KEYS.map((key) => [key, imageByKey.get(key) ?? null]),
  ) as Record<HomepageSectionKey, string | null>;

  return (
    <>
      <DashboardPageHeading>{ah.pageTitle}</DashboardPageHeading>
      <Card>
        <CardHeader>
          <CardTitle>{ah.pageTitle}</CardTitle>
          <CardDescription>{ah.pageHelp}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4">
            {contentResult.status === "ok" ? (
              <AdminHomepageContentEditor
                initialContent={contentResult.content}
                initialUpdatedAt={contentResult.updatedAt}
                previewDict={previewDict}
                initialSectionImages={sectionImages}
                imageCopy={ah}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Засварлах эрх алга.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
