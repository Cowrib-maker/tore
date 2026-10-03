import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Star, Video } from "lucide-react";

import { getSessionUser } from "@/application/common/session";
import { getPublicLawyerProfile } from "@/application/use-cases/discovery/public-directory";
import { LandingNav } from "@/components/marketing/landing-nav";
import { BookingRequestForm } from "@/components/marketplace/booking-request-form";
import { RatingSummary } from "@/components/marketplace/rating-summary";
import { VerifiedBadge } from "@/components/marketplace/verified-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Surface } from "@/components/ui/surface";
import { ConsultationModality, UserRole } from "@/domain/enums";
import { DomainError } from "@/domain/errors/domain-error";
import { getHomepageAccountHref } from "@/domain/services/homepage-routing";
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
  reviewRepository,
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

// Shared by generateMetadata and the page so the profile is loaded once per request.
const loadPublicProfile = cache((slug: string) =>
  getPublicLawyerProfile(slug, discoveryDeps),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const [view, dict] = await Promise.all([
      loadPublicProfile(slug),
      getDictionary(),
    ]);
    const m = dict.marketplace;
    // Only already-public fields: name, headline, verified-attorney label.
    return {
      title: `${view.displayName} — ${m.common.verifiedAttorney}`,
      description: view.profile.headline ?? m.directory.support,
    };
  } catch (error) {
    // Ineligible or unknown slug: the page itself renders notFound().
    if (error instanceof DomainError && error.code === "NOT_FOUND") {
      return {};
    }
    throw error;
  }
}

export default async function PublicLawyerProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let view;
  try {
    view = await loadPublicProfile(slug);
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const [session, dict, locale, reviews] = await Promise.all([
    getSessionUser(),
    getDictionary(),
    getLocale(),
    reviewRepository.findVisibleByLawyerProfileId(view.profile.id),
  ]);
  const m = dict.marketplace;
  const p = m.publicProfile;
  const isClient = session?.user?.role === UserRole.CLIENT;
  const authUser = session?.user
    ? {
        displayName:
          session.user.name?.trim() || session.user.email || dict.common.brand,
        dashboardHref: getHomepageAccountHref(
          session.user.role as UserRole | undefined,
        ),
      }
    : null;

  const bookingCopy = {
    ...m.bookingRequest,
    submitting: m.common.submitting,
    selectPlaceholder: m.common.selectPlaceholder,
    minutesSuffix: m.common.minutesSuffix,
    utc: m.common.utc,
  };

  const offersOnline = view.offerings.some(
    (o) => o.modality === ConsultationModality.ONLINE,
  );
  const offersInPerson = view.offerings.some(
    (o) => o.modality === ConsultationModality.IN_PERSON,
  );
  const hasAbout = Boolean(view.profile.bio || view.profile.education);

  return (
    <div className="ds-shell">
      <LandingNav dict={dict} locale={locale} authUser={authUser} />

      <main className="ds-page ds-page-y">
        <Link
          href="/lawyers"
          className="text-sm text-brand-muted hover:text-brand"
        >
          ← {p.back}
        </Link>

        <div className="mt-4 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <Surface as="section" padded>
              <div className="flex flex-wrap items-start gap-4">
                {view.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={view.imageUrl}
                    alt=""
                    className="size-20 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div
                    aria-hidden
                    className="flex size-20 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-2xl font-semibold text-brand"
                  >
                    {view.displayName.trim().charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h1 className="ds-title">{view.displayName}</h1>
                  <div className="mt-2">
                    <VerifiedBadge
                      status={view.profile.verificationStatus}
                      label={m.common.verifiedAttorney}
                    />
                  </div>
                  <p className="mt-2 text-brand-muted">
                    {view.profile.headline ?? m.common.legalCounsel}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-brand-muted">
                    {view.profile.yearsOfExperience != null && (
                      <span>
                        {p.yearsExperience.replace(
                          "{n}",
                          String(view.profile.yearsOfExperience),
                        )}
                      </span>
                    )}
                    <RatingSummary
                      average={view.profile.averageRating}
                      count={view.profile.reviewCount}
                      countLabel={m.review.ratingCount}
                    />
                    {view.profile.city && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" aria-hidden />
                        {view.profile.city}
                      </span>
                    )}
                    {offersOnline && (
                      <span className="inline-flex items-center gap-1">
                        <Video className="size-3.5" aria-hidden />
                        {p.availableOnline}
                      </span>
                    )}
                    {offersInPerson && <span>{p.availableInPerson}</span>}
                  </div>
                </div>
              </div>
              <a
                href="#consult"
                className={cn(buttonVariants(), "mt-5 w-full sm:w-auto")}
              >
                {p.getConsultation}
              </a>
            </Surface>

            {hasAbout && (
              <Surface as="section" padded>
                <h2 className="ds-section-title">{p.aboutTitle}</h2>
                {view.profile.bio && (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                    {view.profile.bio}
                  </p>
                )}
                {view.profile.education && (
                  <div className="mt-5">
                    <h3 className="text-sm font-semibold text-ink">
                      {p.education}
                    </h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-brand-muted">
                      {view.profile.education}
                    </p>
                  </div>
                )}
              </Surface>
            )}

            {(view.practiceAreas.length > 0 || view.languages.length > 0) && (
              <Surface as="section" padded>
                {view.practiceAreas.length > 0 && (
                  <>
                    <h2 className="ds-section-title">{p.practiceAreasTitle}</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {view.practiceAreas.map((area) => (
                        <span key={area.id} className="ds-chip py-1 text-xs">
                          {localizedTaxonomyName(area, locale)}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                {view.languages.length > 0 && (
                  <div className={view.practiceAreas.length > 0 ? "mt-5" : ""}>
                    <h3 className="text-sm font-semibold text-ink">
                      {p.languagesTitle}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {view.languages.map((lang) => (
                        <span
                          key={lang.id}
                          className="ds-chip py-1 text-xs text-brand-muted"
                        >
                          {localizedTaxonomyName(lang, locale)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Surface>
            )}

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
                          <p className="mt-1 text-xs text-brand-muted">
                            {offering.durationMinutes} {m.common.minutesSuffix}{" "}
                            · {formatModality(offering.modality, locale)}
                          </p>
                          {offering.descriptionMn && (
                            <p className="mt-2 whitespace-pre-wrap text-sm text-brand-muted">
                              {offering.descriptionMn}
                            </p>
                          )}
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

            <Surface as="section" padded>
              <h2 className="ds-section-title">{m.review.sectionTitle}</h2>
              {view.profile.reviewCount > 0 && (
                <div className="mt-2">
                  <RatingSummary
                    average={view.profile.averageRating}
                    count={view.profile.reviewCount}
                    countLabel={m.review.ratingCount}
                  />
                </div>
              )}
              {reviews.length === 0 ? (
                <p className="mt-3 text-sm text-brand-muted">
                  {m.review.noReviews}
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {reviews.map((review) => (
                    <div
                      key={review.id}
                      className="rounded-xl border border-brand/10 p-4"
                    >
                      <div
                        className="flex items-center gap-0.5"
                        role="img"
                        aria-label={`${review.rating} / 5`}
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            aria-hidden
                            className={cn(
                              "size-4",
                              n <= review.rating
                                ? "fill-amber-400 text-amber-400"
                                : "text-brand/20",
                            )}
                          />
                        ))}
                      </div>
                      {review.comment && (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-brand-muted">
                          {review.comment}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Surface>
          </div>

          <div
            id="consult"
            className="scroll-mt-24 space-y-4 lg:sticky lg:top-24 lg:self-start"
          >
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
                  <p className="text-sm text-muted-foreground">
                    {p.notBookable}
                  </p>
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
        </div>
      </main>
    </div>
  );
}
