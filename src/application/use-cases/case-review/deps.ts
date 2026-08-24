import type { CaseFileRepository } from "@/domain/repositories/case-file-repository";
import type {
  CaseAnalysisRequest,
  CaseAnalysisResult,
  RetrievedLegalRule,
} from "@/engine/doctrine";

import { productionCaseFileDeps } from "./prod-wiring";

export type CaseFileDeps = {
  repository: CaseFileRepository;
  runAnalysis: (
    request: CaseAnalysisRequest,
    fixtureRules?: RetrievedLegalRule[] | null,
  ) => Promise<CaseAnalysisResult>;
};

export { runPersistedCaseAnalysis } from "./run-persisted-analysis";

export function defaultCaseFileDeps(): CaseFileDeps {
  return productionCaseFileDeps();
}
