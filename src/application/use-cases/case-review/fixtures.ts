/**
 * In-memory sample CaseAnalysisRequest graphs for the lawyer review UI.
 * Not production legal data. Not a database model.
 */

import {
  LegalAuthorityKind,
  LegalDomain,
  ReasoningSupportStatus,
  emptyTemporal,
  type LegalElement,
  type LegalEvidence,
  type LegalFact,
  type LegalIssue,
  type LegalRule,
  type LegalTest,
  type RetrievedLegalRule,
} from "@/engine/doctrine";
import type { CaseAnalysisRequest } from "@/engine/doctrine";

export const SAMPLE_CASE_VARIANTS = [
  "supported",
  "insufficient-facts",
  "unsupported",
  "conflicting-authority",
] as const;

export type SampleCaseVariant = (typeof SAMPLE_CASE_VARIANTS)[number];

export type SampleCaseBlueprint = {
  variant: SampleCaseVariant;
  title: string;
  request: CaseAnalysisRequest;
  retrievedRules: RetrievedLegalRule[];
};

function positiveLawProvenance(sourceId: string) {
  return {
    sourceId,
    sourceKind: LegalAuthorityKind.POSITIVE_LAW,
    citation: `Civil Code ${sourceId}`,
    locator: "art. 15",
  };
}

function fixtureIssue(): LegalIssue {
  return {
    id: "issue:transfer",
    statement: "Whether ownership transferred under the cited article",
    domain: LegalDomain.CIVIL,
    classification: {
      domain: LegalDomain.CIVIL,
      topics: ["property"],
      nature: "SUBSTANTIVE",
      confidence: 0.8,
    },
    temporal: emptyTemporal({ applicableAt: "2024-06-01" }),
    provenance: [positiveLawProvenance("law:civil-code")],
    unresolved: false,
  };
}

function fixtureRule(id: string, statement: string): LegalRule {
  return {
    id,
    statement,
    doctrineId: null,
    positiveLawRef: "law:civil-code",
    temporal: emptyTemporal({
      validFrom: "2020-01-01",
      validTo: "2026-12-31",
      sourceVersion: "2024-ed",
    }),
    provenance: [positiveLawProvenance("law:civil-code")],
  };
}

function retrieved(
  rule: LegalRule,
  overrides: Partial<RetrievedLegalRule> = {},
): RetrievedLegalRule {
  return {
    rule,
    sourceId: "law:civil-code",
    sourceUrl: "https://legalinfo.mn/mn/detail?lawId=fixture-civil-15",
    officialUrl: "https://legalinfo.mn/mn/detail?lawId=fixture-civil-15",
    legalDocumentId: "doc:civil-code",
    articleId: "art:15",
    articleNumber: "15",
    articleOrChunkId: "art:15",
    chunkId: "chunk:15",
    title: "Civil Code of Mongolia — Article 15",
    articleText:
      "Ownership transfers when (1) a valid contract exists; (2) the thing is delivered.",
    temporal: rule.temporal,
    supportStatus: ReasoningSupportStatus.SOURCE_BACKED,
    confidence: 0.92,
    matchKind: "article-number",
    ...overrides,
  };
}

function element(id: string, order: number, description: string): LegalElement {
  return {
    id,
    label: `Element ${order}`,
    description,
    required: true,
    order,
    conceptId: null,
    temporal: emptyTemporal({
      validFrom: "2020-01-01",
      validTo: null,
      sourceVersion: "2024-ed",
    }),
    provenance: [positiveLawProvenance("law:civil-code")],
  };
}

function fixtureTest(elements: LegalElement[]): LegalTest {
  return {
    id: "test:art-15",
    name: "Article 15 transfer test",
    doctrineId: null,
    ruleId: "rule:art-15",
    elements,
    temporal: emptyTemporal({
      validFrom: "2020-01-01",
      validTo: null,
      sourceVersion: "2024-ed",
    }),
    provenance: [positiveLawProvenance("law:civil-code")],
  };
}

const EL_CONTRACT = element(
  "el:contract",
  1,
  "a valid contract exists",
);
const EL_DELIVERY = element(
  "el:delivery",
  2,
  "the thing is delivered",
);

const MAPPED_FACTS: LegalFact[] = [
  {
    id: "FACT-003",
    statement: "The parties signed a written sale contract on 3 March 2024.",
    elementId: EL_CONTRACT.id,
    disputed: false,
  },
  {
    id: "FACT-007",
    statement: "The seller delivered the vehicle to the buyer on 10 March 2024.",
    elementId: EL_DELIVERY.id,
    disputed: false,
  },
];

const UNMAPPED_FACTS: LegalFact[] = [
  {
    id: "FACT-003",
    statement: "The parties executed a notarized instrument on 3 March 2024.",
    elementId: null,
    disputed: false,
  },
  {
    id: "FACT-007",
    statement: "The seller handed the vehicle keys to the buyer on 10 March 2024.",
    elementId: null,
    disputed: false,
  },
];

const EVIDENCE: LegalEvidence[] = [
  {
    id: "EVID-002",
    factId: "FACT-003",
    description: "Notarized sale contract",
    sourceId: "exhibit:contract",
  },
  {
    id: "EVID-005",
    factId: "FACT-007",
    description: "Delivery receipt signed by buyer",
    sourceId: "exhibit:receipt",
  },
];

const BASE_REQUEST: Omit<CaseAnalysisRequest, "facts"> = {
  evidence: EVIDENCE,
  applicableAt: "2024-06-01",
  issue: fixtureIssue(),
  legalTest: fixtureTest([EL_CONTRACT, EL_DELIVERY]),
  retrievalQuery: "Civil Code article 15 ownership transfer",
};

export function sampleCaseBlueprint(variant: SampleCaseVariant): SampleCaseBlueprint {
  const ruleA = fixtureRule(
    "rule:art-15",
    "Ownership transfers when a valid contract exists and the thing is delivered.",
  );
  const ruleB = fixtureRule(
    "rule:art-16",
    "Ownership does not transfer until registration is completed.",
  );

  switch (variant) {
    case "supported":
      return {
        variant,
        title: "Bayar v. Dorj — vehicle sale (sample)",
        request: { ...BASE_REQUEST, facts: MAPPED_FACTS },
        retrievedRules: [retrieved(ruleA)],
      };
    case "insufficient-facts":
      return {
        variant,
        title: "Bayar v. Dorj — unmapped facts (sample)",
        request: { ...BASE_REQUEST, facts: UNMAPPED_FACTS },
        retrievedRules: [retrieved(ruleA)],
      };
    case "unsupported":
      return {
        variant,
        title: "Bayar v. Dorj — no retrieved rule (sample)",
        request: {
          ...BASE_REQUEST,
          facts: UNMAPPED_FACTS,
          legalTest: null,
        },
        retrievedRules: [],
      };
    case "conflicting-authority":
      return {
        variant,
        title: "Bayar v. Dorj — conflicting articles (sample)",
        request: { ...BASE_REQUEST, facts: MAPPED_FACTS },
        retrievedRules: [
          retrieved(ruleA),
          retrieved(ruleB, {
            sourceId: "law:civil-code-alt",
            articleId: "art:16",
            articleNumber: "16",
            articleOrChunkId: "art:16",
            title: "Civil Code of Mongolia — Article 16",
            sourceUrl: "https://legalinfo.mn/mn/detail?lawId=fixture-civil-16",
            officialUrl: "https://legalinfo.mn/mn/detail?lawId=fixture-civil-16",
          }),
        ],
      };
  }
}
