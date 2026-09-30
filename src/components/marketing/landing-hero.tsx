import { BookOpen, Building2, ShieldCheck } from "lucide-react";

import { HeroLegalAiComposer } from "@/components/marketing/hero-legal-ai-composer";
import { LandingHeroScene } from "@/components/marketing/landing-hero-scene";
import { LandingProducts } from "@/components/marketing/landing-products";
import { LandingReveal } from "@/components/marketing/landing-reveal";
import type { HomepageStats } from "@/application/use-cases/homepage/get-homepage-stats";
import type { Dictionary } from "@/i18n/types";

type ProductKey = "citizen" | "student" | "lawyer" | "firm" | "team";

/**
 * Splits off the final word so it can be rendered with a highlighter-style
 * background behind it, matching the approved hero reference. Space-
 * delimited scripts (mn/en/ko) highlight cleanly; scripts without spaces
 * (zh) fall back to no split rather than cutting a word in half.
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
  productHrefs,
}: {
  home: Dictionary["publicHome"];
  checkoutEnabled: boolean;
  /** Real, live counts. Omitted (no panel) when unavailable or all-zero -- never fabricated. */
  stats?: HomepageStats;
  statsLabels?: { lawyers: string; practiceAreas: string; organizations: string };
  productHrefs: Record<ProductKey, string>;
}) {
  const [taglineLead, taglineAccent] = splitLastWord(home.tagline);
  const statEntries = [
    stats && stats.listedLawyers > 0 && statsLabels
      ? { value: stats.listedLawyers, label: statsLabels.lawyers, icon: ShieldCheck }
      : null,
    stats && stats.practiceAreas > 0 && statsLabels
      ? { value: stats.practiceAreas, label: statsLabels.practiceAreas, icon: BookOpen }
      : null,
    stats && stats.activeOrganizations > 0 && statsLabels
      ? { value: stats.activeOrganizations, label: statsLabels.organizations, icon: Building2 }
      : null,
  ].filter(
    (entry): entry is { value: number; label: string; icon: typeof ShieldCheck } =>
      entry !== null,
  );

  return (
    <section
      id="chat"
      className="relative isolate overflow-hidden scroll-mt-24 border-b border-[#0B1F3A]/8 bg-[#F7F8FB]"
    >
      {/* Mobile/tablet: the atmospheric scene is its own compact band,
          stacked ABOVE the text content. Desktop: the scene bleeds across
          the whole section as one full-width background, under a single
          UNIFORM light wash (not a left-side scrim) -- the scene itself is
          understated enough now (no dominant foreground building) that a
          flat, even wash keeps text legible everywhere without needing to
          selectively block one side of the image. */}
      <div className="relative h-[260px] overflow-hidden sm:h-[340px] lg:hidden">
        <LandingHeroScene className="size-full" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-white/45" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_50%,rgba(247,248,251,0.75)_78%,#F7F8FB_100%)]"
        />
      </div>

      {/* The illustration's own box is pinned to its native 1600x900
          aspect ratio (not stretched to the section's full, content-driven
          height) -- the composer/stats stack can make the section much
          taller than it is wide, and stretching a "slice"-cropped SVG into
          a mismatched box over-zooms it. A bottom fade blends it into the
          page background for any extra section height below the image. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 hidden overflow-hidden lg:block lg:aspect-[1600/900]"
      >
        <LandingHeroScene className="size-full" />
        {/* One uniform wash across the whole image -- not a gradient that
            varies by x-position -- so the full-width scene (mountains,
            city, the upper-right emblem lockup) stays visible everywhere,
            with text legible against it because the wash lightens
            everything evenly, not because one side is blocked out. */}
        <div className="absolute inset-0 bg-white/40" />
        {/* Fades in earlier and across more stops than a single hard cutoff
            -- softens the seam between the scene's own bottom edge and the
            plain canvas color so the role cards below feel anchored into
            the tail of the hero rather than pasted onto a cut-off band. */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(247,248,251,0.75)_82%,#F7F8FB_100%)]" />
      </div>

      <div className="mx-auto max-w-[1600px] px-6 sm:px-10 lg:px-16">
        {/* Its own `relative` scope, separate from the role-router grid
            below -- the stat card's `absolute bottom-16` must resolve
            against the hero's own text/visual height, not against the much
            taller hero+role-cards container (that mismatch previously sent
            the card ~450px below the fold, past the role cards). */}
        <div className="relative">
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
                    <span className="relative inline-block whitespace-nowrap">
                      <span
                        aria-hidden
                        className="absolute inset-x-[-0.1em] inset-y-[0.12em] -z-10 -rotate-1 rounded-md bg-[#0B5CFF]/15"
                      />
                      <span className="text-[#0B5CFF]">{taglineAccent}</span>
                    </span>
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
          </div>
        </div>

        {/* The stat card floats over the institutional scene on desktop
            (anchored within this section's own `relative` container, so it
            stacks above the absolutely-positioned scene without touching
            that component) and drops back into normal flow -- stacked
            below the composer -- on mobile/tablet, where there is no scene
            underneath it to float over. Real counts only: each row is
            already filtered to non-zero live data by `statEntries` above,
            and the whole card is omitted when every count is unavailable.
            A single available metric gets a compact one-line pill instead
            of a sparse three-row card with two empty slots. */}
        {statEntries.length === 1 ? (
          <div className="mt-8 pb-8 sm:pb-12 lg:absolute lg:right-16 lg:bottom-16 lg:mt-0 lg:pb-0">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-[#0B1F3A]/90 px-4 py-2.5 shadow-[0_24px_60px_-20px_rgba(11,31,58,0.55)] backdrop-blur-xl">
              <span className="text-base font-semibold tracking-tight text-white">
                {statEntries[0]!.value}+
              </span>
              <span className="text-[12.5px] text-white/70">{statEntries[0]!.label}</span>
            </div>
          </div>
        ) : statEntries.length > 1 ? (
          <div className="mt-8 pb-8 sm:pb-12 lg:absolute lg:right-16 lg:bottom-16 lg:mt-0 lg:pb-0">
            <div className="flex divide-x divide-white/10 rounded-2xl border border-white/10 bg-[#0B1F3A]/90 shadow-[0_24px_60px_-20px_rgba(11,31,58,0.55)] backdrop-blur-xl">
              {statEntries.map((entry) => {
                const Icon = entry.icon;
                return (
                  <div key={entry.label} className="flex-1 px-5 py-4 text-center">
                    <Icon className="mx-auto size-4 text-white/60" />
                    <p className="mt-2 text-xl font-semibold tracking-tight text-white">
                      {entry.value}+
                    </p>
                    <p className="mt-0.5 text-[11px] leading-tight text-white/70">
                      {entry.label}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        </div>

        {/* The role router is a direct continuation of the hero, not a
            separate page section -- same canvas, no border, no independent
            section chrome. See LandingProducts for the (now section-less)
            card grid markup; hrefs/copy/business logic are unchanged. */}
        <LandingProducts home={home} hrefs={productHrefs} />
      </div>
    </section>
  );
}
