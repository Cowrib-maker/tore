import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/actions/auth.actions";
import { getClientProfileForSession } from "@/application/actions/profile.actions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
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
import { getDashboardPath } from "@/domain/services/rbac";
import { cn } from "@/lib/utils";

export default async function ClientDashboardPage() {
  const session = await getSessionUser();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== UserRole.CLIENT) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const data = await getClientProfileForSession();
  const emailVerified = Boolean(data?.user.emailVerified);
  const profileFilled = Boolean(
    data?.profile.phone || data?.profile.companyName,
  );

  return (
    <DashboardShell
      user={session.user}
      title="Client dashboard"
      nav={[
        { href: "/client/dashboard", label: "Dashboard" },
        { href: "/client/profile", label: "Profile" },
      ]}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Profile</CardTitle>
              <Badge variant={profileFilled ? "default" : "outline"}>
                {profileFilled ? "Updated" : "Incomplete"}
              </Badge>
            </div>
            <CardDescription>
              {profileFilled
                ? "Your contact details are on file."
                : "Add a phone number or company name in profile settings."}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link
              href="/client/profile"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Edit profile
            </Link>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Email verification</CardTitle>
              <Badge variant={emailVerified ? "default" : "secondary"}>
                {emailVerified ? "Verified" : "Pending"}
              </Badge>
            </div>
            <CardDescription>
              {emailVerified
                ? "Your email is verified."
                : "Email verification opens in the next milestone. Marketplace booking will require a verified email."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Welcome to TORE</CardTitle>
          <CardDescription>
            Your client account is ready. Browse lawyers and book consultations —
            full discovery launches in Sprint 5.
          </CardDescription>
        </CardHeader>
      </Card>
    </DashboardShell>
  );
}
