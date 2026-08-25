import { LandingReveal } from "@/components/marketing/landing-reveal";
import {
  LEGAL_INTELLIGENCE_SECTION_KEYS,
  type LegalIntelligenceFeed,
} from "@/domain/legal-intelligence";
import type { Dictionary } from "@/i18n/types";

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
        <LandingReveal className="max-w-xl">
          <p className="text-[12px] font-semibold tracking-[0.16em] text-[#1A7A72] uppercase">
            Legal Intelligence
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-landing-display)] text-[1.65rem] tracking-[-0.03em] text-[#0B1F3A] sm:text-[1.9rem]">
            {home.intelligenceTitle}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#5C6570]">
            {home.intelligenceLead}
          </p>
        </LandingReveal>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {LEGAL_INTELLIGENCE_SECTION_KEYS.map((key, index) => (
            <LandingReveal key={key} delayMs={index * 40}>
              <article className="flex h-full flex-col rounded-2xl border border-[#0B1F3A]/10 bg-white/90 p-5">
                <h3 className="text-[14px] font-semibold text-[#0B1F3A]">
                  {home.intelligenceSections[key]}
                </h3>
                {feed[key].length > 0 ? (
                  <ul className="mt-3 space-y-3">
                    {feed[key].map((item) => (
                      <li key={`${key}-${item.title}`} className="min-w-0">
                        {item.sourceUrl ? (
                          <a
                            href={item.sourceUrl}
                            className="text-[13px] font-medium text-[#0B1F3A] underline-offset-4 hover:underline"
                            rel="noreferrer"
                            target="_blank"
                          >
                            {item.title}
                          </a>
                        ) : (
                          <p className="text-[13px] font-medium text-[#0B1F3A]">
                            {item.title}
                          </p>
                        )}
                        {item.date ? (
                          <p className="mt-0.5 text-[12px] text-[#7B8490]">
                            {item.date}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-[13px] text-[#8A939D]">
                    {home.intelligenceEmpty}
                  </p>
                )}
              </article>
            </LandingReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
