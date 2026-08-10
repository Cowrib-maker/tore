import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getLawyerProfileForSession } from "@/application/actions/profile.actions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
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
import { isLawyerVerified } from "@/domain/services/lawyer-eligibility";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import { formatVerificationStatus } from "@/lib/format-labels";
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
  if (data.status === "unauthenticated") {
    redirect("/login");
  }

  const i18n = await getShellI18n("lawyer");
  const m = i18n.dict.marketplace;
  const locale = i18n.locale;
  const nav = i18n.nav;

  if (data.status === "profile_missing") {
    return (
      <DashboardShell
        user={session.user}
        title={i18n.title}
        nav={nav}
        {...i18n.shellProps}
      >
        <ProfileMissingState
          dashboardHref="/lawyer/dashboard"
          roleLabel="lawyer"
          copy={m.profileMissing}
        />
      </DashboardShell>
    );
  }

  const emailVerified = Boolean(data.user.emailVerified);
  const profileFilled = Boolean(data.profile.headline || data.profile.bio);
  const verificationStatus = data.profile.verificationStatus;
  const verified = isLawyerVerified(data.profile);
  const listed = data.profile.isListed;
  const ld = m.lawyerDashboard;

  return (
    <DashboardShell
      user={session.user}
      title={i18n.title}
      nav={nav}
      {...i18n.shellProps}
    >
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {ld.intro}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{ld.profile}</CardTitle>
              <Badge variant={profileFilled ? "default" : "outline"}>
                {profileFilled ? m.common.complete : m.common.incomplete}
              </Badge>
            </div>
            <CardDescription>
              {profileFilled
                ? ld.publicUrl.replace("{slug}", data.profile.slug)
                : ld.addHeadline}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link
              href="/lawyer/profile"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {m.common.editProfile}
            </Link>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{ld.verification}</CardTitle>
              <Badge variant={verificationBadgeVariant(verificationStatus)}>
                {formatVerificationStatus(verificationStatus, locale)}
              </Badge>
            </div>
            <CardDescription>
              {verified ? ld.verificationApproved : ld.verificationPending}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link
              href="/lawyer/verification"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {ld.manageVerification}
            </Link>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{ld.listing}</CardTitle>
              <div className="flex flex-wrap justify-end gap-1">
                <Badge variant={emailVerified ? "default" : "secondary"}>
                  {emailVerified ? ld.emailConfirmed : ld.emailPending}
                </Badge>
                <Badge variant={listed ? "default" : "outline"}>
                  {listed ? ld.listed : ld.notListed}
                </Badge>
              </div>
            </div>
            <CardDescription>
              {ld.listingHelp}{" "}
              <Link href="/lawyers" className="underline underline-offset-4">
                {ld.directoryLink}
              </Link>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{ld.offerings}</CardTitle>
            <CardDescription>{ld.offeringsHelp}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Link
              href="/lawyer/offerings"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {ld.manageOfferings}
            </Link>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{ld.availability}</CardTitle>
            <CardDescription>{ld.availabilityHelp}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Link
              href="/lawyer/availability"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {ld.setSchedule}
            </Link>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{ld.bookings}</CardTitle>
            <CardDescription>{ld.bookingsHelp}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Link
              href="/lawyer/bookings"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {ld.openBookings}
            </Link>
          </CardFooter>
        </Card>
      </div>
    </DashboardShell>
  );
}
