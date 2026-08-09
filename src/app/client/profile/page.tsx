import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/actions/auth.actions";
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

  const nav = [
    { href: "/client/dashboard", label: "Dashboard" },
    { href: "/client/profile", label: "Profile" },
  ];

  if (data.status === "profile_missing") {
    return (
      <DashboardShell user={session.user} title="Profile settings" nav={nav}>
        <ProfileMissingState
          dashboardHref="/client/dashboard"
          roleLabel="client"
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell user={session.user} title="Profile settings" nav={nav}>
      <Card>
        <CardHeader>
          <CardTitle>Your client profile</CardTitle>
          <CardDescription>
            Contact details used for bookings and account communications.{" "}
            <Link
              href="/client/dashboard"
              className="text-primary underline-offset-4 hover:underline"
            >
              Back to dashboard
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientProfileForm
            phone={data.profile.phone}
            companyName={data.profile.companyName}
          />
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
