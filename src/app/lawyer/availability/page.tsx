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
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
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
import { availabilityRepository } from "@/infrastructure/repositories";

export default async function LawyerAvailabilityPage() {
  const session = await getSessionUser();
  if (!session?.user) redirect("/login");
  if (session.user.role !== UserRole.LAWYER) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const [data, i18n] = await Promise.all([
    getLawyerProfileForSession(),
    getShellI18n("lawyer"),
  ]);
  if (data.status === "unauthenticated") redirect("/login");

  const m = i18n.dict.marketplace;
  const locale = i18n.locale;
  const pageTitle = i18n.pages.availability;
  const a = m.availability;

  if (data.status === "profile_missing") {
    return (
      <>
        <DashboardPageHeading>{pageTitle}</DashboardPageHeading>
        <ProfileMissingState
          dashboardHref="/lawyer/dashboard"
          roleLabel="lawyer"
          copy={m.profileMissing}
        />
      </>
    );
  }

  const rangeStart = new Date();
  const today = rangeStart.toISOString().slice(0, 10);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 60);
  const horizon = rangeEnd.toISOString().slice(0, 10);
  const [rules, exceptions] = await Promise.all([
    availabilityRepository.findRulesByLawyerProfileId(data.profile.id),
    availabilityRepository.findExceptionsByLawyerProfileId(
      data.profile.id,
      today,
      horizon,
    ),
  ]);

  const formCopy = {
    ...m.availabilityForm,
    saving: m.common.saving,
  };

  return (
    <>
      <DashboardPageHeading>{pageTitle}</DashboardPageHeading>
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
    </>
  );
}
