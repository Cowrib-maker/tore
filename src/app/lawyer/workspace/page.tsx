import { redirect } from "next/navigation";

import { getSessionUser } from "@/application/common/session";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { WorkspaceColumnPanel } from "@/components/legal-ai/workspace-column-panel";
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

  const columns = [
    {
      key: "research",
      title: research,
      description: "PDF хавсаргаад эрх зүйн судалгаа хийлгэнэ",
    },
    {
      key: "contracts",
      title: contracts,
      description: "Гэрээний PDF хавсаргаад эрсдэлийг шалгуулна",
    },
    {
      key: "documents",
      title: documents,
      description: "Баримт бичгийн PDF хавсаргаад агуулгыг шинжлүүлнэ",
    },
    {
      key: "case-analysis",
      title: caseAnalysis,
      description: "Хэргийн материал PDF хавсаргаад дүн шинжилгээ хийлгэнэ",
    },
  ] as const;

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
      <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {columns.map((column) => (
          <div key={column.key} className="min-w-0" style={{ height: "34rem" }}>
            <WorkspaceColumnPanel
              title={column.title}
              description={column.description}
            />
          </div>
        ))}
      </div>
    </>
  );
}
