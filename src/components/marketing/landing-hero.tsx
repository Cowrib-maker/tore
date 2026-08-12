import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { LandingExperiences } from "@/components/marketing/landing-experiences";
import { LandingOsPreview } from "@/components/marketing/landing-os-preview";
import { LandingReveal } from "@/components/marketing/landing-reveal";
import type { Dictionary } from "@/i18n/types";

export function LandingHero({ t }: { t: Dictionary["landing"] }) {
  return (
    <section className="relative overflow-hidden border-b border-[#0B1F3A]/8 bg-white">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-8 sm:px-8 sm:py-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10 lg:py-12">
        <LandingReveal>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#0B1F3A] uppercase">
            {t.osEyebrow}
          </p>
          <h1 className="mt-3 max-w-xl font-[family-name:var(--font-landing-display)] text-[2.35rem] leading-[1.08] tracking-[-0.035em] text-[#0A0F14] sm:text-[3.15rem] lg:text-[3.45rem]">
            {t.headline}
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-[#5C6570] sm:text-base">
            {t.support}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="#platform" className="landing-btn-primary">
              {t.ctaExplore}
              <ArrowRight className="size-4 opacity-90" />
            </Link>
            <Link href="/register/client" className="landing-btn-secondary">
              {t.ctaStart}
            </Link>
          </div>
        </LandingReveal>
        <LandingReveal delayMs={80} className="min-w-0">
          <LandingOsPreview t={t} />
        </LandingReveal>
      </div>
      <LandingExperiences t={t} />
    </section>
  );
}
