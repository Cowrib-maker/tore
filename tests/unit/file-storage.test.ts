import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LocalFileStorage } from "@/infrastructure/storage/local-file-storage";
import {
  assertSafeStorageKey,
  buildObjectKey,
  sanitizeFileName,
} from "@/infrastructure/storage/object-key";

describe("object-key helpers", () => {
  it("sanitizes file names and builds purpose-scoped keys", () => {
    expect(sanitizeFileName("../../etc/passwd.pdf")).toBe("passwd.pdf");
    const key = buildObjectKey(
      "lawyer-credential",
      "profile_123",
      "License Scan.pdf",
    );
    expect(key.startsWith("lawyer-credential/profile_123/")).toBe(true);
    expect(key.endsWith("-License_Scan.pdf")).toBe(true);
  });

  it("rejects path traversal keys", () => {
    expect(() => assertSafeStorageKey("../secret")).toThrow();
    expect(() => assertSafeStorageKey("/abs")).toThrow();
  });
});

describe("LocalFileStorage", () => {
  let rootDir = "";

  afterEach(async () => {
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true });
      rootDir = "";
    }
  });

  it("uploads, reads, urls without exposing filesystem paths, and deletes", async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "tore-storage-"));
    const storage = new LocalFileStorage({
      rootDir,
      appUrl: "http://localhost:3000",
    });

    const stored = await storage.upload({
      purpose: "lawyer-credential",
      ownerId: "lp1",
      fileName: "license.pdf",
      contentType: "application/pdf",
      body: new TextEncoder().encode("%PDF-1.4 test"),
    });

    expect(stored.key.includes("lawyer-credential/lp1/")).toBe(true);
    expect(stored.key.includes(rootDir)).toBe(false);

    const url = await storage.getUrl(stored.key);
    expect(url.startsWith("http://localhost:3000/api/files/")).toBe(true);
    expect(url.includes(rootDir)).toBe(false);

    const object = await storage.getObject(stored.key);
    expect(new TextDecoder().decode(object.body)).toContain("%PDF");
    expect(object.contentType).toBe("application/pdf");

    await storage.delete(stored.key);
    await expect(storage.getObject(stored.key)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
