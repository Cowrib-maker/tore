import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { LandingReveal } from "@/components/marketing/landing-reveal";
import {
  LandingEyebrow,
  LandingHeading,
  LandingLead,
  LandingSection,
} from "@/components/marketing/landing-section";
import type { Dictionary } from "@/i18n/types";

export function LandingMarketplace({ t }: { t: Dictionary["landing"] }) {
  return (
    <LandingSection id="marketplace" muted>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <LandingReveal className="max-w-2xl">
          <LandingEyebrow>{t.marketEyebrow}</LandingEyebrow>
          <LandingHeading>{t.marketTitle}</LandingHeading>
          <LandingLead>{t.marketSupport}</LandingLead>
        </LandingReveal>
        <LandingReveal delayMs={40}>
          <Link href="/lawyers" className="landing-btn-secondary">
            {t.marketCta}
            <ArrowRight className="size-4" />
          </Link>
        </LandingReveal>
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {t.marketItems.map((item, index) => (
          <LandingReveal key={item.title} delayMs={30 + index * 35}>
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
