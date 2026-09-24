import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type WorkspaceSideNavItem = {
  key: string;
  icon: LucideIcon;
  label: string;
  /** Real, working destination. Omit for not-yet-implemented items. */
  href?: string;
  active?: boolean;
  comingSoonLabel?: string;
};

/**
 * Shared light-sidebar workspace nav — used by the Student hub and the
 * Firm/Team workspace so both surfaces reuse one component instead of
 * duplicating this layout. Items without an `href` render as inert
 * (never a link) with a "coming soon" badge, so the sidebar never
 * implies a capability that doesn't exist yet.
 */
export function WorkspaceSideNav({
  icon: TitleIcon,
  title,
  subtitle,
  items,
  footer,
  className,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  items: WorkspaceSideNavItem[];
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <nav
      aria-label={title}
      className={cn(
        "flex h-fit flex-col gap-4 rounded-2xl border bg-card p-4",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 px-1">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#0B1F3A] text-white">
          <TitleIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <ul className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          if (item.href) {
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    item.active
                      ? "bg-[#E8F0FE] font-medium text-[#0B5CFF]"
                      : "text-[#3F4852] hover:bg-muted",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={item.key}>
              <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground opacity-70">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.comingSoonLabel ? (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {item.comingSoonLabel}
                  </Badge>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {footer}
    </nav>
  );
}
