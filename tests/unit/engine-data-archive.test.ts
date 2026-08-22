import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  ArchiveService,
  InMemoryArchiveRepository,
  LocalFilesystemArchiveStorage,
  S3ArchiveStorage,
  createArchiveService,
  mimeTypeForFileName,
  sha256Hex,
  type ArchiveStoreInput,
  type IArchiveStorage,
} from "@/engine/data/archive";
import {
  ArchiveVerifiedKnowledgeRepository,
  InMemoryKnowledgeRepository,
  KnowledgeDocumentKind,
} from "@/engine/knowledge";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function input(
  overrides: Partial<ArchiveStoreInput> & { bytes: Uint8Array },
): ArchiveStoreInput {
  return {
    connectorId: "mn.legalinfo",
    source: "legalinfo.mn",
    sourceId: "legalinfo",
    lawId: "1",
    jurisdiction: "MN",
    authority: "LEGISLATION",
    sourceType: "LAW",
    originalUrl: "https://legalinfo.mn/mn/detail?lawId=1",
    originalFileName: "law.html",
    ...overrides,
  };
}

function memoryArchive(storage?: IArchiveStorage) {
  return createArchiveService({
    repository: new InMemoryArchiveRepository(),
    storage: storage ?? new MemoryStorage(),
  });
}

class MemoryStorage implements IArchiveStorage {
  private readonly objects = new Map<string, Uint8Array>();
  failNextPut = false;

  async putIfAbsent(key: string, data: Uint8Array) {
    if (this.failNextPut) {
      this.failNextPut = false;
      throw new Error("simulated storage write failure");
    }
    if (this.objects.has(key)) {
      return { written: false };
    }
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

describe("ArchiveService", () => {
  it("generates immutable metadata and verifies the checksum", async () => {
    const archive = memoryArchive();
    const payload = bytes("<html>statute</html>");
    const result = await archive.store(input({ bytes: payload }));

    expect(result.created).toBe(true);
    expect(result.record.archiveId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result.record.sha256).toBe(sha256Hex(payload));
    expect(result.record.contentSha256).toBe(result.record.sha256);
    expect(result.record.checksumVerified).toBe(true);
    expect(result.record.byteSize).toBe(payload.byteLength);
    expect(result.record.mimeType).toBe("text/html");
    expect(result.record.archiveVersion).toBe(1);
    expect(result.record.source).toBe("legalinfo.mn");
    expect(result.record.sourceId).toBe("legalinfo");
    expect(result.record.lawId).toBe("1");
    expect(result.record.storageKey).toContain(result.record.sha256);
    expect((await archive.findByHash(result.record.sha256))?.archiveId).toBe(
      result.record.archiveId,
    );
    expect(await archive.findByArchiveId(result.record.archiveId)).toEqual(
      result.record,
    );
    expect(await archive.exists(result.record.sha256)).toBe(true);
  });

  it("returns the existing record when the SHA-256 already exists (duplicate content)", async () => {
    const archive = memoryArchive();
    const payload = bytes("same-bytes");
    const first = await archive.store(input({ bytes: payload }));
    const second = await archive.store(
      input({
        bytes: payload,
        originalUrl: "https://legalinfo.mn/mn/detail?lawId=other",
        lawId: "other",
        originalFileName: "copy.html",
      }),
    );

    expect(second.created).toBe(false);
    expect(second.record.archiveId).toBe(first.record.archiveId);
    expect(second.record.originalUrl).toBe(first.record.originalUrl);
    expect(await archive.findVersions(first.record.archiveId)).toHaveLength(1);
  });

  it("creates a new version when the same source URL has different content", async () => {
    const archive = memoryArchive();
    const url = "https://legalinfo.mn/mn/detail?lawId=1";
    const v1 = await archive.store(
      input({ bytes: bytes("version-one"), originalUrl: url }),
    );
    const v2 = await archive.store(
      input({ bytes: bytes("version-two"), originalUrl: url }),
    );

    expect(v2.created).toBe(true);
    expect(v2.record.archiveId).not.toBe(v1.record.archiveId);
    expect(v2.record.sha256).not.toBe(v1.record.sha256);
    expect(v1.record.archiveVersion).toBe(1);
    expect(v2.record.archiveVersion).toBe(2);
    expect(
      (await archive.findVersions(v1.record.archiveId)).map(
        (item) => item.archiveId,
      ),
    ).toEqual([v1.record.archiveId, v2.record.archiveId]);
  });

  it("refuses to mutate a stored record", async () => {
    const repository = new InMemoryArchiveRepository();
    const archive = new ArchiveService({
      repository,
      storage: new MemoryStorage(),
    });
    const stored = await archive.store(input({ bytes: bytes("locked") }));
    await expect(
      repository.save({ ...stored.record, originalFileName: "changed.html" }),
    ).rejects.toThrow(/immutable/);
    expect(
      (await archive.findByArchiveId(stored.record.archiveId))?.originalFileName,
    ).toBe("law.html");
  });

  it("maps supported artifact extensions to mime types", () => {
    expect(mimeTypeForFileName("a.html")).toBe("text/html");
    expect(mimeTypeForFileName("a.pdf")).toBe("application/pdf");
    expect(mimeTypeForFileName("a.docx")).toContain("wordprocessingml");
    expect(mimeTypeForFileName("a.xml")).toBe("application/xml");
    expect(mimeTypeForFileName("a.json")).toBe("application/json");
    expect(mimeTypeForFileName("a.zip")).toBe("application/zip");
    expect(mimeTypeForFileName("a.txt")).toBe("text/plain");
  });

  it("stores multiple mime types with checksums", async () => {
    const archive = memoryArchive();
    const samples: [string, string][] = [
      ["act.html", "<p>html</p>"],
      ["act.pdf", "%PDF-mock"],
      ["act.docx", "PK-mock"],
      ["act.xml", "<law/>"],
      ["act.json", "{\"id\":1}"],
      ["act.zip", "PK\u0003\u0004"],
      ["act.txt", "plain"],
    ];
    for (const [fileName, body] of samples) {
      const result = await archive.store(
        input({
          bytes: bytes(body),
          originalFileName: fileName,
          originalUrl: `mock://file/${fileName}`,
          lawId: null,
        }),
      );
      expect(result.created).toBe(true);
      expect(result.record.checksumVerified).toBe(true);
      expect(result.record.mimeType).toBe(mimeTypeForFileName(fileName));
    }
  });

  it("uses the injected storage abstraction and fails checksum on tamper", async () => {
    const keys: string[] = [];
    const storage: IArchiveStorage = {
      async putIfAbsent(key, data) {
        keys.push(key);
        return new MemoryStorage().putIfAbsent(key, data);
      },
      get: async () => bytes("tampered"),
      has: async () => true,
      health: async () => ({
        ok: true,
        storage: "spy",
        checkedAt: new Date().toISOString(),
        detail: "ok",
      }),
    };
    const archive = memoryArchive(storage);
    await expect(
      archive.store(input({ bytes: bytes("original") })),
    ).rejects.toThrow(/checksum/);
    expect(keys).toHaveLength(1);
  });

  it("does not persist metadata when storage write fails", async () => {
    const storage = new MemoryStorage();
    storage.failNextPut = true;
    const repository = new InMemoryArchiveRepository();
    const archive = new ArchiveService({ repository, storage });
    await expect(
      archive.store(input({ bytes: bytes("will-fail") })),
    ).rejects.toThrow(/storage write failed/);
    expect(await repository.exists(sha256Hex(bytes("will-fail")))).toBe(false);
  });

  it("verifyArchiveIntegrity rejects missing archive blobs", async () => {
    const storage = new MemoryStorage();
    const archive = createArchiveService({
      repository: new InMemoryArchiveRepository(),
      storage,
    });
    const stored = await archive.store(input({ bytes: bytes("present") }));
    storage.delete(stored.record.storageKey);
    await expect(
      archive.verifyArchiveIntegrity(stored.record.sha256),
    ).rejects.toThrow(/missing archive blob/);
  });
});

describe("LocalFilesystemArchiveStorage", () => {
  it("writes exclusively and reports health (local development storage)", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "tore-archive-"));
    try {
      const storage = new LocalFilesystemArchiveStorage(root);
      const payload = bytes("fs-bytes");
      const first = await storage.putIfAbsent("artifacts/aa/hash", payload);
      const second = await storage.putIfAbsent(
        "artifacts/aa/hash",
        bytes("other"),
      );
      expect(first.written).toBe(true);
      expect(second.written).toBe(false);
      expect(
        new TextDecoder().decode(
          (await storage.get("artifacts/aa/hash")) ?? new Uint8Array(),
        ),
      ).toBe("fs-bytes");
      const health = await storage.health();
      expect(health.ok).toBe(true);
      expect(health.storage).toBe("local-filesystem");

      const archive = createArchiveService({
        repository: new InMemoryArchiveRepository(),
        storage,
      });
      const stored = await archive.store(input({ bytes: payload }));
      expect(stored.created).toBe(true);
      expect(await archive.health()).toMatchObject({
        ok: true,
        storage: "local-filesystem",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("S3ArchiveStorage", () => {
  it("put/get with checksum verification via ArchiveService", async () => {
    const objects = new Map<string, Uint8Array>();
    const send = vi.fn(async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      const name = command.constructor.name;
      const key = String(command.input.Key);
      if (name === "HeadObjectCommand") {
        if (!objects.has(key)) {
          const err = Object.assign(new Error("NotFound"), {
            name: "NotFound",
            $metadata: { httpStatusCode: 404 },
          });
          throw err;
        }
        return {};
      }
      if (name === "PutObjectCommand") {
        objects.set(key, command.input.Body as Uint8Array);
        return {};
      }
      if (name === "GetObjectCommand") {
        const body = objects.get(key);
        if (!body) {
          const err = new Error("NoSuchKey");
          (err as { name: string }).name = "NoSuchKey";
          throw err;
        }
        return {
          Body: {
            transformToByteArray: async () => body,
          },
        };
      }
      return {};
    });

    const storage = new S3ArchiveStorage({
      bucket: "tore-legal-archive",
      region: "ap-southeast-1",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      keyPrefix: "legal-archive",
      client: { send } as never,
    });

    const payload = bytes("<html>cloud</html>");
    const first = await storage.putIfAbsent("artifacts/ab/hash1", payload);
    const second = await storage.putIfAbsent("artifacts/ab/hash1", bytes("x"));
    expect(first.written).toBe(true);
    expect(second.written).toBe(false);
    expect(await storage.get("artifacts/ab/hash1")).toEqual(payload);
    expect(await storage.has("artifacts/ab/hash1")).toBe(true);

    const archive = createArchiveService({
      repository: new InMemoryArchiveRepository(),
      storage,
    });
    const stored = await archive.store(input({ bytes: payload, lawId: "99" }));
    expect(stored.created).toBe(true);
    expect(stored.record.lawId).toBe("99");
    await expect(
      archive.verifyArchiveIntegrity(stored.record.sha256),
    ).resolves.toMatchObject({ sha256: stored.record.sha256 });
  });
});

describe("ArchiveVerifiedKnowledgeRepository", () => {
  it("rejects persistence when archive is missing", async () => {
    const archive = memoryArchive();
    const repo = new ArchiveVerifiedKnowledgeRepository(
      new InMemoryKnowledgeRepository(),
      archive,
    );
    await expect(
      repo.save({
        id: "doc-1",
        sourceId: "legalinfo",
        sourceUrl: "https://legalinfo.mn/mn/detail?lawId=1",
        title: "Law",
        kind: KnowledgeDocumentKind.HTML,
        metadata: {
          title: "Law",
          language: "mn",
          jurisdiction: "MN",
          documentType: "LAW",
          sourceUrl: "https://legalinfo.mn/mn/detail?lawId=1",
          articleCount: 1,
        },
        articles: [{ articleNumber: "1", title: null, text: "a", order: 0 }],
        chunks: [
          {
            id: "c1",
            documentId: "doc-1",
            articleNumber: "1",
            order: 0,
            text: "a",
            tokenEstimate: 1,
          },
        ],
        ingestedAt: new Date(),
        provenance: {
          archiveId: "missing",
          sha256: "abc",
          originalUrl: "https://legalinfo.mn/mn/detail?lawId=1",
          lawId: "1",
        },
      }),
    ).rejects.toThrow(/missing archive/);
  });

  it("persists idempotently when archive verifies", async () => {
    const archive = memoryArchive();
    const payload = bytes("<html>body</html>");
    const storedArchive = await archive.store(input({ bytes: payload }));
    const inner = new InMemoryKnowledgeRepository();
    const repo = new ArchiveVerifiedKnowledgeRepository(inner, archive);

    const document = {
      id: "doc-1",
      sourceId: "legalinfo",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=1",
      title: "Law",
      kind: KnowledgeDocumentKind.HTML,
      metadata: {
        title: "Law",
        language: "mn",
        jurisdiction: "MN",
        documentType: "LAW",
        sourceUrl: "https://legalinfo.mn/mn/detail?lawId=1",
        articleCount: 1,
      },
      articles: [{ articleNumber: "1", title: null, text: "a", order: 0 }],
      chunks: [
        {
          id: "c1",
          documentId: "doc-1",
          articleNumber: "1",
          order: 0,
          text: "a",
          tokenEstimate: 1,
        },
      ],
      ingestedAt: new Date(),
      provenance: {
        archiveId: storedArchive.record.archiveId,
        sha256: storedArchive.record.sha256,
        originalUrl: storedArchive.record.originalUrl,
        lawId: "1",
      },
    };

    const first = await repo.save(document);
    const second = await repo.save(document);
    expect(first.id).toBe("doc-1");
    expect(second.id).toBe(first.id);
    expect(await inner.list()).toHaveLength(1);
  });
});
