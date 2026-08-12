import { LandingReveal } from "@/components/marketing/landing-reveal";
import {
  LandingEyebrow,
  LandingHeading,
  LandingLead,
  LandingSection,
} from "@/components/marketing/landing-section";
import type { Dictionary } from "@/i18n/types";

export function LandingEcosystem({ t }: { t: Dictionary["landing"] }) {
  return (
    <LandingSection id="platform" muted>
      <LandingReveal className="max-w-2xl">
        <LandingEyebrow>{t.ecosystemEyebrow}</LandingEyebrow>
        <LandingHeading>{t.ecosystemTitle}</LandingHeading>
        <LandingLead>{t.ecosystemSupport}</LandingLead>
      </LandingReveal>

      <LandingReveal delayMs={60} className="mt-8">
        <div className="overflow-hidden rounded-2xl border border-[#0B1F3A]/10 bg-white">
          <div className="border-b border-[#0B1F3A]/8 bg-[linear-gradient(180deg,#0B1F3A_0%,#0E2748_100%)] px-5 py-6 text-center text-white sm:px-8">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-white/50 uppercase">
              {t.ecosystemHub}
            </p>
            <p className="mt-1 font-[family-name:var(--font-landing-display)] text-2xl tracking-[-0.03em] sm:text-[1.75rem]">
              {t.ecosystemHubSub}
            </p>
            <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm font-medium">
              <span className="size-1.5 rounded-full bg-[#C8A45D]" />
              {t.ecosystemAi}
            </div>
          </div>
          <div className="relative grid sm:grid-cols-3">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 hidden h-6 sm:block"
            >
              <div className="mx-auto h-full w-px bg-[#0B1F3A]/15" />
            </div>
            {t.ecosystemBranches.map((branch, index) => (
              <div
                key={branch.title}
                className={
                  index > 0
                    ? "border-t border-[#0B1F3A]/8 p-5 sm:border-t-0 sm:border-l sm:p-6"
                    : "p-5 sm:p-6"
                }
              >
                <h3 className="text-sm font-semibold tracking-tight text-[#0A0F14]">
                  {branch.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {branch.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-2.5 text-sm text-[#5C6570]"
                    >
                      <span className="h-px w-3 bg-[#0B1F3A]/25" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </LandingReveal>
    </LandingSection>
  );
}
