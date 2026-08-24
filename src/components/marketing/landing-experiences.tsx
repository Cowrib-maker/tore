import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { EditableText } from "@/components/marketing/homepage-editable-text";
import { LandingReveal } from "@/components/marketing/landing-reveal";
import {
  LandingEyebrow,
  LandingHeading,
  LandingSection,
} from "@/components/marketing/landing-section";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

const HREFS = [
  "/register/client",
  "/register/client",
  "/register/lawyer",
  "/register/client",
] as const;

const ANCHORS = ["citizens", "businesses", "lawyers", "government"] as const;

export function LandingExperiences({
  t,
  imageUrl,
  imageSlot,
}: {
  t: Dictionary["landing"];
  imageUrl?: string | null;
  imageSlot?: ReactNode;
}) {
  return (
    <LandingSection id="platform" imageUrl={imageUrl} imageSlot={imageSlot}>
      <LandingReveal className="max-w-2xl">
        <LandingEyebrow>
          <EditableText path="experiencesEyebrow">{t.experiencesEyebrow}</EditableText>
        </LandingEyebrow>
        <LandingHeading>
          <EditableText path="experiencesTitle">{t.experiencesTitle}</EditableText>
        </LandingHeading>
      </LandingReveal>

      <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-[#0B1F3A]/10 bg-[#0B1F3A]/10 sm:grid-cols-2 lg:grid-cols-4">
        {t.experiences.map((item, index) => (
          <LandingReveal key={item.title} delayMs={20 + index * 40}>
            <article
              id={ANCHORS[index]}
              className={cn(
                "group flex h-full scroll-mt-28 flex-col bg-white p-5 sm:p-6",
              )}
            >
              <p className="text-[11px] font-semibold tracking-[0.12em] text-[#7B8490] uppercase">
                <EditableText path={`experiences.${index}.audience`}>
                  {item.audience}
                </EditableText>
              </p>
              <h3 className="mt-2 text-[17px] font-semibold tracking-tight text-[#0A0F14]">
                <EditableText path={`experiences.${index}.title`}>{item.title}</EditableText>
              </h3>
              <p className="mt-3 flex-1 text-[13px] leading-relaxed text-[#5C6570]">
                <EditableText path={`experiences.${index}.description`}>
                  {item.description}
                </EditableText>
              </p>
              <Link
                href={HREFS[index] ?? "/register/client"}
                className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0B1F3A] transition hover:opacity-70"
              >
                <EditableText path="experiencesContinue">{t.experiencesContinue}</EditableText>
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </article>
          </LandingReveal>
        ))}
      </div>
    </LandingSection>
  );
}
