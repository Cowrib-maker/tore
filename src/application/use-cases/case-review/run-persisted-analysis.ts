import { createDoctrineEngine } from "@/engine/doctrine";
import type {
  CaseAnalysisRequest,
  CaseAnalysisResult,
  RetrievedLegalRule,
} from "@/engine/doctrine";

import { runCaseAnalysis } from "./run-analysis";

export async function runPersistedCaseAnalysis(
  request: CaseAnalysisRequest,
  fixtureRules?: RetrievedLegalRule[] | null,
): Promise<CaseAnalysisResult> {
  if (fixtureRules && fixtureRules.length > 0) {
    return runCaseAnalysis(request, fixtureRules);
  }
  return createDoctrineEngine().analyzeCase(request);
}
