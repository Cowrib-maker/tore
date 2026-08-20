"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { DashboardNavItem } from "@/components/layout/dashboard-shell";
import { cn } from "@/lib/utils";

export function DashboardNavLinks({ items }: { items: DashboardNavItem[] }) {
  const pathname = usePathname();

  return (
    <>
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
              active
                ? "bg-[#0B1F3A] text-white"
                : "text-[#5C6570] ring-1 ring-[#0B1F3A]/10 hover:bg-[#0B1F3A]/5",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
