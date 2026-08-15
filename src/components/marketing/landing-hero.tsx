import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { LandingOsPreview } from "@/components/marketing/landing-os-preview";
import { LandingReveal } from "@/components/marketing/landing-reveal";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

export function LandingHero({
  t,
  exploreHref,
  composerMode,
  dashboardHref,
}: {
  t: Dictionary["landing"];
  exploreHref: string;
  composerMode: "guest" | "client" | "other";
  dashboardHref: string;
}) {
  return (
    <section className="relative overflow-hidden border-b border-[#0B1F3A]/8 bg-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(11,31,58,0.06),transparent_55%),linear-gradient(180deg,#FFFFFF_0%,#F7F9FC_100%)]"
      />

      <div className="relative mx-auto max-w-7xl px-5 pb-14 pt-12 sm:px-8 sm:pb-16 sm:pt-16 lg:pb-20 lg:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
          <LandingReveal>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-[#5C6570] uppercase">
  {t.osEyebrow}
</p>

<h1
  className="mt-4 max-w-2xl font-[family-name:var(--font-landing-display)] text-[2.8rem] leading-[1.08] tracking-[-0.035em] text-[#0A0F14] sm:text-[3.6rem] lg:text-[4.1rem]"
>
  {t.headline}
</h1>

            <p className="mt-5 max-w-lg text-[15px] leading-7 text-[#5C6570] sm:text-base">
              {t.support}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={exploreHref}
                className={cn(
                  "inline-flex h-11 items-center justify-center rounded-lg bg-[#0B1F3A] px-5 text-[13px] font-semibold text-white transition hover:bg-[#16365F]",
                )}
              >
                {t.ctaExplore}
              </Link>
              <Link
                href={composerMode === "guest" ? "/register/client" : "/lawyers"}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[#0B1F3A]/15 bg-white px-5 text-[13px] font-semibold text-[#0B1F3A] transition hover:bg-[#F4F6F8]"
              >
                {t.ctaStart}
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </LandingReveal>

          <LandingReveal delayMs={80} className="lg:pl-2">
            <LandingOsPreview
              t={t}
              composerMode={composerMode}
              dashboardHref={dashboardHref}
            />
          </LandingReveal>
        </div>
      </div>
    </section>
  );
}
