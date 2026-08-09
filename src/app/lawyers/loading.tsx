import { Skeleton } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function Loading() {
  const dict = await getDictionary();
  return (
    <div
      className="ds-shell"
      role="status"
      aria-live="polite"
      aria-label={dict.marketplace.common.loading}
    >
      <div className="ds-chrome">
        <div className="ds-chrome-inner">
          <Skeleton className="h-6 w-24" />
        </div>
      </div>
      <div className="ds-page ds-page-y space-y-6">
        <Skeleton className="h-8 w-72 bg-brand/10" />
        <Skeleton className="h-4 w-full max-w-xl bg-brand/8" />
        <Skeleton className="h-28 rounded-2xl border border-brand/10 bg-white" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-40 rounded-2xl border border-brand/10 bg-white"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
