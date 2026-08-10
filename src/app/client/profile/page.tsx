import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getClientProfileForSession } from "@/application/actions/profile.actions";
import { ClientProfileForm } from "@/components/profiles/client-profile-form";
import { ProfileMissingState } from "@/components/profiles/profile-missing-state";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
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

export default async function ClientProfilePage() {
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
  const cp = m.clientProfile;

  if (data.status === "profile_missing") {
    return (
      <>
        <DashboardPageHeading>{cp.title}</DashboardPageHeading>
        <ProfileMissingState
          dashboardHref="/client/dashboard"
          roleLabel="client"
          copy={m.profileMissing}
        />
      </>
    );
  }

  return (
    <>
      <DashboardPageHeading>{cp.title}</DashboardPageHeading>
      <Card>
        <CardHeader>
          <CardTitle>{cp.title}</CardTitle>
          <CardDescription>
            {cp.description}{" "}
            <Link
              href="/client/dashboard"
              className="text-primary underline-offset-4 hover:underline"
            >
              {m.common.returnOverview}
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientProfileForm
            key={data.profile.updatedAt.toISOString()}
            phone={data.profile.phone ?? ""}
            companyName={data.profile.companyName ?? ""}
            copy={{ ...m.clientProfileForm, saving: m.common.saving }}
          />
        </CardContent>
      </Card>
    </>
  );
}
