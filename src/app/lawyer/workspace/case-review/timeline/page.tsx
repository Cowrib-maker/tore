import { redirect } from "next/navigation";

import {
  loadCaseTimelineForPage,
  loadCaseWorkspaceForPage,
} from "@/application/actions/case-review.actions";
import { requireActor } from "@/application/common/require-actor";
import { CaseTimelinePanel } from "@/components/case-review/case-timeline-panel";
import { CaseWorkspaceLayout } from "@/components/case-review/case-workspace-layout";
import { EmptyState } from "@/components/ui/empty-state";
import { DomainError } from "@/domain/errors/domain-error";
import { UserRole } from "@/domain/enums";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CaseTimelinePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireActor(UserRole.LAWYER);
  const params = await searchParams;
  const caseId = typeof params.caseId === "string" ? params.caseId : "";
  if (!caseId) {
    redirect("/lawyer/workspace/cases");
  }

  const caseIdParam = encodeURIComponent(caseId);
  const layoutProps = {
    active: "timeline" as const,
    analyzeHref: `/lawyer/workspace/case-review/analyze?caseId=${caseIdParam}`,
    draftHref: `/lawyer/workspace/case-review/draft?caseId=${caseIdParam}`,
    timelineHref: `/lawyer/workspace/case-review/timeline?caseId=${caseIdParam}`,
    documentsHref: `/lawyer/workspace/case-review?caseId=${caseIdParam}#case-documents`,
  };

  try {
    const [workspace, entries] = await Promise.all([
      loadCaseWorkspaceForPage(caseId),
      loadCaseTimelineForPage(caseId),
    ]);

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
          Хугацааны хэлхээс
        </p>
        <CaseTimelinePanel caseId={caseId} initialEntries={entries} />
      </CaseWorkspaceLayout>
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === "FORBIDDEN") {
      return (
        <CaseWorkspaceLayout {...layoutProps}>
          <EmptyState
            title="Хандах эрхгүй"
            description="Та зөвхөн өөрийн хэргийг харах боломжтой."
          />
        </CaseWorkspaceLayout>
      );
    }
    if (error instanceof DomainError && error.code === "NOT_FOUND") {
      redirect("/lawyer/workspace/cases");
    }
    throw error;
  }
}
