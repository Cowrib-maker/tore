"use client";

import { useRouter } from "next/navigation";

import type { DashboardNavItem } from "@/components/layout/dashboard-shell";

export function DashboardMobileNav({
  items,
  label = "Navigate",
}: {
  items: DashboardNavItem[];
  label?: string;
}) {
  const router = useRouter();

  if (items.length === 0) return null;

  return (
    <div className="sm:hidden">
      <label htmlFor="dashboard-mobile-nav" className="sr-only">
        {label}
      </label>
      <select
        id="dashboard-mobile-nav"
        className="h-9 w-full max-w-[11rem] rounded-md border border-input bg-background px-2 text-sm"
        defaultValue=""
        onChange={(event) => {
          const href = event.target.value;
          if (href) router.push(href);
          event.target.value = "";
        }}
      >
        <option value="" disabled>
          {label}
        </option>
        {items.map((item) => (
          <option key={item.href} value={item.href}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}
