import Link from "next/link";

import { requireAdminPage } from "@/application/common/require-admin-page";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PRODUCT_COVERAGE } from "@/domain/admin-preview/product-coverage";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

const CHECKOUT_LABEL = {
  simulated: "Симуляци хийгдэнэ",
  "read-only": "Зөвхөн унших",
  missing: "Хэрэгжээгүй",
  "other-branch": "Тусдаа салбарт (main-д байхгүй)",
} as const;

export default async function AdminPreviewCoveragePage() {
  await requireAdminPage();
  return (
    <>
      <DashboardPageHeading>Бүтээгдэхүүний хэрэгжилтийн байдал</DashboardPageHeading>
      <Card>
        <CardHeader>
          <CardTitle>Юу бодитоор байгаа вэ</CardTitle>
          <CardDescription>
            Зөвхөн кодод бодитоор хэрэгжсэн зүйлийг симуляци хийнэ. Байхгүй зүйлийг байгаа мэт харуулахгүй. <Link href="/admin/preview" className="underline">← Буцах</Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {PRODUCT_COVERAGE.map((product) => (
            <section key={product.id} data-product={product.id} className="rounded-lg border p-3">
              <h2 className="font-semibold">
                {product.name} · <span className="font-normal">{CHECKOUT_LABEL[product.checkout]}</span>
              </h2>
              <p className="text-sm">{product.summary}</p>
              {product.previewHref ? (
                <p className="text-sm">
                  <Link href={product.previewHref} className="underline">Урьдчилан харах →</Link>
                </p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">Эх сурвалж: {product.evidence.join(" · ")}</p>
              {product.gaps.length > 0 ? (
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {product.gaps.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
