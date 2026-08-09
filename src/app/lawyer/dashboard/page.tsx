import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/actions/auth.actions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";

export default async function LawyerDashboardPage() {
  const session = await getSessionUser();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== UserRole.LAWYER) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  return (
    <DashboardShell user={session.user} title="Lawyer dashboard">
      <Card>
        <CardHeader>
          <CardTitle>Welcome to TORE</CardTitle>
          <CardDescription>
            Complete your profile and submit your license for verification —
            available in Sprint 2 and Sprint 3.
          </CardDescription>
        </CardHeader>
      </Card>
    </DashboardShell>
  );
}
