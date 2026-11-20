import { describe, expect, it } from "vitest";

import { LegalAiService } from "@/application/ai/legal-ai.service";
import { TieredLegalCorpusRetriever } from "@/application/ai/tiered-legal-corpus-retriever";
import { LegalCorpusSource } from "@/application/ai/legal-corpus";
import { KnowledgeDocumentKind } from "@/engine/knowledge";
import { InMemoryKnowledgeRepository } from "@/engine/knowledge/repository";
import type { StoredKnowledgeDocument } from "@/engine/knowledge/types";
import { CourtDecisionLegalCorpusRetriever } from "@/infrastructure/ai/court-decision-legal-corpus-retriever";
import {
  PromptBuilderService,
  RuleBasedDomainFilter,
  UserTypeService,
} from "@/engine/gateway";
import { createIntentEngine } from "@/engine/intent";
import { createReasoningEngine } from "@/engine/reasoning";
import { createLegalRelevanceEngine } from "@/engine/relevance";
import {
  createCompletion,
  createStore,
} from "./support/legal-ai-service-fixtures";

/**
 * End-to-end proof that the court-decision retrieval tier
 * (src/infrastructure/ai/court-decision-legal-corpus-retriever.ts) is
 * genuinely reached by the real chat path (LegalAiService.createTurn),
 * not just unit-correct in isolation (see
 * court-decision-legal-corpus-retriever.test.ts for that). Uses the exact
 * same TieredLegalCorpusRetriever composition createCorpusRetriever() uses
 * in production, backed by an in-memory repository (no real database —
 * safe to run under plain `vitest run`) seeded with a realistic judgment.
 * The completion port is a fixture (no live OpenAI call); this proves
 * retrieval → prompt construction → citation, not model quality.
 */
function judgmentDocument(): StoredKnowledgeDocument {
  const title = "Дархан-Уул аймгийн Иргэний хэргийн давж заалдах шатны шүүх — 209/МА2026/00036";
  const sourceUrl = "https://shuukh.mn/single_case/37257";
  return {
    id: "37257",
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
      validFrom: "2026-07-06",
      validTo: null,
      sourceVersion: "209/МА2026/00036",
    },
    articles: [
      {
        id: "37257-art",
        articleNumber: "209/МА2026/00036",
        title,
        text: "Нэхэмжлэгчийн шаардлагыг бүрэн хангаж, хариуцагчаас 5 сая төгрөг гаргуулахаар шийдвэрлэв.",
        order: 0,
      },
    ],
    chunks: [],
    ingestedAt: new Date("2026-07-06T00:00:00.000Z"),
    provenance: {
      archiveId: "arch-37257",
      sha256: "sha-37257",
      contentSha256: "content-sha-37257",
      originalUrl: sourceUrl,
      lawId: "37257",
    },
  };
}

async function createServiceWithRealCourtRetriever() {
  const repo = new InMemoryKnowledgeRepository();
  await repo.save(judgmentDocument());

  // Same tier composition createCorpusRetriever() uses in production,
  // minus the statute tier (irrelevant here) and the remote/web tiers
  // (not under test) — the court-decision tier is tried first either way.
  const corpusRetriever = new TieredLegalCorpusRetriever([
    {
      retriever: new CourtDecisionLegalCorpusRetriever(repo),
      source: LegalCorpusSource.LOCAL_CORPUS,
    },
  ]);

  const store = createStore();
  const completion = createCompletion();
  const domainFilter = new RuleBasedDomainFilter();
  const intent = createIntentEngine();

  const service = new LegalAiService({
    domainFilter,
    userTypeService: new UserTypeService(),
    promptBuilder: new PromptBuilderService(),
    intent,
    reasoning: createReasoningEngine(),
    legalRelevance: createLegalRelevanceEngine({ domainFilter, intent }),
    store,
    completion,
    corpusRetriever,
  });

  return { service, store, completion, corpusRetriever };
}

describe("LegalAiService — court-decision retrieval reaches the real chat path", () => {
  it("a question naming the court and case number surfaces the real judgment in the model prompt and citations", async () => {
    const { service, completion, store } = await createServiceWithRealCourtRetriever();

    await service.createTurn({
      userId: "user-1",
      message:
        "Дархан-Уул аймгийн Иргэний хэргийн давж заалдах шатны шүүхийн 209/МА2026/00036 дугаартай шийдвэрт юу гэж заасан бэ?",
    });

    expect(completion.complete).toHaveBeenCalledOnce();
    const promptMessages = completion.complete.mock.calls[0]![0];
    const promptText = JSON.stringify(promptMessages);
    expect(promptText).toContain("209/МА2026/00036");
    expect(promptText).toContain("5 сая төгрөг");

    expect(store.citations).toHaveLength(1);
    expect(store.citations[0]?.sourceUrl).toBe("https://shuukh.mn/single_case/37257");
  });

  it("a question naming only the court (no case number) still surfaces the real judgment", async () => {
    const { service, completion } = await createServiceWithRealCourtRetriever();

    await service.createTurn({
      userId: "user-1",
      message: "Дархан-Уул аймгийн Иргэний хэргийн давж заалдах шатны шүүх ямар шийдвэр гаргасан бэ?",
    });

    const promptText = JSON.stringify(completion.complete.mock.calls[0]![0]);
    expect(promptText).toContain("209/МА2026/00036");
  });

  it("a nonexistent case number never fabricates a decision — no citation, missing-source message instead", async () => {
    const { service, completion, store } = await createServiceWithRealCourtRetriever();

    await service.createTurn({
      userId: "user-1",
      message: "999/ЗЗ9999/99999 дугаартай шийдвэрт юу гэж заасан бэ?",
    });

    expect(store.citations).toHaveLength(0);
    const promptText = JSON.stringify(completion.complete.mock.calls[0]![0]);
    expect(promptText).not.toContain("5 сая төгрөг");
  });
});
