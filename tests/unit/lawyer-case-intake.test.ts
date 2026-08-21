import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import type { ActorContext } from "@/application/common/actor-context";
import {
  createCaseEvidenceForLawyer,
  createCaseFactForLawyer,
  createCaseFileForLawyer,
  deleteCaseEvidenceForLawyer,
  deleteCaseFactForLawyer,
  getCaseFileForLawyer,
  getCaseReviewForLawyer,
  linkCaseFactEvidenceForLawyer,
  openSampleCaseForLawyer,
  rerunCaseAnalysisForLawyer,
  unlinkCaseFactEvidenceForLawyer,
  updateCaseEvidenceForLawyer,
  updateCaseFactForLawyer,
  type CaseFileDeps,
} from "@/application/use-cases/case-review";
import { runPersistedCaseAnalysis } from "@/application/use-cases/case-review/deps";
import { CaseReviewSnapshot } from "@/components/case-review/case-review-snapshot";
import {
  CaseEvidenceType,
  CaseFactSourceType,
  CaseFileAnalysisStatus,
  FACT_TEXT_MAX,
} from "@/domain/entities/case-file";
import { UserRole } from "@/domain/enums";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import { ConclusionDisposition, LegalDomain } from "@/engine/doctrine";
import { InMemoryCaseFileRepository } from "@/infrastructure/repositories/in-memory-case-file-repository";

const lawyerA: ActorContext = { userId: "lawyer-a", role: UserRole.LAWYER };
const lawyerB: ActorContext = { userId: "lawyer-b", role: UserRole.LAWYER };
const client: ActorContext = { userId: "client-1", role: UserRole.CLIENT };

function html(payload: Parameters<typeof CaseReviewSnapshot>[0]["payload"]) {
  return renderToStaticMarkup(createElement(CaseReviewSnapshot, { payload }));
}

describe("case fact and evidence intake", () => {
  let deps: CaseFileDeps;
  let repository: InMemoryCaseFileRepository;

  beforeEach(() => {
    repository = new InMemoryCaseFileRepository();
    deps = { repository, runAnalysis: runPersistedCaseAnalysis };
  });

  async function emptyCase() {
    return createCaseFileForLawyer(
      lawyerA,
      { title: "Intake case", legalDomain: LegalDomain.CIVIL },
      deps,
    );
  }

  it("creates, updates, and deletes a fact and syncs the analysis request", async () => {
    const created = await emptyCase();
    const afterCreate = await createCaseFactForLawyer(
      lawyerA,
      {
        caseId: created.id,
        expectedVersion: created.version,
        text: "  Buyer paid 12 million MNT.  ",
        sourceType: CaseFactSourceType.MANUAL,
      },
      deps,
    );
    expect(afterCreate.caseFacts).toHaveLength(1);
    expect(afterCreate.caseFacts[0]?.text).toBe("Buyer paid 12 million MNT.");
    expect(afterCreate.caseFacts[0]?.sourceType).toBe(CaseFactSourceType.MANUAL);
    expect(afterCreate.version).toBe(created.version + 1);

    const file = await getCaseFileForLawyer(lawyerA, created.id, deps);
    expect(file.request.facts).toHaveLength(1);
    expect(file.request.facts[0]?.statement).toBe("Buyer paid 12 million MNT.");
    expect(file.request.facts[0]?.elementId).toBeNull();
    expect(file.request.mappings ?? []).toEqual([]);
    expect(file.facts[0]?.createdByUserId).toBe(lawyerA.userId);

    const afterUpdate = await updateCaseFactForLawyer(
      lawyerA,
      {
        caseId: created.id,
        expectedVersion: afterCreate.version,
        factId: afterCreate.caseFacts[0]!.id,
        text: "Buyer paid 12 million MNT in cash.",
        sourceType: CaseFactSourceType.DOCUMENT,
        sourceReference: "note-1",
      },
      deps,
    );
    expect(afterUpdate.caseFacts[0]?.text).toBe(
      "Buyer paid 12 million MNT in cash.",
    );
    expect(afterUpdate.caseFacts[0]?.sourceType).toBe(
      CaseFactSourceType.DOCUMENT,
    );

    const afterDelete = await deleteCaseFactForLawyer(
      lawyerA,
      {
        caseId: created.id,
        expectedVersion: afterUpdate.version,
        factId: afterUpdate.caseFacts[0]!.id,
      },
      deps,
    );
    expect(afterDelete.caseFacts).toEqual([]);
    const cleared = await getCaseFileForLawyer(lawyerA, created.id, deps);
    expect(cleared.request.facts).toEqual([]);
  });

  it("rejects empty or excessively long fact text", async () => {
    const created = await emptyCase();
    await expect(
      createCaseFactForLawyer(
        lawyerA,
        { caseId: created.id, expectedVersion: created.version, text: "   " },
        deps,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      createCaseFactForLawyer(
        lawyerA,
        {
          caseId: created.id,
          expectedVersion: created.version,
          text: "x".repeat(FACT_TEXT_MAX + 1),
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("creates, updates, and deletes evidence metadata without a file upload", async () => {
    const created = await emptyCase();
    const afterCreate = await createCaseEvidenceForLawyer(
      lawyerA,
      {
        caseId: created.id,
        expectedVersion: created.version,
        title: "Bank transfer receipt",
        description: "June 1 payment",
        evidenceType: CaseEvidenceType.DOCUMENT,
        sourceReference: "receipt-22",
      },
      deps,
    );
    expect(afterCreate.caseEvidence).toHaveLength(1);
    expect(afterCreate.caseEvidence[0]?.title).toBe("Bank transfer receipt");
    expect(afterCreate.caseEvidence[0]?.fileReference).toBeNull();
    expect(afterCreate.caseEvidence[0]?.evidenceType).toBe(
      CaseEvidenceType.DOCUMENT,
    );

    const afterUpdate = await updateCaseEvidenceForLawyer(
      lawyerA,
      {
        caseId: created.id,
        expectedVersion: afterCreate.version,
        evidenceId: afterCreate.caseEvidence[0]!.id,
        title: "Receipt of payment",
        evidenceType: CaseEvidenceType.RECORD,
      },
      deps,
    );
    expect(afterUpdate.caseEvidence[0]?.title).toBe("Receipt of payment");
    expect(afterUpdate.caseEvidence[0]?.evidenceType).toBe(
      CaseEvidenceType.RECORD,
    );

    const afterDelete = await deleteCaseEvidenceForLawyer(
      lawyerA,
      {
        caseId: created.id,
        expectedVersion: afterUpdate.version,
        evidenceId: afterUpdate.caseEvidence[0]!.id,
      },
      deps,
    );
    expect(afterDelete.caseEvidence).toEqual([]);
  });

  it("rejects missing title or unknown evidence type", async () => {
    const created = await emptyCase();
    await expect(
      createCaseEvidenceForLawyer(
        lawyerA,
        {
          caseId: created.id,
          expectedVersion: created.version,
          title: "  ",
          evidenceType: CaseEvidenceType.PHOTO,
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      createCaseEvidenceForLawyer(
        lawyerA,
        {
          caseId: created.id,
          expectedVersion: created.version,
          title: "Photo",
          evidenceType: "DNA",
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("links and unlinks evidence to facts, including many-to-many", async () => {
    const created = await emptyCase();
    const withFactA = await createCaseFactForLawyer(
      lawyerA,
      {
        caseId: created.id,
        expectedVersion: created.version,
        text: "Fact A",
      },
      deps,
    );
    const withFactB = await createCaseFactForLawyer(
      lawyerA,
      {
        caseId: created.id,
        expectedVersion: withFactA.version,
        text: "Fact B",
      },
      deps,
    );
    const withEv1 = await createCaseEvidenceForLawyer(
      lawyerA,
      {
        caseId: created.id,
        expectedVersion: withFactB.version,
        title: "Exhibit 1",
        evidenceType: CaseEvidenceType.PHOTO,
      },
      deps,
    );
    const withEv2 = await createCaseEvidenceForLawyer(
      lawyerA,
      {
        caseId: created.id,
        expectedVersion: withEv1.version,
        title: "Exhibit 2",
        evidenceType: CaseEvidenceType.TESTIMONY,
      },
      deps,
    );
    const factA = withFactB.caseFacts.find((f) => f.text === "Fact A")!.id;
    const factB = withFactB.caseFacts.find((f) => f.text === "Fact B")!.id;
    const ev1 = withEv2.caseEvidence.find((e) => e.title === "Exhibit 1")!.id;
    const ev2 = withEv2.caseEvidence.find((e) => e.title === "Exhibit 2")!.id;

    const linkedA1 = await linkCaseFactEvidenceForLawyer(
      lawyerA,
      {
        caseId: created.id,
        expectedVersion: withEv2.version,
        factId: factA,
        evidenceId: ev1,
      },
      deps,
    );
    const linkedA2 = await linkCaseFactEvidenceForLawyer(
      lawyerA,
      {
        caseId: created.id,
        expectedVersion: linkedA1.version,
        factId: factA,
        evidenceId: ev2,
      },
      deps,
    );
    const linkedBoth = await linkCaseFactEvidenceForLawyer(
      lawyerA,
      {
        caseId: created.id,
        expectedVersion: linkedA2.version,
        factId: factB,
        evidenceId: ev1,
      },
      deps,
    );

    const factAView = linkedBoth.caseFacts.find((f) => f.id === factA)!;
    const ev1View = linkedBoth.caseEvidence.find((e) => e.id === ev1)!;
    expect(factAView.evidenceIds.sort()).toEqual([ev1, ev2].sort());
    expect(ev1View.factIds.sort()).toEqual([factA, factB].sort());

    const file = await getCaseFileForLawyer(lawyerA, created.id, deps);
    expect(file.request.evidence.filter((e) => e.id === ev1)).toHaveLength(2);
    expect(file.request.evidence.some((e) => e.factId === factA && e.id === ev1)).toBe(
      true,
    );
    expect(file.request.evidence.some((e) => e.factId === factB && e.id === ev1)).toBe(
      true,
    );

    const unlinked = await unlinkCaseFactEvidenceForLawyer(
      lawyerA,
      {
        caseId: created.id,
        expectedVersion: linkedBoth.version,
        factId: factA,
        evidenceId: ev1,
      },
      deps,
    );
    expect(
      unlinked.caseFacts.find((f) => f.id === factA)?.evidenceIds,
    ).toEqual([ev2]);
    expect(
      unlinked.caseEvidence.find((e) => e.id === ev1)?.factIds,
    ).toEqual([factB]);
  });

  it("rejects intake by another lawyer, a client, or a missing case", async () => {
    const created = await emptyCase();
    await expect(
      createCaseFactForLawyer(
        lawyerB,
        {
          caseId: created.id,
          expectedVersion: created.version,
          text: "Stolen fact",
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createCaseEvidenceForLawyer(
        client,
        {
          caseId: created.id,
          expectedVersion: created.version,
          title: "Stolen exhibit",
          evidenceType: CaseEvidenceType.OTHER,
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createCaseFactForLawyer(
        lawyerA,
        {
          caseId: "missing-case",
          expectedVersion: 1,
          text: "Gone",
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a stale version instead of overwriting facts", async () => {
    const created = await emptyCase();
    await createCaseFactForLawyer(
      lawyerA,
      {
        caseId: created.id,
        expectedVersion: created.version,
        text: "First write",
      },
      deps,
    );
    await expect(
      createCaseFactForLawyer(
        lawyerA,
        {
          caseId: created.id,
          expectedVersion: created.version,
          text: "Stale write",
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    const current = await getCaseFileForLawyer(lawyerA, created.id, deps);
    expect(current.facts.map((f) => f.text)).toEqual(["First write"]);
  });

  it("re-runs analysis against persisted facts and evidence", async () => {
    const opened = await openSampleCaseForLawyer(lawyerA, "supported", deps);
    const added = await createCaseFactForLawyer(
      lawyerA,
      {
        caseId: opened.caseId,
        expectedVersion: opened.version,
        text: "Buyer also paid a cash deposit.",
      },
      deps,
    );
    expect(added.status).toBe(ConclusionDisposition.SUPPORTED);
    expect(
      added.review.facts.some((f) => f.statement.includes("cash deposit")),
    ).toBe(false);

    const rerun = await rerunCaseAnalysisForLawyer(
      lawyerA,
      { caseId: opened.caseId, expectedVersion: added.version },
      deps,
    );
    const file = await getCaseFileForLawyer(lawyerA, opened.caseId, deps);
    expect(file.request.facts.some((f) => f.statement.includes("cash deposit"))).toBe(
      true,
    );
    expect(
      rerun.review.facts.some((f) => f.statement.includes("cash deposit")),
    ).toBe(true);
    expect(rerun.review.conclusions[0]?.disposition).toBe(
      ConclusionDisposition.SUPPORTED,
    );
  });

  it("preserves the previous review when analysis fails after intake", async () => {
    const opened = await openSampleCaseForLawyer(lawyerA, "supported", deps);
    const added = await createCaseFactForLawyer(
      lawyerA,
      {
        caseId: opened.caseId,
        expectedVersion: opened.version,
        text: "A later disputed payment.",
      },
      deps,
    );
    const failing: CaseFileDeps = {
      repository,
      runAnalysis: async () => {
        throw new Error("engine unavailable");
      },
    };
    const failed = await rerunCaseAnalysisForLawyer(
      lawyerA,
      { caseId: added.caseId, expectedVersion: added.version },
      failing,
    );
    expect(failed.status).toBe(CaseFileAnalysisStatus.ANALYSIS_FAILED);
    expect(failed.review.conclusions[0]?.disposition).toBe(
      ConclusionDisposition.SUPPORTED,
    );
    const file = await getCaseFileForLawyer(lawyerA, opened.caseId, deps);
    expect(file.request.facts.some((f) => f.statement.includes("disputed"))).toBe(
      true,
    );
    expect(file.mappingLog).toEqual([]);
  });

  it("does not calculate a legal disposition in the browser snapshot", async () => {
    const opened = await openSampleCaseForLawyer(lawyerA, "supported", deps);
    const markup = html(opened);
    expect(markup).toContain('data-testid="intake-facts-panel"');
    expect(markup).toContain('data-testid="intake-evidence-panel"');
    expect(markup).toContain('data-testid="conclusion-disposition"');
    expect(markup).toContain(ConclusionDisposition.SUPPORTED);

    const here = dirname(fileURLToPath(import.meta.url));
    const workspaceSrc = readFileSync(
      join(here, "../../src/components/case-review/case-review-workspace.tsx"),
      "utf8",
    );
    const snapshotSrc = readFileSync(
      join(here, "../../src/components/case-review/case-review-snapshot.tsx"),
      "utf8",
    );
    for (const src of [workspaceSrc, snapshotSrc]) {
      expect(src).not.toMatch(/analyzeCase|DefaultSubsumptionEngine|applySubsumption/);
    }
  });

  it("does not invent element mappings when a fact is added", async () => {
    const created = await emptyCase();
    const after = await createCaseFactForLawyer(
      lawyerA,
      {
        caseId: created.id,
        expectedVersion: created.version,
        text: "Seller delivered the vehicle.",
      },
      deps,
    );
    const review = await getCaseReviewForLawyer(lawyerA, created.id, deps);
    expect(review.status).toBe(CaseFileAnalysisStatus.NOT_ANALYZED);
    expect(after.review.mappings).toEqual([]);
    expect(after.review.conclusions).toEqual([]);
  });
});
