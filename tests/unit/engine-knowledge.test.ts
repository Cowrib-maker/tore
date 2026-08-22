import { describe, expect, it } from "vitest";

import {
  InMemoryKnowledgeCrawler,
  InMemoryKnowledgeRepository,
  KnowledgeDocumentKind,
  createKnowledgeEngine,
  knowledgeDocumentId,
  rawTextDocument,
} from "@/engine/knowledge";
import { contentSha256Hex } from "@/engine/data/archive";

describe("KnowledgeEngine", () => {
  it("ingests a seeded document through parse → normalize → chunk → store", async () => {
    const sourceUrl = "https://legalinfo.mn/mn/detail?lawId=1";
    const html = `<h1>Хөдөлмөрийн тухай хууль</h1>
<p>Зүйл 1. Зорилго</p>
<p>${"ажилтан ".repeat(120)}</p>`;
    const engine = createKnowledgeEngine({
      crawler: new InMemoryKnowledgeCrawler([
        rawTextDocument({
          sourceUrl,
          kind: KnowledgeDocumentKind.HTML,
          text: html,
        }),
      ]),
    });

    const result = await engine.ingest({ sourceId: "legalinfo" });
    expect(result.failed).toEqual([]);
    expect(result.ingested).toHaveLength(1);

    const stored = result.ingested[0];
    expect(stored?.id).toBe(
      knowledgeDocumentId(
        sourceUrl,
        contentSha256Hex(new TextEncoder().encode(html)),
      ),
    );
    expect(stored?.metadata.language).toBe("mn");
    expect(stored?.metadata.jurisdiction).toBe("MN");
    expect(stored?.articles.length).toBeGreaterThan(0);
    expect(stored?.chunks.length).toBeGreaterThan(0);
    expect(stored?.chunks[0]?.tokenEstimate).toBeGreaterThan(0);

    await expect(engine.getById(stored!.id)).resolves.toMatchObject({
      sourceUrl,
      title: expect.stringContaining("Хөдөлмөр"),
    });

    const snapshot = await engine.exportSnapshot();
    expect(snapshot.version).toBe(1);
    expect(snapshot.documentCount).toBe(1);
    expect(snapshot.documents[0]?.id).toBe(stored?.id);
  });

  it("records parser failures without aborting the job", async () => {
    const engine = createKnowledgeEngine({
      crawler: new InMemoryKnowledgeCrawler([
        rawTextDocument({
          sourceUrl: "https://legalinfo.mn/ok",
          text: "Иргэний хууль",
        }),
      ]),
      parser: {
        parse: async (raw) => {
          throw new Error(`cannot parse ${raw.sourceUrl}`);
        },
      },
    });

    const result = await engine.ingest({ sourceId: "legalinfo" });
    expect(result.ingested).toHaveLength(0);
    expect(result.failed).toEqual([
      { sourceUrl: "https://legalinfo.mn/ok", reason: "cannot parse https://legalinfo.mn/ok" },
    ]);
  });

  it("reuses a content-addressed document id on re-ingest", async () => {
    const sourceUrl = "https://legalinfo.mn/mn/detail?lawId=42";
    const crawler = new InMemoryKnowledgeCrawler([
      rawTextDocument({ sourceUrl, text: "Гэрээний заалт" }),
    ]);
    const engine = createKnowledgeEngine({ crawler });

    const first = await engine.ingest({ sourceId: "legalinfo" });
    const second = await engine.ingest({ sourceId: "legalinfo" });
    expect(first.ingested[0]?.id).toBe(second.ingested[0]?.id);
    expect(await engine.exportSnapshot()).toMatchObject({ documentCount: 1 });
  });

  it("keeps two retrievable versions when canonical content changes", async () => {
    const sourceUrl = "https://legalinfo.mn/mn/detail?lawId=42";
    const repository = new InMemoryKnowledgeRepository();
    const first = await createKnowledgeEngine({
      crawler: new InMemoryKnowledgeCrawler([
        rawTextDocument({ sourceUrl, text: "Гэрээний хуучин эх" }),
      ]),
      repository,
    }).ingest({ sourceId: "legalinfo" });
    const second = await createKnowledgeEngine({
      crawler: new InMemoryKnowledgeCrawler([
        rawTextDocument({ sourceUrl, text: "Гэрээний шинэ эх" }),
      ]),
      repository,
    }).ingest({ sourceId: "legalinfo" });

    expect(first.ingested[0]?.id).not.toBe(second.ingested[0]?.id);
    expect(await repository.list()).toHaveLength(2);
    expect(await repository.findById(first.ingested[0]!.id)).not.toBeNull();
    expect(await repository.findById(second.ingested[0]!.id)).not.toBeNull();
  });
});
