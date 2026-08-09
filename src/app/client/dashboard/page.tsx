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

export default async function ClientDashboardPage() {
  const session = await getSessionUser();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== UserRole.CLIENT) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  return (
    <DashboardShell user={session.user} title="Client dashboard">
      <Card>
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
