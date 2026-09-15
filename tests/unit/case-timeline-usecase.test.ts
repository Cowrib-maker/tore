import { beforeEach, describe, expect, it } from "vitest";

import type { ActorContext } from "@/application/common/actor-context";
import { createCaseFileForLawyer } from "@/application/use-cases/case-review";
import { createCaseEvidenceForLawyer } from "@/application/use-cases/case-review/intake";
import type { CaseFileDeps } from "@/application/use-cases/case-review/deps";
import { runPersistedCaseAnalysis } from "@/application/use-cases/case-review/deps";
import {
  extractCaseTimelineForLawyer,
  listCaseTimelineForLawyer,
  type CaseTimelineDeps,
} from "@/application/use-cases/case-review/case-timeline";
import { UserRole } from "@/domain/enums";
import { LegalDomain } from "@/engine/doctrine";
import { ForbiddenError, NotFoundError } from "@/domain/errors/domain-error";
import { InMemoryCaseFileRepository } from "@/infrastructure/repositories/in-memory-case-file-repository";
import { InMemoryCaseTimelineRepository } from "@/infrastructure/repositories/in-memory-case-timeline-repository";

const lawyerA: ActorContext = { userId: "lawyer-a", role: UserRole.LAWYER };
const lawyerB: ActorContext = { userId: "lawyer-b", role: UserRole.LAWYER };

describe("case timeline use-case", () => {
  let caseFileRepository: InMemoryCaseFileRepository;
  let timelineRepository: InMemoryCaseTimelineRepository;
  let caseDeps: CaseFileDeps;
  let deps: CaseTimelineDeps;

  beforeEach(() => {
    caseFileRepository = new InMemoryCaseFileRepository();
    timelineRepository = new InMemoryCaseTimelineRepository();
    caseDeps = { repository: caseFileRepository, runAnalysis: runPersistedCaseAnalysis };
    deps = { caseFileRepository, timelineRepository };
  });

  async function ownedCase(actor = lawyerA, title = "Гэрээний маргаан") {
    return createCaseFileForLawyer(actor, { title, legalDomain: LegalDomain.CIVIL }, caseDeps);
  }

  it("extracts and persists timeline entries from case evidence", async () => {
    const file = await ownedCase();
    await createCaseEvidenceForLawyer(
      lawyerA,
      {
        caseId: file.id,
        expectedVersion: file.version,
        title: "Нэхэмжлэл.pdf",
        evidenceType: "DOCUMENT",
        extraction: {
          extractedText: "2024 оны 1 дүгээр сарын 10-нд нэхэмжлэл гаргасан байна.",
          extractStatus: "OK",
          pageCount: 1,
        },
      },
      caseDeps,
    );

    const entries = await extractCaseTimelineForLawyer(lawyerA, file.id, deps);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.confidence).toBe("HIGH");

    const listed = await listCaseTimelineForLawyer(lawyerA, file.id, deps);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(entries[0]?.id);
  });

  it("replaces the previous timeline rather than accumulating duplicates on re-run", async () => {
    const file = await ownedCase();
    await createCaseEvidenceForLawyer(
      lawyerA,
      {
        caseId: file.id,
        expectedVersion: file.version,
        title: "Нэхэмжлэл.pdf",
        evidenceType: "DOCUMENT",
        extraction: {
          extractedText: "2024 оны 1 дүгээр сарын 10-нд нэхэмжлэл гаргасан.",
          extractStatus: "OK",
          pageCount: 1,
        },
      },
      caseDeps,
    );

    await extractCaseTimelineForLawyer(lawyerA, file.id, deps);
    const second = await extractCaseTimelineForLawyer(lawyerA, file.id, deps);
    expect(second).toHaveLength(1);
    const listed = await listCaseTimelineForLawyer(lawyerA, file.id, deps);
    expect(listed).toHaveLength(1);
  });

  it("returns an empty timeline for a case with no evidence", async () => {
    const file = await ownedCase();
    const entries = await extractCaseTimelineForLawyer(lawyerA, file.id, deps);
    expect(entries).toEqual([]);
  });

  it("rejects extraction for a case the actor does not own", async () => {
    const file = await ownedCase(lawyerA);
    await expect(extractCaseTimelineForLawyer(lawyerB, file.id, deps)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("rejects extraction for a nonexistent case", async () => {
    await expect(
      extractCaseTimelineForLawyer(lawyerA, "does-not-exist", deps),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("never includes another case's evidence dates in this case's timeline", async () => {
    const fileA = await ownedCase(lawyerA, "Case A");
    const fileB = await ownedCase(lawyerA, "Case B");
    await createCaseEvidenceForLawyer(
      lawyerA,
      {
        caseId: fileB.id,
        expectedVersion: fileB.version,
        title: "B.pdf",
        evidenceType: "DOCUMENT",
        extraction: {
          extractedText: "2030 оны 9 дүгээр сарын 9-нд Б хэргийн үйл явдал болсон.",
          extractStatus: "OK",
          pageCount: 1,
        },
      },
      caseDeps,
    );

    const entriesA = await extractCaseTimelineForLawyer(lawyerA, fileA.id, deps);
    expect(entriesA).toEqual([]);
    const entriesB = await extractCaseTimelineForLawyer(lawyerA, fileB.id, deps);
    expect(entriesB).toHaveLength(1);
  });

  it("rejects listing the timeline for a case the actor does not own", async () => {
    const file = await ownedCase(lawyerA);
    await expect(listCaseTimelineForLawyer(lawyerB, file.id, deps)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
