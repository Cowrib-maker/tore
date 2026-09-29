import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Locale } from "@/i18n/config";
import { formatBookingStatus } from "@/lib/format-labels";

/**
 * Real, already-available categorical data (booking counts by status) —
 * not a fabricated substitute for the Stitch reference's "request type"
 * donut, which has no corresponding data source in this codebase. See
 * the P0 Step 2 report for the honest-data-source rationale.
 */
const SEGMENT_COLORS = [
  "var(--workspace-accent)",
  "var(--primitive-blue-500)",
  "var(--primitive-navy-850)",
  "var(--primitive-violet-600)",
  "var(--primitive-emerald-700)",
  "var(--primitive-amber-700)",
  "var(--primitive-moss-600)",
  "var(--primitive-navy-300)",
];

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function AdminBookingStatusChart({
  bookingCounts,
  locale,
  title,
  totalLabel,
  emptyLabel,
}: {
  bookingCounts: Record<string, number>;
  locale: Locale;
  title: string;
  totalLabel: string;
  emptyLabel: string;
}) {
  const entries = Object.entries(bookingCounts).filter(([, count]) => count > 0);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <div className="relative shrink-0">
              <svg viewBox="0 0 140 140" className="size-36 -rotate-90">
                <circle
                  cx="70"
                  cy="70"
                  r={RADIUS}
                  fill="none"
                  strokeWidth="16"
                  className="stroke-brand/10"
                />
                {(() => {
                  let offset = 0;
                  return entries.map(([status, count], index) => {
                    const dash = (count / total) * CIRCUMFERENCE;
                    const el = (
                      <circle
                        key={status}
                        cx="70"
                        cy="70"
                        r={RADIUS}
                        fill="none"
                        strokeWidth="16"
                        stroke={SEGMENT_COLORS[index % SEGMENT_COLORS.length]}
                        strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                        strokeDashoffset={-offset}
                      />
                    );
                    offset += dash;
                    return el;
                  });
                })()}
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold tabular-nums text-ink">
                  {total}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {totalLabel}
                </span>
              </div>
            </div>
            <ul className="min-w-0 flex-1 space-y-2">
              {entries.map(([status, count], index) => (
                <li key={status} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        SEGMENT_COLORS[index % SEGMENT_COLORS.length],
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {formatBookingStatus(status, locale)}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {count} · {Math.round((count / total) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
