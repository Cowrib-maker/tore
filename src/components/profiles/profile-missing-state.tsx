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
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";
import { cn } from "@/lib/utils";

type ProfileMissingStateProps = {
  dashboardHref: string;
  roleLabel: "client" | "lawyer";
  copy: MarketplaceDictionary["profileMissing"];
};

/**
 * Shown when an authenticated user has no role profile row.
 * Do not redirect to /login — that misdiagnoses the failure as auth.
 */
export function ProfileMissingState({
  dashboardHref,
  roleLabel,
  copy,
}: ProfileMissingStateProps) {
  const body = roleLabel === "lawyer" ? copy.bodyLawyer : copy.bodyClient;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
      <CardFooter className="flex flex-wrap gap-3">
        <Link
          href={dashboardHref}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          {copy.returnOverview}
        </Link>
        <form action={logoutAction}>
          <button
            type="submit"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            {copy.signOut}
          </button>
        </form>
      </CardFooter>
    </Card>
  );
}
