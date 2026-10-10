import type { Metadata } from "next";
import Link from "next/link";

import { searchListedLawyers } from "@/application/use-cases/discovery/public-directory";
import { getMarketplaceFilterOptions } from "@/application/actions/marketplace.actions";
import { getSessionUser } from "@/application/common/session";
import { LawyerCard } from "@/components/marketplace/lawyer-card";
import { LandingNav } from "@/components/marketing/landing-nav";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { ConsultationModality, type UserRole } from "@/domain/enums";
import { getHomepageAccountHref } from "@/domain/services/homepage-routing";
import { loadRequestDictionary } from "@/application/use-cases/site-content/load-public-dictionary";
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
  lawyerCredentialRepository,
} from "@/infrastructure/repositories";
import { localizedTaxonomyName } from "@/lib/localized-content";
import { cn } from "@/lib/utils";

const discoveryDeps = {
  lawyerProfileRepository,
  lawyerCredentialRepository,
  consultationOfferingRepository,
  availabilityRepository,
  bookingRepository,
  practiceAreaRepository,
  languageRepository,
  lawyerTaxonomyRepository,
  userRepository,
};

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  const d = dict.marketplace.directory;
  // Root layout title template appends " | TORE".
  return { title: d.title, description: d.support };
}

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

  const dict = await loadRequestDictionary();
  const locale = await getLocale();
  const m = dict.marketplace;
  const d = m.directory;
  const cardCopy = {
    verified: m.common.verifiedAttorney,
    fallbackTitle: m.common.legalCounsel,
    yearsExperience: m.publicProfile.yearsExperience,
    ratingCount: m.review.ratingCount,
    online: m.common.online,
    fromPrice: d.fromPrice,
    viewOfferings: d.viewOfferings,
    viewProfile: d.viewProfile,
    getConsultation: d.getConsultation,
  };
  const session = await getSessionUser();
  const authUser = session?.user
    ? {
        displayName:
          session.user.name?.trim() || session.user.email || dict.common.brand,
        dashboardHref: getHomepageAccountHref(
          session.user.role as UserRole | undefined,
        ),
      }
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
      <LandingNav dict={dict} locale={locale} authUser={authUser} />

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

        <p className="mt-8 text-sm text-brand-muted" aria-live="polite">
          {d.resultCount.replace("{n}", String(lawyers.length))}
        </p>

        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              <LawyerCard
                key={card.profile.id}
                copy={cardCopy}
                lawyer={{
                  slug: card.profile.slug,
                  displayName: card.displayName,
                  imageUrl: card.imageUrl,
                  headline: card.profile.headline,
                  verificationStatus: card.profile.verificationStatus,
                  yearsOfExperience: card.profile.yearsOfExperience,
                  averageRating: card.profile.averageRating,
                  reviewCount: card.profile.reviewCount,
                  city: card.profile.city,
                  practiceAreaNames: card.practiceAreaNames,
                  offersOnline: card.modalities.includes(ConsultationModality.ONLINE),
                  minPriceMnt: card.minPriceMnt,
                }}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
}
