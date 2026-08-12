import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";

import { LandingEcosystem } from "@/components/marketing/landing-ecosystem";
import { LandingEnterprise } from "@/components/marketing/landing-enterprise";
import { LandingFaq } from "@/components/marketing/landing-faq";
import { LandingFooter } from "@/components/marketing/landing-footer";
import { LandingHero } from "@/components/marketing/landing-hero";
import { LandingHow } from "@/components/marketing/landing-how";
import { LandingKnowledge } from "@/components/marketing/landing-knowledge";
import { LandingLegalAi } from "@/components/marketing/landing-legal-ai";
import { LandingMarketplace } from "@/components/marketing/landing-marketplace";
import { LandingNav } from "@/components/marketing/landing-nav";
import { LandingReveal } from "@/components/marketing/landing-reveal";
import {
  LandingEyebrow,
  LandingHeading,
  LandingLead,
  LandingSection,
} from "@/components/marketing/landing-section";
import { LandingTrust } from "@/components/marketing/landing-trust";
import { LandingWorkspace } from "@/components/marketing/landing-workspace";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

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
        "landing-page min-h-screen bg-[#F7F8FA] text-[#0A0F14] antialiased",
        "font-[family-name:var(--font-landing-sans)]",
      )}
    >
      <div className="pointer-events-none fixed inset-0 -z-10 landing-hero-atmosphere" />
      <LandingNav dict={dict} locale={locale} />
      <main>
        <LandingHero t={t} />
        <LandingEcosystem t={t} />
        <LandingLegalAi t={t} />
        <LandingKnowledge t={t} />
        <LandingWorkspace t={t} />
        <LandingMarketplace t={t} />
        <LandingEnterprise t={t} />
        <LandingTrust t={t} />
        <LandingHow t={t} />
        <LandingSection id="resources">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
            <LandingReveal>
              <LandingEyebrow>{t.faqEyebrow}</LandingEyebrow>
              <LandingHeading>{t.faqTitle}</LandingHeading>
              <LandingLead>{t.faqSupport}</LandingLead>
            </LandingReveal>
            <LandingReveal delayMs={60}>
              <LandingFaq faqs={t.faqs} />
            </LandingReveal>
          </div>
        </LandingSection>
      </main>
      <LandingFooter dict={dict} />
    </div>
  );
}