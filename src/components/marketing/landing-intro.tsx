import { LandingReveal } from "@/components/marketing/landing-reveal";
import type { Dictionary } from "@/i18n/types";

export function LandingIntro({ home }: { home: Dictionary["publicHome"] }) {
  return (
    <section className="border-b border-[#0B1F3A]/8 bg-[#F7F6F2]">
      <div className="mx-auto max-w-2xl px-5 py-14 text-center sm:px-8 sm:py-16">
        <LandingReveal>
          <h2 className="font-[family-name:var(--font-landing-display)] text-[1.65rem] leading-tight tracking-[-0.03em] text-[#0B1F3A] sm:text-[1.9rem]">
            {home.introTitle}
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-[#5C6570] sm:text-base">
            {home.introBody}
          </p>
        </LandingReveal>
      </div>
    </section>
  );
}
