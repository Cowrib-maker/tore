import { LandingReveal } from "@/components/marketing/landing-reveal";
import {
  LandingEyebrow,
  LandingHeading,
  LandingLead,
  LandingSection,
} from "@/components/marketing/landing-section";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

export function LandingLegalAi({ t }: { t: Dictionary["landing"] }) {
  return (
    <LandingSection id="ai">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-12">
        <LandingReveal>
          <LandingEyebrow>{t.aiEyebrow}</LandingEyebrow>
          <LandingHeading>{t.aiTitle}</LandingHeading>
          <LandingLead>{t.aiSupport}</LandingLead>
          <p className="mt-5 text-sm font-medium text-[#0B1F3A]">{t.aiDisclaimer}</p>
          <p className="mt-2 text-xs text-[#5C6570]">{t.aiDirection}</p>
          <ul className="mt-6 grid grid-cols-2 gap-2">
            {t.aiTabs.map((tab) => (
              <li
                key={tab}
                className="rounded-lg border border-[#0B1F3A]/8 bg-[#F7F8FA] px-3 py-2 text-[13px] font-medium text-[#0A0F14]"
              >
                {tab}
              </li>
            ))}
          </ul>
        </LandingReveal>
        <LandingReveal delayMs={70}>
          <div className="landing-shadow-lg overflow-hidden rounded-2xl border border-[#0B1F3A]/12 bg-white">
            <div className="flex items-center justify-between border-b border-[#0B1F3A]/8 bg-[#0B1F3A] px-4 py-2.5 text-white">
              <p className="text-[11px] font-medium tracking-wide text-white/70">
                {t.aiTabs[0]}
              </p>
              <p className="text-[10px] text-white/40">{t.aiDirection}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 border-b border-[#0B1F3A]/8 bg-[#F7F8FA] px-3 py-2">
              {t.aiTabs.map((tab, index) => (
                <span
                  key={tab}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] font-medium",
                    index === 0
                      ? "bg-[#0B1F3A] text-white"
                      : "bg-white text-[#5C6570] ring-1 ring-[#0B1F3A]/10",
                  )}
                >
                  {tab}
                </span>
              ))}
            </div>
            <div className="space-y-3 bg-[#F4F6F8] p-4 sm:p-5">
              <div className="ml-8 rounded-2xl rounded-tr-md bg-[#0B1F3A] px-3.5 py-2.5 text-[13px] leading-relaxed text-white">
                {t.aiPrompt}
              </div>
              <div className="mr-4 space-y-3 rounded-2xl rounded-tl-md border border-[#0B1F3A]/10 bg-white p-4">
                <p className="text-[13px] leading-relaxed text-[#0A0F14]">
                  {t.aiConclusion}
                </p>
                <div className="rounded-lg border border-[#C8A45D]/35 bg-[#C8A45D]/8 px-3 py-2">
                  <p className="text-[11px] font-medium text-[#8A6A2A]">{t.aiCitation}</p>
                  <p className="mt-1 text-[11px] text-[#5C6570]">{t.aiSource}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-md border border-[#0B1F3A]/12 px-2 py-1 text-[10px] font-medium text-[#0B1F3A]">
                    {t.aiConfidence}
                  </span>
                  <span className="rounded-md bg-[#F4F6F8] px-2 py-1 text-[10px] text-[#5C6570]">
                    {t.aiAuthority}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </LandingReveal>
      </div>
    </LandingSection>
  );
}
