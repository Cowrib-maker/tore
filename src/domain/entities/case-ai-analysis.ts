/**
 * Sprint 13 Phase 6 — grounded Case Analysis V1 structured output.
 * Deliberately separate from CaseAnalysisReview (src/engine/doctrine) —
 * that is the deterministic rule-matching engine's own reproducible
 * output; this is an additive, narrative LLM capability grounded in case
 * documents + verified legal authorities, never a replacement for it.
 */

/** Every statement in the analysis must declare what kind of claim it is —
 * the model is instructed to never blur these, and the parser rejects any
 * section missing this tag rather than defaulting it. */
export const CaseAnalysisStatementKind = {
  /** Drawn from an uploaded/authorized case document. */
  FACT: "FACT",
  /** Drawn from a VERIFIED legal authority (resolveLegalAuthorities). */
  LAW: "LAW",
  /** The model's own reasoning/conclusion — never presented as established. */
  INFERENCE: "INFERENCE",
  /** Explicitly flagged as unknown, unclear, or unverifiable. */
  UNCERTAINTY: "UNCERTAINTY",
} as const;

export type CaseAnalysisStatementKind =
  (typeof CaseAnalysisStatementKind)[keyof typeof CaseAnalysisStatementKind];

export type CaseAnalysisStatement = {
  kind: CaseAnalysisStatementKind;
  text: string;
  /** 0-based indices into the analysis's citations[] array this statement
   * is grounded in. Empty for a pure INFERENCE/UNCERTAINTY statement. */
  citationRefs: number[];
};

export type CaseAnalysisSection = {
  heading: string;
  statements: CaseAnalysisStatement[];
};

/** The 10 sections from the milestone brief, sections 1-9 as structured
 * statement lists; section 10 ("Эх сурвалж" / Sources) is the analysis's
 * citations array itself, not a text section — see CaseAiAnalysisResult. */
export type CaseAiAnalysisSections = {
  briefCircumstances: CaseAnalysisSection; // 1. Хэргийн товч нөхцөл
  mainLegalIssue: CaseAnalysisSection; // 2. Гол эрх зүйн асуудал
  applicableProvisions: CaseAnalysisSection; // 3. Болзошгүй хэрэглэгдэх хуулийн зохицуулалт
  evidenceAnalysis: CaseAnalysisSection; // 4. Нотлох баримтын дүн шинжилгээ
  evidenceGaps: CaseAnalysisSection; // 5. Нотлох баримтын зөрчил / дутагдал
  opposingExplanation: CaseAnalysisSection; // 6. Эсрэг талын боломжит тайлбар
  legalRisks: CaseAnalysisSection; // 7. Эрх зүйн эрсдэл
  clarificationNeeded: CaseAnalysisSection; // 8. Нэмэлтээр тодруулах шаардлагатай асуудал
  nextSteps: CaseAnalysisSection; // 9. Дараагийн процессын алхам
};

export const CASE_AI_ANALYSIS_SECTION_ORDER: Array<keyof CaseAiAnalysisSections> = [
  "briefCircumstances",
  "mainLegalIssue",
  "applicableProvisions",
  "evidenceAnalysis",
  "evidenceGaps",
  "opposingExplanation",
  "legalRisks",
  "clarificationNeeded",
  "nextSteps",
];

export const CASE_AI_ANALYSIS_SECTION_HEADINGS: Record<
  keyof CaseAiAnalysisSections,
  string
> = {
  briefCircumstances: "Хэргийн товч нөхцөл",
  mainLegalIssue: "Гол эрх зүйн асуудал",
  applicableProvisions: "Болзошгүй хэрэглэгдэх хуулийн зохицуулалт",
  evidenceAnalysis: "Нотлох баримтын дүн шинжилгээ",
  evidenceGaps: "Нотлох баримтын зөрчил / дутагдал",
  opposingExplanation: "Эсрэг талын боломжит тайлбар",
  legalRisks: "Эрх зүйн эрсдэл",
  clarificationNeeded: "Нэмэлтээр тодруулах шаардлагатай асуудал",
  nextSteps: "Дараагийн процессын алхам",
};

export const CaseAiCitationType = {
  VERIFIED_LEGAL_SOURCE: "VERIFIED_LEGAL_SOURCE",
  USER_DOCUMENT: "USER_DOCUMENT",
} as const;

export type CaseAiCitationType =
  (typeof CaseAiCitationType)[keyof typeof CaseAiCitationType];

/** Client-safe citation shape — deliberately mirrors LegalAiSafeCitation
 * (src/application/ai/legal-ai-citation.ts): never archive hashes, engine
 * tokens, or storage keys, only what the citation panel may display. */
export type CaseAiCitation = {
  citationType: CaseAiCitationType;
  title: string;
  reference: string | null;
  excerpt: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  documentId: string | null;
  documentVersionId: string | null;
  nodeId: string | null;
  caseEvidenceId: string | null;
};

export const CaseAiAnalysisStatus = {
  PENDING: "PENDING",
  OK: "OK",
  FAILED: "FAILED",
} as const;

export type CaseAiAnalysisStatus =
  (typeof CaseAiAnalysisStatus)[keyof typeof CaseAiAnalysisStatus];

export type CaseAiAnalysisResult = {
  id: string;
  caseFileId: string;
  status: CaseAiAnalysisStatus;
  sections: CaseAiAnalysisSections | null;
  citations: CaseAiCitation[];
  provider: string | null;
  model: string | null;
  failureReason: string | null;
  createdByUserId: string;
  createdAt: Date;
};
