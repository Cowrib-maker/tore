import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { EditableText } from "@/components/marketing/homepage-editable-text";
import { LandingReveal } from "@/components/marketing/landing-reveal";
import { LandingSection } from "@/components/marketing/landing-section";
import type { Dictionary } from "@/i18n/types";

export function LandingEnterprise({
  t,
  imageUrl,
  imageSlot,
}: {
  t: Dictionary["landing"];
  imageUrl?: string | null;
  imageSlot?: ReactNode;
}) {
  return (
    <LandingSection id="enterprise" imageUrl={imageUrl} imageSlot={imageSlot}>
      <div className="overflow-hidden rounded-2xl border border-[#0B1F3A]/20 bg-[#0B1F3A] text-white">
        <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <LandingReveal className="p-6 sm:p-8 lg:p-10">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-white/50 uppercase">
              <EditableText path="enterpriseEyebrow">{t.enterpriseEyebrow}</EditableText>
            </p>
            <h2 className="mt-3 max-w-lg font-[family-name:var(--font-landing-display)] text-[1.85rem] leading-[1.12] tracking-[-0.03em] sm:text-[2.2rem]">
              <EditableText path="enterpriseTitle">{t.enterpriseTitle}</EditableText>
            </h2>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/70">
              <EditableText path="enterpriseSupport">{t.enterpriseSupport}</EditableText>
            </p>
            <p className="mt-3 text-xs leading-relaxed text-white/45">
              <EditableText path="enterpriseDirection">{t.enterpriseDirection}</EditableText>
            </p>
            <Link
              href="/register/client"
              className="mt-7 inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-[#0B1F3A] hover:bg-white/95"
            >
              <EditableText path="enterpriseCta">{t.enterpriseCta}</EditableText>
              <ArrowRight className="size-4" />
            </Link>
          </LandingReveal>
          <LandingReveal delayMs={60} className="border-t border-white/10 lg:border-l lg:border-t-0">
            <div className="grid grid-cols-2 gap-px bg-white/10">
              {t.enterpriseModules.map((module, index) => (
                <div key={module} className="bg-[#0E2748] px-4 py-5 text-sm font-medium text-white/90">
                  <EditableText path={`enterpriseModules.${index}`}>{module}</EditableText>
                </div>
              ))}
            </div>
          </LandingReveal>
        </div>
      </div>
    </LandingSection>
  );
}
