import Link from "next/link";
import { redirect } from "next/navigation";

import { requirePageSession } from "@/application/common/session";
import { loadLawyerLicenseState } from "@/application/use-cases/lawyers/load-lawyer-license-state";
import { BillingCenter } from "@/components/billing/billing-center";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { LICENSE_STAGE_LABEL_MN } from "@/domain/services/lawyer-access-stage";
import { UserRole } from "@/domain/enums";
import { safeReturnPath } from "@/domain/services/safe-return-path";
import { getLocale } from "@/i18n/get-locale";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * "Миний багц" / "Төлбөрийн түүх" inside the lawyer workspace chrome (the parent layout
 * supplies the sidebar). `returnTo` is validated here, on the server, before it reaches the client.
 */
export default async function LawyerBillingPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePageSession();
  // The parent layout also admits ADMIN (canActAsLawyer), who has no lawyer plan: send them to the
  // standalone billing page, which explains that. Without this the lawyer-only billing API answers 403
  // and the page would show a generic load error.
  if (session.user.role !== UserRole.LAWYER) redirect("/billing");
  const [params, locale, licenseState] = await Promise.all([
    searchParams,
    getLocale(),
    loadLawyerLicenseState(session.user.id),
  ]);
  const returnTo = safeReturnPath(typeof params.returnTo === "string" ? params.returnTo : undefined);

  return (
    <div className="max-w-4xl">
      <DashboardPageHeading>Миний багц ба төлбөр</DashboardPageHeading>
      {licenseState ? (
        <section className="mb-6 rounded-2xl border border-[#0B1F3A]/10 bg-white p-5 text-sm text-[#5C6570] sm:p-6" aria-label="Мэргэжлийн эрх">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#0B5CFF] uppercase">Мэргэжлийн эрх</p>
          <p className="mt-1 text-base font-semibold text-[#0B1F3A]" data-testid="license-stage">
            {LICENSE_STAGE_LABEL_MN[licenseState]}
          </p>
          <p className="mt-1">
            Эрхийн баталгаажуулалт болон багцын төлбөр хоёр тусдаа. Багц төлснөөр эрх баталгаажихгүй, эрх баталгаажсанаар багц идэвхжихгүй.
          </p>
          {licenseState !== "APPROVED" ? (
            <Link href="/lawyer/verification" className="mt-2 inline-flex font-medium text-[#0B5CFF] underline underline-offset-4">
              Эрхийн баталгаажуулалт руу очих
            </Link>
          ) : null}
        </section>
      ) : null}
      <BillingCenter role="lawyer" backHref="/lawyer/dashboard" locale={locale} returnTo={returnTo} />
    </div>
  );
}
