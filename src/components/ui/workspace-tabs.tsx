"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type WorkspaceTabItem = {
  value: string;
  label: string;
  content: ReactNode;
};

/**
 * Sidebar-nav + content-pane shell, matching the "lawyer workspace"
 * illustration on the marketing homepage (landing-workspace.tsx).
 */
export function WorkspaceTabs({
  items,
  defaultValue,
  brand = "TORE",
}: {
  items: WorkspaceTabItem[];
  defaultValue?: string;
  brand?: string;
}) {
  const [active, setActive] = useState(defaultValue ?? items[0]?.value);
  const activeItem = items.find((item) => item.value === active) ?? items[0];

  return (
    <div className="overflow-hidden rounded-2xl border border-[#0B1F3A]/10 bg-white shadow-[0_18px_50px_rgba(11,31,58,0.06)]">
      <div className="flex items-center justify-between border-b border-[#0B1F3A]/8 bg-[#F7F9FC] px-4 py-2.5">
        <p className="text-[11px] font-medium tracking-wide text-[#5C6570]">
          {activeItem?.label}
        </p>
        <span className="text-[10px] font-medium text-[#0B1F3A]/55">
          {brand}
        </span>
      </div>

      <div className="grid md:grid-cols-[12rem_1fr]">
        <aside className="border-b border-[#0B1F3A]/8 bg-[#FAFBFC] p-2 md:border-r md:border-b-0">
          <ul className="flex gap-1 overflow-x-auto md:block md:space-y-0.5 md:overflow-visible">
            {items.map((item) => (
              <li key={item.value}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={item.value === active}
                  onClick={() => setActive(item.value)}
                  className={cn(
                    "w-full shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                    item.value === active
                      ? "bg-[#0B1F3A] font-medium text-white"
                      : "text-[#5C6570] hover:bg-[#0B1F3A]/6",
                  )}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div role="tabpanel" className="min-w-0 p-4">
          {activeItem?.content}
        </div>
      </div>
    </div>
  );
}
