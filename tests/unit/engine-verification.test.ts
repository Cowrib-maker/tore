import { describe, expect, it } from "vitest";

import { buildCitationIndex } from "@/engine/citation";
import { createKnowledgeGraph } from "@/engine/graph";
import {
  LegalDocumentStatus,
  LegalNodeKind,
  LegalSourceKind,
  type LegalDocument,
  type LegalNode,
} from "@/engine/knowledge/schema";
import type { ReasoningPlan } from "@/engine/reasoning";
import { ReasoningStepId, ReasoningStepStatus } from "@/engine/reasoning";
import {
  createVerificationEngine,
  type ICitationValidator,
  type ValidatorFinding,
} from "@/engine/verification";

function node(partial: {
  id: string;
  kind: LegalNode["kind"];
  locator?: LegalNode["locator"];
  children?: LegalNode[];
}): LegalNode {
  return {
    id: partial.id,
    kind: partial.kind,
    locator: partial.locator ?? { display: partial.id },
    heading: partial.id,
    text: partial.id,
    order: 0,
    path: partial.id,
    citations: [],
    children: partial.children ?? [],
  };
}

function law(
  hierarchy: LegalNode[],
  status: LegalDocumentStatus = LegalDocumentStatus.IN_FORCE,
): LegalDocument {
  return {
    identity: {
      id: "criminal",
      jurisdiction: "MN",
      language: "mn",
      title: "Criminal Code",
      identifiers: [],
    },
    source: {
      kind: LegalSourceKind.LAW,
      instrumentClass: "CODE",
      enactingBody: null,
    },
    publication: {
      issuer: null,
      officialUrl: null,
      documentNumber: null,
      issuedOn: null,
      publishedOn: null,
      publicationSeries: null,
    },
    temporal: {
      status,
      effectiveOn: null,
      validFrom: null,
      validTo: null,
    },
    hierarchy,
    citations: [],
    relations: [],
  };
}

function validTree(): LegalNode {
  return node({
    id: "art-17",
    kind: LegalNodeKind.ARTICLE,
    locator: { display: "17", article: "17" },
    children: [
      node({
        id: "p-1",
        kind: LegalNodeKind.PARAGRAPH,
        locator: { display: "17.1", article: "17", paragraph: "1" },
        children: [
          node({
            id: "sp-2",
            kind: LegalNodeKind.SUBPARAGRAPH,
            locator: {
              display: "17.1.2",
              article: "17",
              paragraph: "1",
              subparagraph: "2",
            },
          }),
        ],
      }),
    ],
  });
}

function emptyPlan(overrides: Partial<ReasoningPlan> = {}): ReasoningPlan {
  return {
    userIntent: "LEGAL_RESEARCH",
    legalIssue: "Does article 17 apply?",
    relevantAuthorities: [
      { id: "criminal", kind: "LAW", label: "Criminal Code", source: "document" },
      { id: "art-17", kind: "ARTICLE", label: "17", source: "citation" },
      { id: "p-1", kind: "PARAGRAPH", label: "17.1", source: "citation" },
    ],
    requiredEvidence: ["primary_authority", "verified_citation"],
    relatedArticles: [
      { id: "art-17", kind: "ARTICLE", label: "17", source: "citation" },
      { id: "p-1", kind: "PARAGRAPH", label: "17.1", source: "citation" },
    ],
    relatedCases: [],
    missingInformation: [],
    reasoningSteps: [
      {
        order: 1,
        id: ReasoningStepId.VERIFY_CITATIONS,
        title: "Verify citation exists.",
        status: ReasoningStepStatus.READY,
        collectedIds: ["art-17", "p-1"],
        notes: ["all_citations_verified"],
      },
    ],
    confidenceRequirements: {
      minimumIntentConfidence: 0.5,
      requireVerifiedCitation: true,
      requirePrimaryAuthority: true,
      requireCourtAuthority: false,
      blockingGaps: [],
    },
    ...overrides,
  };
}

describe("VerificationService", () => {
  const engine = createVerificationEngine();

  it("accepts a consistent plan, documents, citation index, and graph", () => {
    const document = law([validTree()]);
    const graph = createKnowledgeGraph();
    graph.addDocument(document);
    const report = engine.verify({
      plan: emptyPlan(),
      documents: [document],
      citationIndex: buildCitationIndex(document),
      graph,
    });

    expect(report.success).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.validatedAuthorities).toEqual(
      expect.arrayContaining(["criminal", "art-17", "p-1"]),
    );
    expect(report.validatedCitations.length).toBeGreaterThan(0);
    expect(report.missingAuthorities).toEqual([]);
    expect(report.confidenceScore).toBe(1);
  });

  it("fails when a citation does not resolve through the citation index", () => {
    const document = law([validTree()]);
    const graph = createKnowledgeGraph();
    graph.addDocument(document);
    const report = engine.verify({
      plan: emptyPlan({
        relevantAuthorities: [
          {
            id: "missing-node",
            kind: "ARTICLE",
            label: "99.9",
            source: "citation",
          },
        ],
        relatedArticles: [
          {
            id: "missing-node",
            kind: "ARTICLE",
            label: "99.9",
            source: "citation",
          },
        ],
        reasoningSteps: [
          {
            order: 1,
            id: ReasoningStepId.VERIFY_CITATIONS,
            title: "Verify citation exists.",
            status: ReasoningStepStatus.BLOCKED,
            collectedIds: [],
            notes: ["unresolved:99.9"],
          },
        ],
      }),
      documents: [document],
      citationIndex: buildCitationIndex(document),
      graph,
    });

    expect(report.success).toBe(false);
    expect(report.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining(["citation_unresolved", "authority_not_found"]),
    );
    expect(report.missingAuthorities).toContain("missing-node");
    expect(report.confidenceScore).toBeLessThan(1);
  });

  it("detects invalid hierarchy, obsolete instruments, and duplicates", () => {
    const invalid = law(
      [
        node({
          id: "orphan-p",
          kind: LegalNodeKind.PARAGRAPH,
          locator: { display: "1.1", article: "1", paragraph: "1" },
        }),
      ],
      LegalDocumentStatus.REPEALED,
    );
    const graph = createKnowledgeGraph();
    graph.addDocument(invalid);
    const report = engine.verify({
      plan: emptyPlan({
        relevantAuthorities: [
          { id: "criminal", kind: "LAW", label: "Criminal Code", source: "document" },
          { id: "orphan-p", kind: "PARAGRAPH", label: "1.1", source: "citation" },
          { id: "orphan-p", kind: "PARAGRAPH", label: "1.1", source: "citation" },
        ],
        relatedArticles: [
          { id: "orphan-p", kind: "PARAGRAPH", label: "1.1", source: "citation" },
        ],
      }),
      documents: [invalid],
      citationIndex: buildCitationIndex(invalid),
      graph,
    });

    expect(report.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining(["invalid_hierarchy", "obsolete_authority"]),
    );
    expect(report.warnings.map((item) => item.code)).toContain("duplicate_authority");
  });

  it("detects authorities missing from the knowledge graph", () => {
    const document = law([validTree()]);
    const report = engine.verify({
      plan: emptyPlan(),
      documents: [document],
      citationIndex: buildCitationIndex(document),
      graph: { findNode: () => null },
    });

    expect(report.success).toBe(false);
    expect(report.errors.map((item) => item.code)).toContain("authority_not_in_graph");
    expect(report.missingAuthorities.length).toBeGreaterThan(0);
  });

  it("detects conflicting authorities with the same label", () => {
    const document = law([validTree()]);
    const graph = createKnowledgeGraph();
    graph.addDocument(document);
    const report = engine.verify({
      plan: emptyPlan({
        relatedArticles: [
          { id: "art-17", kind: "ARTICLE", label: "17", source: "citation" },
          { id: "art-18", kind: "ARTICLE", label: "17", source: "citation" },
        ],
      }),
      documents: [document],
      citationIndex: buildCitationIndex(document),
      graph,
    });

    expect(report.errors.map((item) => item.code)).toContain("conflicting_authority");
  });

  it("flags missing supporting authority when no provision is present", () => {
    const document = law([validTree()]);
    const graph = createKnowledgeGraph();
    graph.addDocument(document);
    const report = engine.verify({
      plan: emptyPlan({
        relevantAuthorities: [
          { id: "criminal", kind: "LAW", label: "Criminal Code", source: "document" },
        ],
        relatedArticles: [],
        reasoningSteps: [],
        confidenceRequirements: {
          minimumIntentConfidence: 0.5,
          requireVerifiedCitation: false,
          requirePrimaryAuthority: true,
          requireCourtAuthority: false,
          blockingGaps: [],
        },
      }),
      documents: [document],
      citationIndex: buildCitationIndex(document),
      graph,
    });

    expect(report.errors.map((item) => item.code)).toContain(
      "missing_supporting_authority",
    );
  });

  it("accepts an injected citation validator", () => {
    const stub: ICitationValidator = {
      validate(): ValidatorFinding {
        return {
          issues: [
            {
              code: "injected",
              message: "stub",
              severity: "warning",
            },
          ],
          validatedAuthorities: [],
          validatedCitations: [],
          missingAuthorities: [],
        };
      },
    };
    const document = law([validTree()]);
    const graph = createKnowledgeGraph();
    graph.addDocument(document);
    const report = createVerificationEngine({ citationValidator: stub }).verify({
      plan: emptyPlan(),
      documents: [document],
      citationIndex: buildCitationIndex(document),
      graph,
    });
    expect(report.warnings.map((item) => item.code)).toContain("injected");
    expect(report.success).toBe(true);
  });
});
