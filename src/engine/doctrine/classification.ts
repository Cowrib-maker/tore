/**
 * Legal-domain classification contracts.
 * Labels only — no jurisdiction-specific doctrine content.
 */

import { LegalDomain, type LegalDomain as LegalDomainType } from "./types";

export type LegalIssueClassification = {
  domain: LegalDomainType;
  /** Narrower topic tags (e.g. "contract", "negligence") — free-form, optional. */
  topics: string[];
  /** Procedural vs substantive when known. */
  nature: "SUBSTANTIVE" | "PROCEDURAL" | "MIXED" | "UNKNOWN";
  confidence: number;
};

export type LegalDomainClassificationContract = {
  /**
   * Classify a free-text issue statement into a domain.
   * Implementations must not invent doctrine; they only label.
   */
  classify(statement: string): LegalIssueClassification;
};

/**
 * Deterministic keyword heuristic for tests and scaffolding.
 * Not Mongolian doctrine; not a substitute for a trained classifier.
 */
export class RuleBasedLegalDomainClassifier
  implements LegalDomainClassificationContract
{
  classify(statement: string): LegalIssueClassification {
    const text = statement.toLowerCase();
    if (
      /\b(criminal|crime|offence|offense|prosecut|mens rea|actus reus)\b/.test(
        text,
      )
    ) {
      return {
        domain: LegalDomain.CRIMINAL,
        topics: ["criminal"],
        nature: "SUBSTANTIVE",
        confidence: 0.6,
      };
    }
    if (
      /\b(administrative|agency|licence|license|permit|regulatory)\b/.test(
        text,
      )
    ) {
      return {
        domain: LegalDomain.ADMINISTRATIVE,
        topics: ["administrative"],
        nature: "SUBSTANTIVE",
        confidence: 0.55,
      };
    }
    if (
      /\b(civil|contract|tort|damages|property|obligation)\b/.test(text)
    ) {
      return {
        domain: LegalDomain.CIVIL,
        topics: ["civil"],
        nature: "SUBSTANTIVE",
        confidence: 0.55,
      };
    }
    if (/\b(constitution|constitutional)\b/.test(text)) {
      return {
        domain: LegalDomain.CONSTITUTIONAL,
        topics: ["constitutional"],
        nature: "SUBSTANTIVE",
        confidence: 0.55,
      };
    }
    if (/\b(procedure|procedural|jurisdiction|standing)\b/.test(text)) {
      return {
        domain: LegalDomain.PROCEDURAL,
        topics: ["procedure"],
        nature: "PROCEDURAL",
        confidence: 0.5,
      };
    }
    return {
      domain: LegalDomain.UNKNOWN,
      topics: [],
      nature: "UNKNOWN",
      confidence: 0,
    };
  }
}
