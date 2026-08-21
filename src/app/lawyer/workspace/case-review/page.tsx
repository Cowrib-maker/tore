import { redirect } from "next/navigation";

import { loadCaseReviewForPage } from "@/application/actions/case-review.actions";
import { requireActor } from "@/application/common/require-actor";
import { isCaseReviewWorkspacePayload } from "@/application/use-cases/case-review/view-model";
import { CaseReviewWorkspace } from "@/components/case-review/case-review-workspace";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
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
    const payload = await loadCaseReviewForPage(caseId);
    if (!isCaseReviewWorkspacePayload(payload)) {
      return (
        <>
          <DashboardPageHeading>Case review</DashboardPageHeading>
          <EmptyState
            title="Malformed review payload"
            description="The engine result could not be displayed. Uncertainty is not hidden."
          />
        </>
      );
    }
    return (
      <>
        <DashboardPageHeading>Case review</DashboardPageHeading>
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          Persisted case file. Manual mappings re-run the existing engine; this
          screen does not invent doctrine or conclusions.{" "}
          <a
            href="/lawyer/workspace/cases"
            className="font-medium underline underline-offset-4"
          >
            Back to cases
          </a>
        </p>
        <CaseReviewWorkspace payload={payload} />
      </>
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === "FORBIDDEN") {
      return (
        <>
          <DashboardPageHeading>Case review</DashboardPageHeading>
          <div data-testid="unauthorized-case-review">
            <EmptyState
              title="Not authorized"
              description="You may only review cases you are authorized to access."
            />
          </div>
        </>
      );
    }
    if (error instanceof DomainError && error.code === "NOT_FOUND") {
      redirect("/lawyer/workspace/cases");
    }
    throw error;
  }
}
