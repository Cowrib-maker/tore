"use client";

import { adminDevStopImpersonationAction } from "@/application/actions/admin-devtools.actions";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner({
  email,
  role,
}: {
  email?: string | null;
  role?: string;
}) {
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <p>
          Devtools impersonation active
          {email ? ` — ${email}` : ""}
          {role ? ` (${role})` : ""}. Production routes see this identity.
        </p>
        <form action={adminDevStopImpersonationAction}>
          <Button type="submit" size="sm" variant="outline">
            Stop & return to admin
          </Button>
        </form>
      </div>
    </div>
  );
}
