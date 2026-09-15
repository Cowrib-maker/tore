import type { CaseAiAnalysisResult } from "@/domain/entities/case-ai-analysis";

export type CreateCaseAiAnalysisInput = {
  caseFileId: string;
  createdByUserId: string;
} & (
  | {
      status: "OK";
      sections: CaseAiAnalysisResult["sections"];
      citations: CaseAiAnalysisResult["citations"];
      provider: string;
      model: string;
    }
  | {
      status: "FAILED";
      failureReason: string;
    }
);

/**
 * Sprint 13 Phase 6/16 — persistence port for grounded Case Analysis V1.
 * Deliberately separate from CaseFileRepository: CaseAiAnalysis is an
 * additive, append-only history (never mutates CaseFile.reviewJson), so it
 * gets its own narrow port rather than overloading the CaseFile aggregate.
 */
export interface CaseAiAnalysisRepository {
  create(input: CreateCaseAiAnalysisInput): Promise<CaseAiAnalysisResult>;
  /** Most recent analysis for the case, or null if none has ever run. */
  findLatestByCaseFileId(
    caseFileId: string,
  ): Promise<CaseAiAnalysisResult | null>;
  listByCaseFileId(caseFileId: string): Promise<CaseAiAnalysisResult[]>;
}
