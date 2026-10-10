import Link from "next/link";

import { requireAdminPage } from "@/application/common/require-admin-page";
import { listSiteContentUseCase, type SiteContentLocaleView } from "@/application/use-cases/site-content/manage-site-content";
import { SiteContentList, type SiteContentListRow } from "@/components/admin/site-content/site-content-list";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { siteContentRepository } from "@/infrastructure/repositories";

export const dynamic = "force-dynamic";

function stateOf(view: SiteContentLocaleView): "default" | "published" | "draft" {
  return view.hasPendingDraft ? "draft" : view.publishedValue !== null ? "published" : "default";
}

export default async function AdminSiteContentPage() {
  const actor = await requireAdminPage();
  const items = await listSiteContentUseCase(actor, { siteContentRepository });
  const rows: SiteContentListRow[] = items.map(({ definition, locales }) => ({
    key: definition.key,
    page: definition.page,
    section: definition.section,
    labelMn: definition.label.mn,
    labelEn: definition.label.en,
    preview: locales.mn.editorValue,
    mn: stateOf(locales.mn),
    en: stateOf(locales.en),
  }));

  return (
    <>
      <DashboardPageHeading>Вэб сайтын агуулга</DashboardPageHeading>
      <Card>
        <CardHeader>
          <CardTitle>Засварлах боломжтой нийтийн текст</CardTitle>
          <CardDescription>
            Зөвхөн энгийн текст. Үнэ, төлбөр, лицензийн нөхцөл, хандах эрх, нууцлал болон хууль зүйн нөхцөлийг энд засахгүй. Ноорог нь нийтлэх хүртэл олон нийтэд харагдахгүй.
          </CardDescription>
          <Link href="/admin/preview" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Хэрэглэгчийн хэлбэрээр урьдчилан харах
          </Link>
        </CardHeader>
        <CardContent>
          <SiteContentList rows={rows} />
        </CardContent>
      </Card>
    </>
  );
}
