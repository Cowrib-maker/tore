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
      <div className="ds-page ds-page-y grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Skeleton className="h-56 rounded-2xl border border-brand/10 bg-white" />
          <Skeleton className="h-40 rounded-2xl border border-brand/10 bg-white" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-xl border bg-white" />
          <Skeleton className="h-64 rounded-xl border bg-white" />
        </div>
      </div>
    </div>
  );
}
