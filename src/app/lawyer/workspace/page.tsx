import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { DashboardLegalAiPanel } from "@/components/legal-ai/dashboard-legal-ai-panel";
import { PillTopTabs } from "@/components/ui/pill-top-tabs";
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
  const [research, contracts, documents, caseAnalysis] =
    dict.landing.aiTabs.slice(1);

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
      <PillTopTabs
        defaultValue="research"
        items={[
          {
            value: "research",
            label: research,
            content: <DashboardLegalAiPanel mode="PROFESSIONAL" />,
          },
          {
            value: "contracts",
            label: contracts,
            content: <DashboardLegalAiPanel mode="PROFESSIONAL" />,
          },
          {
            value: "documents",
            label: documents,
            content: <DashboardLegalAiPanel mode="PROFESSIONAL" />,
          },
          {
            value: "case-analysis",
            label: caseAnalysis,
            content: <DashboardLegalAiPanel mode="PROFESSIONAL" />,
          },
        ]}
      />
    </>
  );
}
