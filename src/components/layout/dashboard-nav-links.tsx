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
              "cursor-pointer text-sm hover:text-foreground",
              active
                ? "font-medium text-foreground"
                : "text-muted-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
