import { describe, expect, it } from "vitest";

import {
  CitationEngine,
  CitationResolver,
  createCitationEngine,
  genericCitationGrammar,
} from "@/engine/citation";
import {
  LegalDocumentStatus,
  LegalNodeKind,
  LegalSourceKind,
  type LegalDocument,
  type LegalNode,
} from "@/engine/knowledge/schema";

function node(partial: {
  id: string;
  kind: LegalNode["kind"];
  locator?: LegalNode["locator"];
  heading?: string | null;
  text?: string | null;
  children?: LegalNode[];
}): LegalNode {
  return {
    id: partial.id,
    kind: partial.kind,
    locator: partial.locator ?? null,
    heading: partial.heading ?? null,
    text: partial.text ?? null,
    order: 0,
    path: partial.id,
    citations: [],
    children: partial.children ?? [],
  };
}

function criminalCode(): LegalDocument {
  const item = node({
    id: "art-17/p-1/sp-2/item-1",
    kind: LegalNodeKind.ITEM,
    locator: {
      display: "17.1.2.1",
      article: "17",
      paragraph: "1",
      subparagraph: "2",
      item: "1",
    },
    text: "1.дэлгэрэнгүй.",
  });
  const subparagraph = node({
    id: "art-17/p-1/sp-2",
    kind: LegalNodeKind.SUBPARAGRAPH,
    locator: {
      display: "17.1.2",
      article: "17",
      paragraph: "1",
      subparagraph: "2",
    },
    text: "17.1.2.Заалт.",
    children: [item],
  });
  const paragraph = node({
    id: "art-17/p-1",
    kind: LegalNodeKind.PARAGRAPH,
    locator: {
      display: "17.1",
      article: "17",
      paragraph: "1",
    },
    text: "17.1.Хэсэг.",
    children: [subparagraph],
  });
  const article = node({
    id: "art-17",
    kind: LegalNodeKind.ARTICLE,
    locator: {
      display: "17 дугаар зүйл.Гэмт хэрэг",
      article: "17",
    },
    heading: "Гэмт хэрэг",
    text: "17 дугаар зүйл.Гэмт хэрэг",
    children: [paragraph],
  });
  const chapter = node({
    id: "ch-1",
    kind: LegalNodeKind.CHAPTER,
    locator: { display: "НЭГДҮГЭЭР БҮЛЭГ", chapter: "1" },
    text: "НЭГДҮГЭЭР БҮЛЭГ",
    children: [article],
  });

  return {
    identity: {
      id: "doc-criminal",
      jurisdiction: "MN",
      language: "mn",
      title: "Эрүүгийн хууль",
      identifiers: [],
    },
    source: {
      kind: LegalSourceKind.LAW,
      instrumentClass: "CODE",
      enactingBody: "Улсын Их Хурал",
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
      status: LegalDocumentStatus.IN_FORCE,
      effectiveOn: null,
      validFrom: null,
      validTo: null,
    },
    hierarchy: [chapter],
    citations: [],
    relations: [],
  };
}

describe("CitationEngine", () => {
  const engine = createCitationEngine();
  const document = criminalCode();
  const resolver = engine.resolver(document);

  it("assigns a canonical citation to every node", () => {
    const index = engine.buildIndex(document);
    expect(index.entries).toHaveLength(5);
    for (const entry of index.entries) {
      expect(entry.canonical.length).toBeGreaterThan(0);
      expect(resolver.find(entry.nodeId)?.canonical).toBe(entry.canonical);
    }
  });

  it("uses Mongolian canonical forms for article, paragraph, and subparagraph", () => {
    expect(resolver.find("art-17")?.canonical).toBe(
      "Эрүүгийн хуулийн 17 дугаар зүйл",
    );
    expect(resolver.find("art-17/p-1")?.canonical).toBe(
      "Эрүүгийн хуулийн 17.1 дэх хэсэг",
    );
    expect(resolver.find("art-17/p-1/sp-2")?.canonical).toBe(
      "Эрүүгийн хуулийн 17.1.2 дахь заалт",
    );
  });

  it("resolves aliases to one canonical node", () => {
    const article = resolver.find("art-17");
    const paragraph = resolver.find("art-17/p-1");
    const subparagraph = resolver.find("art-17/p-1/sp-2");

    expect(resolver.resolve("17 дугаар зүйл")?.nodeId).toBe(article?.nodeId);
    expect(resolver.findByCitation("Эрүүгийн хуулийн 17 дугаар зүйл")?.nodeId).toBe(
      article?.nodeId,
    );

    expect(resolver.resolve("17.1")?.nodeId).toBe(paragraph?.nodeId);
    expect(resolver.resolve("Эрүүгийн хуулийн 17.1 дэх хэсэг")?.nodeId).toBe(
      paragraph?.nodeId,
    );

    expect(resolver.resolve("17.1.2")?.nodeId).toBe(subparagraph?.nodeId);
    expect(resolver.resolve("17.1.1")).toBeNull();
  });

  it("prefers the longest citation inside surrounding text", () => {
    expect(
      resolver.resolve("Харах: Эрүүгийн хуулийн 17.1.2 дахь заалт.")?.nodeId,
    ).toBe("art-17/p-1/sp-2");
    expect(resolver.resolve("17.1 болон бусад")?.nodeId).toBe("art-17/p-1");
  });

  it("indexes a non-Mongolian document with the generic grammar", () => {
    const english: LegalDocument = {
      ...document,
      identity: {
        ...document.identity,
        id: "doc-en",
        language: "en",
        jurisdiction: "SG",
        title: "Penal Code",
      },
    };
    const generic = new CitationEngine().resolver(english, genericCitationGrammar);
    expect(generic.find("art-17")?.canonical).toBe("Penal Code 17");
    expect(generic.resolve("17.1")?.nodeId).toBe("art-17/p-1");
    expect(generic.findByCitation("Penal Code 17.1")?.nodeId).toBe("art-17/p-1");
  });
});

describe("CitationResolver", () => {
  it("returns null for empty or unknown citations", () => {
    const resolver = CitationResolver.fromDocument(criminalCode());
    expect(resolver.resolve("   ")).toBeNull();
    expect(resolver.find("missing")).toBeNull();
    expect(resolver.findByCitation("99.9")).toBeNull();
  });
});
