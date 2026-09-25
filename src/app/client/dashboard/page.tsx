import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bell,
  Calendar,
  Home,
  MessagesSquare,
  Search,
  Sparkles,
  UserRound,
  Wallet,
} from "lucide-react";

import { getSessionUser } from "@/application/common/session";
import { getClientProfileForSession } from "@/application/actions/profile-session.queries";
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
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserRole } from "@/domain/enums";
import { canActAsClient, getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import { cn } from "@/lib/utils";

/** Every item here is a real, already-shipped destination. */
function citizenSidebarItems(navLabels: {
  dashboard: string;
  legalAi: string;
  billing: string;
  findLawyers: string;
  bookings: string;
  notifications: string;
  profile: string;
}): WorkspaceSideNavItem[] {
  return [
    { key: "dashboard", icon: Home, label: navLabels.dashboard, href: "/client/dashboard", active: true },
    { key: "legal-ai", icon: MessagesSquare, label: navLabels.legalAi, href: "/legal-ai" },
    { key: "billing", icon: Wallet, label: navLabels.billing, href: "/billing" },
    { key: "lawyers", icon: Search, label: navLabels.findLawyers, href: "/lawyers" },
    { key: "bookings", icon: Calendar, label: navLabels.bookings, href: "/client/bookings" },
    { key: "notifications", icon: Bell, label: navLabels.notifications, href: "/client/notifications" },
    { key: "profile", icon: UserRound, label: navLabels.profile, href: "/client/profile" },
  ];
}

export default async function ClientDashboardPage() {
  const session = await getSessionUser();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canActAsClient(session.user.role as UserRole)) {
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

  const d = i18n.dict.dashboard;
  const displayName = data.user.name?.trim() || data.user.email;

  return (
    <div className="grid gap-6 lg:grid-cols-[272px_1fr] lg:items-start">
      <WorkspaceSideNav
        icon={Sparkles}
        title="TORE Citizen"
        subtitle={displayName}
        items={citizenSidebarItems({
          dashboard: d.navDashboard,
          legalAi: d.navLegalAi,
          billing: d.navBilling,
          findLawyers: d.navFindLawyers,
          bookings: d.navBookings,
          notifications: d.navNotifications,
          profile: d.navProfile,
        })}
        className="lg:sticky lg:top-24"
      />

      <div className="min-w-0">
        {/* Hero — same navy "premium legal workspace" identity used across
            Legal AI, Firm/Team, Student and Lawyer. */}
        <div className="mb-4 rounded-2xl bg-[#0B1F3A] px-6 py-7 text-white sm:px-8 sm:py-8">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-white/60 uppercase">
            TORE CITIZEN
          </p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            {displayName}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">
            {cd.intro}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-white/20 text-white">
              {profileFilled ? m.common.complete : m.common.incomplete}
            </Badge>
            <Badge variant="outline" className="border-white/20 text-white">
              {emailVerified ? m.common.confirmed : m.common.pending}
            </Badge>
            <Link
              href="/billing"
              className="ml-auto inline-flex h-8 items-center rounded-full bg-white px-4 text-[12.5px] font-semibold text-[#0B1F3A] transition hover:bg-white/90"
            >
              Багц харах
            </Link>
          </div>
        </div>

        <div className="mb-6">
          <WorkspaceAiComposer
            placeholder="Хууль зүйн асуултаа бичнэ үү..."
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
            title={cd.legalAi}
            description={cd.legalAiHelp}
            href="/legal-ai"
          />
          <WorkspaceQuickAction
            icon={Search}
            iconClassName="bg-[#F1EBFF] text-[#7C5CFC]"
            title={m.common.browseLawyers}
            description={cd.consultationsHelp}
            href="/lawyers"
          />
          <WorkspaceQuickAction
            icon={Calendar}
            iconClassName="bg-[#E6F7EE] text-[#1F9D5C]"
            title={m.common.viewBookings}
            description={cd.consultations}
            href="/client/bookings"
          />
          <WorkspaceQuickAction
            icon={UserRound}
            iconClassName="bg-[#E6F7F5] text-[#0F9C8F]"
            title={m.common.editProfile}
            description={cd.profile}
            href="/client/profile"
          />
        </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      </div>
    </div>
  );
}
