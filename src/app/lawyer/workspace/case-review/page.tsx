import { redirect } from "next/navigation";

import { loadCaseWorkspaceForPage } from "@/application/actions/case-review.actions";
import { requireActor } from "@/application/common/require-actor";
import { isCaseReviewWorkspacePayload } from "@/application/use-cases/case-review/view-model";
import { CaseReviewWorkspace } from "@/components/case-review/case-review-workspace";
import { CaseWorkspaceLayout } from "@/components/case-review/case-workspace-layout";
import { EmptyState } from "@/components/ui/empty-state";
import { DomainError } from "@/domain/errors/domain-error";
import { UserRole } from "@/domain/enums";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LawyerCaseReviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireActor(UserRole.LAWYER);
  const params = await searchParams;
  const caseId =
    (typeof params.caseId === "string" && params.caseId) ||
    (typeof params.case === "string" && params.case) ||
    "";

  if (!caseId) {
    redirect("/lawyer/workspace/cases");
  }

  try {
    const workspace = await loadCaseWorkspaceForPage(caseId);
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
    return (
      <CaseWorkspaceLayout active="cases">
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
  } catch (error) {
    if (error instanceof DomainError && error.code === "FORBIDDEN") {
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
    if (error instanceof DomainError && error.code === "NOT_FOUND") {
      redirect("/lawyer/workspace/cases");
    }
    throw error;
  }
}
