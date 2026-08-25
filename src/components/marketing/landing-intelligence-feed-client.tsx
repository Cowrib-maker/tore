"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  LEGAL_INTELLIGENCE_SECTION_KEYS,
  type LegalIntelligenceFeed,
  type LegalIntelligenceSectionKey,
} from "@/domain/legal-intelligence";
import type { Dictionary } from "@/i18n/types";

export function LandingIntelligenceFeedClient({
  home,
  feed,
}: {
  home: Dictionary["publicHome"];
  feed: LegalIntelligenceFeed;
}) {
  const [active, setActive] = useState<"all" | LegalIntelligenceSectionKey>(
    "all",
  );

  const items = useMemo(() => {
    if (active === "all") return feed.latest;
    return feed.bySection[active];
  }, [active, feed]);

  const hasAny = feed.totalCount > 0;

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-2">
        <CategoryPill
          active={active === "all"}
          label={home.intelligenceAll}
          onClick={() => setActive("all")}
        />
        {LEGAL_INTELLIGENCE_SECTION_KEYS.map((key) => (
          <CategoryPill
            key={key}
            active={active === key}
            label={home.intelligenceSections[key]}
            count={feed.bySection[key].length}
            onClick={() => setActive(key)}
          />
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-[#0B1F3A]/10 bg-white">
        {!hasAny || items.length === 0 ? (
          <p className="px-5 py-10 text-center text-[14px] text-[#8A939D]">
            {home.intelligenceEmpty}
          </p>
        ) : (
          <ul className="divide-y divide-[#0B1F3A]/8">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.detailHref}
                  className="block px-5 py-4 transition hover:bg-[#F7F6F2]/80"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#E8F4F1] px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-[#1A7A72]">
                      {home.intelligenceSections[item.section]}
                    </span>
                    {item.date ? (
                      <span className="text-[12px] text-[#8A939D]">
                        {item.date}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[15px] font-semibold text-[#0B1F3A]">
                    {item.title}
                  </p>
                  {item.summary ? (
                    <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[#5C6570]">
                      {item.summary}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12px] text-[#7B8490]">
                      {item.sourceName}
                    </span>
                    <span className="text-[13px] font-semibold text-[#0B1F3A]">
                      {home.intelligenceReadMore}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function CategoryPill({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-full bg-[#0B1F3A] px-3.5 py-1.5 text-[12px] font-semibold text-white"
          : "inline-flex items-center gap-1.5 rounded-full border border-[#0B1F3A]/12 bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#3D4A57] transition hover:border-[#1A7A72]/40 hover:text-[#0B1F3A]"
      }
    >
      {label}
      {typeof count === "number" && count > 0 ? (
        <span className={active ? "text-white/70" : "text-[#8A939D]"}>
          {count}
        </span>
      ) : null}
    </button>
  );
}
