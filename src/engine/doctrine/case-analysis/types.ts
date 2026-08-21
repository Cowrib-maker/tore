/**
 * Case-analysis workflow contracts.
 *
 * Facts → Issues → Domain → Doctrine → Rules → Elements → Evidence →
 * Subsumption → Counterarguments → Conclusion
 */

import type { LegalConflict } from "../conflict";
import type {
  LegalDoctrine,
  LegalEvidence,
  LegalFact,
  LegalIssue,
  LegalRule,
  LegalTest,
} from "../models";
import type {
  CaseAnalysisStage,
  ConclusionDisposition,
  LegalDomain,
  TemporalApplicability,
} from "../types";
import type { CandidateLegalIssue } from "./issue-spotter";
import type { ExtractedLegalTest } from "./legal-test-extractor";
import type {
  ExplicitFactMappingInput,
  FactElementMapping,
} from "./fact-element-mapping";
import type { RetrievedLegalRule } from "./rule-retriever";
import type { ElementApplication, SubsumptionEngineResult } from "./subsumption";

export type CaseCounterargument = {
  id: string;
  statement: string;
  relatedElementIds: string[];
  evidenceIds: string[];
  /** Never treated as dispositive without source-backed rule support. */
  authoritative: false;
};

export type CaseAnalysisTraceStep = {
  order: number;
  stage: CaseAnalysisStage;
  subjectIds: string[];
  notes: string[];
};

/**
 * Full explainable trace — JSON-serializable for later UI rendering.
 */
export type CaseAnalysisTrace = {
  stages: CaseAnalysisTraceStep[];
  issueIds: string[];
  doctrineIds: string[];
  ruleIds: string[];
  elementIds: string[];
  factIds: string[];
  evidenceIds: string[];
  mappingIds: string[];
  subsumption: ElementApplication[];
  counterarguments: CaseCounterargument[];
  temporal: TemporalApplicability;
  /**
   * Issue → Retrieved Rule → Legal Document → Article → Chunk provenance chain.
   */
  ruleProvenance: Array<{
    ruleId: string;
    sourceId: string;
    sourceUrl: string | null;
    officialUrl: string | null;
    legalDocumentId: string | null;
    articleId: string | null;
    articleNumber: string | null;
    chunkId: string | null;
    title: string | null;
    confidence: number;
    matchKind: string | null;
  }>;
  /**
   * Retrieved Rule → extracted LegalTest → elements (source-grounded).
   */
  testProvenance: {
    testId: string;
    ruleId: string | null;
    sourceId: string | null;
    sourceUrl: string | null;
    legalDocumentId: string | null;
    articleId: string | null;
    articleNumber: string | null;
    extractionStatus: string | null;
    extractionKind: string | null;
    elementIds: string[];
  } | null;
  mappings: FactElementMapping[];
};

export type CaseAnalysisConclusion = {
  disposition: ConclusionDisposition;
  statement: string;
  issueId: string | null;
  ruleId: string | null;
  doctrineId: string | null;
  reliedFactIds: string[];
  reliedEvidenceIds: string[];
  /** Provenance pointers — empty when disposition is not SUPPORTED. */
  sourceDocumentIds: string[];
  articleOrChunkIds: string[];
  accepted: boolean;
};

export type CaseAnalysisRequest = {
  facts: readonly LegalFact[];
  evidence: readonly LegalEvidence[];
  /** Instant for temporal law selection (required). */
  applicableAt: string;
  /** Optional pre-selected issue; otherwise spotter + caller supply. */
  issue?: LegalIssue | null;
  doctrine?: LegalDoctrine | null;
  legalTest?: LegalTest | null;
  /** Optional free-text / concept query for knowledge rule retrieval. */
  retrievalQuery?: string | null;
  issueKind?: string | null;
  jurisdiction?: string | null;
  sourceUrl?: string | null;
  sourceId?: string | null;
  /** Optional counterarguments from the parties / assistive model. */
  counterarguments?: readonly CaseCounterargument[];
  conflicts?: readonly LegalConflict[];
  /**
   * When true, treat proposed narrative conclusion as LLM-only and reject.
   * Used for safety tests — production callers should leave false.
   */
  llmOnlyConclusion?: boolean;
  proposedConclusionStatement?: string | null;
  /** Caller/manual fact → element assignments. Preserved as EXPLICIT or MANUAL. */
  mappings?: readonly ExplicitFactMappingInput[];
};

export type CaseAnalysisResult = {
  domain: LegalDomain;
  candidateIssues: CandidateLegalIssue[];
  selectedIssue: LegalIssue | null;
  doctrine: LegalDoctrine | null;
  retrievedRules: RetrievedLegalRule[];
  selectedRule: LegalRule | null;
  extractedTest: ExtractedLegalTest | null;
  legalTest: LegalTest | null;
  mappings: FactElementMapping[];
  subsumption: SubsumptionEngineResult;
  counterarguments: CaseCounterargument[];
  conflicts: LegalConflict[];
  conclusion: CaseAnalysisConclusion;
  trace: CaseAnalysisTrace;
  review: CaseAnalysisReview;
};

/**
 * Read-only review payload for a future lawyer UI. Not a legal conclusion.
 */
export type CaseAnalysisReview = {
  issues: Array<{
    id: string;
    statement: string;
    domain: string;
    kind?: string | null;
    status?: string | null;
  }>;
  rules: Array<{
    id: string;
    statement: string;
    sourceId: string | null;
    sourceUrl: string | null;
    officialUrl?: string | null;
    legalDocumentId: string | null;
    articleId: string | null;
    articleNumber: string | null;
    title?: string | null;
    sourceType?: string | null;
    sourceVersion?: string | null;
    validFrom?: string | null;
    validTo?: string | null;
    supportStatus?: string | null;
    confidence?: number | null;
  }>;
  tests: Array<{
    id: string;
    name: string;
    ruleId: string | null;
    extractionKind: string | null;
    extractionStatus?: string | null;
    provenance?: string | null;
  }>;
  elements: Array<{
    id: string;
    label: string;
    description: string;
    required: boolean;
    order: number;
    status: string;
  }>;
  facts: Array<{
    id: string;
    statement: string;
    disputed: boolean;
  }>;
  evidence: Array<{
    id: string;
    factId: string;
    description: string;
    sourceId: string | null;
  }>;
  mappings: FactElementMapping[];
  subsumption: ElementApplication[];
  conclusions: CaseAnalysisConclusion[];
};

export type CaseIntakeFactView = {
  id: string;
  text: string;
  sourceType: string;
  sourceReference: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  evidenceIds: string[];
};

export type CaseIntakeEvidenceView = {
  id: string;
  title: string;
  description: string | null;
  evidenceType: string;
  fileReference: string | null;
  sourceReference: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  factIds: string[];
};

/** Lawyer workspace wrapper over a persisted CaseFile + last engine review. */
export type CaseReviewWorkspacePayload = {
  caseId: string;
  title: string;
  description: string | null;
  domain: string;
  analyzedAt: string | null;
  applicableAt: string;
  status: string;
  version: number;
  lastAnalysisError: string | null;
  caseFacts: CaseIntakeFactView[];
  caseEvidence: CaseIntakeEvidenceView[];
  review: CaseAnalysisReview;
};
