import type {
  CaseAnalysisRequest,
  CaseAnalysisReview,
  RetrievedLegalRule,
} from "@/engine/doctrine";

export const CaseFileAnalysisStatus = {
  NOT_ANALYZED: "NOT_ANALYZED",
  ANALYZED: "ANALYZED",
  ANALYSIS_FAILED: "ANALYSIS_FAILED",
} as const;

export type CaseFileAnalysisStatus =
  (typeof CaseFileAnalysisStatus)[keyof typeof CaseFileAnalysisStatus];

export const CaseFactSourceType = {
  MANUAL: "MANUAL",
  DOCUMENT: "DOCUMENT",
  SYSTEM: "SYSTEM",
} as const;

export type CaseFactSourceType =
  (typeof CaseFactSourceType)[keyof typeof CaseFactSourceType];

export const CaseEvidenceType = {
  DOCUMENT: "DOCUMENT",
  PHOTO: "PHOTO",
  VIDEO: "VIDEO",
  AUDIO: "AUDIO",
  TESTIMONY: "TESTIMONY",
  RECORD: "RECORD",
  OTHER: "OTHER",
} as const;

export type CaseEvidenceType =
  (typeof CaseEvidenceType)[keyof typeof CaseEvidenceType];

export const FACT_TEXT_MAX = 8000;
export const EVIDENCE_TITLE_MAX = 300;
export const EVIDENCE_DESCRIPTION_MAX = 4000;

export type CaseFact = {
  id: string;
  caseFileId: string;
  text: string;
  sourceType: string;
  sourceReference: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Mirrors AIDocumentExtractStatus (prisma/schema.prisma) — reused, not
 * redefined, so case evidence and Legal AI conversation documents share
 * one extraction-status vocabulary. */
export const CaseEvidenceExtractStatus = {
  OK: "OK",
  EMPTY: "EMPTY",
  FAILED: "FAILED",
  NEEDS_OCR: "NEEDS_OCR",
} as const;

export type CaseEvidenceExtractStatus =
  (typeof CaseEvidenceExtractStatus)[keyof typeof CaseEvidenceExtractStatus];

export type CaseEvidenceRecord = {
  id: string;
  caseFileId: string;
  title: string;
  description: string | null;
  evidenceType: string;
  fileReference: string | null;
  sourceReference: string | null;
  /** "" until extraction has run (or the evidence type has no file). */
  extractedText: string;
  /** null = never processed. */
  extractStatus: CaseEvidenceExtractStatus | null;
  pageCount: number | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Evidence relationship foundation (Sprint 13 Phase 10). RELATES_TO is the
 * default, preserving the meaning of every link created before this field
 * existed — SUPPORTS/CONTRADICTS is only ever set by an explicit user
 * action, never auto-assigned by AI. */
export const CaseFactEvidenceRelation = {
  SUPPORTS: "SUPPORTS",
  CONTRADICTS: "CONTRADICTS",
  RELATES_TO: "RELATES_TO",
} as const;

export type CaseFactEvidenceRelation =
  (typeof CaseFactEvidenceRelation)[keyof typeof CaseFactEvidenceRelation];

export type CaseFactEvidenceLink = {
  factId: string;
  evidenceId: string;
  relationType: CaseFactEvidenceRelation;
  createdByUserId: string;
  createdAt: Date;
};

export type ManualMappingLogEntry = {
  id: string;
  recordedAt: string;
  recordedByUserId: string;
  factId: string;
  factText: string;
  elementId: string;
  relation: string;
  evidenceIds: string[];
  method: "MANUAL";
  applicableAt: string;
};

/**
 * Persisted lawyer-owned case file. Review snapshots are engine output,
 * not an independent legal conclusion.
 */
export type CaseFile = {
  id: string;
  ownerLawyerId: string;
  title: string;
  description: string | null;
  legalDomain: string;
  version: number;
  applicableAt: string;
  request: CaseAnalysisRequest;
  review: CaseAnalysisReview | null;
  mappingLog: ManualMappingLogEntry[];
  fixtureRules: RetrievedLegalRule[] | null;
  analysisStatus: string;
  lastAnalyzedAt: Date | null;
  lastAnalysisError: string | null;
  facts: CaseFact[];
  evidence: CaseEvidenceRecord[];
  factEvidenceLinks: CaseFactEvidenceLink[];
  createdAt: Date;
  updatedAt: Date;
};

export type CreateCaseFileInput = {
  ownerLawyerId: string;
  title: string;
  description: string | null;
  legalDomain: string;
  applicableAt: string;
  request: CaseAnalysisRequest;
  review?: CaseAnalysisReview | null;
  mappingLog?: ManualMappingLogEntry[];
  fixtureRules?: RetrievedLegalRule[] | null;
  analysisStatus?: string;
  lastAnalyzedAt?: Date | null;
  lastAnalysisError?: string | null;
  facts?: CaseFact[];
  evidence?: CaseEvidenceRecord[];
  factEvidenceLinks?: CaseFactEvidenceLink[];
};

export type CaseFilePatch = {
  title?: string;
  description?: string | null;
  legalDomain?: string;
  applicableAt?: string;
  request?: CaseAnalysisRequest;
  review?: CaseAnalysisReview | null;
  mappingLog?: ManualMappingLogEntry[];
  fixtureRules?: RetrievedLegalRule[] | null;
  analysisStatus?: string;
  lastAnalyzedAt?: Date | null;
  lastAnalysisError?: string | null;
  facts?: CaseFact[];
  evidence?: CaseEvidenceRecord[];
  factEvidenceLinks?: CaseFactEvidenceLink[];
};
