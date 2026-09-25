import Link from "next/link";

import { requirePageSession } from "@/application/common/session";
import { BrandLink } from "@/components/layout/brand-link";
import { BRAND_LOGO_LANDING } from "@/components/brand/tokens";
import { BillingCenter } from "@/components/billing/billing-center";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";

export default async function BillingPage() {
  const session = await requirePageSession();
  const role = session.user.role as UserRole;
  const [dict, locale] = await Promise.all([getDictionary(), getLocale()]);
  const backHref = getDashboardPath(role);

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#0A0F14]">
      <header className="border-b border-[#0B1F3A]/8 bg-[#F7F6F2]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5 sm:px-8">
          <BrandLink brand={dict.common.brand} logo={BRAND_LOGO_LANDING} />
          <Link
            href={backHref}
            className="text-[13px] font-medium text-[#5C6570] transition hover:text-[#0B1F3A]"
          >
            ← Буцах
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-[11px] font-semibold tracking-[0.22em] text-[#0B5CFF] uppercase">
          Багц & төлбөр
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-landing-display)] text-[1.85rem] tracking-[-0.03em] text-[#0B1F3A] sm:text-[2.1rem]">
          Billing Center
        </h1>
        <p className="mt-2 max-w-xl text-[15px] leading-7 text-[#5C6570]">
          Багц, төлбөрийн мэдээлэл болон түүхээ эндээс хянана уу.
        </p>

        <div className="mt-8">
          {role === UserRole.CLIENT ? (
            <BillingCenter role="citizen" backHref={backHref} locale={locale} />
          ) : role === UserRole.LAWYER ? (
            <BillingCenter role="lawyer" backHref={backHref} locale={locale} />
          ) : (
            <div className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-6">
              <p className="text-sm text-[#5C6570]">
                Админ эрхэд хувийн багц, төлбөр хамаарахгүй. Бүх хэрэглэгчийн
                төлбөрийн мэдээллийг Админ самбар дахь Төлбөрийн төв хэсгээс
                харна уу.
              </p>
              <Link
                href="/admin/payments"
                className="mt-3 inline-flex text-sm font-medium text-[#0B5CFF] underline underline-offset-4"
              >
                Админ Төлбөрийн төв руу очих →
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
