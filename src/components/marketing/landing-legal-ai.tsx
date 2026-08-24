import Link from "next/link";
import type { ReactNode } from "react";

import { EditableText } from "@/components/marketing/homepage-editable-text";
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
  imageUrl,
  imageSlot,
}: {
  t: Dictionary["landing"];
  exploreHref: string;
  imageUrl?: string | null;
  imageSlot?: ReactNode;
}) {
  return (
    <LandingSection id="ai" imageUrl={imageUrl} imageSlot={imageSlot}>
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14">
        <LandingReveal>
          <LandingEyebrow>
            <EditableText path="aiEyebrow">{t.aiEyebrow}</EditableText>
          </LandingEyebrow>
          <LandingHeading>
            <EditableText path="aiTitle">{t.aiTitle}</EditableText>
          </LandingHeading>
          <LandingLead>
            <EditableText path="aiSupport">{t.aiSupport}</EditableText>
          </LandingLead>
          <p className="mt-5 text-[14px] leading-7 text-[#5C6570]">
            <EditableText path="aiSupportDetail">{t.aiSupportDetail}</EditableText>
          </p>
          <p className="mt-5 text-sm font-medium text-[#0B1F3A]">
            <EditableText path="aiDisclaimer">{t.aiDisclaimer}</EditableText>
          </p>

          <Link
            href={exploreHref}
            className="mt-8 inline-flex h-11 items-center rounded-lg bg-[#0B1F3A] px-5 text-[13px] font-semibold text-white transition hover:bg-[#16365F]"
          >
            <EditableText path="aiComposerSubmit">{t.aiComposerSubmit}</EditableText>
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
                  <EditableText path={`aiTrustFlow.${index}`}>{step}</EditableText>
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
                  <EditableText path={`aiTabs.${index}`}>{tab}</EditableText>
                </span>
              ))}
            </div>

            <div className="space-y-3 bg-[#FAFBFC] p-4 sm:p-5">
              <div className="ml-6 rounded-2xl rounded-tr-md bg-[#0B1F3A] px-3.5 py-2.5 text-[13px] leading-relaxed text-white">
                <EditableText path="aiPrompt">{t.aiPrompt}</EditableText>
              </div>
              <div className="mr-2 space-y-3 rounded-2xl rounded-tl-md border border-[#0B1F3A]/10 bg-white p-4">
                <p className="text-[13px] leading-relaxed text-[#0A0F14]">
                  <EditableText path="aiConclusion">{t.aiConclusion}</EditableText>
                </p>
                <div className="rounded-lg border border-[#0B1F3A]/10 bg-[#F7F9FC] px-3 py-2.5">
                  <p className="text-[11px] font-medium text-[#0B1F3A]">
                    <EditableText path="aiCitation">{t.aiCitation}</EditableText>
                  </p>
                  <p className="mt-1 text-[11px] text-[#5C6570]">
                    <EditableText path="aiSource">{t.aiSource}</EditableText>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-md border border-[#0B1F3A]/12 px-2 py-1 text-[10px] font-medium text-[#0B1F3A]">
                    <EditableText path="aiConfidence">{t.aiConfidence}</EditableText>
                  </span>
                  <span className="rounded-md bg-[#F4F6F8] px-2 py-1 text-[10px] text-[#5C6570]">
                    <EditableText path="aiAuthority">{t.aiAuthority}</EditableText>
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
