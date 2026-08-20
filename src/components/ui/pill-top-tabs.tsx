"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PillTopTabItem = {
  value: string;
  label: string;
  content: ReactNode;
};

/**
 * Bordered card with a pill-tab header bar, matching the "TORE Legal AI"
 * illustration on the marketing homepage (landing-legal-ai.tsx).
 */
export function PillTopTabs({
  items,
  defaultValue,
}: {
  items: PillTopTabItem[];
  defaultValue?: string;
}) {
  const [active, setActive] = useState(defaultValue ?? items[0]?.value);
  const activeItem = items.find((item) => item.value === active) ?? items[0];

  return (
    <div className="overflow-hidden rounded-2xl border border-[#0B1F3A]/10 bg-white shadow-[0_18px_50px_rgba(11,31,58,0.06)]">
      <div
        role="tablist"
        className="flex flex-wrap gap-1.5 border-b border-[#0B1F3A]/8 bg-[#F7F9FC] px-3 py-2.5"
      >
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={item.value === active}
            onClick={() => setActive(item.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
              item.value === active
                ? "bg-[#0B1F3A] text-white"
                : "bg-white text-[#5C6570] ring-1 ring-[#0B1F3A]/10 hover:bg-[#0B1F3A]/5",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">{activeItem?.content}</div>
    </div>
  );
}
