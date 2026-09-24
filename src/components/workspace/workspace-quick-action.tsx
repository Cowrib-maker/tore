import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type WorkspaceQuickActionProps = {
  icon: LucideIcon;
  iconClassName?: string;
  title: string;
  description: string;
  href?: string;
  comingSoonLabel?: string;
};

/**
 * Shared quick-action tile — Firm/Team and Student hero sections both use
 * this exact card language. Items without `href` render inert with a
 * "coming soon" badge (same honesty convention as WorkspaceSideNav) rather
 * than linking to a feature that doesn't exist yet.
 */
export function WorkspaceQuickAction({
  icon: Icon,
  iconClassName,
  title,
  description,
  href,
  comingSoonLabel,
}: WorkspaceQuickActionProps) {
  const content = (
    <>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          iconClassName ?? "bg-[#E8F0FE] text-[#0B5CFF]",
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[13.5px] font-semibold text-[#0B1F3A]">{title}</p>
          {!href && comingSoonLabel ? (
            <Badge variant="secondary" className="shrink-0 text-[9px]">
              {comingSoonLabel}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 text-[12px] leading-5 text-[#7B8490]">{description}</p>
      </div>
    </>
  );

  const className =
    "flex h-full flex-col items-start gap-3 rounded-2xl border border-[#0B1F3A]/8 bg-white px-4 py-4 transition";

  if (href) {
    return (
      <Link href={href} className={cn(className, "hover:border-[#0B5CFF]/40 hover:bg-[#F7FAFF]")}>
        {content}
      </Link>
    );
  }
  return <div className={cn(className, "opacity-80")}>{content}</div>;
}
