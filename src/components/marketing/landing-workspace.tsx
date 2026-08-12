import { LandingReveal } from "@/components/marketing/landing-reveal";
import {
  LandingEyebrow,
  LandingHeading,
  LandingLead,
  LandingSection,
} from "@/components/marketing/landing-section";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

export function LandingWorkspace({ t }: { t: Dictionary["landing"] }) {
  const modules = t.workspaceModules;
  const active = modules[1] ?? modules[0];

  return (
    <LandingSection id="workspace">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-12">
        <LandingReveal>
          <LandingEyebrow>{t.workspaceEyebrow}</LandingEyebrow>
          <LandingHeading>{t.workspaceTitle}</LandingHeading>
          <LandingLead>{t.workspaceSupport}</LandingLead>
          <p className="mt-4 text-xs leading-relaxed text-[#5C6570]">
            {t.workspaceDirection}
          </p>
        </LandingReveal>
        <LandingReveal delayMs={70}>
          <div className="landing-shadow-md overflow-hidden rounded-2xl border border-[#0B1F3A]/10 bg-white">
            <div className="flex items-center justify-between border-b border-[#0B1F3A]/8 bg-[#F7F8FA] px-4 py-2.5">
              <p className="text-[11px] font-medium tracking-wide text-[#5C6570]">
                {t.workspaceEyebrow}
              </p>
              <span className="text-[10px] text-[#5C6570]/80">TORE OS</span>
            </div>
            <div className="grid md:grid-cols-[9.5rem_1fr]">
              <aside className="border-b border-[#0B1F3A]/8 p-2 md:border-r md:border-b-0">
                <ul className="space-y-0.5">
                  {modules.map((module) => (
                    <li
                      key={module}
                      className={cn(
                        "rounded-md px-2.5 py-1.5 text-[12px]",
                        module === active
                          ? "bg-[#0B1F3A] font-medium text-white"
                          : "text-[#5C6570]",
                      )}
                    >
                      {module}
                    </li>
                  ))}
                </ul>
              </aside>
              <div className="space-y-3 p-4">
                <div className="h-3 w-2/5 rounded bg-[#0B1F3A]/10" />
                <div className="space-y-1.5">
                  <div className="h-2 w-full rounded bg-[#0B1F3A]/6" />
                  <div className="h-2 w-11/12 rounded bg-[#0B1F3A]/6" />
                  <div className="h-2 w-4/5 rounded bg-[#0B1F3A]/6" />
                </div>
                <div className="rounded-lg border border-[#C8A45D]/30 bg-[#C8A45D]/8 px-3 py-2 text-[11px] text-[#8A6A2A]">
                  {t.aiCitation}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {modules.slice(4, 7).map((module) => (
                    <span
                      key={module}
                      className="rounded-md border border-[#0B1F3A]/10 px-2 py-1 text-[10px] text-[#5C6570]"
                    >
                      {module}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </LandingReveal>
      </div>
    </LandingSection>
  );
}
