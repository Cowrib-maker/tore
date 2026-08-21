import { beforeEach, describe, expect, it } from "vitest";

import type { ActorContext } from "@/application/common/actor-context";
import {
  createCaseFileForLawyer,
  getCaseFileForLawyer,
  getCaseReviewForLawyer,
  listCaseFilesForLawyer,
  listCaseReviewsForLawyer,
  openSampleCaseForLawyer,
  rerunCaseAnalysisForLawyer,
  submitManualMappingForLawyer,
  updateCaseFileForLawyer,
  type CaseFileDeps,
} from "@/application/use-cases/case-review";
import { runPersistedCaseAnalysis } from "@/application/use-cases/case-review/deps";
import { CaseFileAnalysisStatus } from "@/domain/entities/case-file";
import { UserRole } from "@/domain/enums";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import {
  canAccessRoute,
  isProtectedAppRoute,
} from "@/domain/services/rbac";
import {
  ConclusionDisposition,
  FactElementRelation,
  LegalDomain,
  MappingMethod,
} from "@/engine/doctrine";
import { InMemoryCaseFileRepository } from "@/infrastructure/repositories/in-memory-case-file-repository";

const lawyerA: ActorContext = { userId: "lawyer-a", role: UserRole.LAWYER };
const lawyerB: ActorContext = { userId: "lawyer-b", role: UserRole.LAWYER };
const client: ActorContext = { userId: "client-1", role: UserRole.CLIENT };

describe("persisted lawyer case files", () => {
  let deps: CaseFileDeps;
  let repository: InMemoryCaseFileRepository;

  beforeEach(() => {
    repository = new InMemoryCaseFileRepository();
    deps = { repository, runAnalysis: runPersistedCaseAnalysis };
  });

  it("protects the cases list as a lawyer-only route", () => {
    expect(isProtectedAppRoute("/lawyer/workspace/cases")).toBe(true);
    expect(canAccessRoute(UserRole.LAWYER, "/lawyer/workspace/cases")).toBe(true);
    expect(canAccessRoute(UserRole.CLIENT, "/lawyer/workspace/cases")).toBe(false);
  });

  it("creates an empty case without inventing facts or running analysis", async () => {
    const file = await createCaseFileForLawyer(
      lawyerA,
      {
        title: "Bayar vehicle sale",
        description: "Intake notes",
        legalDomain: LegalDomain.CIVIL,
        applicableAt: "2024-06-01",
      },
      deps,
    );
    expect(file.ownerLawyerId).toBe(lawyerA.userId);
    expect(file.title).toBe("Bayar vehicle sale");
    expect(file.legalDomain).toBe(LegalDomain.CIVIL);
    expect(file.analysisStatus).toBe(CaseFileAnalysisStatus.NOT_ANALYZED);
    expect(file.review).toBeNull();
    expect(file.lastAnalyzedAt).toBeNull();
    expect(file.request.facts).toEqual([]);
    expect(file.request.evidence).toEqual([]);
    expect(file.facts).toEqual([]);
    expect(file.evidence).toEqual([]);
    expect(file.factEvidenceLinks).toEqual([]);
    expect(file.mappingLog).toEqual([]);
    expect(file.version).toBe(1);

    const payload = await getCaseReviewForLawyer(lawyerA, file.id, deps);
    expect(payload.status).toBe(CaseFileAnalysisStatus.NOT_ANALYZED);
    expect(payload.analyzedAt).toBeNull();
  });

  it("retrieves and updates an owned case", async () => {
    const created = await createCaseFileForLawyer(
      lawyerA,
      { title: "Original", legalDomain: LegalDomain.CIVIL },
      deps,
    );
    const loaded = await getCaseFileForLawyer(lawyerA, created.id, deps);
    expect(loaded.title).toBe("Original");

    const updated = await updateCaseFileForLawyer(
      lawyerA,
      {
        caseId: created.id,
        expectedVersion: created.version,
        title: "Renamed",
        description: "Updated note",
      },
      deps,
    );
    expect(updated.title).toBe("Renamed");
    expect(updated.description).toBe("Updated note");
    expect(updated.version).toBe(created.version + 1);
  });

  it("lists only cases owned by the current lawyer", async () => {
    await createCaseFileForLawyer(
      lawyerA,
      { title: "A1", legalDomain: LegalDomain.CIVIL },
      deps,
    );
    await createCaseFileForLawyer(
      lawyerB,
      { title: "B1", legalDomain: LegalDomain.CRIMINAL },
      deps,
    );
    const listA = await listCaseReviewsForLawyer(lawyerA, deps);
    const listB = await listCaseReviewsForLawyer(lawyerB, deps);
    expect(listA.map((c) => c.title)).toEqual(["A1"]);
    expect(listB.map((c) => c.title)).toEqual(["B1"]);
    expect(await listCaseFilesForLawyer(lawyerA, deps)).toHaveLength(1);
  });

  it("returns 404 for a missing case and 403 for another lawyer or client", async () => {
    const created = await createCaseFileForLawyer(
      lawyerA,
      { title: "Secret", legalDomain: LegalDomain.CIVIL },
      deps,
    );

    await expect(
      getCaseFileForLawyer(lawyerA, "missing-id", deps),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      getCaseFileForLawyer(lawyerB, created.id, deps),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      createCaseFileForLawyer(
        client,
        { title: "Nope", legalDomain: LegalDomain.CIVIL },
        deps,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      listCaseFilesForLawyer(client, deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("persists a MANUAL mapping, re-runs the engine, and keeps an append-only log", async () => {
    const opened = await openSampleCaseForLawyer(
      lawyerA,
      "insufficient-facts",
      deps,
    );
    expect(opened.analyzedAt).toBeTruthy();

    const after = await submitManualMappingForLawyer(
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
    expect(after.version).toBe(opened.version + 1);
    expect(
      after.review.mappings.some((m) => m.method === MappingMethod.MANUAL),
    ).toBe(true);

    const file = await getCaseFileForLawyer(lawyerA, opened.caseId, deps);
    expect(file.mappingLog).toHaveLength(1);
    expect(file.mappingLog[0]?.method).toBe("MANUAL");
    expect(file.mappingLog[0]?.factId).toBe("FACT-003");
    expect(file.mappingLog[0]?.factText.length).toBeGreaterThan(0);
    expect(file.mappingLog[0]?.recordedByUserId).toBe(lawyerA.userId);
    const firstLog = { ...file.mappingLog[0]! };

    const afterSecond = await submitManualMappingForLawyer(
      lawyerA,
      {
        caseId: opened.caseId,
        expectedVersion: after.version,
        factId: "FACT-007",
        elementId: "el:delivery",
        relation: FactElementRelation.SUPPORTS,
        evidenceIds: ["EVID-005"],
      },
      deps,
    );
    expect(afterSecond.status).toBe(ConclusionDisposition.SUPPORTED);

    const logged = await getCaseFileForLawyer(lawyerA, opened.caseId, deps);
    expect(logged.mappingLog).toHaveLength(2);
    expect(logged.mappingLog[0]).toEqual(firstLog);
  });

  it("re-runs analysis against the persisted request and updates lastAnalyzedAt", async () => {
    const opened = await openSampleCaseForLawyer(lawyerA, "supported", deps);
    const before = opened.analyzedAt;
    const rerun = await rerunCaseAnalysisForLawyer(
      lawyerA,
      { caseId: opened.caseId, expectedVersion: opened.version },
      deps,
    );
    expect(rerun.status).toBe(ConclusionDisposition.SUPPORTED);
    expect(rerun.analyzedAt).toBeTruthy();
    expect(rerun.version).toBe(opened.version + 1);
    expect(rerun.analyzedAt).not.toBe(before);
  });

  it("preserves the previous review when re-analysis throws", async () => {
    const opened = await openSampleCaseForLawyer(lawyerA, "supported", deps);
    const failing: CaseFileDeps = {
      repository,
      runAnalysis: async () => {
        throw new Error("engine unavailable");
      },
    };
    const failed = await rerunCaseAnalysisForLawyer(
      lawyerA,
      { caseId: opened.caseId, expectedVersion: opened.version },
      failing,
    );
    expect(failed.status).toBe(CaseFileAnalysisStatus.ANALYSIS_FAILED);
    expect(failed.lastAnalysisError).toMatch(/Previous review was preserved/);
    expect(failed.review.conclusions[0]?.disposition).toBe(
      ConclusionDisposition.SUPPORTED,
    );
  });

  it("rejects a stale version with 409 instead of overwriting", async () => {
    const created = await createCaseFileForLawyer(
      lawyerA,
      { title: "V1", legalDomain: LegalDomain.CIVIL },
      deps,
    );
    await updateCaseFileForLawyer(
      lawyerA,
      { caseId: created.id, expectedVersion: created.version, title: "V2" },
      deps,
    );
    await expect(
      updateCaseFileForLawyer(
        lawyerA,
        { caseId: created.id, expectedVersion: created.version, title: "stale" },
        deps,
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    const current = await getCaseFileForLawyer(lawyerA, created.id, deps);
    expect(current.title).toBe("V2");
  });

  it("rejects a malformed persisted request", async () => {
    const created = await createCaseFileForLawyer(
      lawyerA,
      { title: "Broken", legalDomain: LegalDomain.CIVIL },
      deps,
    );
    await repository.updateIfVersionMatch(created.id, created.version, {
      request: { facts: "nope" } as never,
    });
    await expect(
      getCaseReviewForLawyer(lawyerA, created.id, deps),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
