import { LandingFeedback } from "@/components/marketing/landing-feedback";
import { LandingFooter } from "@/components/marketing/landing-footer";
import { LandingHero } from "@/components/marketing/landing-hero";
import { LandingIntelligence } from "@/components/marketing/landing-intelligence";
import { LandingIntro } from "@/components/marketing/landing-intro";
import { LandingNav, type LandingAuthUser } from "@/components/marketing/landing-nav";
import { LandingProducts } from "@/components/marketing/landing-products";
import {
  emptyLegalIntelligenceFeed,
  type LegalIntelligenceFeed,
} from "@/domain/legal-intelligence";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

type LandingPageProps = {
  dict: Dictionary;
  locale: Locale;
  authUser?: LandingAuthUser | null;
  checkoutEnabled: boolean;
  productHrefs: {
    chat: string;
    student: string;
    legalAi: string;
  };
  intelligence?: LegalIntelligenceFeed;
};

export function LandingPage({
  dict,
  locale,
  authUser,
  checkoutEnabled,
  productHrefs,
  intelligence,
}: LandingPageProps) {
  const home = dict.publicHome;
  const feed = intelligence ?? emptyLegalIntelligenceFeed();

  return (
    <div
      className={cn(
        "landing-page min-h-screen bg-[#F7F6F2] text-[#0A0F14] antialiased",
      )}
    >
      <LandingNav dict={dict} locale={locale} authUser={authUser} />
      <main>
        <LandingHero home={home} checkoutEnabled={checkoutEnabled} />
        <LandingIntro home={home} />
        <LandingProducts home={home} hrefs={productHrefs} />
        <LandingIntelligence home={home} feed={feed} />
        <LandingFeedback home={home} />
      </main>
      <LandingFooter dict={dict} authUser={authUser} />
    </div>
  );
}
