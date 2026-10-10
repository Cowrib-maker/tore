import Link from "next/link";

import { requireAdminPage } from "@/application/common/require-admin-page";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BILLING_PREVIEW_SCENARIOS, BILLING_PREVIEW_SCENARIO_IDS } from "@/domain/admin-preview/billing-simulation";
import {
  PREVIEW_CONTEXT_IDS,
  PREVIEW_CONTEXTS,
  PREVIEW_PAGES,
  PREVIEW_PAGE_IDS,
  UNSUPPORTED_PREVIEW_CONTEXTS,
} from "@/domain/admin-preview/scenarios";

export const dynamic = "force-dynamic";

export default async function AdminPreviewIndexPage() {
  await requireAdminPage();
  return (
    <>
      <DashboardPageHeading>Хэрэглэгчийн хэлбэрээр урьдчилан харах</DashboardPageHeading>
      <Card>
        <CardHeader>
          <CardTitle>Дүр + хуудас сонгоно уу</CardTitle>
          <CardDescription>
            Жинхэнэ TORE.mn компонентуудыг <strong>синтетик жишээ хэрэглэгчээр</strong> харуулна. Таны сесс солигдохгүй, хэн нэгний дүрд орохгүй, өгөгдлийн сан
            уншигдахгүй/өөрчлөгдөхгүй, төлбөр/имэйл/лиценз/байршуулалт хийгдэхгүй. Бодит эрхийн шалгалтыг тойрохгүй.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {PREVIEW_PAGE_IDS.map((page) => (
            <section key={page} className="space-y-2" aria-labelledby={`p-${page}`}>
              <h2 id={`p-${page}`} className="font-semibold">
                {PREVIEW_PAGES[page].title.mn} <span className="font-normal text-muted-foreground">/ {PREVIEW_PAGES[page].title.en}</span>
              </h2>
              <p className="text-sm text-muted-foreground">{PREVIEW_PAGES[page].description}</p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PREVIEW_CONTEXT_IDS.map((id) => (
                  <li key={id} className="rounded-lg border p-3">
                    <Link href={`/admin/preview/${page}?context=${id}&locale=mn&content=published`} className="font-medium underline" target="_blank">
                      {PREVIEW_CONTEXTS[id].label.mn}
                    </Link>
                    <p className="text-xs text-muted-foreground">{PREVIEW_CONTEXTS[id].description}</p>
                    {page === "home" || page === "student" ? (
                      <p className="mt-1 text-xs">
                        <Link href={`/admin/preview/${page}?context=${id}&locale=mn&content=draft`} className="underline" target="_blank">Ноорогтой нь</Link>
                        {" · "}
                        <Link href={`/admin/preview/${page}?context=${id}&locale=en&content=published`} className="underline" target="_blank">EN</Link>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <section aria-labelledby="checkout" className="space-y-2">
            <h2 id="checkout" className="font-semibold">Төлбөрийн (checkout) симуляци · TEST / SIMULATED</h2>
            <p className="text-sm text-muted-foreground">
              Жинхэнэ Billing Center-ийг санах ойн симуляциар ажиллуулна. Бодит QPay, нэхэмжлэл, багц, эрх хөндөгдөхгүй.{" "}
              <Link href="/admin/preview/coverage" className="underline">Бүтээгдэхүүн бүрийн хэрэгжилтийн байдал</Link>
            </p>
            {(["citizen", "lawyer"] as const).map((role) => (
              <div key={role} className="rounded-lg border p-3">
                <p className="font-medium">{role === "citizen" ? "Иргэн (Citizen)" : "Хуульч (Lawyer)"}</p>
                <ul className="mt-1 flex flex-wrap gap-2 text-sm">
                  {BILLING_PREVIEW_SCENARIO_IDS.map((id) => (
                    <li key={id}>
                      <Link href={`/admin/preview/checkout/${role}?state=${id}`} className="underline" target="_blank">
                        {BILLING_PREVIEW_SCENARIOS[id].label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
          <section aria-labelledby="unsupported" className="space-y-2">
            <h2 id="unsupported" className="font-semibold">Дэмжигдээгүй дүрүүд</h2>
            <ul className="space-y-1 text-sm">
              {UNSUPPORTED_PREVIEW_CONTEXTS.map((c) => (
                <li key={c.id}><strong>{c.label}:</strong> {c.reason}</li>
              ))}
            </ul>
          </section>
        </CardContent>
      </Card>
    </>
  );
}
