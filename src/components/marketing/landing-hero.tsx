import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { HeroLegalAiComposer } from "@/components/marketing/hero-legal-ai-composer";
import { EditableText } from "@/components/marketing/homepage-editable-text";
import { LandingReveal } from "@/components/marketing/landing-reveal";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

export function LandingHero({
  t,
  exploreHref,
  composerMode,
  imageUrl,
  imageSlot,
}: {
  t: Dictionary["landing"];
  exploreHref: string;
  composerMode: "guest" | "client" | "other";
  imageUrl?: string | null;
  imageSlot?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-[#0B1F3A]/8 bg-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(11,31,58,0.06),transparent_55%),linear-gradient(180deg,#FFFFFF_0%,#F7F9FC_100%)]"
      />

      <div className="relative mx-auto max-w-3xl px-5 pt-16 pb-16 text-center sm:px-8 sm:pt-20 sm:pb-20 lg:pt-24 lg:pb-24">
        <LandingReveal>
          {imageSlot ? (
            <div className="mx-auto mb-8 max-w-2xl">{imageSlot}</div>
          ) : imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className="mx-auto mb-8 max-h-80 w-full max-w-2xl rounded-2xl border border-[#0B1F3A]/10 object-cover"
            />
          ) : null}
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#5C6570] uppercase">
            <EditableText path="osEyebrow">{t.osEyebrow}</EditableText>
          </p>

          <h1 className="mx-auto mt-3 max-w-2xl text-xl leading-[1.3] font-semibold tracking-[-0.01em] text-[#0A0F14] sm:text-2xl">
            <EditableText path="headline">{t.headline}</EditableText>
          </h1>

          <p className="mx-auto mt-5 max-w-lg text-[15px] leading-7 text-[#5C6570] sm:text-base">
            <EditableText path="support">{t.support}</EditableText>
          </p>

          <div className="mt-8">
            <HeroLegalAiComposer
              placeholder={t.aiComposerPlaceholder}
              checkoutEnabled={composerMode === "client"}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={exploreHref}
              className={cn(
                "inline-flex h-11 items-center justify-center rounded-full bg-[#0B1F3A] px-5 text-[13px] font-semibold text-white transition hover:bg-[#16365F]",
              )}
            >
              <EditableText path="ctaExplore">{t.ctaExplore}</EditableText>
            </Link>
            <Link
              href={composerMode === "guest" ? "/register/client" : "/lawyers"}
              className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[#0B1F3A]/15 bg-white px-5 text-[13px] font-semibold text-[#0B1F3A] transition hover:bg-[#F4F6F8]"
            >
              <EditableText path="ctaStart">{t.ctaStart}</EditableText>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
