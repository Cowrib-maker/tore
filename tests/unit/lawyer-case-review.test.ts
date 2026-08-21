import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import type { ActorContext } from "@/application/common/actor-context";
import {
  getCaseReviewForLawyer,
  listCaseReviewsForLawyer,
  openSampleCaseForLawyer,
  submitManualMappingForLawyer,
  type CaseFileDeps,
} from "@/application/use-cases/case-review";
import { runPersistedCaseAnalysis } from "@/application/use-cases/case-review/deps";
import {
  blockingElements,
  isAuthoritativeRule,
  isCaseAnalysisReview,
  relatedHighlightIds,
  reviewErrorState,
  reviewTraceId,
  validateManualMapping,
} from "@/application/use-cases/case-review/view-model";
import { CaseReviewSnapshot } from "@/components/case-review/case-review-snapshot";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import {
  canAccessRoute,
  isProtectedAppRoute,
} from "@/domain/services/rbac";
import {
  ConclusionDisposition,
  FactElementRelation,
  MappingMethod,
} from "@/engine/doctrine";
import { InMemoryCaseFileRepository } from "@/infrastructure/repositories/in-memory-case-file-repository";

const lawyerA: ActorContext = { userId: "lawyer-a", role: UserRole.LAWYER };
const lawyerB: ActorContext = { userId: "lawyer-b", role: UserRole.LAWYER };
const client: ActorContext = { userId: "client-1", role: UserRole.CLIENT };

function html(payload: Parameters<typeof CaseReviewSnapshot>[0]["payload"]) {
  return renderToStaticMarkup(createElement(CaseReviewSnapshot, { payload }));
}

describe("lawyer case review workspace", () => {
  let deps: CaseFileDeps;

  beforeEach(() => {
    deps = {
      repository: new InMemoryCaseFileRepository(),
      runAnalysis: runPersistedCaseAnalysis,
    };
  });

  it("protects /lawyer/workspace/case-review as a lawyer-only route", () => {
    expect(isProtectedAppRoute("/lawyer/workspace/case-review")).toBe(true);
    expect(canAccessRoute(UserRole.LAWYER, "/lawyer/workspace/case-review")).toBe(
      true,
    );
    expect(canAccessRoute(UserRole.CLIENT, "/lawyer/workspace/case-review")).toBe(
      false,
    );
  });

  it("renders the supported review: header, source, elements, mappings, conclusion", async () => {
    const payload = await openSampleCaseForLawyer(lawyerA, "supported", deps);
    const markup = html(payload);

    expect(markup).toContain(payload.title);
    expect(markup).toContain("CIVIL");
    expect(markup).toContain("2024-06-01");
    expect(markup).toContain("SUPPORTED");
    expect(markup).toContain("Open official source");
    expect(markup).toContain("Civil Code of Mongolia — Article 15");
    expect(markup).toContain("15");
    expect(markup).toContain("a valid contract exists");
    expect(markup).toContain("the thing is delivered");
    expect(markup).toContain("FACT-003");
    expect(markup).toContain("FACT-007");
    expect(markup).toContain("EVID-002");
    expect(markup).not.toContain("Ask AI");
    expect(payload.review.elements.every((el) => el.status === "SATISFIED")).toBe(
      true,
    );
    expect(payload.review.conclusions[0]?.disposition).toBe(
      ConclusionDisposition.SUPPORTED,
    );
  });

  it("highlights downstream nodes when an issue is selected", async () => {
    const payload = await openSampleCaseForLawyer(lawyerA, "supported", deps);
    const issueId = payload.review.issues[0]!.id;
    const ids = relatedHighlightIds(payload.review, {
      kind: "ISSUE",
      id: issueId,
    });
    expect(ids.has(reviewTraceId("ISSUE", issueId))).toBe(true);
    expect(ids.has(reviewTraceId("RULE", payload.review.rules[0]!.id))).toBe(
      true,
    );
    expect(
      ids.has(reviewTraceId("ELEMENT", payload.review.elements[0]!.id)),
    ).toBe(true);
    expect(ids.has(reviewTraceId("FACT", "FACT-003"))).toBe(true);
    expect(ids.has(reviewTraceId("CONCLUSION", "SUPPORTED"))).toBe(true);

    const markup = renderToStaticMarkup(
      createElement(CaseReviewSnapshot, {
        payload,
        selectedIssueId: issueId,
        selection: { kind: "ISSUE", id: issueId },
      }),
    );
    expect(markup).toContain('data-highlighted="true"');
  });

  it("highlights related facts and mappings when an element is selected", async () => {
    const payload = await openSampleCaseForLawyer(lawyerA, "supported", deps);
    const elementId = "el:contract";
    const ids = relatedHighlightIds(payload.review, {
      kind: "ELEMENT",
      id: elementId,
    });
    expect(ids.has(reviewTraceId("ELEMENT", elementId))).toBe(true);
    expect(ids.has(reviewTraceId("FACT", "FACT-003"))).toBe(true);
    expect(ids.has(reviewTraceId("EVIDENCE", "EVID-002"))).toBe(true);
    expect([...ids].some((id) => id.startsWith("MAPPING:"))).toBe(true);
  });

  it("renders UNSUPPORTED when no rule was retrieved", async () => {
    const payload = await openSampleCaseForLawyer(lawyerA, "unsupported", deps);
    expect(payload.status).toBe(ConclusionDisposition.UNSUPPORTED);
    expect(reviewErrorState(payload.review)).toBe("no-rule");
    const markup = html(payload);
    expect(markup).toContain("error-no-rule");
    expect(markup).toContain("No retrieved rule");
    expect(markup).toContain("UNSUPPORTED");
  });

  it("renders INSUFFICIENT_FACTS and blocking elements", async () => {
    const payload = await openSampleCaseForLawyer(
      lawyerA,
      "insufficient-facts",
      deps,
    );
    expect(payload.status).toBe(ConclusionDisposition.INSUFFICIENT_FACTS);
    expect(reviewErrorState(payload.review)).toBe("insufficient-facts");
    const blockers = blockingElements(payload.review);
    expect(blockers.length).toBeGreaterThan(0);
    const markup = html(payload);
    expect(markup).toContain("INSUFFICIENT_FACTS");
    expect(markup).toContain("blocking-elements");
    expect(markup).toContain("el:contract");
  });

  it("renders CONFLICTING_AUTHORITY without inventing a winner", async () => {
    const payload = await openSampleCaseForLawyer(
      lawyerA,
      "conflicting-authority",
      deps,
    );
    expect(payload.status).toBe(ConclusionDisposition.CONFLICTING_AUTHORITY);
    expect(reviewErrorState(payload.review)).toBe("conflicting-authority");
    expect(payload.review.rules.length).toBeGreaterThanOrEqual(2);
    const markup = html(payload);
    expect(markup).toContain("CONFLICTING_AUTHORITY");
    expect(markup).toContain("error-conflicting-authority");
  });

  it("does not treat a PARTIAL rule as authoritative", () => {
    expect(
      isAuthoritativeRule({
        id: "r1",
        statement: "guess",
        sourceId: null,
        sourceUrl: null,
        legalDocumentId: null,
        articleId: null,
        articleNumber: null,
        supportStatus: "PARTIAL",
      }),
    ).toBe(false);
  });

  it("validates manual mapping input", async () => {
    const payload = await openSampleCaseForLawyer(
      lawyerA,
      "insufficient-facts",
      deps,
    );
    expect(
      validateManualMapping(payload.review, {
        factId: "",
        elementId: "el:contract",
        relation: FactElementRelation.SUPPORTS,
      }).ok,
    ).toBe(false);
    expect(
      validateManualMapping(payload.review, {
        factId: "FACT-003",
        elementId: "",
        relation: FactElementRelation.SUPPORTS,
      }).ok,
    ).toBe(false);
    expect(
      validateManualMapping(payload.review, {
        factId: "missing",
        elementId: "el:contract",
        relation: FactElementRelation.SUPPORTS,
      }).ok,
    ).toBe(false);
    expect(
      validateManualMapping(payload.review, {
        factId: "FACT-003",
        elementId: "el:contract",
        relation: "MAYBE",
      }).ok,
    ).toBe(false);
    expect(
      validateManualMapping(payload.review, {
        factId: "FACT-003",
        elementId: "el:contract",
        relation: FactElementRelation.SUPPORTS,
        evidenceIds: ["EVID-005"],
      }).ok,
    ).toBe(false);
    expect(
      validateManualMapping(payload.review, {
        factId: "FACT-003",
        elementId: "el:contract",
        relation: FactElementRelation.SUPPORTS,
        evidenceIds: ["EVID-002"],
      }).ok,
    ).toBe(true);
  });

  it("creates a MANUAL mapping and re-runs the engine instead of editing the conclusion", async () => {
    const opened = await openSampleCaseForLawyer(
      lawyerA,
      "insufficient-facts",
      deps,
    );
    expect(opened.status).toBe(ConclusionDisposition.INSUFFICIENT_FACTS);

    const afterFirst = await submitManualMappingForLawyer(
      lawyerA,
      {
        caseId: opened.caseId,
        expectedVersion: opened.version,
        factId: "FACT-003",
        elementId: "el:contract",
        relation: FactElementRelation.SUPPORTS,
        evidenceIds: ["EVID-002"],
      },
      deps,
    );
    const manual = afterFirst.review.mappings.filter(
      (m) => m.method === MappingMethod.MANUAL,
    );
    expect(manual.length).toBeGreaterThan(0);
    expect(manual[0]?.factId).toBe("FACT-003");
    expect(manual[0]?.elementId).toBe("el:contract");
    expect(html(afterFirst)).toContain('data-manual="true"');

    const afterBoth = await submitManualMappingForLawyer(
      lawyerA,
      {
        caseId: opened.caseId,
        expectedVersion: afterFirst.version,
        factId: "FACT-007",
        elementId: "el:delivery",
        relation: FactElementRelation.SUPPORTS,
        evidenceIds: ["EVID-005"],
      },
      deps,
    );
    expect(afterBoth.status).toBe(ConclusionDisposition.SUPPORTED);
    expect(afterBoth.review.conclusions[0]?.disposition).toBe(
      ConclusionDisposition.SUPPORTED,
    );
  });

  it("rejects unauthorized roles and other lawyers", async () => {
    const opened = await openSampleCaseForLawyer(lawyerA, "supported", deps);

    await expect(
      openSampleCaseForLawyer(client, "supported", deps),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(listCaseReviewsForLawyer(client, deps)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      getCaseReviewForLawyer(client, opened.caseId, deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      getCaseReviewForLawyer(lawyerB, opened.caseId, deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      submitManualMappingForLawyer(
        lawyerB,
        {
          caseId: opened.caseId,
          expectedVersion: opened.version,
          factId: "FACT-003",
          elementId: "el:contract",
          relation: FactElementRelation.SUPPORTS,
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a malformed review payload", () => {
    expect(isCaseAnalysisReview(null)).toBe(false);
    expect(isCaseAnalysisReview({})).toBe(false);
    expect(
      isCaseAnalysisReview({
        issues: [],
        rules: [],
        tests: [],
        elements: [],
        facts: [],
        evidence: [],
        mappings: [],
        subsumption: [],
        conclusions: [],
      }),
    ).toBe(true);
  });
});
