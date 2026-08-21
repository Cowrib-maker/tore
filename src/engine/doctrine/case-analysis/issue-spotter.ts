/**
 * Issue spotting — candidate classification only.
 * Never asserts that an issue applies without fact support + later doctrine/rules.
 */

import type { LegalDomainClassificationContract } from "../classification";
import { issueKindsForDomain } from "../frameworks/issue-catalog";
import type { LegalFact } from "../models";
import {
  LegalDomain,
  LegalIssueKind,
  type LegalDomain as LegalDomainType,
  type LegalIssueKind as IssueKind,
} from "../types";

export type CandidateLegalIssue = {
  kind: IssueKind;
  domain: LegalDomainType;
  /** Short label for UI / traces — not a legal holding. */
  label: string;
  /** True only when fact text heuristically supports considering this kind. */
  supportedByFacts: boolean;
  /** Why it was (or was not) surfaced — never a conclusion. */
  rationale: string;
  confidence: number;
};

export type IssueSpottingResult = {
  domain: LegalDomainType;
  candidates: CandidateLegalIssue[];
  notes: string[];
};

export interface IIssueSpotter {
  spot(facts: readonly LegalFact[]): IssueSpottingResult;
}

const KIND_HINTS: Record<IssueKind, RegExp> = {
  [LegalIssueKind.ELEMENTS_OF_OFFENSE]:
    /\b(offense|offence|crime|actus|element|charge)\b/i,
  [LegalIssueKind.UNLAWFULNESS]: /\b(unlawful|illegal|wrongful|prohibited)\b/i,
  [LegalIssueKind.CULPABILITY]:
    /\b(intent|mens rea|negligen|reckless|culpab|fault)\b/i,
  [LegalIssueKind.CAUSATION]: /\b(caus|result|consequence|link)\b/i,
  [LegalIssueKind.ATTEMPT_OR_PARTICIPATION]:
    /\b(attempt|participat|aiding|abetting|accomplic)\b/i,
  [LegalIssueKind.CIVIL_OBLIGATION]:
    /\b(obligat|contract|duty|debt|performance)\b/i,
  [LegalIssueKind.BREACH]: /\b(breach|default|non.?performance|violat)\b/i,
  [LegalIssueKind.DAMAGES]: /\b(damage|loss|compensat|harm|injury)\b/i,
  [LegalIssueKind.ADMINISTRATIVE_LEGALITY]:
    /\b(administrat|agency|licence|license|permit|regulatory)\b/i,
  [LegalIssueKind.COMPETENCE_OR_JURISDICTION]:
    /\b(jurisdiction|competence|authority|forum)\b/i,
  [LegalIssueKind.PROCEDURAL_LEGALITY]:
    /\b(procedure|procedural|due process|hearing|notice)\b/i,
  [LegalIssueKind.EVIDENCE_OR_ADMISSIBILITY]:
    /\b(evidence|admissib|exhibit|witness|proof)\b/i,
};

const KIND_LABELS: Record<IssueKind, string> = {
  [LegalIssueKind.ELEMENTS_OF_OFFENSE]: "Elements of an offense",
  [LegalIssueKind.UNLAWFULNESS]: "Unlawfulness",
  [LegalIssueKind.CULPABILITY]: "Culpability",
  [LegalIssueKind.CAUSATION]: "Causation",
  [LegalIssueKind.ATTEMPT_OR_PARTICIPATION]: "Attempt / participation",
  [LegalIssueKind.CIVIL_OBLIGATION]: "Civil obligation",
  [LegalIssueKind.BREACH]: "Breach",
  [LegalIssueKind.DAMAGES]: "Damages",
  [LegalIssueKind.ADMINISTRATIVE_LEGALITY]: "Administrative legality",
  [LegalIssueKind.COMPETENCE_OR_JURISDICTION]: "Competence / jurisdiction",
  [LegalIssueKind.PROCEDURAL_LEGALITY]: "Procedural legality",
  [LegalIssueKind.EVIDENCE_OR_ADMISSIBILITY]: "Evidence / admissibility",
};

/**
 * Deterministic spotter: surfaces candidates when facts mention related terms.
 * Does not claim an issue applies; does not invent doctrine.
 */
export class RuleBasedIssueSpotter implements IIssueSpotter {
  constructor(
    private readonly classifier: LegalDomainClassificationContract,
  ) {}

  spot(facts: readonly LegalFact[]): IssueSpottingResult {
    const combined = facts.map((f) => f.statement).join(" \n ");
    const classification = this.classifier.classify(combined || "unknown");
    const domain = classification.domain;
    const kinds = issueKindsForDomain(domain);
    const notes: string[] = [];

    if (facts.length === 0) {
      notes.push("no facts supplied — no issue may be claimed as applicable");
      return { domain: LegalDomain.UNKNOWN, candidates: [], notes };
    }

    if (kinds.length === 0) {
      notes.push(
        `domain ${domain} has no issue catalog — candidates empty until doctrine is loaded`,
      );
      return { domain, candidates: [], notes };
    }

    const candidates: CandidateLegalIssue[] = [];
    for (const kind of kinds) {
      const hint = KIND_HINTS[kind];
      const supportedByFacts = hint.test(combined);
      if (!supportedByFacts) {
        continue;
      }
      candidates.push({
        kind,
        domain,
        label: KIND_LABELS[kind],
        supportedByFacts: true,
        rationale:
          "Fact text heuristically matches this issue kind; not a determination that the issue applies.",
        confidence: Math.min(0.55, classification.confidence || 0.4),
      });
    }

    if (candidates.length === 0) {
      notes.push(
        "no candidate issues supported by supplied facts — refusing to invent issues",
      );
    }

    return { domain, candidates, notes };
  }
}
