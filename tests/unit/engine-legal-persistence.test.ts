/**
 * Unit tests for Prisma-backed archive + knowledge persistence contracts.
 * Uses an in-memory fake Prisma surface (no live Neon in unit tests).
 */

import { describe, expect, it } from "vitest";

import {
  InMemoryArchiveRepository,
  createArchiveService,
  sha256Hex,
  type ArchiveRecord,
  type IArchiveStorage,
} from "@/engine/data/archive";
import { KnowledgeDocumentKind } from "@/engine/knowledge";
import { PrismaArchiveRepository } from "@/infrastructure/archive/prisma-archive.repository";
import { PrismaKnowledgeRepository } from "@/infrastructure/repositories/prisma-legal-knowledge-repository";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

class MemoryStorage implements IArchiveStorage {
  private readonly objects = new Map<string, Uint8Array>();

  async putIfAbsent(key: string, data: Uint8Array) {
    if (this.objects.has(key)) return { written: false };
    this.objects.set(key, data);
    return { written: true };
  }
  async get(key: string) {
    return this.objects.get(key) ?? null;
  }
  async has(key: string) {
    return this.objects.has(key);
  }
  async health() {
    return {
      ok: true,
      storage: "memory",
      checkedAt: new Date().toISOString(),
      detail: "ok",
    };
  }
  delete(key: string) {
    this.objects.delete(key);
  }
}

type ArchiveRow = {
  id: string;
  connectorId: string;
  source: string;
  sourceId: string;
  lawId: string | null;
  jurisdiction: string;
  authority: string;
  sourceType: string;
  originalUrl: string;
  fetchedAt: Date;
  sha256: string;
  checksumVerified: boolean;
  mimeType: string;
  byteSize: number;
  archiveVersion: number;
  storageKey: string;
  originalFileName: string;
  encoding: string | null;
};

function createFakePrisma() {
  const archives = new Map<string, ArchiveRow>();
  const byHash = new Map<string, string>();
  const documents = new Map<
    string,
    {
      id: string;
      sourceId: string;
      sourceUrl: string;
      lawId: string | null;
      title: string;
      kind: string;
      language: string;
      jurisdiction: string;
      documentType: string | null;
      articleCount: number;
      chunkCount: number;
      contentSha256: string;
      archiveId: string;
      version: number;
      ingestedAt: Date;
      articles: Array<{
        articleNumber: string | null;
        title: string | null;
        text: string;
        order: number;
      }>;
      chunks: Array<{
        id: string;
        documentId: string;
        articleNumber: string | null;
        order: number;
        text: string;
        tokenEstimate: number;
      }>;
    }
  >();

  return {
    legalSourceArchive: {
      async create({ data }: { data: ArchiveRow }) {
        if (byHash.has(data.sha256)) {
          const err = Object.assign(new Error("unique"), { code: "P2002" });
          throw err;
        }
        archives.set(data.id, data);
        byHash.set(data.sha256, data.id);
        return data;
      },
      async findUnique({
        where,
      }: {
        where: { sha256?: string; id?: string };
      }) {
        if (where.sha256) {
          const id = byHash.get(where.sha256);
          return id ? archives.get(id) ?? null : null;
        }
        if (where.id) {
          return archives.get(where.id) ?? null;
        }
        return null;
      },
      async findMany({
        where,
      }: {
        where: { connectorId: string; originalUrl: string };
      }) {
        return [...archives.values()]
          .filter(
            (row) =>
              row.connectorId === where.connectorId &&
              row.originalUrl === where.originalUrl,
          )
          .sort((a, b) => a.archiveVersion - b.archiveVersion);
      },
    },
    legalKnowledgeDocument: {
      async findUnique({
        where,
      }: {
        where: {
          sourceUrl_contentSha256?: {
            sourceUrl: string;
            contentSha256: string;
          };
          id?: string;
        };
      }) {
        if (where.id) {
          return documents.get(where.id) ?? null;
        }
        const key = where.sourceUrl_contentSha256;
        if (!key) return null;
        for (const doc of documents.values()) {
          if (
            doc.sourceUrl === key.sourceUrl &&
            doc.contentSha256 === key.contentSha256
          ) {
            return doc;
          }
        }
        return null;
      },
      async findFirst({
        where,
      }: {
        where: { sourceUrl: string };
      }) {
        const matches = [...documents.values()]
          .filter((doc) => doc.sourceUrl === where.sourceUrl)
          .sort((a, b) => b.version - a.version);
        return matches[0] ?? null;
      },
      async findMany() {
        return [...documents.values()];
      },
      async count({ where }: { where: { sourceUrl: string } }) {
        return [...documents.values()].filter(
          (doc) => doc.sourceUrl === where.sourceUrl,
        ).length;
      },
      async create({
        data,
      }: {
        data: {
          id: string;
          sourceId: string;
          sourceUrl: string;
          lawId: string | null;
          title: string;
          kind: string;
          language: string;
          jurisdiction: string;
          documentType: string | null;
          articleCount: number;
          chunkCount: number;
          contentSha256: string;
          archiveId: string;
          version: number;
          ingestedAt: Date;
          articles: {
            create: Array<{
              articleNumber: string | null;
              title: string | null;
              text: string;
              order: number;
            }>;
          };
          chunks: {
            create: Array<{
              id: string;
              articleNumber: string | null;
              order: number;
              text: string;
              tokenEstimate: number;
            }>;
          };
        };
      }) {
        const row = {
          id: data.id,
          sourceId: data.sourceId,
          sourceUrl: data.sourceUrl,
          lawId: data.lawId,
          title: data.title,
          kind: data.kind,
          language: data.language,
          jurisdiction: data.jurisdiction,
          documentType: data.documentType,
          articleCount: data.articleCount,
          chunkCount: data.chunkCount,
          contentSha256: data.contentSha256,
          archiveId: data.archiveId,
          version: data.version,
          ingestedAt: data.ingestedAt,
          articles: data.articles.create,
          chunks: data.chunks.create.map((chunk) => ({
            ...chunk,
            documentId: data.id,
          })),
        };
        documents.set(row.id, row);
        return row;
      },
    },
  };
}

describe("PrismaArchiveRepository (fake Prisma)", () => {
  it("persists archive metadata with source / lawId fields", async () => {
    const db = createFakePrisma();
    const repo = new PrismaArchiveRepository(db as never);
    const record: ArchiveRecord = Object.freeze({
      archiveId: "arch-1",
      connectorId: "mn.legalinfo",
      source: "legalinfo.mn",
      sourceId: "legalinfo",
      lawId: "367",
      jurisdiction: "MN",
      authority: "LEGALINFO",
      sourceType: "law",
      originalUrl: "https://legalinfo.mn/mn/detail?lawId=367",
      fetchedAt: "2026-08-21T00:00:00.000Z",
      sha256: "abc123",
      checksumVerified: true,
      mimeType: "text/html",
      byteSize: 10,
      archiveVersion: 1,
      storageKey: "artifacts/ab/abc123",
      originalFileName: "legalinfo-detail.html",
      encoding: "utf-8",
    });
    await repo.save(record);
    expect(await repo.findByHash("abc123")).toMatchObject({
      lawId: "367",
      source: "legalinfo.mn",
    });
    expect(await repo.exists("abc123")).toBe(true);
  });
});

describe("PrismaKnowledgeRepository (fake Prisma)", () => {
  it("refuses knowledge rows when the archive blob is missing", async () => {
    const storage = new MemoryStorage();
    const archiveMeta = new InMemoryArchiveRepository();
    const archive = createArchiveService({
      repository: archiveMeta,
      storage,
    });
    const stored = await archive.store({
      bytes: bytes("<html/>"),
      connectorId: "mn.legalinfo",
      source: "legalinfo.mn",
      sourceId: "legalinfo",
      lawId: "1",
      jurisdiction: "MN",
      authority: "LEGALINFO",
      sourceType: "law",
      originalUrl: "https://legalinfo.mn/mn/detail?lawId=1",
      originalFileName: "a.html",
    });
    storage.delete(stored.record.storageKey);

    const db = createFakePrisma();
    // Seed archive metadata into fake prisma to simulate orphaned DB metadata
    // without blob — use ArchiveService meta that still has the hash.
    const knowledge = new PrismaKnowledgeRepository(archive, db as never);
    await expect(
      knowledge.save({
        id: "doc-1",
        sourceId: "legalinfo",
        sourceUrl: stored.record.originalUrl,
        title: "t",
        kind: KnowledgeDocumentKind.HTML,
        metadata: {
          title: "t",
          language: "mn",
          jurisdiction: "MN",
          documentType: "LAW",
          sourceUrl: stored.record.originalUrl,
          articleCount: 1,
        },
        articles: [{ articleNumber: "1", title: null, text: "x", order: 0 }],
        chunks: [
          {
            id: "c1",
            documentId: "doc-1",
            articleNumber: "1",
            order: 0,
            text: "x",
            tokenEstimate: 1,
          },
        ],
        ingestedAt: new Date(),
        provenance: {
          archiveId: stored.record.archiveId,
          sha256: stored.record.sha256,
          originalUrl: stored.record.originalUrl,
          lawId: "1",
        },
      }),
    ).rejects.toThrow(/missing archive blob/);
  });

  it("persists idempotently when archive verifies", async () => {
    const storage = new MemoryStorage();
    const archive = createArchiveService({
      repository: new InMemoryArchiveRepository(),
      storage,
    });
    const payload = bytes("<html>idempotent</html>");
    const stored = await archive.store({
      bytes: payload,
      connectorId: "mn.legalinfo",
      source: "legalinfo.mn",
      sourceId: "legalinfo",
      lawId: "1",
      jurisdiction: "MN",
      authority: "LEGALINFO",
      sourceType: "law",
      originalUrl: "https://legalinfo.mn/mn/detail?lawId=1",
      originalFileName: "a.html",
    });

    // Prisma knowledge uses ArchiveService for verify; metadata for FK is in fake prisma.
    const db = createFakePrisma();
    await db.legalSourceArchive.create({
      data: {
        id: stored.record.archiveId,
        connectorId: stored.record.connectorId,
        source: stored.record.source,
        sourceId: stored.record.sourceId,
        lawId: stored.record.lawId,
        jurisdiction: stored.record.jurisdiction,
        authority: stored.record.authority,
        sourceType: stored.record.sourceType,
        originalUrl: stored.record.originalUrl,
        fetchedAt: new Date(stored.record.fetchedAt),
        sha256: stored.record.sha256,
        checksumVerified: true,
        mimeType: stored.record.mimeType,
        byteSize: stored.record.byteSize,
        archiveVersion: stored.record.archiveVersion,
        storageKey: stored.record.storageKey,
        originalFileName: stored.record.originalFileName,
        encoding: stored.record.encoding ?? null,
      },
    });

    const knowledge = new PrismaKnowledgeRepository(archive, db as never);
    const doc = {
      id: "doc-1",
      sourceId: "legalinfo",
      sourceUrl: stored.record.originalUrl,
      title: "Law",
      kind: KnowledgeDocumentKind.HTML,
      metadata: {
        title: "Law",
        language: "mn",
        jurisdiction: "MN",
        documentType: "LAW",
        sourceUrl: stored.record.originalUrl,
        articleCount: 1,
      },
      articles: [{ articleNumber: "1", title: null, text: "x", order: 0 }],
      chunks: [
        {
          id: "c1",
          documentId: "doc-1",
          articleNumber: "1",
          order: 0,
          text: "x",
          tokenEstimate: 1,
        },
      ],
      ingestedAt: new Date(),
      provenance: {
        archiveId: stored.record.archiveId,
        sha256: stored.record.sha256,
        originalUrl: stored.record.originalUrl,
        lawId: "1",
      },
    };

    const first = await knowledge.save(doc);
    const second = await knowledge.save(doc);
    expect(first.provenance?.sha256).toBe(sha256Hex(payload));
    expect(second.id).toBe(first.id);
    expect(await knowledge.list()).toHaveLength(1);
  });
});
