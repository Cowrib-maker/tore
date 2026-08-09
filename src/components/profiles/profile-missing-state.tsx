import Link from "next/link";

import { logoutAction } from "@/application/actions/auth.actions";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ProfileMissingStateProps = {
  dashboardHref: string;
  roleLabel: "client" | "lawyer";
};

/**
 * Shown when an authenticated user has no role profile row.
 * Do not redirect to /login — that misdiagnoses the failure as auth.
 */
export function ProfileMissingState({
  dashboardHref,
  roleLabel,
}: ProfileMissingStateProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile record missing</CardTitle>
        <CardDescription>
          Your account is signed in, but the {roleLabel} profile could not be
          loaded. An operator can restore it with the profile backfill script
          (`npm run db:backfill-profiles`).
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex flex-wrap gap-3">
        <Link
          href={dashboardHref}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Back to dashboard
        </Link>
        <form action={logoutAction}>
          <button
            type="submit"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            Sign out
          </button>
        </form>
      </CardFooter>
    </Card>
  );
}
