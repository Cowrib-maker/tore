import Link from "next/link";
import { notFound } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getPublicLawyerProfile } from "@/application/use-cases/discovery/public-directory";
import { BRAND_LOGO_SHELL } from "@/components/brand/tokens";
import { BrandLink } from "@/components/layout/brand-link";
import { BookingRequestForm } from "@/components/marketplace/booking-request-form";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Surface } from "@/components/ui/surface";
import { DomainError } from "@/domain/errors/domain-error";
import { UserRole } from "@/domain/enums";
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
import { formatDateTimeUtc, formatModality } from "@/lib/format-labels";
import {
  localizedOfferingTitle,
  localizedTaxonomyName,
} from "@/lib/localized-content";
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

export default async function PublicLawyerProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let view;
  try {
    view = await getPublicLawyerProfile(slug, discoveryDeps);
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const [session, dict, locale] = await Promise.all([
    getSessionUser(),
    getDictionary(),
    getLocale(),
  ]);
  const m = dict.marketplace;
  const p = m.publicProfile;
  const isClient = session?.user?.role === UserRole.CLIENT;

  const bookingCopy = {
    ...m.bookingRequest,
    submitting: m.common.submitting,
    selectPlaceholder: m.common.selectPlaceholder,
    minutesSuffix: m.common.minutesSuffix,
    utc: m.common.utc,
  };

  return (
    <div className="ds-shell">
      <header className="ds-chrome">
        <div className="ds-chrome-inner justify-between">
          <BrandLink brand={dict.common.brand} logo={BRAND_LOGO_SHELL} />
          <Link
            href="/lawyers"
            className="cursor-pointer text-sm text-brand-muted hover:text-brand"
          >
            {p.back}
          </Link>
        </div>
      </header>

      <main className="ds-page ds-page-y grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Surface as="section" padded>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-4">
                {view.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={view.imageUrl}
                    alt=""
                    className="size-16 rounded-full object-cover"
                  />
                ) : null}
                <div>
                  <h1 className="ds-title">{view.displayName}</h1>
                  <p className="mt-1 text-brand-muted">
                    {view.profile.headline ?? m.common.legalCounsel}
                  </p>
                  {view.profile.city && (
                    <p className="mt-2 text-sm text-brand-muted">{view.profile.city}</p>
                  )}
                </div>
              </div>
              <Badge>{m.common.verified}</Badge>
            </div>
            {view.profile.yearsOfExperience != null && (
              <p className="mt-4 text-sm text-ink/80">
                {p.yearsExperience.replace(
                  "{n}",
                  String(view.profile.yearsOfExperience),
                )}
              </p>
            )}
            {view.phone && (
              <p className="mt-2 text-sm text-ink/80">
                {p.phone}: {view.phone}
              </p>
            )}
            {view.licenseNumber && (
              <p className="mt-2 text-sm text-ink/80">
                {p.license}: {view.licenseNumber}
              </p>
            )}
            {view.profile.bio && (
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                {view.profile.bio}
              </p>
            )}
            {view.profile.education && (
              <div className="mt-5">
                <h2 className="text-sm font-semibold text-ink">{p.education}</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-brand-muted">
                  {view.profile.education}
                </p>
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              {view.practiceAreas.map((area) => (
                <span key={area.id} className="ds-chip py-1 text-xs">
                  {localizedTaxonomyName(area, locale)}
                </span>
              ))}
              {view.languages.map((lang) => (
                <span
                  key={lang.id}
                  className="ds-chip py-1 text-xs text-brand-muted"
                >
                  {localizedTaxonomyName(lang, locale)}
                </span>
              ))}
            </div>
          </Surface>

          <Surface as="section" padded>
            <h2 className="ds-section-title">{p.offeringsTitle}</h2>
            <p className="mt-1 text-sm text-brand-muted">{p.offeringsHelp}</p>
            <div className="mt-4 space-y-3">
              {view.offerings.length === 0 ? (
                <p className="text-sm text-brand-muted">{p.noOfferings}</p>
              ) : (
                view.offerings.map((offering) => (
                  <div
                    key={offering.id}
                    className="rounded-xl border border-brand/10 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">
                          {localizedOfferingTitle(offering, locale)}
                        </p>
                        {offering.titleEn &&
                          offering.titleMn &&
                          offering.titleEn !== offering.titleMn &&
                          locale === "en" && (
                          <p className="text-xs text-brand-muted">
                            {offering.titleMn}
                          </p>
                        )}
                        {offering.titleEn &&
                          offering.titleMn &&
                          offering.titleEn !== offering.titleMn &&
                          locale !== "en" && (
                          <p className="text-xs text-brand-muted">
                            {offering.titleEn}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-brand-muted">
                          {offering.durationMinutes} {m.common.minutesSuffix} ·{" "}
                          {formatModality(offering.modality, locale)}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold text-brand">
                        {offering.priceMnt.toLocaleString()} ₮
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Surface>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>{p.availabilityTitle}</CardTitle>
              <CardDescription>{p.availabilityHelp}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {view.slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">{p.noSlots}</p>
              ) : (
                view.slots.slice(0, 8).map((slot) => (
                  <div
                    key={slot.startAt.toISOString()}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    {formatDateTimeUtc(slot.startAt, locale)} {m.common.utc}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{p.requestTitle}</CardTitle>
              <CardDescription>{p.requestHelp}</CardDescription>
            </CardHeader>
            <CardContent>
              {!session?.user ? (
                <Link href="/login" className={cn(buttonVariants(), "w-full")}>
                  {p.signIn}
                </Link>
              ) : !isClient ? (
                <p className="text-sm text-muted-foreground">{p.needClient}</p>
              ) : view.offerings.length === 0 || view.slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">{p.notBookable}</p>
              ) : (
                <BookingRequestForm
                  lawyerSlug={view.profile.slug}
                  offerings={view.offerings}
                  slots={view.slots}
                  practiceAreas={view.practiceAreas}
                  copy={bookingCopy}
                  locale={locale}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
