import { HeroLegalAiComposer } from "@/components/marketing/hero-legal-ai-composer";
import { LandingHeroScene } from "@/components/marketing/landing-hero-scene";
import { LandingReveal } from "@/components/marketing/landing-reveal";
import type { HomepageStats } from "@/application/use-cases/homepage/get-homepage-stats";
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
  stats,
  statsLabels,
}: {
  home: Dictionary["publicHome"];
  checkoutEnabled: boolean;
  /** Real, live counts. Omitted (no panel) when unavailable or all-zero -- never fabricated. */
  stats?: HomepageStats;
  statsLabels?: { lawyers: string; practiceAreas: string; organizations: string };
}) {
  const [taglineLead, taglineAccent] = splitLastWord(home.tagline);
  const hasStats =
    stats && statsLabels && (stats.listedLawyers > 0 || stats.practiceAreas > 0 || stats.activeOrganizations > 0);

  return (
    <section
      id="chat"
      className="relative isolate overflow-hidden scroll-mt-24 border-b border-[#0B1F3A]/8"
    >
      {/* One full-bleed atmospheric scene (sky + institutional building),
          not a boxed illustration beside the text -- a top band on mobile,
          the entire section on desktop, with the scrim below keeping text
          legible so the whole hero reads as a single scene. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[280px] overflow-hidden sm:h-[360px] lg:inset-0 lg:h-auto"
      >
        <LandingHeroScene className="size-full" />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[280px] bg-[linear-gradient(180deg,transparent_45%,#F7F8FB_96%)] sm:h-[360px] lg:inset-0 lg:h-auto lg:bg-[linear-gradient(100deg,#F7F8FB_0%,#F7F8FB_34%,rgba(247,248,251,0.75)_50%,rgba(247,248,251,0.15)_68%,transparent_82%)]"
      />

      <div className="relative mx-auto max-w-7xl px-5 pt-[300px] sm:px-8 sm:pt-[380px] lg:flex lg:min-h-[760px] lg:items-center lg:pt-0">
        <div className="max-w-xl py-10 sm:py-14 lg:max-w-2xl lg:py-20">
          <LandingReveal>
            <p className="text-[11px] font-semibold tracking-[0.24em] text-[#5C6570] uppercase sm:text-xs">
              {home.brandLine}
            </p>

            <h1 className="mt-5 max-w-2xl font-[family-name:var(--font-landing-display)] text-[2.5rem] leading-[1.08] font-semibold tracking-[-0.03em] text-[#0B1F3A] sm:text-[3.4rem] lg:text-[3.9rem]">
              {taglineAccent ? (
                <>
                  {taglineLead}
                  <span className="text-[#0B5CFF]">{taglineAccent}</span>
                </>
              ) : (
                home.tagline
              )}
            </h1>

            <p className="mt-5 max-w-lg text-xl font-medium text-[#0B1F3A]/80 sm:text-2xl">
              {home.chatTitle}
            </p>

            <p className="mt-3 max-w-lg text-[15px] leading-7 text-[#5C6570] sm:text-base">
              {home.chatSubtitle}
            </p>
          </LandingReveal>

          <div className="mt-8 max-w-xl lg:max-w-2xl">
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

      {hasStats ? (
        <div className="relative z-10 mx-auto hidden max-w-7xl px-8 pb-10 lg:block">
          <div className="ml-auto flex w-fit gap-6 rounded-2xl bg-[#0B1F3A]/80 px-6 py-4 text-white shadow-[0_20px_45px_-25px_rgba(11,31,58,0.6)] backdrop-blur-sm">
            {stats!.listedLawyers > 0 ? (
              <div>
                <p className="text-2xl font-semibold tracking-tight">{stats!.listedLawyers}+</p>
                <p className="text-[11px] text-white/65">{statsLabels!.lawyers}</p>
              </div>
            ) : null}
            {stats!.practiceAreas > 0 ? (
              <div>
                <p className="text-2xl font-semibold tracking-tight">{stats!.practiceAreas}+</p>
                <p className="text-[11px] text-white/65">{statsLabels!.practiceAreas}</p>
              </div>
            ) : null}
            {stats!.activeOrganizations > 0 ? (
              <div>
                <p className="text-2xl font-semibold tracking-tight">{stats!.activeOrganizations}+</p>
                <p className="text-[11px] text-white/65">{statsLabels!.organizations}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="h-10 sm:h-16 lg:h-0" />
    </section>
  );
}
