import Link from "next/link";
import { notFound } from "next/navigation";

import { getSessionUser } from "@/application/actions/auth.actions";
import { getPublicLawyerProfile } from "@/application/use-cases/discovery/public-directory";
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
} from "@/infrastructure/repositories";
import { formatDateTimeUtc, formatModality } from "@/lib/format-labels";
import {
  localizedOfferingTitle,
  localizedTaxonomyName,
} from "@/lib/localized-content";
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
    <div className="min-h-svh bg-[#FAFBFA]">
      <header className="border-b border-[#0F3D33]/10 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
          <BrandLink brand={dict.common.brand} />
          <Link
            href="/lawyers"
            className="cursor-pointer text-sm text-[#5A6B64] hover:text-[#0F3D33]"
          >
            {p.back}
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-5 py-10 sm:px-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-[#0F3D33]/12 bg-white p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-[#0A0F14]">
                  {view.displayName}
                </h1>
                <p className="mt-1 text-[#5A6B64]">
                  {view.profile.headline ?? m.common.legalCounsel}
                </p>
                {view.profile.city && (
                  <p className="mt-2 text-sm text-[#5A6B64]">{view.profile.city}</p>
                )}
              </div>
              <Badge className="bg-[#0F3D33] text-white">
                {m.common.verified}
              </Badge>
            </div>
            {view.profile.yearsOfExperience != null && (
              <p className="mt-4 text-sm text-[#3D4F48]">
                {p.yearsExperience.replace(
                  "{n}",
                  String(view.profile.yearsOfExperience),
                )}
              </p>
            )}
            {view.profile.bio && (
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[#3D4F48]">
                {view.profile.bio}
              </p>
            )}
            {view.profile.education && (
              <div className="mt-5">
                <h2 className="text-sm font-semibold text-[#0A0F14]">
                  {p.education}
                </h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[#5A6B64]">
                  {view.profile.education}
                </p>
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              {view.practiceAreas.map((area) => (
                <span
                  key={area.id}
                  className="rounded-md border border-[#0F3D33]/10 bg-[#F4F8F6] px-2 py-1 text-xs text-[#0A0F14]"
                >
                  {localizedTaxonomyName(area, locale)}
                </span>
              ))}
              {view.languages.map((lang) => (
                <span
                  key={lang.id}
                  className="rounded-md border border-[#0F3D33]/10 px-2 py-1 text-xs text-[#5A6B64]"
                >
                  {localizedTaxonomyName(lang, locale)}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[#0F3D33]/12 bg-white p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-[#0A0F14]">
              {p.offeringsTitle}
            </h2>
            <p className="mt-1 text-sm text-[#5A6B64]">{p.offeringsHelp}</p>
            <div className="mt-4 space-y-3">
              {view.offerings.length === 0 ? (
                <p className="text-sm text-[#5A6B64]">{p.noOfferings}</p>
              ) : (
                view.offerings.map((offering) => (
                  <div
                    key={offering.id}
                    className="rounded-xl border border-[#0F3D33]/10 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-[#0A0F14]">
                          {localizedOfferingTitle(offering, locale)}
                        </p>
                        {offering.titleEn &&
                          offering.titleMn &&
                          offering.titleEn !== offering.titleMn &&
                          locale === "en" && (
                          <p className="text-xs text-[#5A6B64]">
                            {offering.titleMn}
                          </p>
                        )}
                        {offering.titleEn &&
                          offering.titleMn &&
                          offering.titleEn !== offering.titleMn &&
                          locale !== "en" && (
                          <p className="text-xs text-[#5A6B64]">
                            {offering.titleEn}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-[#5A6B64]">
                          {offering.durationMinutes} {m.common.minutesSuffix} ·{" "}
                          {formatModality(offering.modality, locale)}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold text-[#0F3D33]">
                        {offering.priceMnt.toLocaleString()} ₮
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
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
                <Link
                  href="/login"
                  className={cn(
                    buttonVariants(),
                    "w-full bg-[#0F3D33] text-white hover:bg-[#0F3D33]/90",
                  )}
                >
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
