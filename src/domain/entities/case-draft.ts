import type { CaseAiCitation, CaseAnalysisSection } from "@/domain/entities/case-ai-analysis";

/**
 * Sprint 13 Phase 8 — Draft Generator V1. Only LAWYER_POSITION is actually
 * implemented (see case-draft-generator.ts) — the other two enum values
 * exist in the schema/domain model so the shape is future-proof, but their
 * generators throw NotImplementedError rather than producing shallow or
 * fake output. Drafts are explicitly non-authoritative: they are DRAFTS a
 * lawyer edits and owns, never final legal advice or an official document.
 */
export const CaseDraftType = {
  LAWYER_POSITION: "LAWYER_POSITION",
  PROSECUTOR_CONCLUSION_STRUCTURE: "PROSECUTOR_CONCLUSION_STRUCTURE",
  COURT_QUESTIONS: "COURT_QUESTIONS",
} as const;

export type CaseDraftType = (typeof CaseDraftType)[keyof typeof CaseDraftType];

export const CaseDraftStatus = {
  PENDING: "PENDING",
  OK: "OK",
  FAILED: "FAILED",
} as const;

export type CaseDraftStatus = (typeof CaseDraftStatus)[keyof typeof CaseDraftStatus];

export const LAWYER_POSITION_SECTION_ORDER = [
  "factSummary",
  "legalBasis",
  "positionStatement",
] as const;

export type LawyerPositionSectionKey = (typeof LAWYER_POSITION_SECTION_ORDER)[number];

export const LAWYER_POSITION_SECTION_HEADINGS: Record<LawyerPositionSectionKey, string> = {
  factSummary: "Баримтын тойм",
  legalBasis: "Эрх зүйн үндэслэл",
  positionStatement: "Өмгөөлөгчийн эрх зүйн байр суурь",
};

export type LawyerPositionDraftContent = {
  sections: Record<LawyerPositionSectionKey, CaseAnalysisSection>;
  citations: CaseAiCitation[];
};

export type CaseDraftResult = {
  id: string;
  caseFileId: string;
  draftType: CaseDraftType;
  status: CaseDraftStatus;
  /** Typed as unknown at the persistence boundary — only LAWYER_POSITION is
   * ever actually written, and the use-case narrows it to
   * LawyerPositionDraftContent right after loading. */
  content: LawyerPositionDraftContent | null;
  failureReason: string | null;
  createdByUserId: string;
  createdAt: Date;
};
