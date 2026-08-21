import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { HeroLegalAiComposer } from "@/components/marketing/hero-legal-ai-composer";
import { LandingReveal } from "@/components/marketing/landing-reveal";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

export function LandingHero({
  t,
  exploreHref,
  composerMode,
  imageUrl,
}: {
  t: Dictionary["landing"];
  exploreHref: string;
  composerMode: "guest" | "client" | "other";
  imageUrl?: string | null;
}) {
  return (
    <section className="relative overflow-hidden border-b border-[#0B1F3A]/8 bg-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(11,31,58,0.06),transparent_55%),linear-gradient(180deg,#FFFFFF_0%,#F7F9FC_100%)]"
      />

      <div className="relative mx-auto max-w-3xl px-5 pt-16 pb-16 text-center sm:px-8 sm:pt-20 sm:pb-20 lg:pt-24 lg:pb-24">
        <LandingReveal>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className="mx-auto mb-8 max-h-80 w-full max-w-2xl rounded-2xl border border-[#0B1F3A]/10 object-cover"
            />
          ) : null}
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#5C6570] uppercase">
            {t.osEyebrow}
          </p>

          <h1 className="mx-auto mt-3 max-w-2xl text-xl leading-[1.3] font-semibold tracking-[-0.01em] text-[#0A0F14] sm:text-2xl">
            {t.headline}
          </h1>

          <p className="mx-auto mt-5 max-w-lg text-[15px] leading-7 text-[#5C6570] sm:text-base">
            {t.support}
          </p>

          <div className="mt-8">
            <HeroLegalAiComposer placeholder={t.aiComposerPlaceholder} />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={exploreHref}
              className={cn(
                "inline-flex h-11 items-center justify-center rounded-full bg-[#0B1F3A] px-5 text-[13px] font-semibold text-white transition hover:bg-[#16365F]",
              )}
            >
              {t.ctaExplore}
            </Link>
            <Link
              href={composerMode === "guest" ? "/register/client" : "/lawyers"}
              className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[#0B1F3A]/15 bg-white px-5 text-[13px] font-semibold text-[#0B1F3A] transition hover:bg-[#F4F6F8]"
            >
              {t.ctaStart}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
