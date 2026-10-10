import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdminPage } from "@/application/common/require-admin-page";
import { PreviewNetworkGuard } from "@/components/admin/preview/preview-network-guard";
import { BillingSandbox } from "@/components/admin/preview/billing-sandbox";
import {
  BILLING_PREVIEW_SCENARIOS,
  BILLING_PREVIEW_SCENARIO_IDS,
  isBillingPreviewScenario,
} from "@/domain/admin-preview/billing-simulation";
import { CITIZEN_PLANS, SOLO_PLAN, getPlanDefinition } from "@/domain/constants/subscription-plans";
import { isLocale } from "@/i18n/config";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

const ROLES = { citizen: "Иргэн (Citizen)", lawyer: "Хуульч (Lawyer)" } as const;

export default async function AdminCheckoutPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ role: string }>;
  searchParams: Promise<{ state?: string; locale?: string }>;
}) {
  // Server-side gate: only an active ADMIN reaches anything below. Nothing is read from the database for the previewed "user".
  await requireAdminPage();
  const [{ role }, query] = await Promise.all([params, searchParams]);
  if (role !== "citizen" && role !== "lawyer") notFound();

  const scenario = isBillingPreviewScenario(query.state) ? query.state : "no-plan";
  const locale = query.locale && isLocale(query.locale) ? query.locale : "mn";
  // Never fall back silently: say so when a URL parameter was not understood.
  const ignored: string[] = [];
  if (query.state !== undefined && !isBillingPreviewScenario(query.state)) ignored.push(`төлөв «${String(query.state).slice(0, 40)}»`);
  if (query.locale !== undefined && !(typeof query.locale === "string" && isLocale(query.locale))) ignored.push(`хэл «${String(query.locale).slice(0, 10)}»`);
  const plans = (role === "citizen" ? CITIZEN_PLANS.map((code) => getPlanDefinition(code)) : [SOLO_PLAN]);

  return (
    // contain: inline-size keeps the payment history table (min-w-[560px]) from widening the admin shell on narrow screens.
    <div data-preview-frame data-preview-checkout={role} data-preview-state={scenario} className="[contain:inline-size]">
      {/* Belt and braces: while this page is open, any same-origin /api request or server action is answered locally and never reaches the server. */}
      <PreviewNetworkGuard audience={role} />
      <div role="status" className="sticky top-0 z-50 border-b border-amber-400 bg-amber-100 px-4 py-2 text-sm text-amber-950">
        <strong>УРЬДЧИЛАН ХАРАХ · TEST / SIMULATED</strong> · Дүр: <strong>{ROLES[role]}</strong> · Төлөв:{" "}
        <strong>{BILLING_PREVIEW_SCENARIOS[scenario].label}</strong>
        <span className="block text-xs">
          Бодит QPay, нэхэмжлэл, callback, багц/эрх огт хөндөгдөхгүй. Синтетик өгөгдөл. Админ эрх нь энэ дүрийн эрх биш.{" "}
          <Link href="/admin/preview" className="underline">← Админ урьдчилан харах</Link>
        </span>
      </div>
      <div className="mx-auto max-w-4xl space-y-6 p-4">
        {ignored.length > 0 ? (
          <p role="alert" className="rounded-md bg-amber-50 p-2 text-sm text-amber-950">
            Дэмжигдээгүй {ignored.join(", ")} — анхдагч утгыг харуулж байна.
          </p>
        ) : null}
        <nav aria-label="Төлөв сонгох" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {BILLING_PREVIEW_SCENARIO_IDS.map((id) => (
            <Link
              key={id}
              href={`/admin/preview/checkout/${role}?state=${id}&locale=${locale}`}
              aria-current={id === scenario ? "page" : undefined}
              className={`shrink-0 rounded-full border px-3 py-1 ${id === scenario ? "border-amber-600 bg-amber-100 font-semibold" : ""}`}
            >
              {BILLING_PREVIEW_SCENARIOS[id].label}
            </Link>
          ))}
        </nav>
        <section aria-label="Каталогийн багцууд" className="rounded-xl border p-3 text-sm">
          <h2 className="font-semibold">Каталогт тохируулсан багц (subscription-plans.ts)</h2>
          <ul className="mt-1 space-y-0.5" data-testid="catalog-plans">
            {plans.map((plan) => (
              <li key={plan.code}>
                {plan.name} — {plan.priceMnt.toLocaleString("mn-MN")}₮ / сар · AI асуулт {plan.quotas.legalAiQueries} · баримт шинжилгээ {plan.quotas.documentAnalysis}
              </li>
            ))}
          </ul>
        </section>
        <BillingSandbox key={`${role}-${scenario}`} role={role} scenario={scenario} nowIso={new Date().toISOString()} locale={locale} />
      </div>
    </div>
  );
}
