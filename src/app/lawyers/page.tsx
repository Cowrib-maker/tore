import Link from "next/link";

import { searchListedLawyers } from "@/application/use-cases/discovery/public-directory";
import { getMarketplaceFilterOptions } from "@/application/actions/marketplace.actions";
import { getSessionUser } from "@/application/actions/auth.actions";
import { BRAND_LOGO_SHELL } from "@/components/brand/tokens";
import { BrandLink } from "@/components/layout/brand-link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
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
    <div className="ds-shell">
      <header className="ds-chrome">
        <div className="ds-chrome-inner justify-between">
          <BrandLink brand={dict.common.brand} logo={BRAND_LOGO_SHELL} />
          <div className="flex items-center gap-3 text-sm">
            {dashboardHref ? (
              <Link href={dashboardHref} className={buttonVariants({ size: "sm" })}>
                {dict.dashboard.navDashboard}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="cursor-pointer text-brand-muted hover:text-brand"
                >
                  {dict.common.signIn}
                </Link>
                <Link
                  href="/register/client"
                  className={buttonVariants({ size: "sm" })}
                >
                  {dict.common.getStarted}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="ds-page ds-page-y">
        <PageHeader eyebrow={d.eyebrow} title={d.title} description={d.support} />

        <form
          method="get"
          className="mt-8 grid gap-3 rounded-2xl border border-brand/12 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
          aria-label={d.filtersAria}
        >
          <div className="space-y-1.5">
            <Label htmlFor="q" className="text-xs text-brand-muted">
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
            <Label htmlFor="practiceAreaId" className="text-xs text-brand-muted">
              {d.practiceArea}
            </Label>
            <NativeSelect
              id="practiceAreaId"
              name="practiceAreaId"
              defaultValue={practiceAreaId ?? ""}
            >
              <option value="">{d.allAreas}</option>
              {practiceAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {localizedTaxonomyName(area, locale)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="languageId" className="text-xs text-brand-muted">
              {d.language}
            </Label>
            <NativeSelect
              id="languageId"
              name="languageId"
              defaultValue={languageId ?? ""}
            >
              <option value="">{d.allLanguages}</option>
              {languages.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {localizedTaxonomyName(lang, locale)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city" className="text-xs text-brand-muted">
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
              className={cn(buttonVariants({ size: "sm" }), "h-9 w-full")}
            >
              {d.apply}
            </button>
          </div>
        </form>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lawyers.length === 0 ? (
            <EmptyState
              wide
              title={d.emptyTitle}
              description={d.emptyBody}
              action={
                <Link
                  href="/lawyers"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {d.clear}
                </Link>
              }
            />
          ) : (
            lawyers.map((card) => (
              <Link
                key={card.profile.id}
                href={`/lawyers/${card.profile.slug}`}
                className="ds-surface p-5 transition-colors hover:border-brand/28"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-ink">{card.displayName}</h2>
                    <p className="mt-1 text-sm text-brand-muted">
                      {card.profile.headline ?? m.common.legalCounsel}
                    </p>
                  </div>
                  <Badge>{m.common.verified}</Badge>
                </div>
                {card.profile.city && (
                  <p className="mt-3 text-xs text-brand-muted">{card.profile.city}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {card.practiceAreaNames.slice(0, 3).map((name) => (
                    <span key={name} className="ds-chip">
                      {name}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-sm font-medium text-brand">
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
