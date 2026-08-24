import type { ReactNode } from "react";

import { EditableText } from "@/components/marketing/homepage-editable-text";
import { LandingReveal } from "@/components/marketing/landing-reveal";
import {
  LandingEyebrow,
  LandingHeading,
  LandingLead,
  LandingSection,
} from "@/components/marketing/landing-section";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

export function LandingWorkspace({
  t,
  imageUrl,
  imageSlot,
}: {
  t: Dictionary["landing"];
  imageUrl?: string | null;
  imageSlot?: ReactNode;
}) {
  const modules = t.workspaceModules;
  const nav = modules.slice(0, 5);
  const active = nav[0] ?? modules[0];

  return (
    <LandingSection id="workspace" imageUrl={imageUrl} imageSlot={imageSlot}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-14">
        <LandingReveal>
          <LandingEyebrow>
            <EditableText path="workspaceEyebrow">{t.workspaceEyebrow}</EditableText>
          </LandingEyebrow>
          <LandingHeading>
            <EditableText path="workspaceTitle">{t.workspaceTitle}</EditableText>
          </LandingHeading>
          <LandingLead>
            <EditableText path="workspaceSupport">{t.workspaceSupport}</EditableText>
          </LandingLead>
        </LandingReveal>

        <LandingReveal delayMs={70}>
          <div className="overflow-hidden rounded-2xl border border-[#0B1F3A]/10 bg-white shadow-[0_18px_50px_rgba(11,31,58,0.06)]">
            <div className="flex items-center justify-between border-b border-[#0B1F3A]/8 bg-[#F7F9FC] px-4 py-2.5">
              <p className="text-[11px] font-medium tracking-wide text-[#5C6570]">
                <EditableText path="workspaceEyebrow">{t.workspaceEyebrow}</EditableText>
              </p>
              <span className="text-[10px] font-medium text-[#0B1F3A]/55">TORE</span>
            </div>

            <div className="grid min-h-[280px] md:grid-cols-[9.5rem_1fr_8.5rem]">
              <aside className="border-b border-[#0B1F3A]/8 bg-[#FAFBFC] p-2 md:border-r md:border-b-0">
                <ul className="space-y-0.5">
                  {nav.map((module, index) => (
                    <li
                      key={module}
                      className={cn(
                        "rounded-md px-2.5 py-1.5 text-[12px]",
                        module === active
                          ? "bg-[#0B1F3A] font-medium text-white"
                          : "text-[#5C6570]",
                      )}
                    >
                      <EditableText path={`workspaceModules.${index}`}>{module}</EditableText>
                    </li>
                  ))}
                </ul>
              </aside>

              <div className="space-y-4 border-b border-[#0B1F3A]/8 p-4 md:border-b-0 md:border-r">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.12em] text-[#7B8490] uppercase">
                    <EditableText path="workspaceModules.0">{active}</EditableText>
                  </p>
                  <div className="mt-3 h-3 w-2/5 rounded bg-[#0B1F3A]/10" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 w-full rounded bg-[#0B1F3A]/6" />
                  <div className="h-2 w-11/12 rounded bg-[#0B1F3A]/6" />
                  <div className="h-2 w-4/5 rounded bg-[#0B1F3A]/6" />
                  <div className="h-2 w-3/5 rounded bg-[#0B1F3A]/6" />
                </div>
                <div className="rounded-lg border border-[#0B1F3A]/10 bg-[#F7F9FC] px-3 py-2 text-[11px] text-[#0B1F3A]">
                  <EditableText path="aiCitation">{t.aiCitation}</EditableText>
                </div>
              </div>

              <div className="hidden space-y-3 bg-[#FAFBFC] p-3 md:block">
                <p className="px-1 text-[10px] font-semibold tracking-[0.12em] text-[#7B8490] uppercase">
                  <EditableText path="workspaceModules.2">{modules[2]}</EditableText>
                </p>
                <div className="rounded-lg border border-[#0B1F3A]/8 bg-white p-2.5">
                  <div className="h-2 w-4/5 rounded bg-[#0B1F3A]/8" />
                  <div className="mt-2 h-2 w-full rounded bg-[#0B1F3A]/5" />
                  <div className="mt-1.5 h-2 w-3/4 rounded bg-[#0B1F3A]/5" />
                </div>
                <div className="rounded-lg border border-[#0B1F3A]/8 bg-white p-2.5">
                  <div className="h-2 w-3/5 rounded bg-[#0B1F3A]/8" />
                  <div className="mt-2 h-2 w-full rounded bg-[#0B1F3A]/5" />
                </div>
              </div>
            </div>
          </div>
        </LandingReveal>
      </div>
    </LandingSection>
  );
}
