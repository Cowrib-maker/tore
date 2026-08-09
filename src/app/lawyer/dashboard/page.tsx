import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/actions/auth.actions";
import { getLawyerProfileForSession } from "@/application/actions/profile.actions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserRole } from "@/domain/enums";
import { isLawyerVerified } from "@/domain/services/lawyer-eligibility";
import { getDashboardPath } from "@/domain/services/rbac";
import { cn } from "@/lib/utils";

function verificationBadgeVariant(
  status: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "APPROVED":
      return "default";
    case "REJECTED":
    case "SUSPENDED":
      return "destructive";
    default:
      return "secondary";
  }
}

export default async function LawyerDashboardPage() {
  const session = await getSessionUser();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== UserRole.LAWYER) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const data = await getLawyerProfileForSession();
  const emailVerified = Boolean(data?.user.emailVerified);
  const profileFilled = Boolean(
    data?.profile.headline || data?.profile.bio,
  );
  const verificationStatus = data?.profile.verificationStatus ?? "PENDING";
  const verified = data ? isLawyerVerified(data.profile) : false;
  const listed = Boolean(data?.profile.isListed);

  return (
    <DashboardShell
      user={session.user}
      title="Lawyer dashboard"
      nav={[
        { href: "/lawyer/dashboard", label: "Dashboard" },
        { href: "/lawyer/profile", label: "Profile" },
      ]}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Profile</CardTitle>
              <Badge variant={profileFilled ? "default" : "outline"}>
                {profileFilled ? "Updated" : "Incomplete"}
              </Badge>
            </div>
            <CardDescription>
              {profileFilled
                ? `Slug: ${data?.profile.slug}`
                : "Add a headline and bio in profile settings."}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link
              href="/lawyer/profile"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Edit profile
            </Link>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Verification</CardTitle>
              <Badge variant={verificationBadgeVariant(verificationStatus)}>
                {verificationStatus}
              </Badge>
            </div>
            <CardDescription>
              {verified
                ? "Your license is approved."
                : "License submission and admin review land in Sprint 3."}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Email & listing</CardTitle>
              <div className="flex flex-wrap gap-1">
                <Badge variant={emailVerified ? "default" : "secondary"}>
                  {emailVerified ? "Email verified" : "Email pending"}
                </Badge>
                <Badge variant={listed ? "default" : "outline"}>
                  {listed ? "Listed" : "Not listed"}
                </Badge>
              </div>
            </div>
            <CardDescription>
              Listing requires verification. Public directory appears after
              offerings (Sprint 4–5).
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Welcome to TORE</CardTitle>
          <CardDescription>
            Update your profile now. Submit your license for verification in
            Sprint 3.
          </CardDescription>
        </CardHeader>
      </Card>
    </DashboardShell>
  );
}
