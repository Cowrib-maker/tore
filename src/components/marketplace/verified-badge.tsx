import { BadgeCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * Public trust signal. Renders only for an APPROVED verification status so a
 * PENDING/REJECTED/SUSPENDED profile can never be shown as verified, even if
 * a caller passes one through by mistake.
 */
export function VerifiedBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  if (status !== "APPROVED") return null;
  return (
    <Badge>
      <BadgeCheck aria-hidden />
      {label}
    </Badge>
  );
}
