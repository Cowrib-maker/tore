import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

export function LandingOsPreview({ t }: { t: Dictionary["landing"] }) {
  return (
    <div className="landing-product-panel landing-shadow-lg overflow-hidden rounded-2xl border border-[#0B1F3A]/12 bg-[#0B1F3A] text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-white/25" />
          <span className="size-2 rounded-full bg-white/25" />
          <span className="size-2 rounded-full bg-white/25" />
        </div>
        <p className="text-[11px] font-medium tracking-wide text-white/55">
          {t.previewLabel}
        </p>
        <span className="text-[10px] text-white/35">TORE OS</span>
      </div>
      <div className="grid md:grid-cols-[8.5rem_1fr]">
        <aside className="hidden border-r border-white/10 p-3 md:block">
          <p className="px-2 text-[10px] font-semibold tracking-[0.14em] text-white/40 uppercase">
            {t.ecosystemHub}
          </p>
          <ul className="mt-3 space-y-1 text-[12px] text-white/70">
            {t.aiTabs.slice(0, 5).map((tab, index) => (
              <li
                key={tab}
                className={cn(
                  "rounded-md px-2 py-1.5",
                  index === 0 ? "bg-white/10 text-white" : "hover:bg-white/5",
                )}
              >
                {tab}
              </li>
            ))}
          </ul>
        </aside>
        <div className="bg-[#0E2748] p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {t.aiTabs.map((tab, index) => (
              <span
                key={tab}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                  index === 0
                    ? "bg-white text-[#0B1F3A]"
                    : "bg-white/8 text-white/65",
                )}
              >
                {tab}
              </span>
            ))}
          </div>
          <div className="rounded-xl bg-white/8 px-3 py-2.5 text-[13px] leading-relaxed text-white/90">
            {t.aiPrompt}
          </div>
          <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-[#071526] p-3">
            <p className="text-[13px] leading-relaxed text-white/90">
              {t.aiConclusion}
            </p>
            <p className="text-[11px] text-[#C8A45D]">{t.aiCitation}</p>
            <p className="text-[11px] text-white/50">{t.aiSource}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="rounded-md border border-white/15 px-2 py-0.5 text-[10px] text-white/70">
                {t.aiConfidence}
              </span>
              <span className="rounded-md border border-white/15 px-2 py-0.5 text-[10px] text-white/70">
                {t.aiAuthority}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
