import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/actions/auth.actions";
import { getLawyerProfileForSession } from "@/application/actions/profile.actions";
import { LawyerProfileForm } from "@/components/profiles/lawyer-profile-form";
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
  if (!data) {
    redirect("/login");
  }

  const verified = isLawyerVerified(data.profile);

  return (
    <DashboardShell
      user={session.user}
      title="Profile settings"
      nav={[
        { href: "/lawyer/dashboard", label: "Dashboard" },
        { href: "/lawyer/profile", label: "Profile" },
      ]}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          Public slug: <span className="font-medium text-foreground">{data.profile.slug}</span>
        </span>
        <Badge variant="outline">{data.profile.verificationStatus}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Your lawyer profile</CardTitle>
          <CardDescription>
            Appears on your public profile once you are verified and listed.{" "}
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
            canRequestListing={verified}
          />
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
