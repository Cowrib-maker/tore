import { createDoctrineEngine } from "@/engine/doctrine";
import type { IKnowledgeRepository } from "@/engine/knowledge/types";
import type {
  CaseAnalysisRequest,
  CaseAnalysisResult,
  RetrievedLegalRule,
} from "@/engine/doctrine";

import { runCaseAnalysis } from "./run-analysis";

export async function runPersistedCaseAnalysis(
  request: CaseAnalysisRequest,
  fixtureRules?: RetrievedLegalRule[] | null,
  options?: { knowledgeRepository?: IKnowledgeRepository },
): Promise<CaseAnalysisResult> {
  if (fixtureRules && fixtureRules.length > 0) {
    return runCaseAnalysis(request, fixtureRules);
  }
  return createDoctrineEngine({
    knowledgeRepository: options?.knowledgeRepository,
  }).analyzeCase(request);
}
