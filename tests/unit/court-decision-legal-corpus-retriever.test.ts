import { describe, expect, it } from "vitest";

import { CitationVerificationStatus } from "@/application/ai/legal-corpus";
import { KnowledgeDocumentKind } from "@/engine/knowledge";
import { InMemoryKnowledgeRepository } from "@/engine/knowledge/repository";
import type { StoredKnowledgeDocument } from "@/engine/knowledge/types";
import { CourtDecisionLegalCorpusRetriever } from "@/infrastructure/ai/court-decision-legal-corpus-retriever";

function judgmentDocument(input: {
  id: string;
  courtTitle: string;
  caseNumber: string;
  text: string;
  decidedOn: string;
}): StoredKnowledgeDocument {
  const title = `${input.courtTitle} — ${input.caseNumber}`;
  const sourceUrl = `https://shuukh.mn/single_case/${input.id}`;
  return {
    id: input.id,
    sourceId: "shuukh",
    sourceUrl,
    title,
    kind: KnowledgeDocumentKind.HTML,
    metadata: {
      title,
      language: "mn",
      jurisdiction: "MN",
      documentType: "COURT_JUDGMENT",
      sourceUrl,
      articleCount: 1,
      validFrom: input.decidedOn,
      validTo: null,
      sourceVersion: input.caseNumber,
    },
    articles: [
      {
        id: `${input.id}-art`,
        articleNumber: input.caseNumber,
        title,
        text: input.text,
        order: 0,
      },
    ],
    chunks: [],
    ingestedAt: new Date("2026-01-01T00:00:00.000Z"),
    provenance: {
      archiveId: `arch-${input.id}`,
      sha256: `sha-${input.id}`,
      contentSha256: `content-sha-${input.id}`,
      originalUrl: sourceUrl,
      lawId: input.id,
    },
  };
}

async function seededRepository() {
  const repo = new InMemoryKnowledgeRepository();
  const darkhan = judgmentDocument({
    id: "37257",
    courtTitle: "Дархан-Уул аймгийн Иргэний хэргийн давж заалдах шатны шүүх",
    caseNumber: "209/МА2026/00036",
    text: "Дархан-Уул аймгийн шүүхийн магадлал. Нэхэмжлэгчийн шаардлагыг хангах.",
    decidedOn: "2026-07-06",
  });
  const selenge = judgmentDocument({
    id: "37243",
    courtTitle: "Сэлэнгэ аймгийн Эрүү, Иргэний хэргийн давж заалдах шатны шүүх",
    caseNumber: "208/МА2026/00034",
    text: "Сэлэнгэ аймгийн шүүхийн магадлал. Нэхэмжлэлийг хэрэгсэхгvй болгох.",
    decidedOn: "2026-06-01",
  });
  await repo.save(darkhan);
  await repo.save(selenge);
  return repo;
}

describe("CourtDecisionLegalCorpusRetriever", () => {
  it("finds the exact judgment when the question names its case number", async () => {
    const retriever = new CourtDecisionLegalCorpusRetriever(await seededRepository());
    const question =
      "Дархан-Уул аймгийн Иргэний хэргийн давж заалдах шатны шүүхийн 209/МА2026/00036 дугаартай шийдвэрт юу гэж заасан бэ?";
    const result = await retriever.retrieveLegalQuestion({ question, query: question, locator: null });

    expect(result.kind).toBe("retrieved");
    if (result.kind !== "retrieved") return;
    expect(result.authorities).toHaveLength(1);
    expect(result.authorities[0]?.title).toContain("209/МА2026/00036");
    expect(result.authorities[0]?.sourceUrl).toBe("https://shuukh.mn/single_case/37257");
  });

  it("ranks the correctly-named court first, ahead of a different court sharing boilerplate wording", async () => {
    const retriever = new CourtDecisionLegalCorpusRetriever(await seededRepository());
    const question = "Дархан-Уул аймгийн Иргэний хэргийн давж заалдах шатны шүүх ямар шийдвэр гаргасан бэ?";
    const result = await retriever.retrieveLegalQuestion({ question, query: question, locator: null });

    // Both judgments share generic appellate-court boilerplate ("Иргэний
    // хэргийн давж заалдах шатны шүүх"), so a lower-ranked candidate
    // appearing at all is fine — what must hold is that the judgment whose
    // aimag the question actually named ("Дархан-Уул") outranks the one it
    // didn't ("Сэлэнгэ").
    expect(result.kind).toBe("retrieved");
    if (result.kind !== "retrieved") return;
    expect(result.authorities[0]?.title).toContain("Дархан-Уул");
  });

  it("never fabricates a decision for a case number that was not ingested", async () => {
    const retriever = new CourtDecisionLegalCorpusRetriever(await seededRepository());
    const question = "999/ЗЗ9999/99999 дугаартай шийдвэрт юу гэж заасан бэ?";
    const result = await retriever.retrieveLegalQuestion({ question, query: question, locator: null });

    expect(result.kind).toBe("unavailable");
  });

  it("does not false-positive on an ordinary statute question with no court-name overlap", async () => {
    const retriever = new CourtDecisionLegalCorpusRetriever(await seededRepository());
    const question = "Хөдөлмөрийн тухай хуулийн дагуу ажлаас халах журам ямар байдаг вэ?";
    const result = await retriever.retrieveLegalQuestion({ question, query: question, locator: null });

    expect(result.kind).toBe("unavailable");
  });

  it("retrieveExactCitation requires an unambiguous single case-number match", async () => {
    const retriever = new CourtDecisionLegalCorpusRetriever(await seededRepository());
    const exact = await retriever.retrieveExactCitation({
      question: "209/МА2026/00036",
      query: "209/МА2026/00036",
      locator: null,
    });
    expect(exact.kind).toBe("retrieved");

    const missing = await retriever.retrieveExactCitation({
      question: "000/ХХ0000/00000",
      query: "000/ХХ0000/00000",
      locator: null,
    });
    expect(missing.kind).toBe("unavailable");
  });

  it("verifyCitation reports VALID for an ingested case number and UNRESOLVED otherwise", async () => {
    const retriever = new CourtDecisionLegalCorpusRetriever(await seededRepository());

    const valid = await retriever.verifyCitation({ query: "209/МА2026/00036" });
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.verdict.status).toBe(CitationVerificationStatus.VALID);

    const unresolved = await retriever.verifyCitation({ query: "000/ХХ0000/00000" });
    expect(unresolved.ok).toBe(true);
    if (unresolved.ok) expect(unresolved.verdict.status).toBe(CitationVerificationStatus.UNRESOLVED);
  });

  it("skips a candidate with no verified archive provenance rather than citing it", async () => {
    const repo = new InMemoryKnowledgeRepository();
    const unverified = judgmentDocument({
      id: "99999",
      courtTitle: "Дорнод аймгийн Иргэний хэргийн анхан шатны шүүх",
      caseNumber: "100/АА2026/00001",
      text: "Шийдвэрийн агуулга.",
      decidedOn: "2026-01-01",
    });
    unverified.provenance = undefined;
    await repo.save(unverified);

    const retriever = new CourtDecisionLegalCorpusRetriever(repo);
    const result = await retriever.retrieveExactCitation({
      question: "100/АА2026/00001",
      query: "100/АА2026/00001",
      locator: null,
    });
    expect(result.kind).toBe("unavailable");
  });
});
