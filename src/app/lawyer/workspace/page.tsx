import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { WorkspaceShell } from "@/components/legal-ai/workspace-shell";
import { UserRole } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function LawyerWorkspacePage() {
  const session = await getSessionUser();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== UserRole.LAWYER) {
    redirect(getDashboardPath(session.user.role as UserRole));
  }

  const dict = await getDictionary();

  return (
    <>
      <DashboardPageHeading>{dict.dashboard.navWorkspace}</DashboardPageHeading>
      <p className="mb-4 text-sm text-muted-foreground">
        <a
          href="/lawyer/workspace/cases"
          className="font-medium underline underline-offset-4"
        >
          Case files
        </a>
        {" — "}
        persist facts, MANUAL mappings, and the last engine review. This
        workspace does not generate legal conclusions.
      </p>
      <div className="flex min-w-0" style={{ height: "38rem" }}>
        <WorkspaceShell />
      </div>
    </>
  );
}
