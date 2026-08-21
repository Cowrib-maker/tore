import type { CaseFileRepository } from "@/domain/repositories/case-file-repository";
import { createDoctrineEngine } from "@/engine/doctrine";
import type {
  CaseAnalysisRequest,
  CaseAnalysisResult,
  RetrievedLegalRule,
} from "@/engine/doctrine";

import { runCaseAnalysis } from "./run-analysis";

export type CaseFileDeps = {
  repository: CaseFileRepository;
  runAnalysis: (
    request: CaseAnalysisRequest,
    fixtureRules?: RetrievedLegalRule[] | null,
  ) => Promise<CaseAnalysisResult>;
};

export async function runPersistedCaseAnalysis(
  request: CaseAnalysisRequest,
  fixtureRules?: RetrievedLegalRule[] | null,
): Promise<CaseAnalysisResult> {
  if (fixtureRules && fixtureRules.length > 0) {
    return runCaseAnalysis(request, fixtureRules);
  }
  return createDoctrineEngine().analyzeCase(request);
}

export function defaultCaseFileDeps(): CaseFileDeps {
  const { caseFileRepository } =
    require("@/infrastructure/repositories") as typeof import("@/infrastructure/repositories");
  return {
    repository: caseFileRepository,
    runAnalysis: runPersistedCaseAnalysis,
  };
}
