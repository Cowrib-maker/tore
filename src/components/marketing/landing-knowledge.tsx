import { LandingReveal } from "@/components/marketing/landing-reveal";
import {
  LandingEyebrow,
  LandingHeading,
  LandingLead,
  LandingSection,
} from "@/components/marketing/landing-section";
import type { Dictionary } from "@/i18n/types";

export function LandingKnowledge({ t }: { t: Dictionary["landing"] }) {
  return (
    <LandingSection id="knowledge" muted>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-12">
        <LandingReveal>
          <LandingEyebrow>{t.knowledgeEyebrow}</LandingEyebrow>
          <LandingHeading>{t.knowledgeTitle}</LandingHeading>
          <LandingLead>{t.knowledgeSupport}</LandingLead>
          <p className="mt-5 text-sm font-medium text-[#0A0F14]">
            {t.knowledgePrinciple}
          </p>
          <p className="mt-2 text-xs text-[#5C6570]">{t.knowledgeDirection}</p>
        </LandingReveal>
        <LandingReveal delayMs={50}>
          <div className="overflow-hidden rounded-2xl border border-[#0B1F3A]/10 bg-white">
            <div className="flex items-center justify-between border-b border-[#0B1F3A]/8 px-4 py-3">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[#5C6570] uppercase">
                {t.knowledgeEyebrow}
              </p>
              <span className="rounded-full bg-[#0B1F3A]/6 px-2 py-0.5 text-[10px] font-medium text-[#0B1F3A]">
                {t.knowledgeDirection}
              </span>
            </div>
            <ul className="grid sm:grid-cols-2">
              {t.knowledgeSources.map((source, index) => (
                <li
                  key={source}
                  className="flex items-center gap-3 border-b border-[#0B1F3A]/8 px-4 py-3 text-sm text-[#0A0F14] last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0"
                >
                  <span className="font-mono text-[10px] text-[#5C6570]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {source}
                </li>
              ))}
            </ul>
          </div>
        </LandingReveal>
      </div>
    </LandingSection>
  );
}
