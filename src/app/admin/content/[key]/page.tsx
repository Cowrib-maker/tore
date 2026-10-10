import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdminPage } from "@/application/common/require-admin-page";
import { getSiteContentItemUseCase } from "@/application/use-cases/site-content/manage-site-content";
import { SiteContentEditor, type EditorLocaleData } from "@/components/admin/site-content/site-content-editor";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DomainError } from "@/domain/errors/domain-error";
import { SITE_CONTENT_LOCALES, SITE_CONTENT_PAGES, SITE_CONTENT_SECTION_LABELS } from "@/domain/site-content/registry";
import { siteContentRepository } from "@/infrastructure/repositories";
import { formatDateTimeUtc } from "@/lib/format-labels";

export const dynamic = "force-dynamic";

export default async function AdminSiteContentItemPage({ params }: { params: Promise<{ key: string }> }) {
  const actor = await requireAdminPage();
  const { key } = await params;
  let data;
  try {
    data = await getSiteContentItemUseCase(actor, decodeURIComponent(key), { siteContentRepository });
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const { item, revisions } = data;
  const locales: EditorLocaleData[] = SITE_CONTENT_LOCALES.map((locale) => {
    const view = item.locales[locale];
    return {
      locale,
      defaultValue: view.defaultValue,
      publishedValue: view.publishedValue,
      editorValue: view.editorValue,
      version: view.version,
      hasPendingDraft: view.hasPendingDraft,
      publishedRevision: view.publishedRevision,
      publishedAtLabel: view.publishedAt ? formatDateTimeUtc(view.publishedAt) : null,
      publishedByLabel: view.publishedByLabel,
      updatedAtLabel: view.updatedAt ? formatDateTimeUtc(view.updatedAt) : null,
      updatedByLabel: view.updatedByLabel,
      revisions: revisions[locale].map((r) => ({
        revision: r.revision,
        value: r.value,
        createdAtLabel: formatDateTimeUtc(r.createdAt),
        createdByLabel: r.createdByLabel,
      })),
    };
  });

  const pageInfo = SITE_CONTENT_PAGES.find((p) => p.id === item.definition.page)!;
  const placement = {
    pageTitle: pageInfo.title.mn,
    route: pageInfo.route,
    sectionTitle: SITE_CONTENT_SECTION_LABELS[item.definition.section].mn,
    previewPage: pageInfo.previewPage,
  };

  return (
    <>
      <DashboardPageHeading>{item.definition.label.mn}</DashboardPageHeading>
      <Card>
        <CardHeader>
          <CardTitle>
            {item.definition.label.mn} · {item.definition.label.en}
          </CardTitle>
          <CardDescription>
            <code>{item.definition.key}</code> — Ноорог хадгалах нь олон нийтэд нөлөөлөхгүй. «Нийтлэх» дарсны дараа нүүр хуудас шинэчлэгдэнэ.{" "}
            <Link href="/admin/content" className="underline">← Жагсаалт руу</Link>
          </CardDescription>
          {item.definition.note ? (
            <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-950" role="note">
              {item.definition.note.mn} <span className="text-xs">({item.definition.note.en})</span>
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          <SiteContentEditor definition={item.definition} locales={locales} placement={placement} />
        </CardContent>
      </Card>
    </>
  );
}
