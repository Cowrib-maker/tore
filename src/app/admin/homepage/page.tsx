import Link from "next/link";

import { requireAdminPage } from "@/application/common/require-admin-page";
import { buildLegacyImportReportUseCase } from "@/application/use-cases/site-content/legacy-homepage-import";
import { LegacyImportButton } from "@/components/admin/site-content/legacy-import-button";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { homepageContentRepository, siteContentRepository } from "@/infrastructure/repositories";

export const dynamic = "force-dynamic";

const STATUS_TEXT = {
  importable: "Ноорог болгон импортлоно",
  managed: "Шинэ системд аль хэдийн засварласан — өөрчлөхгүй",
  invalid: "Шалгалтад тэнцээгүй — импортлохгүй",
} as const;

/**
 * Replacement for the retired homepage text editor. That editor saved overrides the live site never read; text is now managed in
 * /admin/content. This page keeps the old data visible and lets an administrator move still-relevant edits into the new system as DRAFTS.
 */
export default async function AdminHomepageRetiredPage() {
  const actor = await requireAdminPage();
  const report = await buildLegacyImportReportUseCase(actor, { siteContentRepository, homepageContentRepository });
  const importable = report.rows.filter((r) => r.status === "importable").length;

  return (
    <>
      <DashboardPageHeading>Нүүр хуудасны текст — шинэ газар руу шилжсэн</DashboardPageHeading>
      <Card>
        <CardHeader>
          <CardTitle>Энэ засварлагч хаагдсан</CardTitle>
          <CardDescription>
            Хуучин засварлагчийн хадгалсан текст нийтийн нүүр хуудсанд хэзээ ч харагдаагүй. Одоо бүх нийтийн текстийг нэг газраас — «Вэб сайтын агуулга» хэсгээс — ноорог,
            урьдчилан харах, нийтлэх, хувилбарын түүхтэйгээр засна. Хуучин мэдээлэл устаагүй, хэвээр хадгалагдаж байна.
          </CardDescription>
          <Link href="/admin/content" className={buttonVariants({ size: "sm" })}>Вэб сайтын агуулга руу очих</Link>
        </CardHeader>
        <CardContent className="space-y-5">
          <section aria-labelledby="legacy-summary" className="space-y-2">
            <h2 id="legacy-summary" className="font-semibold">Хуучин засварлагчийн хадгалсан өгөгдөл</h2>
            <p className="text-sm text-muted-foreground">
              Олдсон хэл: {report.legacyLocalesFound.length ? report.legacyLocalesFound.join(", ") : "—"} · Шинэ системийн түлхүүртэй таарсан засвар:{" "}
              <strong>{report.rows.length}</strong> · Таарах түлхүүргүй (нийтийн хуудсанд ашиглагддаггүй, зөвхөн хадгалагдсан): <strong>{report.unmappedChangedFields}</strong>
            </p>
            {report.rows.length === 0 ? (
              <p className="text-sm">Шилжүүлэх засвар олдсонгүй — хийх зүйл алга.</p>
            ) : (
              <table className="w-full text-sm" aria-label="Импортлох засварууд">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground"><th>Түлхүүр</th><th>Хэл</th><th>Хуучин засвар</th><th>Одоогийн анхдагч</th><th>Үйлдэл</th></tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={`${row.key}:${row.locale}`} className="border-t align-top">
                      <td><code className="text-xs">{row.key}</code></td>
                      <td>{row.locale.toUpperCase()}</td>
                      <td lang={row.locale}>{row.legacyValue}</td>
                      <td lang={row.locale} className="text-muted-foreground">{row.builtInValue}</td>
                      <td>{STATUS_TEXT[row.status]}{row.reason ? ` (${row.reason})` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <LegacyImportButton importable={importable} />
            <p className="text-xs text-muted-foreground">Импорт нь зөвхөн ноорог үүсгэнэ — нийтэд харагдахгүй. Таны хянан нийтлэх хүртэл өөрчлөлт гарахгүй.</p>
          </section>
          <section aria-labelledby="images" className="space-y-1">
            <h2 id="images" className="font-semibold">Хэсгийн зургууд</h2>
            <p className="text-sm text-muted-foreground">
              Хуучин хуудсан дээрх хэсгийн зургууд өгөгдлийн санд хадгалагдсан хэвээр бөгөөд өөрчлөгдөөгүй. Нийтийн нүүр хуудас эдгээрийг одоогоор уншдаггүй тул энд удирдах хэрэгсэл үлдээгээгүй.
            </p>
          </section>
        </CardContent>
      </Card>
    </>
  );
}
