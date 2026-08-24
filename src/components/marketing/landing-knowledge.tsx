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

export function LandingKnowledge({
  t,
  imageUrl,
  imageSlot,
}: {
  t: Dictionary["landing"];
  imageUrl?: string | null;
  imageSlot?: ReactNode;
}) {
  return (
    <LandingSection id="knowledge" muted imageUrl={imageUrl} imageSlot={imageSlot}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-14">
        <LandingReveal>
          <LandingEyebrow>
            <EditableText path="knowledgeEyebrow">{t.knowledgeEyebrow}</EditableText>
          </LandingEyebrow>
          <LandingHeading>
            <EditableText path="knowledgeTitle">{t.knowledgeTitle}</EditableText>
          </LandingHeading>
          <LandingLead>
            <EditableText path="knowledgeSupport">{t.knowledgeSupport}</EditableText>
          </LandingLead>
          <p className="mt-5 text-sm font-medium text-[#0A0F14]">
            <EditableText path="knowledgePrinciple">{t.knowledgePrinciple}</EditableText>
          </p>
        </LandingReveal>

        <LandingReveal delayMs={50}>
          <div className="overflow-hidden rounded-2xl border border-[#0B1F3A]/10 bg-white">
            <div className="border-b border-[#0B1F3A]/8 px-5 py-4">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[#7B8490] uppercase">
                <EditableText path="knowledgeEyebrow">{t.knowledgeEyebrow}</EditableText>
              </p>
            </div>
            <ul>
              {t.knowledgeSources.map((source, index) => (
                <li
                  key={source}
                  className="flex items-center gap-4 border-b border-[#0B1F3A]/8 px-5 py-4 last:border-b-0"
                >
                  <span className="font-mono text-[11px] text-[#7B8490]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm font-medium text-[#0A0F14]">
                    <EditableText path={`knowledgeSources.${index}`}>{source}</EditableText>
                  </span>
                  <span className="ml-auto h-px w-10 bg-[#0B1F3A]/15" aria-hidden />
                </li>
              ))}
            </ul>
          </div>
        </LandingReveal>
      </div>
    </LandingSection>
  );
}
