import { Star } from "lucide-react";

type Props = {
  average: number | null;
  count: number;
  /** "{count} үнэлгээ" */
  countLabel: string;
  /** Shown when there are no reviews; omit to render nothing instead. */
  emptyLabel?: string;
};

export function RatingSummary({ average, count, countLabel, emptyLabel }: Props) {
  if (count <= 0 || average == null) {
    return emptyLabel ? (
      <span className="text-xs text-brand-muted">{emptyLabel}</span>
    ) : null;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-brand-muted">
      <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
      <span className="font-medium text-ink">{average.toFixed(1)}</span>
      <span>· {countLabel.replace("{count}", String(count))}</span>
    </span>
  );
}
