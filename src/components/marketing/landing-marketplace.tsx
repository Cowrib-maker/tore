import Link from "next/link";
import { ArrowRight } from "lucide-react";
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

export function LandingMarketplace({
  t,
  imageUrl,
  imageSlot,
}: {
  t: Dictionary["landing"];
  imageUrl?: string | null;
  imageSlot?: ReactNode;
}) {
  return (
    <LandingSection id="marketplace" muted imageUrl={imageUrl} imageSlot={imageSlot}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <LandingReveal className="max-w-2xl">
          <LandingEyebrow>
            <EditableText path="marketEyebrow">{t.marketEyebrow}</EditableText>
          </LandingEyebrow>
          <LandingHeading>
            <EditableText path="marketTitle">{t.marketTitle}</EditableText>
          </LandingHeading>
          <LandingLead>
            <EditableText path="marketSupport">{t.marketSupport}</EditableText>
          </LandingLead>
        </LandingReveal>
        <LandingReveal delayMs={40}>
          <Link href="/lawyers" className="landing-btn-secondary">
            <EditableText path="marketCta">{t.marketCta}</EditableText>
            <ArrowRight className="size-4" />
          </Link>
        </LandingReveal>
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {t.marketItems.map((item, index) => (
          <LandingReveal key={item.title} delayMs={30 + index * 35}>
            <div className="h-full rounded-xl border border-[#0B1F3A]/8 bg-white p-4">
              <h3 className="text-sm font-semibold text-[#0A0F14]">
                <EditableText path={`marketItems.${index}.title`}>{item.title}</EditableText>
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5C6570]">
                <EditableText path={`marketItems.${index}.description`}>
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
