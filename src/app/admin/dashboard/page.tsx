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

export default async function AdminDashboardPage() {
  const session = await getSessionUser();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== UserRole.ADMIN) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  return (
    <DashboardShell user={session.user} title="Admin dashboard">
      <Card>
        <CardHeader>
          <CardTitle>Platform administration</CardTitle>
          <CardDescription>
            Lawyer verification queue and platform operations —
            available starting Sprint 3.
          </CardDescription>
        </CardHeader>
      </Card>
    </DashboardShell>
  );
}
