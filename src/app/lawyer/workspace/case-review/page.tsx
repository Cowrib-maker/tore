import { redirect } from "next/navigation";

import { loadCaseWorkspaceForPage } from "@/application/actions/case-review.actions";
import { loadOrForbidden } from "@/application/common/load-or-forbidden";
import { requireActor } from "@/application/common/require-actor";
import { isCaseReviewWorkspacePayload } from "@/application/use-cases/case-review/view-model";
import { CaseReviewWorkspace } from "@/components/case-review/case-review-workspace";
import { CaseWorkspaceLayout } from "@/components/case-review/case-workspace-layout";
import { EmptyState } from "@/components/ui/empty-state";
import { UserRole } from "@/domain/enums";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LawyerCaseReviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireActor([UserRole.LAWYER, UserRole.ADMIN]);
  const params = await searchParams;
  const caseId =
    (typeof params.caseId === "string" && params.caseId) ||
    (typeof params.case === "string" && params.case) ||
    "";

  if (!caseId) {
    redirect("/lawyer/workspace/cases");
  }

  const loaded = await loadOrForbidden(() => loadCaseWorkspaceForPage(caseId));
  if (loaded.kind === "forbidden") {
    return (
      <CaseWorkspaceLayout active="cases">
        <div data-testid="unauthorized-case-review">
          <EmptyState
            title="Хандах эрхгүй"
            description="Та зөвхөн өөрийн хэргээ нээж болно."
          />
        </div>
      </CaseWorkspaceLayout>
    );
  }
  const workspace = loaded.value;
  if (!isCaseReviewWorkspacePayload(workspace.payload)) {
    return (
      <CaseWorkspaceLayout active="cases">
        <EmptyState
          title="Шинжилгээний үр дүнг харуулах боломжгүй"
          description="Хөдөлгүүрийн хариу буруу бүтэцтэй байна. Тодорхойгүй байдлыг нуухгүй."
        />
      </CaseWorkspaceLayout>
    );
  }
  const caseIdParam = encodeURIComponent(caseId);
  return (
    <CaseWorkspaceLayout
      active="cases"
      analyzeHref={`/lawyer/workspace/case-review/analyze?caseId=${caseIdParam}`}
      draftHref={`/lawyer/workspace/case-review/draft?caseId=${caseIdParam}`}
      timelineHref={`/lawyer/workspace/case-review/timeline?caseId=${caseIdParam}`}
    >
      <p className="mb-5 text-sm text-[#5C6570]">
        <a
          href="/lawyer/workspace"
          className="font-medium text-[#0B1F3A] underline underline-offset-4"
        >
          Ажлын талбар
        </a>
        <span className="mx-2 text-[#8A939D]">/</span>
        <a
          href="/lawyer/workspace/cases"
          className="font-medium text-[#0B1F3A] underline underline-offset-4"
        >
          Миний хэргүүд
        </a>
      </p>
      <CaseReviewWorkspace
        payload={workspace.payload}
        createdAt={workspace.createdAt}
        conversations={workspace.conversations}
        documents={workspace.documents}
        activity={workspace.activity}
      />
    </CaseWorkspaceLayout>
  );
}
