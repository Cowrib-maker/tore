import Link from "next/link";

import { searchListedLawyers } from "@/application/use-cases/discovery/public-directory";
import { getMarketplaceFilterOptions } from "@/application/actions/marketplace.actions";
import { getSessionUser } from "@/application/actions/auth.actions";
import { BRAND_LOGO_SHELL } from "@/components/brand/tokens";
import { BrandLink } from "@/components/layout/brand-link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";
import {
  availabilityRepository,
  bookingRepository,
  consultationOfferingRepository,
  languageRepository,
  lawyerProfileRepository,
  lawyerTaxonomyRepository,
  practiceAreaRepository,
  userRepository,
} from "@/infrastructure/repositories";
import { localizedTaxonomyName } from "@/lib/localized-content";
import { cn } from "@/lib/utils";

const discoveryDeps = {
  lawyerProfileRepository,
  consultationOfferingRepository,
  availabilityRepository,
  bookingRepository,
  practiceAreaRepository,
  languageRepository,
  lawyerTaxonomyRepository,
  userRepository,
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LawyersDirectoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const practiceAreaId =
    typeof params.practiceAreaId === "string"
      ? params.practiceAreaId
      : undefined;
  const languageId =
    typeof params.languageId === "string" ? params.languageId : undefined;
  const city = typeof params.city === "string" ? params.city : undefined;

  const dict = await getDictionary();
  const locale = await getLocale();
  const m = dict.marketplace;
  const d = m.directory;
  const session = await getSessionUser();
  const dashboardHref =
    session?.user?.role &&
    (session.user.role === UserRole.CLIENT ||
      session.user.role === UserRole.LAWYER ||
      session.user.role === UserRole.ADMIN)
      ? getDashboardPath(session.user.role as UserRole)
      : null;

  const [{ practiceAreas, languages }, lawyers] = await Promise.all([
    getMarketplaceFilterOptions(),
    searchListedLawyers(
      {
        query: q,
        practiceAreaId: practiceAreaId || undefined,
        languageId: languageId || undefined,
        city: city || undefined,
        limit: 48,
      },
      discoveryDeps,
      locale,
    ),
  ]);

  return (
    <div className="min-h-svh bg-[#FAFBFA]">
      <header className="border-b border-[#0F3D33]/10 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
          <BrandLink brand={dict.common.brand} logo={BRAND_LOGO_SHELL} />
          <div className="flex items-center gap-3 text-sm">
            {dashboardHref ? (
              <Link
                href={dashboardHref}
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "bg-[#0F3D33] text-white hover:bg-[#0F3D33]/90",
                )}
              >
                {dict.dashboard.navDashboard}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="cursor-pointer text-[#5A6B64] hover:text-[#0F3D33]"
                >
                  {dict.common.signIn}
                </Link>
                <Link
                  href="/register/client"
                  className={cn(
                    buttonVariants({ size: "sm" }),
                    "bg-[#0F3D33] text-white hover:bg-[#0F3D33]/90",
                  )}
                >
                  {dict.common.getStarted}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.12em] text-[#5A6B64] uppercase">
            {d.eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#0A0F14]">
            {d.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#5A6B64]">
            {d.support}
          </p>
        </div>

        <form
          method="get"
          className="mt-8 grid gap-3 rounded-2xl border border-[#0F3D33]/12 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
          aria-label={d.filtersAria}
        >
          <div className="space-y-1.5">
            <Label htmlFor="q" className="text-xs text-[#5A6B64]">
              {d.search}
            </Label>
            <Input
              id="q"
              name="q"
              placeholder={d.searchPh}
              defaultValue={q}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="practiceAreaId" className="text-xs text-[#5A6B64]">
              {d.practiceArea}
            </Label>
            <select
              id="practiceAreaId"
              name="practiceAreaId"
              defaultValue={practiceAreaId ?? ""}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">{d.allAreas}</option>
              {practiceAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {localizedTaxonomyName(area, locale)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="languageId" className="text-xs text-[#5A6B64]">
              {d.language}
            </Label>
            <select
              id="languageId"
              name="languageId"
              defaultValue={languageId ?? ""}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">{d.allLanguages}</option>
              {languages.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {localizedTaxonomyName(lang, locale)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city" className="text-xs text-[#5A6B64]">
              {d.city}
            </Label>
            <Input
              id="city"
              name="city"
              placeholder={d.cityPh}
              defaultValue={city}
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className={cn(
                buttonVariants({ size: "sm" }),
                "h-9 w-full bg-[#0F3D33] text-white",
              )}
            >
              {d.apply}
            </button>
          </div>
        </form>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lawyers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#0F3D33]/2 bg-white px-6 py-12 text-center sm:col-span-2 lg:col-span-3">
              <p className="text-base font-semibold text-[#0A0F14]">
                {d.emptyTitle}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#5A6B64]">
                {d.emptyBody}
              </p>
              <Link
                href="/lawyers"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "mt-5",
                )}
              >
                {d.clear}
              </Link>
            </div>
          ) : (
            lawyers.map((card) => (
              <Link
                key={card.profile.id}
                href={`/lawyers/${card.profile.slug}`}
                className="rounded-2xl border border-[#0F3D33]/12 bg-white p-5 transition-colors hover:border-[#0F3D33]/28"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-[#0A0F14]">
                      {card.displayName}
                    </h2>
                    <p className="mt-1 text-sm text-[#5A6B64]">
                      {card.profile.headline ?? m.common.legalCounsel}
                    </p>
                  </div>
                  <Badge className="bg-[#0F3D33] text-white">
                    {m.common.verified}
                  </Badge>
                </div>
                {card.profile.city && (
                  <p className="mt-3 text-xs text-[#5A6B64]">{card.profile.city}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {card.practiceAreaNames.slice(0, 3).map((name) => (
                    <span
                      key={name}
                      className="rounded-md border border-[#0F3D33]/10 bg-[#F4F8F6] px-2 py-0.5 text-[11px]"
                    >
                      {name}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-sm font-medium text-[#0F3D33]">
                  {card.minPriceMnt != null
                    ? d.fromPrice.replace(
                        "{price}",
                        card.minPriceMnt.toLocaleString(),
                      )
                    : d.viewOfferings}
                </p>
              </Link>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
