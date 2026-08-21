import { LandingEnterprise } from "@/components/marketing/landing-enterprise";
import { LandingExperiences } from "@/components/marketing/landing-experiences";
import { LandingFaq } from "@/components/marketing/landing-faq";
import { LandingFooter } from "@/components/marketing/landing-footer";
import { LandingHero } from "@/components/marketing/landing-hero";
import { LandingHow } from "@/components/marketing/landing-how";
import { LandingKnowledge } from "@/components/marketing/landing-knowledge";
import { LandingLegalAi } from "@/components/marketing/landing-legal-ai";
import { LandingMarketplace } from "@/components/marketing/landing-marketplace";
import { LandingNav, type LandingAuthUser } from "@/components/marketing/landing-nav";
import { LandingReveal } from "@/components/marketing/landing-reveal";
import {
  LandingEyebrow,
  LandingHeading,
  LandingLead,
  LandingSection,
} from "@/components/marketing/landing-section";
import { LandingTrust } from "@/components/marketing/landing-trust";
import { LandingWorkspace } from "@/components/marketing/landing-workspace";
import type { HomepageSectionKey } from "@/domain/entities/homepage-section";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

type LandingPageProps = {
  dict: Dictionary;
  locale: Locale;
  authUser?: LandingAuthUser | null;
  composerMode: "guest" | "client" | "other";
  exploreHref: string;
  sectionImages?: Partial<Record<HomepageSectionKey, string | null>>;
};

export function LandingPage({
  dict,
  locale,
  authUser,
  composerMode,
  exploreHref,
  sectionImages,
}: LandingPageProps) {
  const t = dict.landing;
  const images = sectionImages ?? {};

  return (
    <div
      className={cn(
        "landing-page min-h-screen bg-white text-[#0A0F14] antialiased",
      )}
    >
      <LandingNav dict={dict} locale={locale} authUser={authUser} />
      <main>
        <LandingHero
          t={t}
          exploreHref={exploreHref}
          composerMode={composerMode}
          imageUrl={images.hero}
        />
        <LandingExperiences t={t} imageUrl={images.experiences} />
        <LandingLegalAi t={t} exploreHref={exploreHref} imageUrl={images["legal-ai"]} />
        <LandingKnowledge t={t} imageUrl={images.knowledge} />
        <LandingWorkspace t={t} imageUrl={images.workspace} />
        <LandingMarketplace t={t} imageUrl={images.marketplace} />
        <LandingEnterprise t={t} imageUrl={images.enterprise} />
        <LandingTrust t={t} imageUrl={images.trust} />
        <LandingHow t={t} imageUrl={images.how} />
        <LandingSection id="resources" imageUrl={images.faq}>
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
      <LandingFooter dict={dict} authUser={authUser} />
    </div>
  );
}