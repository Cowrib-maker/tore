/**
 * Issue spotting — candidate classification only.
 * Never asserts that an issue applies without fact support + later doctrine/rules.
 */

import type { LegalDomainClassificationContract } from "../classification";
import {
  ADMINISTRATIVE_ISSUE_KINDS,
  CIVIL_ISSUE_KINDS,
  CRIMINAL_ISSUE_KINDS,
  issueKindsForDomain,
} from "../frameworks/issue-catalog";
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
    /\b(offense|offence|crime|actus|element|charge)\b|гэмт\s*хэрэг|бүрэлдэхүүн|яллах|эрүү/i,
  [LegalIssueKind.UNLAWFULNESS]:
    /\b(unlawful|illegal|wrongful|prohibited)\b|хууль\s*бус|хориотой|зөрчсөн/i,
  [LegalIssueKind.CULPABILITY]:
    /\b(intent|mens rea|negligen|reckless|culpab|fault)\b|санаатай|болгоомжгүй|гэм\s*буруу/i,
  [LegalIssueKind.CAUSATION]:
    /\b(caus|result|consequence|link)\b|шалтгаан|үр\s*дагавар|холбоо/i,
  [LegalIssueKind.ATTEMPT_OR_PARTICIPATION]:
    /\b(attempt|participat|aiding|abetting|accomplic)\b|завдсан|хамтран|хамсаатан/i,
  [LegalIssueKind.CIVIL_OBLIGATION]:
    /\b(obligat|contract|duty|debt|performance)\b|гэрээ|үүрэг|өр\b|гүйцэтгэл/i,
  [LegalIssueKind.BREACH]:
    /\b(breach|default|non.?performance|violat)\b|зөрчил|биелүүлээгүй|гэрээг?\s*зөрч/i,
  [LegalIssueKind.DAMAGES]:
    /\b(damage|loss|compensat|harm|injury)\b|хохирол|нөхөн\s*төлбөр|гэмтэл/i,
  [LegalIssueKind.ADMINISTRATIVE_LEGALITY]:
    /\b(administrat|agency|licence|license|permit|regulatory)\b|захиргаа|зөвшөөрөл|лиценз/i,
  [LegalIssueKind.COMPETENCE_OR_JURISDICTION]:
    /\b(jurisdiction|competence|authority|forum)\b|харьяалал|эрх\s*мэдэл/i,
  [LegalIssueKind.PROCEDURAL_LEGALITY]:
    /\b(procedure|procedural|due process|hearing|notice)\b|журам|процесс|мэдэгдэл|сонсох/i,
  [LegalIssueKind.EVIDENCE_OR_ADMISSIBILITY]:
    /\b(evidence|admissib|exhibit|witness|proof)\b|нотлох\s*баримт|гэрч|нотолгоо/i,
};

const KIND_LABELS: Record<IssueKind, string> = {
  [LegalIssueKind.ELEMENTS_OF_OFFENSE]: "Гэмт хэргийн бүрэлдэхүүн",
  [LegalIssueKind.UNLAWFULNESS]: "Хууль бус байдал",
  [LegalIssueKind.CULPABILITY]: "Гэм буруу",
  [LegalIssueKind.CAUSATION]: "Шалтгаан холбоо",
  [LegalIssueKind.ATTEMPT_OR_PARTICIPATION]: "Завдалт / оролцоо",
  [LegalIssueKind.CIVIL_OBLIGATION]: "Иргэний үүрэг",
  [LegalIssueKind.BREACH]: "Үүрэг зөрчих",
  [LegalIssueKind.DAMAGES]: "Хохирол",
  [LegalIssueKind.ADMINISTRATIVE_LEGALITY]: "Захиргааны хууль ёсны байдал",
  [LegalIssueKind.COMPETENCE_OR_JURISDICTION]: "Харьяалал / эрх мэдэл",
  [LegalIssueKind.PROCEDURAL_LEGALITY]: "Процессын хууль ёсны байдал",
  [LegalIssueKind.EVIDENCE_OR_ADMISSIBILITY]: "Нотлох баримт / хүлээн зөвшөөрөх",
};

const KIND_DOMAIN: Partial<Record<IssueKind, LegalDomainType>> = {
  [LegalIssueKind.ELEMENTS_OF_OFFENSE]: LegalDomain.CRIMINAL,
  [LegalIssueKind.UNLAWFULNESS]: LegalDomain.CRIMINAL,
  [LegalIssueKind.CULPABILITY]: LegalDomain.CRIMINAL,
  [LegalIssueKind.ATTEMPT_OR_PARTICIPATION]: LegalDomain.CRIMINAL,
  [LegalIssueKind.CIVIL_OBLIGATION]: LegalDomain.CIVIL,
  [LegalIssueKind.BREACH]: LegalDomain.CIVIL,
  [LegalIssueKind.DAMAGES]: LegalDomain.CIVIL,
  [LegalIssueKind.ADMINISTRATIVE_LEGALITY]: LegalDomain.ADMINISTRATIVE,
  [LegalIssueKind.COMPETENCE_OR_JURISDICTION]: LegalDomain.ADMINISTRATIVE,
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
    let domain = classification.domain;
    let kinds = issueKindsForDomain(domain);
    const notes: string[] = [];

    if (facts.length === 0) {
      notes.push("no facts supplied — no issue may be claimed as applicable");
      return { domain: LegalDomain.UNKNOWN, candidates: [], notes };
    }

    if (kinds.length === 0) {
      kinds = uniqueKinds([
        ...CRIMINAL_ISSUE_KINDS,
        ...CIVIL_ISSUE_KINDS,
        ...ADMINISTRATIVE_ISSUE_KINDS,
      ]);
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
    } else if (domain === LegalDomain.UNKNOWN) {
      domain = KIND_DOMAIN[candidates[0]!.kind] ?? LegalDomain.UNKNOWN;
    }

    return { domain, candidates, notes };
  }
}

function uniqueKinds(kinds: readonly IssueKind[]): IssueKind[] {
  return [...new Set(kinds)];
}
