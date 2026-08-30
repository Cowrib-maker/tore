import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getLawyerProfileForSession } from "@/application/actions/profile.actions";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { ProfileMissingState } from "@/components/profiles/profile-missing-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LawyerListingActions } from "@/components/verification/lawyer-listing-actions";
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

  const [data, i18n] = await Promise.all([
    getLawyerProfileForSession(),
    getShellI18n("lawyer"),
  ]);
  if (data.status === "unauthenticated") {
    redirect("/login");
  }

  const m = i18n.dict.marketplace;
  const locale = i18n.locale;

  if (data.status === "profile_missing") {
    return (
      <>
        <DashboardPageHeading>{i18n.title}</DashboardPageHeading>
        <ProfileMissingState
          dashboardHref="/lawyer/dashboard"
          roleLabel="lawyer"
          copy={m.profileMissing}
        />
      </>
    );
  }

  const emailVerified = Boolean(data.user.emailVerified);
  const profileFilled = Boolean(data.profile.headline || data.profile.bio);
  const verificationStatus = data.profile.verificationStatus;
  const verified = isLawyerVerified(data.profile);
  const hasActiveOffering = data.hasActiveOffering;
  const listed = data.profile.isListed;
  const ld = m.lawyerDashboard;
  const pf = m.lawyerProfileForm;

  const profileSummary = [
    { label: pf.headline, value: data.profile.headline },
    { label: pf.city, value: data.profile.city },
    {
      label: pf.years,
      value:
        data.profile.yearsOfExperience !== null
          ? String(data.profile.yearsOfExperience)
          : null,
    },
    { label: pf.phone, value: data.profile.phone },
  ].filter((item): item is { label: string; value: string } =>
    Boolean(item.value),
  );

  return (
    <>
      <DashboardPageHeading>{i18n.title}</DashboardPageHeading>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {ld.intro}
      </p>
      <div className="space-y-4">
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
          {profileSummary.length > 0 || data.profile.bio ? (
            <CardContent>
              <dl className="space-y-1.5 text-sm">
                {profileSummary.map((item) => (
                  <div key={item.label} className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">
                      {item.label}:
                    </dt>
                    <dd className="truncate font-medium">{item.value}</dd>
                  </div>
                ))}
              </dl>
              {data.profile.bio ? (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {data.profile.bio}
                </p>
              ) : null}
            </CardContent>
          ) : null}
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
              href="/lawyer/profile#verification"
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
              {listed ? (
                <>
                  {ld.listingHelp}{" "}
                  <Link href="/lawyers" className="underline underline-offset-4">
                    {ld.directoryLink}
                  </Link>
                  .
                </>
              ) : (
                ld.listingGateIncomplete
              )}
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col items-start gap-3">
            <ul className="w-full space-y-1.5 text-sm text-muted-foreground">
              <li className={verified ? "text-foreground" : undefined}>
                {verified ? "✓" : "○"} {ld.listingGateVerification}
              </li>
              <li className={hasActiveOffering ? "text-foreground" : undefined}>
                {hasActiveOffering ? "✓" : "○"} {ld.listingGateOffering}
              </li>
              <li className={listed ? "text-foreground" : undefined}>
                {listed ? "✓" : "○"} {ld.listingGateOptIn}
              </li>
            </ul>
            <LawyerListingActions
              lawyerProfileId={data.profile.id}
              isListed={listed}
              canList={verified}
              copy={m.verification}
            />
          </CardFooter>
        </Card>
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
              href="/lawyer/profile"
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
    </>
  );
}
