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

export function LandingTrust({
  t,
  imageUrl,
  imageSlot,
}: {
  t: Dictionary["landing"];
  imageUrl?: string | null;
  imageSlot?: ReactNode;
}) {
  return (
    <LandingSection id="trust" muted imageUrl={imageUrl} imageSlot={imageSlot}>
      <LandingReveal className="max-w-2xl">
        <LandingEyebrow>
          <EditableText path="trustEyebrow">{t.trustEyebrow}</EditableText>
        </LandingEyebrow>
        <LandingHeading>
          <EditableText path="trustTitle">{t.trustTitle}</EditableText>
        </LandingHeading>
        <LandingLead>
          <EditableText path="trustSupport">{t.trustSupport}</EditableText>
        </LandingLead>
      </LandingReveal>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {t.trustItems.map((item, index) => (
          <LandingReveal key={item.title} delayMs={25 + index * 30}>
            <div className="h-full rounded-xl border border-[#0B1F3A]/8 bg-white p-4">
              <h3 className="text-sm font-semibold text-[#0A0F14]">
                <EditableText path={`trustItems.${index}.title`}>{item.title}</EditableText>
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5C6570]">
                <EditableText path={`trustItems.${index}.description`}>
                  {item.description}
                </EditableText>
              </p>
            </div>
          </LandingReveal>
        ))}
      </div>
    </LandingSection>
  );
}
