import Link from "next/link";
import {
  ArrowRight,
  BookMarked,
  CalendarClock,
  CircleHelp,
  Laptop,
  MonitorCheck,
  ShieldCheck,
  SpellCheck,
} from "lucide-react";

import { LandingFooter } from "@/components/marketing/landing-footer";
import { LandingNav, type LandingAuthUser } from "@/components/marketing/landing-nav";
import { SpellPurchase, type SpellPlanOption } from "@/components/marketing/spell-purchase";
import { LandingReveal } from "@/components/marketing/landing-reveal";
import {
  LandingEyebrow,
  LandingHeading,
  LandingLead,
  LandingSection,
} from "@/components/marketing/landing-section";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

const FEATURE_ICONS = [SpellCheck, CircleHelp, BookMarked, ShieldCheck, Laptop, CalendarClock];

const PRIMARY_CTA =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1B63FF] px-6 text-[15px] font-bold text-white shadow-[0_8px_20px_-10px_rgba(27,99,255,0.6)] transition hover:bg-blue-700";
const SECONDARY_CTA =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 text-[15px] font-semibold text-slate-800 transition hover:bg-slate-50";

/** Public TORE Spell product page. Copy lives in `dict.spell` (truthful to the shipped beta). */
export function SpellLanding({
  dict,
  locale,
  authUser,
  plans,
  purchaseAvailable,
}: {
  dict: Dictionary;
  locale: Locale;
  authUser?: LandingAuthUser | null;
  plans: SpellPlanOption[];
  /** Spell enabled and QPay configured on the server. */
  purchaseAvailable: boolean;
}) {
  const t = dict.spell;

  return (
    <div
      className={cn(
        "landing-page min-h-screen overflow-x-hidden bg-[var(--landing-canvas)] text-[var(--landing-ink)] antialiased",
      )}
    >
      <LandingNav dict={dict} locale={locale} authUser={authUser} />
      <main>
        {/* Hero */}
        <section className="border-b border-[#0B1F3A]/8 bg-[linear-gradient(180deg,#F4F7FD_0%,#FFFFFF_100%)]">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-14 sm:px-8 lg:grid-cols-12 lg:py-20">
            <LandingReveal className="lg:col-span-7">
              <p className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.22em] text-blue-600 uppercase">
                <SpellCheck className="size-4" />
                {t.hero.eyebrow}
              </p>
              <h1 className="mt-4 font-[family-name:var(--font-landing-display)] text-[2rem] leading-[1.15] font-extrabold tracking-tight text-[#0B1D3A] sm:text-5xl lg:text-[52px]">
                {t.hero.title}
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
                {t.hero.support}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="#pricing" className={PRIMARY_CTA}>
                  {t.hero.primaryCta}
                  <ArrowRight className="size-4" />
                </a>
                <a href="#features" className={SECONDARY_CTA}>
                  {t.hero.secondaryCta}
                </a>
              </div>
              <p className="mt-4 text-sm text-slate-500">{t.hero.betaNote}</p>
            </LandingReveal>

            {/* Illustration of the shipped behaviour (not a screenshot). */}
            <LandingReveal delayMs={80} className="lg:col-span-5">
              <figure>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-30px_rgba(11,31,58,0.35)]">
                  <div className="flex items-center gap-1.5 border-b border-slate-100 pb-3">
                    <span className="size-2.5 rounded-full bg-slate-200" />
                    <span className="size-2.5 rounded-full bg-slate-200" />
                    <span className="size-2.5 rounded-full bg-slate-200" />
                    <span className="ml-2 text-xs font-semibold text-slate-400">TORE Spell</span>
                  </div>
                  <p className="mt-4 text-[17px] leading-relaxed text-slate-800">
                    {t.hero.mockText.split(t.hero.mockWrong).map((part, i, arr) => (
                      <span key={i}>
                        {part}
                        {i < arr.length - 1 ? (
                          <span className="rounded-sm underline decoration-red-500 decoration-wavy underline-offset-4">
                            {t.hero.mockWrong}
                          </span>
                        ) : null}
                      </span>
                    ))}
                  </p>
                  <div className="mt-4 rounded-xl border border-slate-200 border-l-4 border-l-red-500 p-3">
                    <p className="text-sm">
                      <span className="mr-2 rounded bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                        {t.hero.mockWrongLabel}
                      </span>
                      <span className="font-semibold">{t.hero.mockWrong}</span>
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {t.hero.mockSuggestionLabel}:{" "}
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
                        {t.hero.mockRight}
                      </span>
                    </p>
                  </div>
                  <div className="mt-3 rounded-xl border border-slate-200 border-l-4 border-l-amber-500 p-3">
                    <p className="text-sm">
                      <span className="font-semibold">{t.hero.mockUnknownWord}</span>
                    </p>
                    <p className="mt-1 text-xs text-amber-800">{t.hero.mockUnknownLabel}</p>
                  </div>
                </div>
                <figcaption className="mt-3 text-center text-xs text-slate-400">
                  {t.hero.mockCaption}
                </figcaption>
              </figure>
            </LandingReveal>
          </div>
        </section>

        {/* Relationship to TORE.MN */}
        <LandingSection muted>
          <LandingReveal className="mx-auto max-w-3xl rounded-2xl border border-[#0B1F3A]/10 bg-white p-6 text-center sm:p-8">
            <p className="text-[12px] font-semibold tracking-[0.16em] text-[#5C6570] uppercase">
              {t.relation.title}
            </p>
            <p className="mt-3 text-lg leading-relaxed font-medium text-slate-800">
              {t.relation.statement}
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-700"
            >
              {t.relation.back}
              <ArrowRight className="size-3.5" />
            </Link>
          </LandingReveal>
        </LandingSection>

        {/* Features */}
        <LandingSection id="features">
          <LandingReveal className="max-w-2xl">
            <LandingEyebrow>{t.features.eyebrow}</LandingEyebrow>
            <LandingHeading>{t.features.title}</LandingHeading>
            <LandingLead>{t.features.support}</LandingLead>
          </LandingReveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.features.items.map((item, index) => {
              const Icon = FEATURE_ICONS[index] ?? MonitorCheck;
              return (
                <LandingReveal key={item.title} delayMs={index * 40}>
                  <article className="h-full rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <Icon className="size-5" />
                    </span>
                    <h3 className="mt-5 text-lg leading-tight font-bold text-slate-900">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">
                      {item.description}
                    </p>
                  </article>
                </LandingReveal>
              );
            })}
          </div>
          <LandingReveal className="mt-8 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
            <p className="font-semibold text-indigo-900">{t.honesty.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-indigo-900/80">{t.honesty.body}</p>
          </LandingReveal>
        </LandingSection>

        {/* Not in the beta yet */}
        <LandingSection muted>
          <LandingReveal className="max-w-2xl">
            <LandingEyebrow>{t.roadmap.eyebrow}</LandingEyebrow>
            <LandingHeading>{t.roadmap.title}</LandingHeading>
            <LandingLead>{t.roadmap.support}</LandingLead>
          </LandingReveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {t.roadmap.items.map((item) => (
              <LandingReveal key={item.title}>
                <article className="h-full rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6">
                  <h3 className="text-base font-bold text-slate-800">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.description}</p>
                </article>
              </LandingReveal>
            ))}
          </div>
        </LandingSection>

        {/* Beta */}
        <LandingSection id="beta">
          <div className="grid gap-8 lg:grid-cols-2">
            <LandingReveal>
              <LandingEyebrow>{t.beta.eyebrow}</LandingEyebrow>
              <LandingHeading>{t.beta.title}</LandingHeading>
              <LandingLead>{t.beta.description}</LandingLead>
              <div className="mt-6">
                <Link href="/#feedback" className={PRIMARY_CTA}>
                  {t.beta.cta}
                  <ArrowRight className="size-4" />
                </Link>
                <p className="mt-3 text-sm text-slate-500">{t.beta.ctaNote}</p>
              </div>
            </LandingReveal>
            <LandingReveal delayMs={60}>
              <ul className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
                {t.beta.points.map((point) => (
                  <li key={point} className="flex gap-3 text-sm leading-relaxed text-slate-600">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-blue-500" />
                    {point}
                  </li>
                ))}
              </ul>
            </LandingReveal>
          </div>
        </LandingSection>

        {/* Licence + purchase (prices come from server configuration only) */}
        <LandingSection id="pricing" muted>
          <LandingReveal className="mx-auto max-w-2xl text-center">
            <LandingEyebrow>{t.pricing.eyebrow}</LandingEyebrow>
            <LandingHeading>{t.pricing.title}</LandingHeading>
            <LandingLead className="mx-auto">{t.pricing.description}</LandingLead>
          </LandingReveal>
          <SpellPurchase plans={plans} loggedIn={Boolean(authUser)} available={purchaseAvailable} copy={t.pricing} />
          <p className="mt-6 text-center text-sm text-slate-500">{t.pricing.note}</p>
        </LandingSection>
      </main>
      <LandingFooter dict={dict} authUser={authUser} />
    </div>
  );
}
