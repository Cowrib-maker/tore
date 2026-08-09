import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Stretch across grid columns when placed in a directory/catalog layout */
  wide?: boolean;
};

/**
 * Shared empty / zero-result panel for directory and dashboard lists.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
  wide = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "ds-surface rounded-2xl border-dashed px-6 py-12 text-center",
        wide && "sm:col-span-2 lg:col-span-3",
        className,
      )}
      role="status"
    >
      <p className="text-base font-semibold text-ink">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-brand-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
