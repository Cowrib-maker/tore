import { BookOpen, Building2, ShieldCheck } from "lucide-react";

import { HeroLegalAiComposer } from "@/components/marketing/hero-legal-ai-composer";
import { LandingProducts } from "@/components/marketing/landing-products";
import { LandingReveal } from "@/components/marketing/landing-reveal";
import type { HomepageStats } from "@/application/use-cases/homepage/get-homepage-stats";
import type { Dictionary } from "@/i18n/types";

/**
 * Crop of the building in the approved Stitch Home screen (project-owned,
 * AI-generated design asset -- a fictional building carrying the TORE
 * slogan, not a real institution). Replace with a licensed photograph of the
 * intended building when one exists.
 */
const HERO_IMAGE = "/home/hero-building.jpg";

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

  const [eyebrowLead, eyebrowTail] = splitEyebrow(home.brandLine);

  return (
    <section
      id="chat"
      className="relative isolate scroll-mt-24 overflow-hidden bg-[radial-gradient(circle_at_20%_15%,#ffffff_0%,#eef4fb_50%,#e0ebf7_100%)] pt-6 pb-16 lg:pt-12"
    >
      {/* Mobile/tablet: the image is its own compact band above the text. */}
      <div className="relative -mt-6 mb-6 h-[220px] overflow-hidden sm:h-[300px] lg:hidden" aria-hidden>
        <div
          className="absolute inset-0 bg-cover bg-[position:30%_top]"
          style={{ backgroundImage: `url(${HERO_IMAGE})` }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,250,252,0)_55%,#F8FAFC_100%)]" />
      </div>

      {/* Desktop: the building sits on the right of the hero, anchored to the
          content width, dissolving into the page canvas toward the text (left),
          the role cards (bottom) and -- on very wide screens -- the right edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 mx-auto hidden max-w-[1600px] select-none lg:block"
      >
        <div
          className="ml-auto aspect-[580/456] w-[46%] bg-cover bg-center"
          style={{
            backgroundImage: `url(${HERO_IMAGE})`,
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0%, #000 36%, #000 94%, transparent 100%), linear-gradient(to bottom, #000 78%, transparent 100%)",
            WebkitMaskComposite: "source-in",
            maskImage:
              "linear-gradient(to right, transparent 0%, #000 36%, #000 94%, transparent 100%), linear-gradient(to bottom, #000 78%, transparent 100%)",
            maskComposite: "intersect",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-[1440px] px-6 sm:px-10">
        <div className="grid grid-cols-12 items-start gap-8 pt-0 lg:pt-6">
          <div className="col-span-12 pr-0 lg:col-span-7 lg:pr-4">
            <LandingReveal>
              <div className="mb-4 flex items-center space-x-2 text-xs font-bold tracking-[0.22em] text-blue-600 uppercase">
                <span>{eyebrowLead}</span>
                {eyebrowTail ? (
                  <>
                    <span className="text-blue-400">•</span>
                    <span>{eyebrowTail}</span>
                  </>
                ) : null}
              </div>

              <h1 className="font-[family-name:var(--font-landing-display)] text-4xl leading-[1.18] font-extrabold tracking-tight text-[#0B1D3A] sm:text-5xl lg:text-[58px]">
                {taglineAccent ? (
                  <>
                    {renderWithBreak(taglineLead)}
                    <span className="relative inline-block text-[#1B63FF]">{taglineAccent}</span>
                  </>
                ) : (
                  home.tagline
                )}
              </h1>

              <div className="mt-6 mb-7">
                <h2 className="mb-1.5 text-xl font-bold text-slate-900 sm:text-2xl">
                  {home.chatTitle}
                </h2>
                <p className="text-[15px] font-normal text-slate-500">{home.chatSubtitle}</p>
              </div>
            </LandingReveal>

            <div className="w-full max-w-[820px]">
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

          {/* Real, live counts only -- each metric is already filtered to
              non-zero data and the card is omitted when nothing is
              available. A single metric gets a compact pill. */}
          <div className="col-span-12 flex flex-col items-end justify-end lg:col-span-5 lg:min-h-[300px] lg:pt-[clamp(300px,calc(33vw-65px),520px)]">
            {statEntries.length === 1 ? (
              <div className="inline-flex items-center gap-2.5 rounded-full border border-white/20 bg-[rgba(13,31,60,0.86)] px-5 py-2.5 text-white shadow-2xl backdrop-blur-[14px]">
                <span className="text-base font-extrabold tracking-tight">
                  {statEntries[0]!.value}+
                </span>
                <span className="text-[12px] font-medium text-slate-200">
                  {statEntries[0]!.label}
                </span>
              </div>
            ) : statEntries.length > 1 ? (
              <div
                className="grid w-full max-w-md divide-x divide-white/20 rounded-2xl border border-white/20 bg-[rgba(13,31,60,0.86)] p-4 text-center text-white shadow-2xl backdrop-blur-[14px]"
                style={{ gridTemplateColumns: `repeat(${statEntries.length}, minmax(0, 1fr))` }}
              >
                {statEntries.map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <div key={entry.label} className="px-2">
                      <Icon className="mx-auto mb-1 size-4 text-blue-300" />
                      <p className="text-xl font-extrabold tracking-tight">{entry.value}+</p>
                      <p className="mt-0.5 text-[11px] font-medium text-slate-300">
                        {entry.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <LandingProducts home={home} hrefs={productHrefs} />
      </div>
    </section>
  );
}

/** "A FOR B" -> ["A", "FOR B"] so the eyebrow reads "A • FOR B"; otherwise unsplit. */
function splitEyebrow(text: string): [string, string | null] {
  const index = text.indexOf(" FOR ");
  if (index === -1) return [text, null];
  return [text.slice(0, index), text.slice(index + 1)];
}

/** Puts the headline's line break after its first comma ("A, / B"). */
function renderWithBreak(text: string) {
  const index = text.indexOf(", ");
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index + 1)} <br />
      {text.slice(index + 2)}
    </>
  );
}
