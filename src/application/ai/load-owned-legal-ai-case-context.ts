import type { ActorContext } from "@/application/common/actor-context";
import {
  buildLegalAiCaseContext,
  type LegalAiCaseContextLoader,
  type LegalAiCaseContextPayload,
} from "@/application/ai/legal-ai-case-context";
import { UserRole } from "@/domain/enums";
import type { CaseFileRepository } from "@/domain/repositories/case-file-repository";
import { requireOwnedCaseFile } from "@/application/use-cases/case-review/assert-access";

/**
 * Loads CaseFile context only when the actor owns the file.
 * Unowned / missing files return null — never leak another lawyer's case.
 */
export function createOwnedCaseContextLoader(
  repository: CaseFileRepository,
): LegalAiCaseContextLoader {
  return {
    async loadOwned(input: {
      userId: string;
      caseFileId: string;
    }): Promise<LegalAiCaseContextPayload | null> {
      const actor: ActorContext = {
        userId: input.userId,
        role: UserRole.LAWYER,
      };
      try {
        const file = await requireOwnedCaseFile(
          actor,
          input.caseFileId,
          repository,
        );
        return buildLegalAiCaseContext(file);
      } catch {
        return null;
      }
    },
  };
}
