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
      {/* Mobile/tablet: the institutional scene is its own compact band,
          stacked ABOVE the text content (not a background the text sits
          on top of) -- the illustration is busy enough now (real window
          grid, skyline, sun) that overlapping text on it would hurt
          legibility. Desktop: the scene bleeds across the whole section
          as one atmospheric background, with a soft gradient scrim (not a
          hard edge, not a boxed card) protecting the left text column. */}
      <div className="relative h-[260px] overflow-hidden sm:h-[340px] lg:hidden">
        <LandingHeroScene className="size-full" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_70%,#F7F8FB_100%)]"
        />
      </div>

      {/* The illustration's own box is pinned to its native 1600x900
          aspect ratio (not stretched to the section's full, content-driven
          height) -- the composer/stats stack can make the section much
          taller than it is wide, and stretching a "slice"-cropped SVG into
          that mismatched box zoomed in so far that the building was cropped
          almost entirely off-screen at narrower desktop widths (confirmed
          in QA at 1024px). Matching the box to the SVG's own aspect ratio
          means no cropping is ever needed, at any width. A bottom fade
          blends it into the page background for any extra section height
          below the image. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 hidden overflow-hidden lg:block lg:aspect-[1600/900]"
      >
        <LandingHeroScene className="size-full" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_72%,#F7F8FB_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,#F7F8FB_0%,#F7F8FB_42%,rgba(247,248,251,0.55)_50%,rgba(247,248,251,0.12)_58%,transparent_66%)]" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-6 sm:px-10 lg:px-16">
        <div className="py-8 sm:py-12 lg:flex lg:min-h-[800px] lg:items-center lg:py-24">
          <div className="lg:max-w-[56%]">
            <LandingReveal>
              <p className="text-[13px] font-semibold tracking-[0.24em] text-[#5C6570] uppercase sm:text-sm">
                {home.brandLine}
              </p>

              <h1 className="mt-5 max-w-[720px] font-[family-name:var(--font-landing-display)] text-[2.75rem] leading-[1.04] font-semibold tracking-[-0.03em] text-[#0B1F3A] sm:text-[3.75rem] lg:text-[4.25rem] xl:text-[4.5rem]">
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

            <div className="mt-8 max-w-[820px]">
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
              <div className="mt-10 flex max-w-[820px] flex-wrap gap-x-10 gap-y-4 border-t border-[#0B1F3A]/10 pt-6">
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
        </div>
      </div>
    </section>
  );
}
