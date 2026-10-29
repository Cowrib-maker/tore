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

describe("LocalFileStorage.upload — Vercel serverless filesystem guard (regression)", () => {
  const originalVercel = process.env.VERCEL;

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
  });

  const sampleUpload = {
    purpose: "lawyer-credential" as const,
    ownerId: "lp1",
    fileName: "license.pdf",
    contentType: "application/pdf",
    body: new TextEncoder().encode("%PDF-1.4 test"),
  };

  // Reproduces the real deployed failure this guard replaces: on a Vercel
  // preview with FILE_STORAGE unset (TORE_ALLOW_LOCAL_STORAGE=1 bypasses the
  // boot-time assertProductionEnvGuards check), createFileStorage() silently
  // builds a LocalFileStorage — fine by itself, since at least two callers
  // (admin-homepage.actions.ts, verification.actions.ts) construct it at
  // module top level, which must never throw (see createFileStorage()'s doc
  // comment — an earlier version of this fix threw there and broke the
  // Vercel build entirely: "Failed to collect page data for /admin/
  // homepage"). The real failure only appears once an actual upload is
  // attempted: `ENOENT: no such file or directory, mkdir '/var/task/.data'`
  // — a confusing, undiagnosable 500. upload() must now fail immediately
  // with a clear, actionable configuration error instead, without needing
  // the real read-only filesystem to reproduce it.
  it("throws a clear configuration error on upload() when running on Vercel, instead of attempting a doomed filesystem write", async () => {
    process.env.VERCEL = "1";
    const storage = new LocalFileStorage({
      rootDir: "/var/task/.data",
      appUrl: "http://localhost:3000",
    });

    await expect(storage.upload(sampleUpload)).rejects.toThrow(/FILE_STORAGE=s3/);
    await expect(storage.upload(sampleUpload)).rejects.toThrow(/Vercel/);
  });

  it("still uploads normally outside Vercel (local dev) — the happy-path test above already proves this, confirmed again explicitly", async () => {
    delete process.env.VERCEL;
    const rootDir = await mkdtemp(path.join(tmpdir(), "tore-storage-vercel-guard-"));
    try {
      const storage = new LocalFileStorage({ rootDir, appUrl: "http://localhost:3000" });
      await expect(storage.upload(sampleUpload)).resolves.toMatchObject({
        contentType: "application/pdf",
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
