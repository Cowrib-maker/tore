import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { SpellCodeReveal } from "@/components/marketing/spell-license-card";
import { LandingFooter } from "@/components/marketing/landing-footer";
import { LandingNav } from "@/components/marketing/landing-nav";
import { listOwnerLicenses } from "@/application/use-cases/spell/owner-licenses";
import { fulfillSpellPurchase } from "@/application/use-cases/spell/purchase";
import { InvoiceStatus, type UserRole } from "@/domain/enums";
import { getHomepageAccountHref } from "@/domain/services/homepage-routing";
import { isSpellV1Enabled } from "@/lib/feature-flags";
import { getSpellInstallerUrl } from "@/domain/spell/installer";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";
import { invoiceRepository } from "@/infrastructure/repositories/prisma-invoice-repository";
import { getSpellRuntime } from "@/infrastructure/spell/spell-runtime";
import { formatDateTimeUlaanbaatar } from "@/lib/format-labels";

export const metadata: Metadata = { title: "TORE Spell — Миний лиценз", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS_MN: Record<string, string> = { ACTIVE: "Идэвхтэй", EXPIRED: "Хугацаа дууссан", REVOKED: "Хүчингүй болсон" };
const MONTHS_MN = (m: number) => (m === 12 ? "1 жил" : `${m} сар`);

/** The signed-in user's own TORE Spell licences, code reveal and installer download. */
export default async function SpellLicensePage() {
  const session = await getSessionUser();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent("/spell/license")}`);
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const role = session.user.role as UserRole | undefined;
  const authUser = {
    displayName: session.user.name?.trim() || session.user.email || dict.common.brand,
    dashboardHref: getHomepageAccountHref(role),
  };

  let body: React.ReactNode;
  if (!isSpellV1Enabled()) {
    body = <p className="text-slate-600">TORE Spell үйлчилгээ одоогоор нээгдээгүй байна.</p>;
  } else {
    const runtime = getSpellRuntime();
    const actor = { userId: session.user.id, role: role! };
    // Self-healing: a paid invoice whose licence was not minted yet (e.g. Spell was
    // briefly unavailable at callback time) is fulfilled here, idempotently.
    const own = await invoiceRepository.listByUserId(actor.userId);
    for (const inv of own.filter((i) => i.spellPlanCode && i.status === InvoiceStatus.PAID)) {
      await fulfillSpellPurchase(inv, runtime.deps).catch(() => undefined);
    }
    const licenses = await listOwnerLicenses(actor, runtime.deps);
    const installerReady = getSpellInstallerUrl() !== null;
    const hasUsable = licenses.some((l) => l.status === "ACTIVE");

    body = (
      <>
        {licenses.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <p className="text-slate-700">Танд одоогоор TORE Spell лиценз байхгүй байна.</p>
            <Link href="/spell#pricing" className="mt-3 inline-block text-sm font-bold text-blue-600 hover:text-blue-700">
              Лиценз сонгох →
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {licenses.map((l) => (
              <li key={l.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg font-bold text-slate-900">TORE Spell · {MONTHS_MN(l.durationMonths)}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${l.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {STATUS_MN[l.status] ?? l.status}
                  </span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Хугацаа</dt>
                    <dd className="font-medium text-slate-800">{MONTHS_MN(l.durationMonths)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Дуусах огноо</dt>
                    <dd className="font-medium text-slate-800">
                      {l.expiresAt
                        ? formatDateTimeUlaanbaatar(new Date(l.expiresAt), locale)
                        : `Идэвхжүүлээгүй — ${formatDateTimeUlaanbaatar(new Date(l.redeemBy), locale)}-ээс өмнө идэвхжүүлнэ`}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4">
                  <p className="mb-1 text-sm text-slate-500">Лицензийн код</p>
                  <SpellCodeReveal licenseId={l.id} maskedCode={l.maskedCode} />
                </div>
                <p className="mt-4 text-sm text-slate-500">
                  {l.activeActivation ? "Одоогоор нэг компьютер дээр идэвхтэй." : "Одоогоор ямар ч компьютер дээр идэвхжээгүй."}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-lg font-bold text-slate-900">Windows хувилбар</p>
          {hasUsable && installerReady ? (
            <a href="/api/spell/download" className="mt-3 inline-flex h-11 items-center rounded-xl bg-[#1B63FF] px-6 text-[15px] font-bold text-white hover:bg-blue-700">
              Windows хувилбар татах
            </a>
          ) : hasUsable ? (
            <p className="mt-2 text-slate-600">Beta installer удахгүй. Бэлэн болмогц энд татах холбоос гарна.</p>
          ) : (
            <p className="mt-2 text-slate-600">Татахын тулд идэвхтэй лиценз шаардлагатай.</p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Суулгацад дижитал гарын үсэг одоогоор байхгүй тул Windows SmartScreen анхааруулга харуулж болно. Суулгасны дараа программд лицензийн кодоо оруулж идэвхжүүлнэ.
          </p>
        </div>
      </>
    );
  }

  return (
    <div className="landing-page min-h-screen overflow-x-hidden bg-[var(--landing-canvas)] text-[var(--landing-ink)] antialiased">
      <LandingNav dict={dict} locale={locale} authUser={authUser} />
      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <p className="text-xs font-bold tracking-[0.2em] text-blue-600 uppercase">TORE Spell</p>
        <h1 className="mt-2 font-[family-name:var(--font-landing-display)] text-3xl font-extrabold text-[#0B1D3A]">Миний лиценз</h1>
        <div className="mt-8">{body}</div>
        <p className="mt-8 text-sm">
          <Link href="/spell" className="font-semibold text-blue-600 hover:text-blue-700">← TORE Spell</Link>
        </p>
      </main>
      <LandingFooter dict={dict} authUser={authUser} />
    </div>
  );
}
