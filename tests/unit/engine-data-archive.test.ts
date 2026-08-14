import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ArchiveService,
  InMemoryArchiveRepository,
  LocalFilesystemArchiveStorage,
  createArchiveService,
  mimeTypeForFileName,
  sha256Hex,
  type ArchiveStoreInput,
  type IArchiveStorage,
} from "@/engine/data/archive";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function input(
  overrides: Partial<ArchiveStoreInput> & { bytes: Uint8Array },
): ArchiveStoreInput {
  return {
    connectorId: "mn.legalinfo",
    jurisdiction: "MN",
    authority: "LEGISLATION",
    sourceType: "LAW",
    originalUrl: "mock://mn.legalinfo/law/1",
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

  async putIfAbsent(key: string, data: Uint8Array) {
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
    expect(result.record.checksumVerified).toBe(true);
    expect(result.record.fileSize).toBe(payload.byteLength);
    expect(result.record.mimeType).toBe("text/html");
    expect(result.record.archiveVersion).toBe(1);
    expect(result.record.storageKey).toContain(result.record.sha256);
    expect(archive.findByHash(result.record.sha256)?.archiveId).toBe(
      result.record.archiveId,
    );
    expect(archive.findByArchiveId(result.record.archiveId)).toEqual(result.record);
    expect(archive.exists(result.record.sha256)).toBe(true);
  });

  it("returns the existing record when the SHA-256 already exists", async () => {
    const archive = memoryArchive();
    const payload = bytes("same-bytes");
    const first = await archive.store(input({ bytes: payload }));
    const second = await archive.store(
      input({
        bytes: payload,
        originalUrl: "mock://mn.legalinfo/law/other",
        originalFileName: "copy.html",
      }),
    );

    expect(second.created).toBe(false);
    expect(second.record.archiveId).toBe(first.record.archiveId);
    expect(second.record.originalUrl).toBe(first.record.originalUrl);
    expect(archive.findVersions(first.record.archiveId)).toHaveLength(1);
  });

  it("creates a new version when the same source URL has different content", async () => {
    const archive = memoryArchive();
    const url = "mock://mn.legalinfo/law/1";
    const v1 = await archive.store(input({ bytes: bytes("version-one"), originalUrl: url }));
    const v2 = await archive.store(input({ bytes: bytes("version-two"), originalUrl: url }));

    expect(v2.created).toBe(true);
    expect(v2.record.archiveId).not.toBe(v1.record.archiveId);
    expect(v2.record.sha256).not.toBe(v1.record.sha256);
    expect(v1.record.archiveVersion).toBe(1);
    expect(v2.record.archiveVersion).toBe(2);
    expect(archive.findVersions(v1.record.archiveId).map((item) => item.archiveId)).toEqual([
      v1.record.archiveId,
      v2.record.archiveId,
    ]);
    expect(archive.findByArchiveId(v1.record.archiveId)?.sha256).toBe(v1.record.sha256);
  });

  it("refuses to mutate a stored record", async () => {
    const repository = new InMemoryArchiveRepository();
    const archive = new ArchiveService({
      repository,
      storage: new MemoryStorage(),
    });
    const stored = await archive.store(input({ bytes: bytes("locked") }));
    expect(() => {
      repository.save({ ...stored.record, originalFileName: "changed.html" });
    }).toThrow(/immutable/);
    expect(archive.findByArchiveId(stored.record.archiveId)?.originalFileName).toBe(
      "law.html",
    );
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
        }),
      );
      expect(result.created).toBe(true);
      expect(result.record.checksumVerified).toBe(true);
      expect(result.record.mimeType).toBe(mimeTypeForFileName(fileName));
    }
  });

  it("uses the injected storage abstraction", async () => {
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
    await expect(archive.store(input({ bytes: bytes("original") }))).rejects.toThrow(
      /checksum/,
    );
    expect(keys).toHaveLength(1);
  });
});

describe("LocalFilesystemArchiveStorage", () => {
  it("writes exclusively and reports health", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "tore-archive-"));
    try {
      const storage = new LocalFilesystemArchiveStorage(root);
      const payload = bytes("fs-bytes");
      const first = await storage.putIfAbsent("artifacts/aa/hash", payload);
      const second = await storage.putIfAbsent("artifacts/aa/hash", bytes("other"));
      expect(first.written).toBe(true);
      expect(second.written).toBe(false);
      expect(new TextDecoder().decode((await storage.get("artifacts/aa/hash")) ?? new Uint8Array())).toBe(
        "fs-bytes",
      );
      const health = await storage.health();
      expect(health.ok).toBe(true);
      expect(health.storage).toBe("local-filesystem");

      const archive = createArchiveService({
        repository: new InMemoryArchiveRepository(),
        storage,
      });
      const stored = await archive.store(input({ bytes: payload }));
      expect(stored.created).toBe(true);
      expect(await archive.health()).toMatchObject({ ok: true, storage: "local-filesystem" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
