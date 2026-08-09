import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Shared route-level loading skeleton for marketplace dashboards. */
export function PageSkeleton({
  className,
  cards = 3,
  label = "…",
}: {
  className?: string;
  cards?: number;
  label?: string;
}) {
  return (
    <div
      className={cn("space-y-4", className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-full max-w-lg bg-muted/80" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-36 rounded-xl border border-border/60 bg-muted/50"
          />
        ))}
      </div>
    </div>
  );
}
