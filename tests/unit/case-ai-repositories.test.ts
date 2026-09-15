import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryCaseAiAnalysisRepository } from "@/infrastructure/repositories/in-memory-case-ai-analysis-repository";
import { InMemoryCaseTimelineRepository } from "@/infrastructure/repositories/in-memory-case-timeline-repository";
import { InMemoryCaseDraftRepository } from "@/infrastructure/repositories/in-memory-case-draft-repository";
import { CaseDraftType } from "@/domain/entities/case-draft";

describe("InMemoryCaseAiAnalysisRepository", () => {
  let repo: InMemoryCaseAiAnalysisRepository;

  beforeEach(() => {
    repo = new InMemoryCaseAiAnalysisRepository();
  });

  it("returns null from findLatestByCaseFileId for a case with no rows", async () => {
    expect(await repo.findLatestByCaseFileId("case-none")).toBeNull();
  });

  it("never returns another case's analysis from findLatestByCaseFileId", async () => {
    await repo.create({
      caseFileId: "case-b",
      createdByUserId: "lawyer-a",
      status: "OK",
      sections: null as never,
      citations: [],
      provider: "OPENAI",
      model: "test",
    });
    expect(await repo.findLatestByCaseFileId("case-a")).toBeNull();
  });

  it("listByCaseFileId scopes strictly to the given case and orders newest first", async () => {
    const first = await repo.create({
      caseFileId: "case-a",
      createdByUserId: "lawyer-a",
      status: "FAILED",
      failureReason: "first",
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await repo.create({
      caseFileId: "case-a",
      createdByUserId: "lawyer-a",
      status: "FAILED",
      failureReason: "second",
    });
    await repo.create({
      caseFileId: "case-b",
      createdByUserId: "lawyer-a",
      status: "FAILED",
      failureReason: "other case",
    });
    const list = await repo.listByCaseFileId("case-a");
    expect(list.map((r) => r.id)).toEqual([second.id, first.id]);
  });

  it("stores citations on an OK row and nothing on a FAILED row", async () => {
    const ok = await repo.create({
      caseFileId: "case-a",
      createdByUserId: "lawyer-a",
      status: "OK",
      sections: null as never,
      citations: [
        {
          citationType: "USER_DOCUMENT",
          title: "Doc",
          reference: null,
          excerpt: "x",
          sourceUrl: null,
          sourceType: null,
          documentId: null,
          documentVersionId: null,
          nodeId: null,
          caseEvidenceId: "ev-1",
        },
      ],
      provider: "OPENAI",
      model: "test",
    });
    expect(ok.citations).toHaveLength(1);
    const failed = await repo.create({
      caseFileId: "case-a",
      createdByUserId: "lawyer-a",
      status: "FAILED",
      failureReason: "x",
    });
    expect(failed.citations).toEqual([]);
    expect(failed.sections).toBeNull();
  });
});

describe("InMemoryCaseTimelineRepository", () => {
  let repo: InMemoryCaseTimelineRepository;

  beforeEach(() => {
    repo = new InMemoryCaseTimelineRepository();
  });

  it("replaceForCaseFile only removes rows belonging to the given case", async () => {
    await repo.replaceForCaseFile("case-a", [
      {
        caseFileId: "case-a",
        caseEvidenceId: "ev-a",
        rawDateText: "2024-01-01",
        parsedDate: new Date("2024-01-01"),
        eventText: "a",
        sourceExcerpt: "a",
        confidence: "HIGH",
      },
    ]);
    await repo.replaceForCaseFile("case-b", [
      {
        caseFileId: "case-b",
        caseEvidenceId: "ev-b",
        rawDateText: "2024-02-02",
        parsedDate: new Date("2024-02-02"),
        eventText: "b",
        sourceExcerpt: "b",
        confidence: "HIGH",
      },
    ]);
    // Re-running case-a's extraction (e.g. with zero results) must not
    // touch case-b's rows.
    await repo.replaceForCaseFile("case-a", []);
    expect(await repo.listByCaseFileId("case-a")).toEqual([]);
    expect(await repo.listByCaseFileId("case-b")).toHaveLength(1);
  });

  it("orders entries by parsedDate ascending, nulls last", async () => {
    await repo.replaceForCaseFile("case-a", [
      {
        caseFileId: "case-a",
        caseEvidenceId: "ev-a",
        rawDateText: "2024 онд",
        parsedDate: null,
        eventText: "uncertain",
        sourceExcerpt: "x",
        confidence: "UNCERTAIN",
      },
      {
        caseFileId: "case-a",
        caseEvidenceId: "ev-a",
        rawDateText: "2024-01-01",
        parsedDate: new Date("2024-01-01"),
        eventText: "early",
        sourceExcerpt: "x",
        confidence: "HIGH",
      },
    ]);
    const list = await repo.listByCaseFileId("case-a");
    expect(list.map((e) => e.eventText)).toEqual(["early", "uncertain"]);
  });
});

describe("InMemoryCaseDraftRepository", () => {
  let repo: InMemoryCaseDraftRepository;

  beforeEach(() => {
    repo = new InMemoryCaseDraftRepository();
  });

  it("never returns another case's drafts from listByCaseFileId", async () => {
    await repo.create({
      caseFileId: "case-b",
      draftType: CaseDraftType.LAWYER_POSITION,
      createdByUserId: "lawyer-a",
      status: "FAILED",
      failureReason: "x",
    });
    expect(await repo.listByCaseFileId("case-a")).toEqual([]);
  });

  it("orders drafts newest first", async () => {
    const first = await repo.create({
      caseFileId: "case-a",
      draftType: CaseDraftType.LAWYER_POSITION,
      createdByUserId: "lawyer-a",
      status: "FAILED",
      failureReason: "first",
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await repo.create({
      caseFileId: "case-a",
      draftType: CaseDraftType.LAWYER_POSITION,
      createdByUserId: "lawyer-a",
      status: "FAILED",
      failureReason: "second",
    });
    const list = await repo.listByCaseFileId("case-a");
    expect(list.map((d) => d.id)).toEqual([second.id, first.id]);
  });
});
