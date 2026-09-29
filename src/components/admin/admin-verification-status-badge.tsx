import { cn } from "@/lib/utils";

export type VerificationBadgeTone = "success" | "warning" | "destructive" | "neutral";

const TONE_CLASSES: Record<VerificationBadgeTone, string> = {
  success: "bg-status-success-bg text-status-success-text",
  warning: "bg-status-warning-bg text-status-warning-text",
  destructive: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

/**
 * Pastel status pill for lawyer/credential verification states — reuses
 * the shared --status-* tokens (src/app/globals.css, commit 401ee3a) for
 * success/warning, and the existing --destructive token for rejections,
 * rather than introducing new hex values.
 */
export function AdminVerificationStatusBadge({
  tone,
  label,
}: {
  tone: VerificationBadgeTone;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-md px-2 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
      )}
    >
      {label}
    </span>
  );
}
