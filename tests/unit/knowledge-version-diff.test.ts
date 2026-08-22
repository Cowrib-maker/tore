import { describe, expect, it } from "vitest";

import { contentSha256Hex } from "@/engine/data/archive";
import {
  InMemoryKnowledgeRepository,
  KnowledgeDocumentKind,
  KnowledgeVersionDiffRejectReason,
  LegalChangeType,
  diffKnowledgeDocuments,
  type StoredKnowledgeDocument,
} from "@/engine/knowledge";

function hashOf(text: string): string {
  return contentSha256Hex(new TextEncoder().encode(text));
}

function document(input: {
  id: string;
  sourceUrl: string;
  content: string;
  articles: StoredKnowledgeDocument["articles"];
  ingestedAt?: Date;
  version?: number;
  title?: string;
}): StoredKnowledgeDocument {
  return {
    id: input.id,
    sourceId: "legalinfo",
    sourceUrl: input.sourceUrl,
    title: input.title ?? "Тестийн хууль",
    kind: KnowledgeDocumentKind.HTML,
    metadata: {
      title: input.title ?? "Тестийн хууль",
      language: "mn",
      jurisdiction: "MN",
      documentType: "LAW",
      sourceUrl: input.sourceUrl,
      articleCount: input.articles.length,
      validFrom: null,
      validTo: null,
      sourceVersion: null,
    },
    articles: input.articles,
    chunks: [],
    ingestedAt: input.ingestedAt ?? new Date("2026-01-01T00:00:00.000Z"),
    version: input.version,
    provenance: {
      archiveId: `arch-${input.id}`,
      sha256: `raw-${input.id}`,
      contentSha256: hashOf(input.content),
      originalUrl: input.sourceUrl,
    },
  };
}

function article(
  articleNumber: string,
  text: string,
  order: number,
  title?: string,
): StoredKnowledgeDocument["articles"][number] {
  return {
    id: `art-${articleNumber}-${order}`,
    articleNumber,
    title: title ?? `${articleNumber} дүгээр зүйл`,
    text,
    order,
  };
}

describe("diffKnowledgeDocuments", () => {
  const civilUrl = "https://legalinfo.mn/mn/detail?lawId=299";

  it("A. same URL + same canonical hash is not a version diff", () => {
    const from = document({
      id: "civil-a",
      sourceUrl: civilUrl,
      content: "same",
      articles: [article("1", "Нэг", 0)],
    });
    const to = document({
      id: "civil-b",
      sourceUrl: civilUrl,
      content: "same",
      articles: [article("1", "Нэг", 0)],
    });
    expect(diffKnowledgeDocuments(from, to)).toEqual({
      ok: false,
      reason: KnowledgeVersionDiffRejectReason.SAME_CONTENT_SHA256,
    });
  });

  it("B. captcha-only canonical-equivalent content is not a version diff", () => {
    const legal = "<p>1 дүгээр зүйл. Зорилт</p>";
    const from = document({
      id: "captcha-a",
      sourceUrl: civilUrl,
      content: `${legal}<img src="api/captcha?x=111">`,
      articles: [article("1", "Зорилт", 0)],
    });
    const to = document({
      id: "captcha-b",
      sourceUrl: civilUrl,
      content: `${legal}<img src="api/captcha?x=999">`,
      articles: [article("1", "Зорилт", 0)],
    });
    expect(from.provenance?.contentSha256).toBe(to.provenance?.contentSha256);
    expect(diffKnowledgeDocuments(from, to)).toMatchObject({
      ok: false,
      reason: KnowledgeVersionDiffRejectReason.SAME_CONTENT_SHA256,
    });
  });

  it("C. article only in B is ADDED", () => {
    const from = document({
      id: "from",
      sourceUrl: civilUrl,
      content: "v1",
      articles: [article("1", "Хуучин", 0)],
    });
    const to = document({
      id: "to",
      sourceUrl: civilUrl,
      content: "v2",
      articles: [article("1", "Хуучин", 0), article("2", "Шинэ зүйл", 1)],
    });
    const result = diffKnowledgeDocuments(from, to);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diffs.find((row) => row.locator === "2")).toMatchObject({
        changeType: LegalChangeType.ADDED,
        beforeText: null,
        afterText: "Шинэ зүйл",
      });
    }
  });

  it("D. article only in A is REMOVED", () => {
    const from = document({
      id: "from",
      sourceUrl: civilUrl,
      content: "v1",
      articles: [article("1", "Үлдэнэ", 0), article("99", "Хасагдана", 1)],
    });
    const to = document({
      id: "to",
      sourceUrl: civilUrl,
      content: "v2",
      articles: [article("1", "Үлдэнэ", 0)],
    });
    const result = diffKnowledgeDocuments(from, to);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diffs.find((row) => row.locator === "99")).toMatchObject({
        changeType: LegalChangeType.REMOVED,
        beforeText: "Хасагдана",
        afterText: null,
      });
    }
  });

  it("E. same article number and different text is MODIFIED", () => {
    const from = document({
      id: "from",
      sourceUrl: civilUrl,
      content: "old-text",
      articles: [article("1", "Хуучин эх", 0)],
    });
    const to = document({
      id: "to",
      sourceUrl: civilUrl,
      content: "new-text",
      articles: [article("1", "Шинэ эх", 0)],
    });
    const result = diffKnowledgeDocuments(from, to);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diffs).toEqual([
        expect.objectContaining({
          locator: "1",
          changeType: LegalChangeType.MODIFIED,
          beforeText: "Хуучин эх",
          afterText: "Шинэ эх",
        }),
      ]);
    }
  });

  it("F. same article number and same normalized text is UNCHANGED", () => {
    const from = document({
      id: "from",
      sourceUrl: civilUrl,
      content: "ws-a",
      articles: [article("1", "Нэг  мөр\r\n", 0)],
    });
    const to = document({
      id: "to",
      sourceUrl: civilUrl,
      content: "ws-b",
      articles: [article("1", "Нэг мөр\n", 0)],
    });
    const result = diffKnowledgeDocuments(from, to);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diffs[0]).toMatchObject({
        changeType: LegalChangeType.UNCHANGED,
        beforeText: "Нэг  мөр\r\n",
        afterText: "Нэг мөр\n",
      });
    }
  });

  it("G. 17 / 17.1 / 17.2 never collapse", () => {
    const from = document({
      id: "from",
      sourceUrl: civilUrl,
      content: "a",
      articles: [
        article("17", "Ерөнхий", 0, "17 дугаар зүйл"),
        article("17.1", "Нэг", 1, "17.1 дүгээр зүйл"),
        article("17.2", "Хоёр", 2, "17.2 дугаар зүйл"),
      ],
    });
    const to = document({
      id: "to",
      sourceUrl: civilUrl,
      content: "b",
      articles: [
        article("17", "Ерөнхий", 0, "17 дугаар зүйл"),
        article("17.1", "Нэг өөрчлөгдсөн", 1, "17.1 дүгээр зүйл"),
        article("17.2", "Хоёр", 2, "17.2 дугаар зүйл"),
      ],
    });
    const result = diffKnowledgeDocuments(from, to);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const byLocator = Object.fromEntries(
        result.diffs.map((row) => [row.locator, row.changeType]),
      );
      expect(byLocator["17"]).toBe(LegalChangeType.UNCHANGED);
      expect(byLocator["17.1"]).toBe(LegalChangeType.MODIFIED);
      expect(byLocator["17.2"]).toBe(LegalChangeType.UNCHANGED);
      expect(result.diffs.map((row) => row.locator).sort()).toEqual([
        "17",
        "17.1",
        "17.2",
      ]);
    }
  });

  it("H. dotted article identity is preserved", () => {
    const from = document({
      id: "from",
      sourceUrl: civilUrl,
      content: "dotted-a",
      articles: [article("17.1", "Тусгай нэгж", 0, "17.1 дүгээр зүйл")],
    });
    const to = document({
      id: "to",
      sourceUrl: civilUrl,
      content: "dotted-b",
      articles: [article("17.1", "Тусгай нэгж шинэ", 0, "17.1 дүгээр зүйл")],
    });
    const result = diffKnowledgeDocuments(from, to);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diffs).toHaveLength(1);
      expect(result.diffs[0]?.locator).toBe("17.1");
      expect(result.diffs[0]?.locator).not.toBe("17");
    }
  });

  it("does not treat a 17.1 article heading as a 17.1 paragraph", () => {
    const from = document({
      id: "from",
      sourceUrl: civilUrl,
      content: "role-a",
      articles: [article("17.1", "Зүйл хэлбэр", 0, "17.1 дүгээр зүйл")],
    });
    const to = document({
      id: "to",
      sourceUrl: civilUrl,
      content: "role-b",
      articles: [
        {
          id: "p-17-1",
          articleNumber: "17.1",
          title: "17.1",
          text: "Зүйл хэлбэр",
          order: 0,
        },
      ],
    });
    const result = diffKnowledgeDocuments(from, to);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diffs.map((row) => row.changeType).sort()).toEqual([
        LegalChangeType.ADDED,
        LegalChangeType.REMOVED,
      ]);
      expect(result.diffs.some((row) => row.changeType === LegalChangeType.MODIFIED)).toBe(
        false,
      );
      expect(result.diffs.some((row) => row.changeType === LegalChangeType.UNCHANGED)).toBe(
        false,
      );
      expect(result.diffs.map((row) => row.locator).sort()).toEqual([
        "article:17.1",
        "paragraph:17.1",
      ]);
    }
  });

  it("I. two persisted versions remain independently retrievable", async () => {
    const repository = new InMemoryKnowledgeRepository();
    const from = document({
      id: "v-old",
      sourceUrl: civilUrl,
      content: "persist-old",
      articles: [article("1", "Хуучин", 0)],
      ingestedAt: new Date("2025-01-01T00:00:00.000Z"),
    });
    const to = document({
      id: "v-new",
      sourceUrl: civilUrl,
      content: "persist-new",
      articles: [article("1", "Шинэ", 0)],
      ingestedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    await repository.save(from);
    await repository.save(to);
    const listed = await repository.listBySourceUrl(civilUrl);
    expect(listed.map((row) => row.id)).toEqual(["v-old", "v-new"]);
    expect(await repository.findById("v-old")).not.toBeNull();
    expect(await repository.findById("v-new")).not.toBeNull();
    const result = diffKnowledgeDocuments(listed[0]!, listed[1]!);
    expect(result.ok).toBe(true);
  });

  it("J. different sourceUrl is rejected", () => {
    const from = document({
      id: "from",
      sourceUrl: civilUrl,
      content: "a",
      articles: [article("1", "Нэг", 0)],
    });
    const to = document({
      id: "to",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=310",
      content: "b",
      articles: [article("1", "Нэг", 0)],
    });
    expect(diffKnowledgeDocuments(from, to)).toEqual({
      ok: false,
      reason: KnowledgeVersionDiffRejectReason.SOURCE_URL_MISMATCH,
    });
  });

  it("K. different content hashes are required for version comparison", () => {
    const from = document({
      id: "from",
      sourceUrl: civilUrl,
      content: "hash-a",
      articles: [article("1", "Нэг", 0)],
    });
    const to = {
      ...document({
        id: "to",
        sourceUrl: civilUrl,
        content: "hash-b",
        articles: [article("1", "Хоёр", 0)],
      }),
      provenance: {
        archiveId: "arch-to",
        sha256: "raw-to",
        originalUrl: civilUrl,
      },
    };
    expect(diffKnowledgeDocuments(from, to)).toEqual({
      ok: false,
      reason: KnowledgeVersionDiffRejectReason.MISSING_CONTENT_SHA256,
    });
  });

  it("L–P. diff never creates relations, dates, or current status", () => {
    const from = document({
      id: "from",
      sourceUrl: civilUrl,
      content: "safety-a",
      articles: [article("1", "Хуучин", 0)],
    });
    const to = document({
      id: "to",
      sourceUrl: civilUrl,
      content: "safety-b",
      articles: [article("1", "Шинэ", 0)],
    });
    const result = diffKnowledgeDocuments(from, to);
    expect(result.ok).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("AMENDS");
    expect(serialized).not.toContain("REPEALS");
    expect(serialized).not.toContain("SUPERSEDES");
    expect(serialized).not.toContain("effectiveDate");
    expect(serialized).not.toContain("IN_FORCE");
    expect(serialized).not.toContain("REPEALED");
    if (result.ok) {
      for (const row of result.diffs) {
        expect(row).not.toHaveProperty("effectiveDate");
        expect(row).not.toHaveProperty("validTo");
        expect(row).not.toHaveProperty("sourceStatus");
        expect(row.evidence.kind).toBe("CANONICAL_TEXT_DIFF");
      }
    }
  });

  it("Q. ingest version is never presented as a legal version number", () => {
    const from = document({
      id: "from",
      sourceUrl: civilUrl,
      content: "ord-a",
      articles: [article("1", "Хуучин", 0)],
      version: 1,
    });
    const to = document({
      id: "to",
      sourceUrl: civilUrl,
      content: "ord-b",
      articles: [article("1", "Шинэ", 0)],
      version: 2,
    });
    const result = diffKnowledgeDocuments(from, to);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const serialized = JSON.stringify(result.diffs);
      expect(serialized).not.toContain('"version"');
      expect(result.diffs[0]).not.toHaveProperty("version");
    }
  });

  it("R. generic Civil Law fixture", () => {
    const from = document({
      id: "civil-from",
      sourceUrl: civilUrl,
      content: "civil-old",
      title: "Иргэний хууль",
      articles: [article("1", "Хуучин иргэний эх", 0)],
    });
    const to = document({
      id: "civil-to",
      sourceUrl: civilUrl,
      content: "civil-new",
      title: "Иргэний хууль",
      articles: [article("1", "Шинэ иргэний эх", 0)],
    });
    const result = diffKnowledgeDocuments(from, to);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diffs[0]?.changeType).toBe(LegalChangeType.MODIFIED);
    }
  });

  it("S. generic Company Law fixture", () => {
    const url = "https://legalinfo.mn/mn/detail?lawId=310";
    const from = document({
      id: "company-from",
      sourceUrl: url,
      content: "company-old",
      title: "Компанийн тухай хууль",
      articles: [article("15", "Хуучин компанийн эх", 0)],
    });
    const to = document({
      id: "company-to",
      sourceUrl: url,
      content: "company-new",
      title: "Компанийн тухай хууль",
      articles: [article("15", "Шинэ компанийн эх", 0)],
    });
    const result = diffKnowledgeDocuments(from, to);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diffs[0]?.locator).toBe("15");
      expect(result.diffs[0]?.changeType).toBe(LegalChangeType.MODIFIED);
    }
  });

  it("T. generic Labor Law fixture", () => {
    const url = "https://legalinfo.mn/mn/detail?lawId=565";
    const from = document({
      id: "labor-from",
      sourceUrl: url,
      content: "labor-old",
      title: "Хөдөлмөрийн тухай хууль",
      articles: [article("1", "Хуучин хөдөлмөрийн эх", 0)],
    });
    const to = document({
      id: "labor-to",
      sourceUrl: url,
      content: "labor-new",
      title: "Хөдөлмөрийн тухай хууль",
      articles: [article("1", "Хуучин хөдөлмөрийн эх", 0), article("3", "Нэмэгдсэн", 1)],
    });
    const result = diffKnowledgeDocuments(from, to);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diffs.find((row) => row.locator === "3")?.changeType).toBe(
        LegalChangeType.ADDED,
      );
    }
  });

  it("U. 11634 is only a generic dotted-article fixture, not production logic", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(
      join(process.cwd(), "src/engine/knowledge/diff/diff-knowledge-versions.ts"),
      "utf8",
    );
    expect(source).not.toContain("11634");
    const url = "https://legalinfo.mn/mn/detail?lawId=11634";
    const from = document({
      id: "fixture-from",
      sourceUrl: url,
      content: "fixture-old",
      articles: [article("17.1", "Хуучин 17.1", 0, "17.1 дүгээр зүйл")],
    });
    const to = document({
      id: "fixture-to",
      sourceUrl: url,
      content: "fixture-new",
      articles: [article("17.1", "Шинэ 17.1", 0, "17.1 дүгээр зүйл")],
    });
    const result = diffKnowledgeDocuments(from, to);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diffs[0]?.locator).toBe("17.1");
    }
  });

  it("does not invent a locator when articleNumber is missing", () => {
    const from = document({
      id: "from",
      sourceUrl: civilUrl,
      content: "no-num-a",
      articles: [
        { id: "x", articleNumber: null, title: null, text: "Оршил", order: 0 },
        article("1", "Нэг", 1),
      ],
    });
    const to = document({
      id: "to",
      sourceUrl: civilUrl,
      content: "no-num-b",
      articles: [article("1", "Нэг өөр", 0)],
    });
    const result = diffKnowledgeDocuments(from, to);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diffs.every((row) => row.locator.length > 0)).toBe(true);
      expect(result.diffs.some((row) => row.beforeText === "Оршил")).toBe(false);
    }
  });
});
