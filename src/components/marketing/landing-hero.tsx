import { HeroLegalAiComposer } from "@/components/marketing/hero-legal-ai-composer";
import { LandingReveal } from "@/components/marketing/landing-reveal";
import type { Dictionary } from "@/i18n/types";

/**
 * Splits off the final word so it can be rendered in the accent color,
 * matching the approved hero reference. Space-delimited scripts (mn/en/ko)
 * highlight cleanly; scripts without spaces (zh) fall back to no split
 * rather than cutting a word in half.
 */
function splitLastWord(text: string): [string, string | null] {
  const lastSpace = text.lastIndexOf(" ");
  if (lastSpace === -1) return [text, null];
  return [text.slice(0, lastSpace + 1), text.slice(lastSpace + 1)];
}

export function LandingHero({
  home,
  checkoutEnabled,
}: {
  home: Dictionary["publicHome"];
  checkoutEnabled: boolean;
}) {
  const [taglineLead, taglineAccent] = splitLastWord(home.tagline);

  return (
    <section
      id="chat"
      className="relative overflow-hidden scroll-mt-24 border-b border-[#0B1F3A]/8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(11,92,255,0.08),transparent_52%),linear-gradient(180deg,#F7F8FB_0%,#EEF3FB_100%)]"
      />

      {/* Full-bleed architectural visual — right two-fifths on desktop,
          top banner on mobile. A white-to-transparent fade keeps the left
          text column legible; captions are real HTML text overlaid on the
          image, never baked into the asset itself. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[220px] overflow-hidden sm:h-[280px] lg:inset-y-0 lg:right-0 lg:left-[54%] lg:h-auto"
      >
        <img
          src="/images/landing/hero-architecture.svg"
          alt=""
          className="size-full object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,#F7F8FB_100%)] lg:bg-[linear-gradient(90deg,#F7F8FB_0%,rgba(247,248,251,0.55)_16%,transparent_38%)]" />
        <div className="absolute right-4 bottom-3 max-w-[220px] text-right sm:right-6 sm:bottom-5 lg:right-10 lg:bottom-10 lg:max-w-xs">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-white/85 uppercase sm:text-[11px]">
            {home.brandLine}
          </p>
        </div>
      </div>

      <div className="relative mx-auto max-w-6xl px-5 pt-[240px] sm:px-8 sm:pt-[300px] lg:grid lg:grid-cols-[minmax(0,54%)_1fr] lg:pt-0">
        <div className="py-10 sm:py-14 lg:py-20 lg:pr-10">
          <LandingReveal>
            <p className="text-[11px] font-semibold tracking-[0.22em] text-[#5C6570] uppercase sm:text-xs">
              {home.brandLine}
            </p>

            <h1 className="mt-5 max-w-xl font-[family-name:var(--font-landing-display)] text-[2rem] leading-[1.15] font-semibold tracking-[-0.03em] text-[#0B1F3A] sm:text-[2.5rem]">
              {taglineAccent ? (
                <>
                  {taglineLead}
                  <span className="text-[#0B5CFF]">{taglineAccent}</span>
                </>
              ) : (
                home.tagline
              )}
            </h1>

            <p className="mt-4 max-w-lg text-lg font-medium text-[#0B1F3A]/80">
              {home.chatTitle}
            </p>

            <p className="mt-3 max-w-lg text-[15px] leading-7 text-[#5C6570] sm:text-base">
              {home.chatSubtitle}
            </p>
          </LandingReveal>

          <div className="mt-8">
            <HeroLegalAiComposer
              placeholder={home.chatPlaceholder}
              submitLabel={home.chatSubmit}
              typingLabel={home.chatTyping}
              checkoutEnabled={checkoutEnabled}
              suggestionsLabel={home.chatSuggestionsLabel}
              suggestions={home.chatSuggestions}
            />
          </div>
        </div>
      </div>

      <div className="h-10 sm:h-16 lg:h-0" />
    </section>
  );
}
