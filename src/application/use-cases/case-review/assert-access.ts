import type { ActorContext } from "@/application/common/actor-context";
import type { CaseFile } from "@/domain/entities/case-file";
import type { CaseFileRepository } from "@/domain/repositories/case-file-repository";
import { UserRole } from "@/domain/enums";
import { ForbiddenError, NotFoundError } from "@/domain/errors/domain-error";

export function assertLawyerReviewer(actor: ActorContext): void {
  if (actor.role !== UserRole.LAWYER) {
    throw new ForbiddenError("Only licensed lawyers may review case analysis.");
  }
}

export async function requireOwnedCaseFile(
  actor: ActorContext,
  caseId: string,
  repository: CaseFileRepository,
): Promise<CaseFile> {
  assertLawyerReviewer(actor);
  const file = await repository.findById(caseId);
  if (!file) {
    throw new NotFoundError("Case file");
  }
  if (file.ownerLawyerId !== actor.userId) {
    throw new ForbiddenError("You are not authorized to review this case.");
  }
  return file;
}
