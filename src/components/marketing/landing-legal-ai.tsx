import Link from "next/link";

import { LandingReveal } from "@/components/marketing/landing-reveal";
import {
  LandingEyebrow,
  LandingHeading,
  LandingLead,
  LandingSection,
} from "@/components/marketing/landing-section";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

export function LandingLegalAi({
  t,
  exploreHref,
}: {
  t: Dictionary["landing"];
  exploreHref: string;
}) {
  return (
    <LandingSection id="ai">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14">
        <LandingReveal>
          <LandingEyebrow>{t.aiEyebrow}</LandingEyebrow>
          <LandingHeading>{t.aiTitle}</LandingHeading>
          <LandingLead>{t.aiSupport}</LandingLead>
          <p className="mt-5 text-[14px] leading-7 text-[#5C6570]">{t.aiSupportDetail}</p>
          <p className="mt-5 text-sm font-medium text-[#0B1F3A]">{t.aiDisclaimer}</p>

          <Link
            href={exploreHref}
            className="mt-8 inline-flex h-11 items-center rounded-lg bg-[#0B1F3A] px-5 text-[13px] font-semibold text-white transition hover:bg-[#16365F]"
          >
            {t.aiComposerSubmit}
          </Link>

          <div className="mt-8 flex flex-wrap items-center gap-2 text-[11px] text-[#5C6570]">
            {t.aiTrustFlow.map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                {index > 0 ? (
                  <span aria-hidden className="text-[#0B1F3A]/30">
                    →
                  </span>
                ) : null}
                <span className="rounded-md bg-[#EEF3F8] px-2.5 py-1 font-medium text-[#0B1F3A]">
                  {step}
                </span>
              </div>
            ))}
          </div>
        </LandingReveal>

        <LandingReveal delayMs={70}>
          <div className="overflow-hidden rounded-2xl border border-[#0B1F3A]/10 bg-white shadow-[0_18px_50px_rgba(11,31,58,0.06)]">
            <div className="flex flex-wrap gap-1.5 border-b border-[#0B1F3A]/8 bg-[#F7F9FC] px-3 py-2.5">
              {t.aiTabs.map((tab, index) => (
                <span
                  key={tab}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[10px] font-medium",
                    index === 0
                      ? "bg-[#0B1F3A] text-white"
                      : "bg-white text-[#5C6570] ring-1 ring-[#0B1F3A]/10",
                  )}
                >
                  {tab}
                </span>
              ))}
            </div>

            <div className="space-y-3 bg-[#FAFBFC] p-4 sm:p-5">
              <div className="ml-6 rounded-2xl rounded-tr-md bg-[#0B1F3A] px-3.5 py-2.5 text-[13px] leading-relaxed text-white">
                {t.aiPrompt}
              </div>
              <div className="mr-2 space-y-3 rounded-2xl rounded-tl-md border border-[#0B1F3A]/10 bg-white p-4">
                <p className="text-[13px] leading-relaxed text-[#0A0F14]">
                  {t.aiConclusion}
                </p>
                <div className="rounded-lg border border-[#0B1F3A]/10 bg-[#F7F9FC] px-3 py-2.5">
                  <p className="text-[11px] font-medium text-[#0B1F3A]">{t.aiCitation}</p>
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
