import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getLawyerProfileForSession } from "@/application/actions/profile.actions";
import {
  CreateOfferingForm,
  OfferingRow,
} from "@/components/marketplace/offering-forms";
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
import { consultationOfferingRepository } from "@/infrastructure/repositories";

export default async function LawyerOfferingsPage() {
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
  const pageTitle = i18n.pages.offerings;
  const o = m.offerings;

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

  const offerings = await consultationOfferingRepository.findByLawyerProfileId(
    data.profile.id,
  );

  const offeringCopy = {
    ...m.offeringForm,
    online: m.common.online,
    inPerson: m.common.inPerson,
    saving: m.common.saving,
    removing: m.common.removing,
  };

  return (
    <>
      <DashboardPageHeading>{pageTitle}</DashboardPageHeading>
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
    </>
  );
}
