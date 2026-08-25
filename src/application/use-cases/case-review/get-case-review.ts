import type { ActorContext } from "@/application/common/actor-context";
import type { CaseFile } from "@/domain/entities/case-file";
import type { CaseReviewWorkspacePayload } from "@/engine/doctrine";
import { ValidationError } from "@/domain/errors/domain-error";

import { assertLawyerReviewer, requireOwnedCaseFile } from "./assert-access";
import type { CaseFileDeps } from "./deps";
import { defaultCaseFileDeps } from "./deps";
import { toWorkspacePayload } from "./payload";
import { isCaseAnalysisRequest } from "./view-model";

export async function getCaseFileForLawyer(
  actor: ActorContext,
  caseId: string,
  deps: CaseFileDeps = defaultCaseFileDeps(),
): Promise<CaseFile> {
  return requireOwnedCaseFile(actor, caseId, deps.repository);
}

export async function getCaseReviewForLawyer(
  actor: ActorContext,
  caseId: string,
  deps: CaseFileDeps = defaultCaseFileDeps(),
): Promise<CaseReviewWorkspacePayload> {
  const file = await requireOwnedCaseFile(actor, caseId, deps.repository);
  if (!isCaseAnalysisRequest(file.request)) {
    throw new ValidationError("Шинжилгээний хүсэлт буруу бүтэцтэй байна.");
  }
  return toWorkspacePayload(file);
}

export async function listCaseFilesForLawyer(
  actor: ActorContext,
  deps: CaseFileDeps = defaultCaseFileDeps(),
): Promise<CaseFile[]> {
  assertLawyerReviewer(actor);
  return deps.repository.listByOwnerLawyerId(actor.userId);
}

export async function listCaseReviewsForLawyer(
  actor: ActorContext,
  deps: CaseFileDeps = defaultCaseFileDeps(),
): Promise<
  Array<{
    caseId: string;
    title: string;
    domain: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    lastAnalyzedAt: string | null;
  }>
> {
  const files = await listCaseFilesForLawyer(actor, deps);
  return files.map((file) => {
    const payload = toWorkspacePayload(file);
    return {
      caseId: file.id,
      title: file.title,
      domain: file.legalDomain,
      status: payload.status,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
      lastAnalyzedAt: payload.analyzedAt,
    };
  });
}
