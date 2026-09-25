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
  const statEntries = [
    stats && stats.listedLawyers > 0 && statsLabels
      ? { value: stats.listedLawyers, label: statsLabels.lawyers }
      : null,
    stats && stats.practiceAreas > 0 && statsLabels
      ? { value: stats.practiceAreas, label: statsLabels.practiceAreas }
      : null,
    stats && stats.activeOrganizations > 0 && statsLabels
      ? { value: stats.activeOrganizations, label: statsLabels.organizations }
      : null,
  ].filter((entry): entry is { value: number; label: string } => entry !== null);

  return (
    <section
      id="chat"
      className="relative isolate overflow-hidden scroll-mt-24 border-b border-[#0B1F3A]/8 bg-[#F7F8FB]"
    >
      {/* Compact decorative band for mobile/tablet -- replaced by the
          contained right-column panel below at lg+. The two never render
          at the same time, so there is never a doubled/overlapping visual. */}
      <div aria-hidden className="relative h-[200px] overflow-hidden sm:h-[260px] lg:hidden">
        <LandingHeroScene className="size-full" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_50%,#F7F8FB_100%)]" />
      </div>

      <div className="mx-auto max-w-[1600px] px-6 sm:px-10 lg:px-16">
        <div className="py-10 sm:py-14 lg:grid lg:min-h-[720px] lg:grid-cols-[minmax(0,60%)_minmax(0,40%)] lg:items-center lg:gap-8 lg:py-24 xl:gap-12">
          {/* LEFT -- product/message */}
          <div>
            <LandingReveal>
              <p className="text-[13px] font-semibold tracking-[0.24em] text-[#5C6570] uppercase sm:text-sm">
                {home.brandLine}
              </p>

              <h1 className="mt-5 font-[family-name:var(--font-landing-display)] text-[2.75rem] leading-[1.04] font-semibold tracking-[-0.03em] text-[#0B1F3A] sm:text-[3.75rem] lg:text-[4.25rem] xl:text-[5rem]">
                {taglineAccent ? (
                  <>
                    {taglineLead}
                    <span className="text-[#0B5CFF]">{taglineAccent}</span>
                  </>
                ) : (
                  home.tagline
                )}
              </h1>

              <p className="mt-6 max-w-xl text-xl font-medium text-[#0B1F3A]/80 sm:text-2xl">
                {home.chatTitle}
              </p>

              <p className="mt-3 max-w-lg text-[15px] leading-7 text-[#5C6570] sm:text-base">
                {home.chatSubtitle}
              </p>
            </LandingReveal>

            <div className="mt-8 max-w-[860px]">
              <HeroLegalAiComposer
                placeholder={home.chatPlaceholder}
                submitLabel={home.chatSubmit}
                typingLabel={home.chatTyping}
                checkoutEnabled={checkoutEnabled}
                suggestionsLabel={home.chatSuggestionsLabel}
                suggestions={home.chatSuggestions}
              />
            </div>

            {statEntries.length > 0 ? (
              <div className="mt-10 flex max-w-[860px] flex-wrap gap-x-10 gap-y-4 border-t border-[#0B1F3A]/10 pt-6">
                {statEntries.map((entry) => (
                  <div key={entry.label}>
                    <p className="text-2xl font-semibold tracking-tight text-[#0B1F3A] sm:text-[1.75rem]">
                      {entry.value}+
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-[#5C6570]">{entry.label}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* RIGHT -- institutional legal visual, contained and framed --
              a deliberate panel, not a full-bleed background wash. */}
          <div className="relative mt-12 hidden aspect-[4/5] overflow-hidden rounded-[2rem] border border-[#0B1F3A]/10 shadow-[0_35px_70px_-35px_rgba(11,31,58,0.35)] lg:mt-0 lg:block">
            <LandingHeroScene className="size-full" />
          </div>
        </div>
      </div>
    </section>
  );
}
