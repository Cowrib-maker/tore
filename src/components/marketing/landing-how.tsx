import { LandingReveal } from "@/components/marketing/landing-reveal";
import {
  LandingEyebrow,
  LandingHeading,
  LandingSection,
} from "@/components/marketing/landing-section";
import type { Dictionary } from "@/i18n/types";

export function LandingHow({ t }: { t: Dictionary["landing"] }) {
  return (
    <LandingSection id="how">
      <LandingReveal className="max-w-2xl">
        <LandingEyebrow>{t.howEyebrow}</LandingEyebrow>
        <LandingHeading>{t.howTitle}</LandingHeading>
      </LandingReveal>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {t.howSteps.map((item, index) => (
          <LandingReveal key={item.title} delayMs={30 + index * 40}>
            <div className="h-full border-t border-[#0B1F3A]/15 pt-4">
              <span className="text-[11px] font-semibold tracking-[0.16em] text-[#0B1F3A]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-base font-semibold tracking-tight text-[#0A0F14]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5C6570]">
                {item.description}
              </p>
            </div>
          </LandingReveal>
        ))}
      </div>
    </LandingSection>
  );
}
