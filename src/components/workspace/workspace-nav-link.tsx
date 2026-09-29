"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarMenuBadge,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import type { WorkspaceNavItem } from "@/components/workspace/workspace-shell";

/**
 * Active-state matches DashboardNavLinks' rule (exact path or a sub-route),
 * but rendered through the shell-level Sidebar primitive instead of a
 * horizontal top-nav link.
 */
export function WorkspaceNavLink({ item }: { item: WorkspaceNavItem }) {
  const pathname = usePathname();
  const active =
    pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <SidebarMenuButton
      isActive={active}
      render={<Link href={item.href} />}
      className="text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground data-active:shadow-sm"
    >
      {Icon ? <Icon /> : null}
      <span>{item.label}</span>
      {item.badge && item.badge > 0 ? (
        <SidebarMenuBadge className="static ml-auto rounded-full bg-workspace-accent text-white">
          {item.badge}
        </SidebarMenuBadge>
      ) : null}
    </SidebarMenuButton>
  );
}
