const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Mongolian relative-time label for a real timestamp — formatting only,
 * never a stand-in for missing data (callers must already have `iso`). */
export function formatRelativeMn(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = now - then;
  if (diff < 0) return formatAbsoluteMn(iso);
  if (diff < MINUTE) return "дөнгөж сая";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} минутын өмнө`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} цагийн өмнө`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return "өчигдөр";
  if (days < 7) return `${days} өдрийн өмнө`;
  return formatAbsoluteMn(iso);
}

export function formatAbsoluteMn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** Mongolian short time-of-day label ("14:00"), for schedule rows. */
export function formatTimeMn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("mn-MN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
