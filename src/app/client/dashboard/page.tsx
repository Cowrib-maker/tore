import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getClientProfileForSession } from "@/application/actions/profile.actions";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { ProfileMissingState } from "@/components/profiles/profile-missing-state";
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
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import { cn } from "@/lib/utils";

export default async function ClientDashboardPage() {
  const session = await getSessionUser();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== UserRole.CLIENT) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const [data, i18n] = await Promise.all([
    getClientProfileForSession(),
    getShellI18n("client"),
  ]);
  if (data.status === "unauthenticated") {
    redirect("/login");
  }

  const m = i18n.dict.marketplace;
  const cd = m.clientDashboard;

  if (data.status === "profile_missing") {
    return (
      <>
        <DashboardPageHeading>{i18n.title}</DashboardPageHeading>
        <ProfileMissingState
          dashboardHref="/client/dashboard"
          roleLabel="client"
          copy={m.profileMissing}
        />
      </>
    );
  }

  const emailVerified = Boolean(data.user.emailVerified);
  const profileFilled = Boolean(
    data.profile.phone || data.profile.companyName,
  );

  return (
    <>
      <DashboardPageHeading>{i18n.title}</DashboardPageHeading>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {cd.intro}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-[#0B1F3A]/15 sm:col-span-2 lg:col-span-3">
          <CardHeader>
            <CardTitle>{cd.legalAi}</CardTitle>
            <CardDescription>{cd.legalAiHelp}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Link href="/legal-ai" className={cn(buttonVariants({ size: "sm" }))}>
              {cd.legalAiCta}
            </Link>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{cd.profile}</CardTitle>
              <Badge variant={profileFilled ? "default" : "outline"}>
                {profileFilled ? m.common.complete : m.common.incomplete}
              </Badge>
            </div>
            <CardDescription>
              {profileFilled ? cd.profileComplete : cd.profileIncomplete}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link
              href="/client/profile"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {m.common.editProfile}
            </Link>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{cd.consultations}</CardTitle>
            <CardDescription>{cd.consultationsHelp}</CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-wrap gap-2">
            <Link
              href="/lawyers"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              {m.common.browseLawyers}
            </Link>
            <Link
              href="/client/bookings"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {m.common.viewBookings}
            </Link>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{cd.emailTitle}</CardTitle>
              <Badge variant={emailVerified ? "default" : "secondary"}>
                {emailVerified ? m.common.confirmed : m.common.pending}
              </Badge>
            </div>
            <CardDescription>
              {emailVerified ? cd.emailConfirmed : cd.emailPending}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </>
  );
}
