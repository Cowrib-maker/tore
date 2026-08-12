import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { LandingReveal } from "@/components/marketing/landing-reveal";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

const HREFS = [
  "/register/client",
  "/register/client",
  "/register/lawyer",
  "/register/client",
] as const;

export function LandingExperiences({ t }: { t: Dictionary["landing"] }) {
  return (
    <div id="solutions" className="scroll-mt-24 border-t border-[#0B1F3A]/8">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex items-end justify-between gap-4 py-5">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#5C6570] uppercase">
              {t.experiencesEyebrow}
            </p>
            <h2 className="mt-1 text-base font-semibold tracking-tight text-[#0A0F14] sm:text-lg">
              {t.experiencesTitle}
            </h2>
          </div>
        </div>
        <div className="grid border-t border-[#0B1F3A]/8 sm:grid-cols-2 lg:grid-cols-4">
          {t.experiences.map((item, index) => (
            <LandingReveal key={item.title} delayMs={20 + index * 35}>
              <article
                className={cn(
                  "group flex h-full flex-col px-0 py-5 sm:px-5 sm:py-6",
                  index > 0 && "lg:border-l lg:border-[#0B1F3A]/8",
                  index % 2 === 1 && "sm:border-l sm:border-[#0B1F3A]/8 lg:border-l",
                  index < 2 && "border-b border-[#0B1F3A]/8 lg:border-b-0",
                )}
              >
                <p className="text-[11px] font-semibold tracking-[0.12em] text-[#5C6570] uppercase">
                  {item.audience}
                </p>
                <h3 className="mt-1.5 text-[15px] font-semibold tracking-tight text-[#0A0F14]">
                  {item.title}
                </h3>
                <p className="mt-2 flex-1 text-[13px] leading-relaxed text-[#5C6570]">
                  {item.description}
                </p>
                <Link
                  href={HREFS[index] ?? "/register/client"}
                  className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0B1F3A] hover:opacity-70"
                >
                  {t.experiencesContinue}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </article>
            </LandingReveal>
          ))}
        </div>
      </div>
    </div>
  );
}
