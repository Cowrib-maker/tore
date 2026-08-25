import { HeroLegalAiComposer } from "@/components/marketing/hero-legal-ai-composer";
import { LandingReveal } from "@/components/marketing/landing-reveal";
import type { Dictionary } from "@/i18n/types";

export function LandingHero({
  home,
  checkoutEnabled,
}: {
  home: Dictionary["publicHome"];
  checkoutEnabled: boolean;
}) {
  return (
    <section
      id="chat"
      className="relative overflow-hidden scroll-mt-24 border-b border-[#0B1F3A]/8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(14,124,123,0.10),transparent_52%),linear-gradient(180deg,#F7F6F2_0%,#EEF4F2_100%)]"
      />

      <div className="relative mx-auto max-w-3xl px-5 pt-14 pb-16 text-center sm:px-8 sm:pt-16 sm:pb-20 lg:pt-20 lg:pb-24">
        <LandingReveal>
          <p className="text-[13px] font-semibold tracking-[0.18em] text-[#1A7A72] uppercase sm:text-sm">
            {home.tagline}
          </p>

          <h1 className="mx-auto mt-5 max-w-2xl font-[family-name:var(--font-landing-display)] text-[1.85rem] leading-[1.15] font-semibold tracking-[-0.03em] text-[#0B1F3A] sm:text-[2.35rem]">
            {home.chatTitle}
          </h1>

          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-7 text-[#5C6570] sm:text-base">
            {home.chatSubtitle}
          </p>

          <div className="mt-8">
            <HeroLegalAiComposer
              placeholder={home.chatPlaceholder}
              submitLabel={home.chatSubmit}
              typingLabel={home.chatTyping}
              checkoutEnabled={checkoutEnabled}
            />
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
