import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { getClientProfileForSession } from "@/application/actions/profile.actions";
import { ClientProfileForm } from "@/components/profiles/client-profile-form";
import { ProfileMissingState } from "@/components/profiles/profile-missing-state";
import { DashboardShell } from "@/components/layout/dashboard-shell";
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

  const data = await getClientProfileForSession();
  if (data.status === "unauthenticated") {
    redirect("/login");
  }

  const i18n = await getShellI18n("client");
  const m = i18n.dict.marketplace;
  const nav = i18n.nav;
  const cp = m.clientProfile;

  if (data.status === "profile_missing") {
    return (
      <DashboardShell
        user={session.user}
        title={cp.title}
        nav={nav}
        {...i18n.shellProps}
      >
        <ProfileMissingState
          dashboardHref="/client/dashboard"
          roleLabel="client"
          copy={m.profileMissing}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      user={session.user}
      title={cp.title}
      nav={nav}
      {...i18n.shellProps}
    >
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
    </DashboardShell>
  );
}
