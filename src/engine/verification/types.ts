/**
 * Contracts for the TORE Verification Engine.
 *
 * Validates legal correctness before and after a model response.
 * No prompts, embeddings, inference, or persistence.
 */

import type { CitationIndex } from "../citation/types";
import type { KnowledgeGraph } from "../graph/knowledge-graph";
import type { LegalDocument } from "../knowledge/schema";
import type { ReasoningPlan } from "../reasoning/types";

export type VerificationSeverity = "error" | "warning";

export type VerificationIssue = {
  code: string;
  message: string;
  severity: VerificationSeverity;
  authorityId?: string;
  citation?: string;
};

export type VerificationRequest = {
  plan: ReasoningPlan;
  documents: readonly LegalDocument[];
  citationIndex: CitationIndex | readonly CitationIndex[];
  graph: Pick<KnowledgeGraph, "findNode">;
};

export type ValidatorFinding = {
  issues: VerificationIssue[];
  validatedAuthorities: string[];
  validatedCitations: string[];
  missingAuthorities: string[];
};

export type VerificationReport = {
  success: boolean;
  errors: VerificationIssue[];
  warnings: VerificationIssue[];
  validatedAuthorities: string[];
  validatedCitations: string[];
  missingAuthorities: string[];
  confidenceScore: number;
};

export interface ICitationValidator {
  validate(request: VerificationRequest): ValidatorFinding;
}

export interface IAuthorityValidator {
  validate(request: VerificationRequest): ValidatorFinding;
}

export interface IConsistencyValidator {
  validate(request: VerificationRequest): ValidatorFinding;
}

export interface IVerificationReportBuilder {
  build(findings: readonly ValidatorFinding[]): VerificationReport;
}

export type VerificationServiceDependencies = {
  citationValidator: ICitationValidator;
  authorityValidator: IAuthorityValidator;
  consistencyValidator: IConsistencyValidator;
  reportBuilder: IVerificationReportBuilder;
};
