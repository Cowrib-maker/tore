import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/actions/auth.actions";
import { getLawyerProfileForSession } from "@/application/actions/profile.actions";
import {
  CreateOfferingForm,
  OfferingRow,
} from "@/components/marketplace/offering-forms";
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
  consultationOfferingRepository,
  lawyerProfileRepository,
} from "@/infrastructure/repositories";

export default async function LawyerOfferingsPage() {
  const session = await getSessionUser();
  if (!session?.user) redirect("/login");
  if (session.user.role !== UserRole.LAWYER) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const data = await getLawyerProfileForSession();
  if (data.status === "unauthenticated") redirect("/login");

  const i18n = await getShellI18n("lawyer");
  const m = i18n.dict.marketplace;
  const nav = i18n.nav;
  const pageTitle = i18n.pages.offerings;
  const o = m.offerings;

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
  const offerings = profile
    ? await consultationOfferingRepository.findByLawyerProfileId(profile.id)
    : [];

  const offeringCopy = {
    ...m.offeringForm,
    online: m.common.online,
    inPerson: m.common.inPerson,
    saving: m.common.saving,
    removing: m.common.removing,
  };

  return (
    <DashboardShell
      user={session.user}
      title={pageTitle}
      nav={nav}
      {...i18n.shellProps}
    >
      <p className="mb-5 text-sm text-muted-foreground">
        {o.intro}{" "}
        <Link href="/lawyer/dashboard" className="underline underline-offset-4">
          {m.common.returnOverview}
        </Link>
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{o.publishedTitle}</CardTitle>
            <CardDescription>{o.publishedHelp}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {offerings.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-8 text-center">
                <p className="text-sm font-medium">{o.emptyTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {o.emptyBody}
                </p>
              </div>
            ) : (
              offerings.map((offering) => (
                <OfferingRow
                  key={offering.id}
                  offering={offering}
                  copy={offeringCopy}
                />
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{o.newTitle}</CardTitle>
            <CardDescription>{o.newHelp}</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateOfferingForm copy={offeringCopy} />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
