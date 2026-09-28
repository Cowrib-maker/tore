import type { LegalAiStore } from "@/application/ai/legal-ai.types";
import type { CaseFileRepository } from "@/domain/repositories/case-file-repository";
import { PrismaLegalAiStore } from "@/infrastructure/ai/prisma-legal-ai-store";
import { createReadOnlyKnowledgeRepository } from "@/infrastructure/ai/read-only-knowledge-repository";
import { bookingRepository } from "@/infrastructure/repositories/prisma-booking-repository";
import { caseFileRepository } from "@/infrastructure/repositories/prisma-case-file-repository";
import { lawyerProfileRepository } from "@/infrastructure/repositories/prisma-lawyer-profile-repository";

import type { CaseFileDeps } from "./deps";
import type { LawyerWorkspaceScheduleDeps } from "./load-lawyer-workspace-home";
import { runPersistedCaseAnalysis } from "./run-persisted-analysis";

export function productionCaseFileDeps(): CaseFileDeps {
  const knowledgeRepository = createReadOnlyKnowledgeRepository();
  return {
    repository: caseFileRepository,
    runAnalysis: (request, fixtureRules) =>
      runPersistedCaseAnalysis(request, fixtureRules, {
        knowledgeRepository,
      }),
  };
}

export function productionCaseAiDeps(): {
  repository: CaseFileRepository;
  store: LegalAiStore;
} {
  return {
    repository: caseFileRepository,
    store: new PrismaLegalAiStore(),
  };
}

export function productionLawyerWorkspaceScheduleDeps(): LawyerWorkspaceScheduleDeps {
  return {
    bookingRepository,
    lawyerProfileRepository,
  };
}
