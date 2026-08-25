import {
  LandingIntelligenceFeedClient,
} from "@/components/marketing/landing-intelligence-feed-client";
import type { LegalIntelligenceFeed } from "@/domain/legal-intelligence";
import type { Dictionary } from "@/i18n/types";

/**
 * Server-rendered Тойм chrome. Interactive filter/list lives in a thin client
 * island so homepage hydration is not tied to this section's static markup.
 */
export function LandingIntelligence({
  home,
  feed,
}: {
  home: Dictionary["publicHome"];
  feed: LegalIntelligenceFeed;
}) {
  return (
    <section
      id="intelligence"
      className="scroll-mt-24 border-b border-[#0B1F3A]/8 bg-[#E8F4F1]/55"
    >
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
        <div className="max-w-2xl">
          <p className="text-[12px] font-semibold tracking-[0.16em] text-[#1A7A72] uppercase">
            Legal Intelligence
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-landing-display)] text-[1.65rem] tracking-[-0.03em] text-[#0B1F3A] sm:text-[1.9rem]">
            {home.intelligenceTitle}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#5C6570]">
            {home.intelligenceLead}
          </p>
        </div>

        <LandingIntelligenceFeedClient home={home} feed={feed} />
      </div>
    </section>
  );
}
