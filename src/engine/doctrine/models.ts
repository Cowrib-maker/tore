/**
 * Domain models for Legal Doctrine foundation.
 *
 * These types hold structure only. They do not invent or scrape doctrine.
 * Populate later from source-backed catalogs.
 */

import type { LegalIssueClassification } from "./classification";
import type { DoctrineProvenance } from "./provenance";
import type {
  LegalDomain,
  TemporalApplicability,
  FactElementRelation,
  MappingMethod,
} from "./types";

/** Abstract legal concept used inside doctrine (e.g. an element label). */
export type LegalConcept = {
  id: string;
  label: string;
  description: string;
  domain: LegalDomain;
  temporal: TemporalApplicability;
  provenance: DoctrineProvenance[];
};

/**
 * Doctrinal statement — not positive law, not a court holding,
 * not an administrative regulation, not AI inference.
 */
export type LegalDoctrine = {
  id: string;
  name: string;
  statement: string;
  domain: LegalDomain;
  /** Related positive-law citation targets (ids only; meaning lives in knowledge). */
  relatedPositiveLawIds: string[];
  /** Related court decision ids (ids only). */
  relatedCourtDecisionIds: string[];
  concepts: LegalConcept[];
  temporal: TemporalApplicability;
  provenance: DoctrineProvenance[];
};

/** A legal rule drawn from positive law or doctrine (with provenance). */
export type LegalRule = {
  id: string;
  statement: string;
  /** Prefer POSITIVE_LAW or DOCTRINE provenance. */
  doctrineId: string | null;
  positiveLawRef: string | null;
  temporal: TemporalApplicability;
  provenance: DoctrineProvenance[];
};

/** One element of a multi-factor legal test. */
export type LegalElement = {
  id: string;
  label: string;
  description: string;
  required: boolean;
  order: number;
  conceptId: string | null;
  temporal: TemporalApplicability;
  provenance: DoctrineProvenance[];
};

/** Doctrinal / statutory test composed of ordered elements. */
export type LegalTest = {
  id: string;
  name: string;
  /** Null when the test is extracted from positive law, not a doctrine corpus. */
  doctrineId: string | null;
  ruleId: string | null;
  elements: LegalElement[];
  temporal: TemporalApplicability;
  provenance: DoctrineProvenance[];
};

/** Contested or analyzed legal question. */
export type LegalIssue = {
  id: string;
  statement: string;
  domain: LegalDomain;
  classification: LegalIssueClassification;
  temporal: TemporalApplicability;
  provenance: DoctrineProvenance[];
  /** Explicitly mark issues that cannot yet be decided. */
  unresolved: boolean;
};

/** Source-backed interpretation of a rule or doctrine. */
export type LegalInterpretation = {
  id: string;
  subjectId: string;
  subjectKind: "legal_rule" | "doctrine" | "element" | "test";
  statement: string;
  temporal: TemporalApplicability;
  provenance: DoctrineProvenance[];
};

/** Fact asserted in the reasoning request (user or case file). */
export type LegalFact = {
  id: string;
  statement: string;
  elementId: string | null;
  /** Extra element ids when one fact is assigned to multiple elements. */
  elementIds?: string[];
  disputed: boolean;
  /** Caller-assigned relation; default SUPPORTS when an element id is set. */
  mappingRelation?: FactElementRelation;
  /** EXPLICIT (default) or MANUAL when the caller assigned element ids. */
  mappingMethod?: MappingMethod;
};

/** Evidence offered to support a fact. */
export type LegalEvidence = {
  id: string;
  factId: string;
  description: string;
  /** Optional non-AI source id for the exhibit itself. */
  sourceId: string | null;
};

/** Proposed or accepted conclusion — must be validated for support. */
export type LegalConclusion = {
  id: string;
  issueId: string;
  statement: string;
  /** True when a human or system accepted the conclusion after validation. */
  accepted: boolean;
  temporal: TemporalApplicability;
  provenance: DoctrineProvenance[];
  /**
   * When true, the statement originated solely from an LLM without mapped sources.
   * The reasoning engine must reject this as a legal conclusion.
   */
  llmGeneratedAlone: boolean;
};
