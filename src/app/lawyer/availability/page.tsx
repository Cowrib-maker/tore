import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getLawyerProfileForSession } from "@/application/actions/profile.actions";
import {
  AvailabilityExceptionList,
  AvailabilityRuleList,
  CreateAvailabilityExceptionForm,
  CreateAvailabilityRuleForm,
} from "@/components/marketplace/availability-forms";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ProfileMissingState } from "@/components/profiles/profile-missing-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import {
  availabilityRepository,
  lawyerProfileRepository,
} from "@/infrastructure/repositories";

export default async function LawyerAvailabilityPage() {
  const session = await getSessionUser();
  if (!session?.user) redirect("/login");
  if (session.user.role !== UserRole.LAWYER) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const data = await getLawyerProfileForSession();
  if (data.status === "unauthenticated") redirect("/login");

  const i18n = await getShellI18n("lawyer");
  const m = i18n.dict.marketplace;
  const locale = i18n.locale;
  const nav = i18n.nav;
  const pageTitle = i18n.pages.availability;
  const a = m.availability;

  if (data.status === "profile_missing") {
    return (
      <DashboardShell
        user={session.user}
        title={pageTitle}
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

  const profile = await lawyerProfileRepository.findByUserId(session.user.id);
  const rangeStart = new Date();
  const today = rangeStart.toISOString().slice(0, 10);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 60);
  const horizon = rangeEnd.toISOString().slice(0, 10);
  const [rules, exceptions] = profile
    ? await Promise.all([
        availabilityRepository.findRulesByLawyerProfileId(profile.id),
        availabilityRepository.findExceptionsByLawyerProfileId(
          profile.id,
          today,
          horizon,
        ),
      ])
    : [[], []];

  const formCopy = {
    ...m.availabilityForm,
    saving: m.common.saving,
  };

  return (
    <DashboardShell
      user={session.user}
      title={pageTitle}
      nav={nav}
      {...i18n.shellProps}
    >
      <p className="mb-5 text-sm text-muted-foreground">
        {a.intro}{" "}
        <Link href="/lawyer/offerings" className="underline underline-offset-4">
          {m.lawyerDashboard.manageOfferings}
        </Link>
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{a.weeklyTitle}</CardTitle>
            <CardDescription>{a.weeklyHelp}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AvailabilityRuleList
              rules={rules}
              copy={formCopy}
              locale={locale}
            />
            <CreateAvailabilityRuleForm copy={formCopy} locale={locale} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{a.exceptionsTitle}</CardTitle>
            <CardDescription>{a.exceptionsHelp}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AvailabilityExceptionList
              exceptions={exceptions}
              copy={formCopy}
            />
            <CreateAvailabilityExceptionForm copy={formCopy} />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
