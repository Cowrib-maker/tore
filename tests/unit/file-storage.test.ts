import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

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

const mockEnv = vi.hoisted(() => ({
  FILE_STORAGE: "local" as "local" | "s3",
  FILE_STORAGE_LOCAL_ROOT: ".data/uploads",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  S3_BUCKET: "bucket",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  S3_ENDPOINT: undefined as string | undefined,
  S3_FORCE_PATH_STYLE: undefined as boolean | undefined,
  S3_PUBLIC_BASE_URL: undefined as string | undefined,
}));

vi.mock("@/lib/env", () => ({ env: mockEnv }));

describe("createFileStorage — Vercel serverless filesystem guard (regression)", () => {
  const originalVercel = process.env.VERCEL;

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    mockEnv.FILE_STORAGE = "local";
    vi.resetModules();
  });

  // Reproduces the real deployed failure this guard replaces: on a Vercel
  // preview with FILE_STORAGE unset (TORE_ALLOW_LOCAL_STORAGE=1 bypasses the
  // boot-time assertProductionEnvGuards check), createFileStorage() used to
  // silently build a LocalFileStorage whose first real upload then failed
  // with `ENOENT: no such file or directory, mkdir '/var/task/.data'` — a
  // confusing, undiagnosable 500 for every caller (document upload, profile
  // photos, verification uploads, case documents...). It must now fail
  // immediately with a clear, actionable configuration error instead.
  it("throws a clear configuration error instead of building a doomed LocalFileStorage on Vercel", async () => {
    process.env.VERCEL = "1";
    mockEnv.FILE_STORAGE = "local";
    vi.resetModules();
    const { createFileStorage } = await import("@/infrastructure/storage");

    expect(() => createFileStorage()).toThrow(/FILE_STORAGE=s3/);
    expect(() => createFileStorage()).toThrow(/Vercel/);
  });

  it("does not throw on Vercel when FILE_STORAGE=s3 is actually configured", async () => {
    process.env.VERCEL = "1";
    mockEnv.FILE_STORAGE = "s3";
    vi.resetModules();
    const { createFileStorage } = await import("@/infrastructure/storage");

    expect(() => createFileStorage()).not.toThrow();
  });

  it("still builds LocalFileStorage normally outside Vercel (local dev)", async () => {
    delete process.env.VERCEL;
    mockEnv.FILE_STORAGE = "local";
    vi.resetModules();
    const { createFileStorage } = await import("@/infrastructure/storage");

    expect(() => createFileStorage()).not.toThrow();
  });
});
