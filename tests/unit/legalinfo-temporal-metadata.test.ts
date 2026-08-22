import { describe, expect, it } from "vitest";

import {
  createKnowledgeEngine,
  InMemoryKnowledgeCrawler,
  KnowledgeDocumentKind,
  LegalInfoKnowledgeParser,
  UnicodeKnowledgeNormalizer,
  RuleBasedKnowledgeMetadataExtractor,
} from "@/engine/knowledge";

const DATED_HTML = `<!DOCTYPE html>
<html>
<head>
  <script>var lawId = "16230654312051";</script>
</head>
<body>
  <h1>МОНГОЛ УЛСЫН ХУУЛЬ</h1>
  <div data-block="enacteddate">2017 оны 5 дугаар сарын 25</div>
  <div data-block="enforcementdate">2017 оны 7 дугаар сарын 01</div>
  <div class="law-content">
    <p>ИРГЭНИЙ ХЭРЭГ ШҮҮХЭД ХЯНАН ШИЙДВЭРЛЭХ ТУХАЙ</p>
    <p>1 дүгээр зүйл.Хуулийн зорилт</p>
    <p>1.1.Энэ хуулийн зорилт нь иргэний хэргийг шүүхэд хянан шийдвэрлэх журмыг тогтооход оршино.</p>
  </div>
</body>
</html>`;

const UNDATED_HTML = `<!DOCTYPE html>
<html>
<body>
  <div class="law-content">
    <p>ТУРШИЛТЫН ХУУЛЬ ТУХАЙ</p>
    <p>1 дүгээр зүйл.Зорилт</p>
    <p>1.1.Текст.</p>
  </div>
</body>
</html>`;

describe("LegalInfo temporal metadata preservation", () => {
  it("keeps source effective date through parse → normalize → metadata", async () => {
    const parser = new LegalInfoKnowledgeParser();
    const parsed = await parser.parse({
      sourceId: "legalinfo",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=16230654312051",
      kind: KnowledgeDocumentKind.HTML,
      bytes: new TextEncoder().encode(DATED_HTML),
      fetchedAt: new Date(),
    });

    expect(parsed.validFrom).toBe("2017-07-01");
    expect(parsed.validTo).toBeNull();
    expect(parsed.sourceVersion).toBeNull();

    const normalized = new UnicodeKnowledgeNormalizer().normalize(parsed);
    expect(normalized.validFrom).toBe("2017-07-01");
    expect(normalized.sourceVersion).toBeNull();

    const metadata = new RuleBasedKnowledgeMetadataExtractor().extract(
      normalized,
    );
    expect(metadata.validFrom).toBe("2017-07-01");
    expect(metadata.validTo).toBeNull();
    expect(metadata.sourceVersion).toBeNull();
  });

  it("does not treat enacteddate as validFrom", async () => {
    const parsed = await new LegalInfoKnowledgeParser().parse({
      sourceId: "legalinfo",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=16230654312051",
      kind: KnowledgeDocumentKind.HTML,
      bytes: new TextEncoder().encode(DATED_HTML),
      fetchedAt: new Date(),
    });
    expect(parsed.validFrom).toBe("2017-07-01");
    expect(parsed.validFrom).not.toBe("2017-05-25");
  });

  it("keeps missing source dates null and does not invent sourceVersion", async () => {
    const engine = createKnowledgeEngine({
      crawler: new InMemoryKnowledgeCrawler([
        {
          sourceId: "legalinfo",
          sourceUrl: "https://legalinfo.mn/mn/detail?lawId=local-undated",
          kind: KnowledgeDocumentKind.HTML,
          bytes: new TextEncoder().encode(UNDATED_HTML),
          fetchedAt: new Date(),
        },
      ]),
      parser: new LegalInfoKnowledgeParser(),
    });

    const result = await engine.ingest({ sourceId: "legalinfo" });
    expect(result.failed).toEqual([]);
    const stored = result.ingested[0];
    expect(stored?.metadata.validFrom).toBeNull();
    expect(stored?.metadata.validTo).toBeNull();
    expect(stored?.metadata.sourceVersion).toBeNull();
  });
});
