import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bell,
  Briefcase,
  Calendar,
  FolderOpen,
  Home,
  MessagesSquare,
  Scale,
  UserRound,
} from "lucide-react";

import { getSessionUser } from "@/application/common/session";
import { getLawyerProfileForSession } from "@/application/actions/profile-session.queries";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { ProfileMissingState } from "@/components/profiles/profile-missing-state";
import {
  WorkspaceSideNav,
  type WorkspaceSideNavItem,
} from "@/components/workspace/workspace-side-nav";
import { WorkspaceAiComposer } from "@/components/workspace/workspace-ai-composer";
import { WorkspaceQuickAction } from "@/components/workspace/workspace-quick-action";
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
import { LawyerPosition, UserRole } from "@/domain/enums";
import { isLawyerVerified } from "@/domain/services/lawyer-eligibility";
import { getDashboardPath, LEGAL_AI_PATH } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import { formatVerificationStatus } from "@/lib/format-labels";
import { cn } from "@/lib/utils";

/**
 * Sidebar mirrors the workspace's own PRIMARY/SECONDARY nav — every item
 * is a real, already-shipped destination, so unlike Firm/Team/Student
 * nothing here needs an inert "coming soon" row.
 */
function lawyerSidebarItems(navLabels: {
  dashboard: string;
  workspace: string;
  cases: string;
  offerings: string;
  bookings: string;
  notifications: string;
  profile: string;
}): WorkspaceSideNavItem[] {
  return [
    { key: "dashboard", icon: Home, label: navLabels.dashboard, href: "/lawyer/dashboard", active: true },
    { key: "workspace", icon: Briefcase, label: navLabels.workspace, href: "/lawyer/workspace" },
    { key: "cases", icon: FolderOpen, label: navLabels.cases, href: "/lawyer/workspace/cases" },
    { key: "offerings", icon: Scale, label: navLabels.offerings, href: "/lawyer/offerings" },
    { key: "bookings", icon: Calendar, label: navLabels.bookings, href: "/lawyer/bookings" },
    { key: "notifications", icon: Bell, label: navLabels.notifications, href: "/lawyer/notifications" },
    { key: "profile", icon: UserRound, label: navLabels.profile, href: "/lawyer/profile" },
  ];
}

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
  const isAttorney = data.profile.position === LawyerPosition.ATTORNEY;
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

  const d = i18n.dict.dashboard;
  const displayName = data.user.name?.trim() || data.profile.headline || data.user.email;

  return (
    <div className="grid gap-6 lg:grid-cols-[272px_1fr] lg:items-start">
      <WorkspaceSideNav
        icon={Scale}
        title="TORE Lawyer"
        subtitle={displayName}
        items={lawyerSidebarItems({
          dashboard: d.navDashboard,
          workspace: d.navWorkspace,
          cases: d.navCases,
          offerings: d.navOfferings,
          bookings: d.navBookings,
          notifications: d.navNotifications,
          profile: d.navProfile,
        })}
        className="lg:sticky lg:top-24"
      />

      <div className="min-w-0">
        {/* Hero — same navy "premium legal workspace" identity used across
            Legal AI, Firm/Team and Student. */}
        <div className="mb-4 rounded-2xl bg-[#0B1F3A] px-6 py-7 text-white sm:px-8 sm:py-8">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-white/60 uppercase">
            TORE LAWYER
          </p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            {displayName}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">
            {ld.intro}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="outline" className="border-white/20 text-white">
              {formatVerificationStatus(verificationStatus, locale)}
            </Badge>
            <Badge variant="outline" className="border-white/20 text-white">
              {listed ? ld.listed : ld.notListed}
            </Badge>
          </div>
        </div>

        <div className="mb-6">
          <WorkspaceAiComposer
            placeholder="Хууль, кейс, ойлголтын талаар асуух..."
            attachLabel="Хавсаргах"
            aiLabel="AI сонгох"
            knowledgeLabel="Вэбээс хайх"
            comingSoonLabel="Тун удахгүй"
          />
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <WorkspaceQuickAction
            icon={MessagesSquare}
            iconClassName="bg-[#E8F0FE] text-[#0B5CFF]"
            title="Хуулийн судалгаа"
            description="AI-аар хууль, зүйл заалт хайх"
            href={LEGAL_AI_PATH}
          />
          <WorkspaceQuickAction
            icon={FolderOpen}
            iconClassName="bg-[#F1EBFF] text-[#7C5CFC]"
            title={ld.workspaceTitle}
            description={ld.workspaceHelp}
            href="/lawyer/workspace/cases"
          />
          <WorkspaceQuickAction
            icon={Calendar}
            iconClassName="bg-[#E6F7EE] text-[#1F9D5C]"
            title={ld.bookings}
            description={ld.bookingsHelp}
            href="/lawyer/bookings"
          />
          <WorkspaceQuickAction
            icon={UserRound}
            iconClassName="bg-[#E6F7F5] text-[#0F9C8F]"
            title={ld.profile}
            description={pf.headline}
            href="/lawyer/profile"
          />
        </div>

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
        {isAttorney ? (
        <>
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
        </>
        ) : (
        <Card>
          <CardHeader>
            <CardTitle>{ld.workspaceTitle}</CardTitle>
            <CardDescription>{ld.workspaceHelp}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Link
              href={LEGAL_AI_PATH}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {ld.openLegalAi}
            </Link>
          </CardFooter>
        </Card>
        )}
      </div>
      </div>
    </div>
  );
}
