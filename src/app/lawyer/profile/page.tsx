import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/actions/auth.actions";
import { getLawyerProfileForSession } from "@/application/actions/profile.actions";
import { LawyerProfileForm } from "@/components/profiles/lawyer-profile-form";
import { ProfileMissingState } from "@/components/profiles/profile-missing-state";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserRole } from "@/domain/enums";
import { isLawyerVerified } from "@/domain/services/lawyer-eligibility";
import { getDashboardPath } from "@/domain/services/rbac";

export default async function LawyerProfilePage() {
  const session = await getSessionUser();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== UserRole.LAWYER) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const data = await getLawyerProfileForSession();
  if (data.status === "unauthenticated") {
    redirect("/login");
  }

  const nav = [
    { href: "/lawyer/dashboard", label: "Dashboard" },
    { href: "/lawyer/profile", label: "Profile" },
  ];

  if (data.status === "profile_missing") {
    return (
      <DashboardShell user={session.user} title="Profile settings" nav={nav}>
        <ProfileMissingState
          dashboardHref="/lawyer/dashboard"
          roleLabel="lawyer"
        />
      </DashboardShell>
    );
  }

  const verified = isLawyerVerified(data.profile);
  const canRequestListing = verified && data.hasActiveOffering;

  return (
    <DashboardShell user={session.user} title="Profile settings" nav={nav}>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          Public slug:{" "}
          <span className="font-medium text-foreground">
            {data.profile.slug}
          </span>
        </span>
        <Badge variant="outline">{data.profile.verificationStatus}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Your lawyer profile</CardTitle>
          <CardDescription>
            Appears publicly once verified, listed, and you have an active
            offering.{" "}
            <Link
              href="/lawyer/dashboard"
              className="text-primary underline-offset-4 hover:underline"
            >
              Back to dashboard
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LawyerProfileForm
            headline={data.profile.headline}
            bio={data.profile.bio}
            yearsOfExperience={data.profile.yearsOfExperience}
            timezone={data.profile.timezone}
            isListed={data.profile.isListed}
            canRequestListing={canRequestListing}
          />
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
