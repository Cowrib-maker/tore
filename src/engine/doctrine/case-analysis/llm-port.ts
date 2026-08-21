/**
 * LLM-independent assistive port.
 * May extract / suggest / summarize — never authoritative for legal rules.
 */

import type { LegalEvidence, LegalFact } from "../models";
import type { CandidateLegalIssue } from "./issue-spotter";

export type LegalArgumentDraft = {
  side: "CLAIMANT" | "RESPONDENT" | "NEUTRAL";
  statement: string;
  /** Always non-authoritative — must be verified against doctrine/knowledge. */
  authoritative: false;
};

/**
 * Optional assistive model. Implementations must not be treated as legal authority.
 */
export interface ILegalReasoningModel {
  extractFacts?(narrative: string): Promise<LegalFact[]>;
  suggestIssues?(facts: readonly LegalFact[]): Promise<CandidateLegalIssue[]>;
  summarizeEvidence?(evidence: readonly LegalEvidence[]): Promise<string>;
  generateCandidateArguments?(input: {
    facts: readonly LegalFact[];
    issues: readonly CandidateLegalIssue[];
  }): Promise<LegalArgumentDraft[]>;
}

/** No-op model — default. Never invents rules or conclusions. */
export class NullLegalReasoningModel implements ILegalReasoningModel {
  async extractFacts(): Promise<LegalFact[]> {
    return [];
  }

  async suggestIssues(): Promise<CandidateLegalIssue[]> {
    return [];
  }

  async summarizeEvidence(): Promise<string> {
    return "";
  }

  async generateCandidateArguments(): Promise<LegalArgumentDraft[]> {
    return [];
  }
}
