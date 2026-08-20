"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type SimpleTabItem = {
  value: string;
  label: string;
  content: ReactNode;
};

export function SimpleTabs({
  items,
  defaultValue,
}: {
  items: SimpleTabItem[];
  defaultValue?: string;
}) {
  const [active, setActive] = useState(defaultValue ?? items[0]?.value);
  const activeItem = items.find((item) => item.value === active) ?? items[0];

  return (
    <div>
      <div
        role="tablist"
        className="mb-5 flex flex-wrap gap-1.5 border-b pb-3"
      >
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={item.value === active}
            onClick={() => setActive(item.value)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              item.value === active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
