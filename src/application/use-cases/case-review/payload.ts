import type { CaseFile } from "@/domain/entities/case-file";
import { CaseFileAnalysisStatus } from "@/domain/entities/case-file";
import type {
  CaseAnalysisRequest,
  CaseIntakeEvidenceView,
  CaseIntakeFactView,
  CaseReviewWorkspacePayload,
} from "@/engine/doctrine";

import {
  analysisStatus,
  emptyCaseAnalysisReview,
  isCaseAnalysisReview,
} from "./view-model";

export function emptyCaseAnalysisRequest(
  applicableAt: string,
): CaseAnalysisRequest {
  return {
    facts: [],
    evidence: [],
    applicableAt,
    mappings: [],
  };
}

export function displayCaseStatus(file: CaseFile): string {
  if (file.analysisStatus !== CaseFileAnalysisStatus.ANALYZED) {
    return file.analysisStatus;
  }
  if (file.review && isCaseAnalysisReview(file.review)) {
    return analysisStatus(file.review);
  }
  return CaseFileAnalysisStatus.NOT_ANALYZED;
}

export function reviewForDisplay(file: CaseFile) {
  if (file.review && isCaseAnalysisReview(file.review)) {
    return file.review;
  }
  return {
    ...emptyCaseAnalysisReview(),
    facts: file.request.facts.map((f) => ({
      id: f.id,
      statement: f.statement,
      disputed: f.disputed,
    })),
    evidence: file.request.evidence.map((e) => ({
      id: e.id,
      factId: e.factId,
      description: e.description,
      sourceId: e.sourceId,
    })),
  };
}

export function toCaseFactsView(file: CaseFile): CaseIntakeFactView[] {
  return file.facts.map((fact) => ({
    id: fact.id,
    text: fact.text,
    sourceType: fact.sourceType,
    sourceReference: fact.sourceReference,
    createdByUserId: fact.createdByUserId,
    createdAt: fact.createdAt.toISOString(),
    updatedAt: fact.updatedAt.toISOString(),
    evidenceIds: file.factEvidenceLinks
      .filter((link) => link.factId === fact.id)
      .map((link) => link.evidenceId),
  }));
}

export function toCaseEvidenceView(file: CaseFile): CaseIntakeEvidenceView[] {
  return file.evidence.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    evidenceType: item.evidenceType,
    fileReference: item.fileReference,
    sourceReference: item.sourceReference,
    createdByUserId: item.createdByUserId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    factIds: file.factEvidenceLinks
      .filter((link) => link.evidenceId === item.id)
      .map((link) => link.factId),
  }));
}

export function toWorkspacePayload(file: CaseFile): CaseReviewWorkspacePayload {
  return {
    caseId: file.id,
    title: file.title,
    description: file.description,
    domain: file.legalDomain,
    analyzedAt: file.lastAnalyzedAt ? file.lastAnalyzedAt.toISOString() : null,
    applicableAt: file.applicableAt,
    status: displayCaseStatus(file),
    version: file.version,
    lastAnalysisError: file.lastAnalysisError,
    caseFacts: toCaseFactsView(file),
    caseEvidence: toCaseEvidenceView(file),
    review: reviewForDisplay(file),
  };
}
