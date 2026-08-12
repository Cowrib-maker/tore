import { LandingReveal } from "@/components/marketing/landing-reveal";
import {
  LandingEyebrow,
  LandingHeading,
  LandingLead,
  LandingSection,
} from "@/components/marketing/landing-section";
import type { Dictionary } from "@/i18n/types";

export function LandingTrust({ t }: { t: Dictionary["landing"] }) {
  return (
    <LandingSection id="trust" muted>
      <LandingReveal className="max-w-2xl">
        <LandingEyebrow>{t.trustEyebrow}</LandingEyebrow>
        <LandingHeading>{t.trustTitle}</LandingHeading>
        <LandingLead>{t.trustSupport}</LandingLead>
      </LandingReveal>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {t.trustItems.map((item, index) => (
          <LandingReveal key={item.title} delayMs={25 + index * 30}>
            <div className="h-full rounded-xl border border-[#0B1F3A]/8 bg-white p-4">
              <h3 className="text-sm font-semibold text-[#0A0F14]">{item.title}</h3>
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
