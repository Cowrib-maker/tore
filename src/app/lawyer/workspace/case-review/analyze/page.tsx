import { redirect } from "next/navigation";

import {
  loadCaseAiAnalysisForPage,
  loadCaseWorkspaceForPage,
} from "@/application/actions/case-review.actions";
import { loadOrForbidden } from "@/application/common/load-or-forbidden";
import { requireActor } from "@/application/common/require-actor";
import { CaseAiAnalyzePanel } from "@/components/case-review/case-ai-analyze-panel";
import { CaseWorkspaceLayout } from "@/components/case-review/case-workspace-layout";
import { EmptyState } from "@/components/ui/empty-state";
import { UserRole } from "@/domain/enums";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CaseAiAnalyzePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireActor([UserRole.LAWYER, UserRole.ADMIN]);
  const params = await searchParams;
  const caseId = typeof params.caseId === "string" ? params.caseId : "";
  if (!caseId) {
    redirect("/lawyer/workspace/cases");
  }

  const caseIdParam = encodeURIComponent(caseId);
  const layoutProps = {
    active: "analyze" as const,
    analyzeHref: `/lawyer/workspace/case-review/analyze?caseId=${caseIdParam}`,
    draftHref: `/lawyer/workspace/case-review/draft?caseId=${caseIdParam}`,
    timelineHref: `/lawyer/workspace/case-review/timeline?caseId=${caseIdParam}`,
    documentsHref: `/lawyer/workspace/case-review?caseId=${caseIdParam}#case-documents`,
  };

  const loaded = await loadOrForbidden(async () => {
    const [workspace, analysis] = await Promise.all([
      loadCaseWorkspaceForPage(caseId),
      loadCaseAiAnalysisForPage(caseId),
    ]);
    return { workspace, analysis };
  });
  if (loaded.kind === "forbidden") {
    return (
      <CaseWorkspaceLayout {...layoutProps}>
        <EmptyState
          title="Хандах эрхгүй"
          description="Та зөвхөн өөрийн хэргээ шинжлэх боломжтой."
        />
      </CaseWorkspaceLayout>
    );
  }
  const { workspace, analysis } = loaded.value;
  const documentHrefByEvidenceId = Object.fromEntries(
    workspace.documents.map((doc) => [doc.id, doc.href]),
  );

  return (
    <CaseWorkspaceLayout {...layoutProps}>
      <p className="mb-5 text-sm text-[#5C6570]">
        <a
          href={`/lawyer/workspace/case-review?caseId=${caseIdParam}`}
          className="font-medium text-[#0B1F3A] underline underline-offset-4"
        >
          {workspace.payload.title}
        </a>
        <span className="mx-2 text-[#8A939D]">/</span>
        Хэрэг шинжлэх
      </p>
      <CaseAiAnalyzePanel
        caseId={caseId}
        initialAnalysis={analysis}
        documentHrefByEvidenceId={documentHrefByEvidenceId}
      />
    </CaseWorkspaceLayout>
  );
}
