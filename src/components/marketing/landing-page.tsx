import { BrandTagline } from "@/components/brand/brand-tagline";
import { ToreLogo } from "@/components/brand/tore-logo";
import { BRAND_LOGO_LANDING } from "@/components/brand/tokens";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { BrandLink } from "@/components/layout/brand-link";
import { LandingFaq } from "@/components/marketing/landing-faq";
import { LandingProductMockup } from "@/components/marketing/landing-product-mockup";
import { LandingReveal } from "@/components/marketing/landing-reveal";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  Clock3,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
  Video,
} from "lucide-react";

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-landing-display",
  display: "swap",
});

const sans = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-landing-sans",
  display: "swap",
});

type LandingPageProps = {
  dict: Dictionary;
  locale: Locale;
};

export function LandingPage({ dict, locale }: LandingPageProps) {
  const t = dict.landing;

  return (
    <div
      className={cn(
        display.variable,
        sans.variable,
        "landing-page min-h-screen bg-[#FAF9F7] text-[#0A0F14] antialiased",
        "font-[family-name:var(--font-landing-sans)]",
      )}
    >
      <div className="pointer-events-none fixed inset-0 -z-10 landing-hero-atmosphere" />

      <header className="sticky top-0 z-40 border-b border-[#0F3D33]/8 bg-[#FAF9F7]/80 shadow-[0_1px_0_rgb(15_61_51/0.03)] backdrop-blur-2xl">
        <div className="mx-auto flex h-[4.75rem] max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <BrandLink brand={dict.common.brand} logo={BRAND_LOGO_LANDING} />
          <nav
            className="hidden items-center gap-8 md:flex"
            aria-label="Primary"
          >
            <Link href="/lawyers" className="landing-nav-link">
              {dict.nav.lawyers}
            </Link>
            <a href="#how" className="landing-nav-link">
              {dict.nav.howItWorks}
            </a>
            <a href="#trust" className="landing-nav-link">
              {dict.nav.trust}
            </a>
            <a href="#faq" className="landing-nav-link">
              {dict.nav.faq}
            </a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher locale={locale} label={dict.common.language} />
            <Link
              href="/login"
              className="hidden h-10 items-center rounded-xl px-3 text-[13px] font-medium text-[#5A6B64] transition-colors duration-[250ms] ease-in-out hover:bg-[#0F3D33]/5 hover:text-[#0F3D33] sm:inline-flex"
            >
              {dict.common.signIn}
            </Link>
            <Link
              href="/register/client"
              className="inline-flex h-10 items-center rounded-xl bg-[#0F3D33] px-4 text-[13px] font-semibold text-white shadow-[0_6px_16px_-8px_rgb(15_61_51/0.55)] transition-[transform,background-color] duration-[250ms] ease-in-out hover:-translate-y-px hover:bg-[#0F3D33]/92"
            >
              {dict.common.getStarted}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-[#0F3D33]/8">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-20 lg:pb-24 lg:pt-20">
            <LandingReveal className="max-w-xl">
              <p className="text-[12px] font-semibold tracking-[0.14em] text-[#5A6B64] uppercase sm:text-[13px]">
                {t.eyebrow}
              </p>
              <h1 className="mt-5 font-[family-name:var(--font-landing-display)] text-[2.75rem] leading-[1.06] tracking-[-0.03em] text-[#0A0F14] sm:text-[3.4rem] lg:text-[4rem]">
                {t.headline}
              </h1>
              <p className="mt-6 max-w-sm text-[1.05rem] leading-relaxed text-[#5A6B64] sm:text-lg">
                {t.support}
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link href="/lawyers" className="landing-btn-primary">
                  {t.ctaFind}
                  <ArrowRight className="size-4 opacity-90" />
                </Link>
                <Link href="/register/lawyer" className="landing-btn-secondary">
                  {t.ctaJoin}
                </Link>
              </div>

              <div className="mt-11 grid grid-cols-3 gap-5 border-t border-[#0F3D33]/1 pt-8 sm:gap-6">
                {[
                  { value: "01", label: t.proofProfiles },
                  { value: "02", label: t.proofRating },
                  { value: "03", label: t.proofBilingual },
                ].map((item) => (
                  <div key={item.label} className="min-w-0">
                    <p className="text-sm font-semibold tracking-[0.08em] text-[#0F3D33] uppercase sm:text-base">
                      {item.value}
                    </p>
                    <p className="mt-1.5 text-[11px] leading-snug text-[#5A6B64] sm:text-xs">
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-7">
                <div className="inline-flex flex-col items-center">
                  <ToreLogo
                    brand={dict.common.brand}
                    markClassName="size-9"
                    wordmarkClassName="text-[15px] tracking-[-0.02em]"
                    className="gap-3"
                  />
                  <BrandTagline />
                </div>
                <p className="mt-3 max-w-[18rem] text-xs leading-snug text-[#5A6B64] sm:max-w-md">
                  {t.proofAvatars}
                </p>
              </div>
            </LandingReveal>

            <LandingReveal
              delayMs={120}
              className="relative lg:justify-self-end"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.75rem] bg-[radial-gradient(ellipse_at_50%_40%,rgba(15,61,51,0.04),transparent_64%),radial-gradient(ellipse_at_70%_70%,rgba(200,164,93,0.03),transparent_58%)] sm:-inset-10"
              />
              <LandingProductMockup
                copy={t.mockup}
                className="w-full max-w-[620px] opacity-[0.96] lg:max-w-none"
              />
            </LandingReveal>
          </div>
        </section>

        <section
          id="featured"
          className="scroll-mt-24 border-b border-[#0F3D33]/8"
        >
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <LandingReveal className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-xl">
                <p className="text-[12px] font-semibold tracking-[0.14em] text-[#5A6B64] uppercase sm:text-[13px]">
                  {t.featuredEyebrow}
                </p>
                <h2 className="mt-3 font-[family-name:var(--font-landing-display)] text-[2.15rem] leading-[1.1] tracking-[-0.025em] text-[#0A0F14] sm:text-[2.55rem]">
                  {t.featuredTitle}
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-[#5A6B64] sm:text-base">
                  {t.featuredSupport}
                </p>
              </div>
              <Link
                href="/lawyers"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0F3D33] transition-opacity duration-[250ms] ease-in-out hover:opacity-70"
              >
                {t.browseAll}
                <ArrowRight className="size-3.5" />
              </Link>
            </LandingReveal>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {t.lawyers.map((lawyer, index) => (
                <LandingReveal key={lawyer.name} delayMs={70 + index * 70}>
                  <article className="landing-card group flex h-full flex-col overflow-hidden">
                    <div
                      className={cn(
                        "relative h-28 bg-gradient-to-br",
                        lawyer.tone,
                      )}
                    >
                      <div className="absolute inset-x-5 bottom-0 translate-y-1/2">
                        <div className="flex size-14 items-center justify-center rounded-2xl border border-[#0F3D33]/8 bg-white text-sm font-semibold tracking-tight text-[#0F3D33] shadow-[0_8px_20px_-10px_rgb(15_61_51/0.35)]">
                          {lawyer.initials}
                        </div>
                      </div>
                      <span className="absolute right-3.5 top-3.5 inline-flex items-center gap-1 rounded-lg border border-[#0F3D33]/8 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-[#0F3D33] shadow-sm backdrop-blur-sm">
                        <BadgeCheck className="size-3 fill-[#0F3D33] text-white" />
                        {t.verified}
                      </span>
                    </div>

                    <div className="flex flex-1 flex-col px-5 pb-5 pt-11">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-[1.05rem] font-semibold tracking-tight text-[#0A0F14]">
                            {lawyer.name}
                          </h3>
                          <p className="mt-1 text-xs text-[#5A6B64]">
                            {lawyer.role}
                          </p>
                        </div>
                        {lawyer.reviews > 0 && lawyer.rating ? (
                          <div className="inline-flex items-center gap-1 text-xs font-semibold text-[#0A0F14]">
                            <Star className="size-3.5 fill-[#C8A45D] text-[#C8A45D]" />
                            {lawyer.rating}
                            <span className="font-normal text-[#5A6B64]">
                              ({lawyer.reviews})
                            </span>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {lawyer.focus.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md border border-[#0F3D33]/8 bg-[#F7FAF8] px-2 py-0.5 text-[11px] font-medium text-[#3D4F48]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="mt-5 space-y-2 text-xs text-[#5A6B64]">
                        <p className="inline-flex items-center gap-1.5">
                          <MapPin className="size-3.5 opacity-80" />
                          {lawyer.city}
                        </p>
                        <p className="inline-flex items-center gap-1.5">
                          <Clock3 className="size-3.5 opacity-80" />
                          {lawyer.duration} · {t.fromPrice} {lawyer.price}
                        </p>
                        <p className="inline-flex items-center gap-1.5 font-medium text-[#0F3D33]">
                          <Video className="size-3.5" />
                          {t.nextSlot}: {lawyer.available}
                        </p>
                      </div>

                      <div className="mt-auto flex gap-2.5 pt-6">
                        <Link
                          href="/lawyers"
                          className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-[#0F3D33] text-sm font-semibold text-white shadow-[0_8px_18px_-10px_rgb(15_61_51/0.5)] transition-[transform,background-color] duration-[250ms] ease-in-out hover:-translate-y-px hover:bg-[#0F3D33]/92"
                        >
                          {t.book}
                        </Link>
                        <Link
                          href="/lawyers"
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-[#0F3D33]/14 bg-white px-4 text-sm font-semibold text-[#0F3D33] transition-colors duration-[250ms] ease-in-out hover:bg-[#F4F8F6]"
                        >
                          {t.profile}
                        </Link>
                      </div>
                    </div>
                  </article>
                </LandingReveal>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-24 border-b border-[#0F3D33]/8">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <LandingReveal className="max-w-xl">
              <p className="text-[12px] font-semibold tracking-[0.14em] text-[#5A6B64] uppercase sm:text-[13px]">
                {t.howEyebrow}
              </p>
              <h2 className="mt-3 font-[family-name:var(--font-landing-display)] text-[2.15rem] leading-[1.1] tracking-[-0.025em] text-[#0A0F14] sm:text-[2.55rem]">
                {t.howTitle}
              </h2>
            </LandingReveal>

            <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
              {t.howSteps.map((item, index) => (
                <LandingReveal key={item.title} delayMs={50 + index * 80}>
                  <div className="relative h-full border-t border-[#0F3D33]/12 pt-6">
                    <span className="text-[11px] font-semibold tracking-[0.16em] text-[#0F3D33]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="mt-4 text-xl font-semibold tracking-tight text-[#0A0F14]">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-[15px] leading-relaxed text-[#5A6B64]">
                      {item.description}
                    </p>
                  </div>
                </LandingReveal>
              ))}
            </div>
          </div>
        </section>

        <section
          id="trust"
          className="scroll-mt-24 border-b border-[#0F3D33]/8 bg-[#F3F1ED]"
        >
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <LandingReveal className="max-w-xl">
              <p className="text-[12px] font-semibold tracking-[0.14em] text-[#5A6B64] uppercase sm:text-[13px]">
                {t.trustEyebrow}
              </p>
              <h2 className="mt-3 font-[family-name:var(--font-landing-display)] text-[2.15rem] leading-[1.1] tracking-[-0.025em] text-[#0A0F14] sm:text-[2.55rem]">
                {t.trustTitle}
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-[#5A6B64] sm:text-base">
                {t.trustSupport}
              </p>
            </LandingReveal>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {t.trustItems.map((item, index) => {
                const Icon = [
                  ShieldCheck,
                  LockKeyhole,
                  CalendarCheck2,
                  Sparkles,
                ][index]!;
                return (
                  <LandingReveal key={item.title} delayMs={40 + index * 55}>
                    <div className="landing-card h-full p-6">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-[#F4F8F6] text-[#0F3D33]">
                        <Icon className="size-5" strokeWidth={1.5} />
                      </div>
                      <h3 className="mt-5 text-[15px] font-semibold tracking-tight text-[#0A0F14]">
                        {item.title}
                      </h3>
                      <p className="mt-2.5 text-sm leading-relaxed text-[#5A6B64]">
                        {item.description}
                      </p>
                    </div>
                  </LandingReveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-b border-[#0F3D33]/8">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <LandingReveal className="max-w-xl">
              <p className="text-[12px] font-semibold tracking-[0.14em] text-[#5A6B64] uppercase sm:text-[13px]">
                {t.testimonialsEyebrow}
              </p>
              <h2 className="mt-3 font-[family-name:var(--font-landing-display)] text-[2.15rem] leading-[1.1] tracking-[-0.025em] text-[#0A0F14] sm:text-[2.55rem]">
                {t.testimonialsTitle}
              </h2>
            </LandingReveal>

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {t.testimonials.map((item, index) => (
                <LandingReveal key={item.name} delayMs={60 + index * 70}>
                  <figure className="landing-card flex h-full flex-col p-7">
                    <blockquote className="flex-1 text-[15px] leading-relaxed text-[#3D4F48] sm:text-base">
                      “{item.quote}”
                    </blockquote>
                    <figcaption className="mt-7 border-t border-[#0F3D33]/8 pt-5">
                      <p className="text-sm font-semibold text-[#0A0F14]">
                        {item.name}
                      </p>
                      <p className="mt-1 text-xs text-[#5A6B64]">{item.role}</p>
                    </figcaption>
                  </figure>
                </LandingReveal>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 border-b border-[#0F3D33]/8">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <LandingReveal>
              <p className="text-[12px] font-semibold tracking-[0.14em] text-[#5A6B64] uppercase sm:text-[13px]">
                {t.faqEyebrow}
              </p>
              <h2 className="mt-3 font-[family-name:var(--font-landing-display)] text-[2.15rem] leading-[1.1] tracking-[-0.025em] text-[#0A0F14] sm:text-[2.55rem]">
                {t.faqTitle}
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-[#5A6B64] sm:text-base">
                {t.faqSupport}
              </p>
            </LandingReveal>
            <LandingReveal delayMs={80}>
              <LandingFaq faqs={t.faqs} />
            </LandingReveal>
          </div>
        </section>

        <section className="border-b border-[#0F3D33]/8">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <LandingReveal className="landing-shadow-lg relative overflow-hidden rounded-[1.75rem] border border-[#0F3D33]/25 bg-[#0F3D33] px-8 py-14 text-white sm:rounded-[2rem] sm:px-14 sm:py-16">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_10%,rgba(200,164,93,0.16),transparent_45%),radial-gradient(ellipse_at_15%_90%,rgba(255,255,255,0.06),transparent_40%)]" />
              <div className="relative max-w-xl">
                <h2 className="font-[family-name:var(--font-landing-display)] text-[2.15rem] leading-[1.1] tracking-[-0.025em] sm:text-[2.55rem]">
                  {t.ctaTitle}
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-white/70 sm:text-base">
                  {t.ctaSupport}
                </p>
                <div className="mt-9 flex flex-wrap gap-3">
                  <Link
                    href="/register/client"
                    className="inline-flex h-12 items-center justify-center rounded-xl bg-white px-6 text-[15px] font-semibold text-[#0F3D33] shadow-[0_10px_28px_-12px_rgb(0_0_0/0.35)] transition-[transform,background-color] duration-[250ms] ease-in-out hover:-translate-y-px hover:bg-white/95"
                  >
                    {t.ctaClient}
                  </Link>
                  <Link
                    href="/register/lawyer"
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-white/25 bg-transparent px-6 text-[15px] font-semibold text-white transition-[transform,background-color] duration-[250ms] ease-in-out hover:-translate-y-px hover:bg-white/10"
                  >
                    {t.ctaLawyer}
                  </Link>
                </div>
              </div>
            </LandingReveal>
          </div>
        </section>
      </main>

      <footer className="bg-[#FAF9F7]">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
          <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <div className="inline-flex flex-col items-center">
                <BrandLink brand={dict.common.brand} logo={BRAND_LOGO_LANDING} />
                <BrandTagline />
              </div>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#5A6B64]">
                {t.footerTagline}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.12em] text-[#5A6B64] uppercase">
                {t.footerProduct}
              </p>
              <ul className="mt-4 space-y-3 text-sm text-[#3D4F48]">
                <li>
                  <a
                    href="#featured"
                    className="transition-colors duration-[250ms] ease-in-out hover:text-[#0F3D33]"
                  >
                    {t.footerFeatured}
                  </a>
                </li>
                <li>
                  <a
                    href="#how"
                    className="transition-colors duration-[250ms] ease-in-out hover:text-[#0F3D33]"
                  >
                    {t.footerHow}
                  </a>
                </li>
                <li>
                  <a
                    href="#trust"
                    className="transition-colors duration-[250ms] ease-in-out hover:text-[#0F3D33]"
                  >
                    {t.footerTrust}
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.12em] text-[#5A6B64] uppercase">
                {t.footerAccounts}
              </p>
              <ul className="mt-4 space-y-3 text-sm text-[#3D4F48]">
                <li>
                  <Link
                    href="/login"
                    className="transition-colors duration-[250ms] ease-in-out hover:text-[#0F3D33]"
                  >
                    {dict.common.signIn}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/register/client"
                    className="transition-colors duration-[250ms] ease-in-out hover:text-[#0F3D33]"
                  >
                    {t.footerClientReg}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/register/lawyer"
                    className="transition-colors duration-[250ms] ease-in-out hover:text-[#0F3D33]"
                  >
                    {t.footerLawyerReg}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.12em] text-[#5A6B64] uppercase">
                {t.footerCompany}
              </p>
              <ul className="mt-4 space-y-3 text-sm text-[#3D4F48]">
                <li>
                  <a
                    href="#faq"
                    className="transition-colors duration-[250ms] ease-in-out hover:text-[#0F3D33]"
                  >
                    {t.footerFaq}
                  </a>
                </li>
                <li>
                  <span className="text-[#5A6B64]">{t.footerTerms}</span>
                </li>
                <li>
                  <span className="text-[#5A6B64]">{t.footerPrivacy}</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 flex flex-col gap-3 border-t border-[#0F3D33]/1 pt-8 text-xs text-[#5A6B64] sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {new Date().getFullYear()} {dict.common.brand}. {t.footerRights}
            </p>
            <p>{t.footerBuilt}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
