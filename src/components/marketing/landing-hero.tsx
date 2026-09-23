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
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(11,92,255,0.08),transparent_52%),linear-gradient(180deg,#F7F8FB_0%,#EEF3FB_100%)]"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pt-14 pb-10 sm:px-8 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-6 lg:pt-20">
        <LandingReveal className="text-center lg:text-left">
          <p className="text-[11px] font-semibold tracking-[0.22em] text-[#5C6570] uppercase sm:text-xs">
            {home.brandLine}
          </p>

          <p className="mt-4 text-[13px] font-semibold tracking-[0.18em] text-[#0B5CFF] uppercase sm:text-sm">
            {home.tagline}
          </p>

          <h1 className="mx-auto mt-5 max-w-2xl font-[family-name:var(--font-landing-display)] text-[1.85rem] leading-[1.15] font-semibold tracking-[-0.03em] text-[#0B1F3A] sm:text-[2.35rem] lg:mx-0">
            {home.chatTitle}
          </h1>

          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-7 text-[#5C6570] sm:text-base lg:mx-0">
            {home.chatSubtitle}
          </p>
        </LandingReveal>

        <LandingReveal
          delayMs={80}
          className="pointer-events-none order-first mx-auto aspect-[9/10] w-full max-w-sm overflow-hidden rounded-[2rem] shadow-[0_30px_70px_-40px_rgba(11,31,58,0.35)] lg:order-last lg:max-w-none"
        >
          <img
            src="/images/landing/hero-architecture.svg"
            alt=""
            aria-hidden="true"
            className="size-full object-cover"
          />
        </LandingReveal>
      </div>

      <div className="relative mx-auto max-w-3xl px-5 pt-6 pb-16 sm:px-8 sm:pb-20 lg:pb-24">
        <HeroLegalAiComposer
          placeholder={home.chatPlaceholder}
          submitLabel={home.chatSubmit}
          typingLabel={home.chatTyping}
          checkoutEnabled={checkoutEnabled}
        />
      </div>
    </section>
  );
}
