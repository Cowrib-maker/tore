import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ArchiveHealth, IArchiveStorage } from "./types";

/**
 * Local filesystem object store. Keys are content-addressed; writes are exclusive.
 * Replace with S3/Azure/GCS/MinIO by implementing {@link IArchiveStorage}.
 */
export class LocalFilesystemArchiveStorage implements IArchiveStorage {
  constructor(private readonly rootDir: string) {}

  async putIfAbsent(
    key: string,
    bytes: Uint8Array,
  ): Promise<{ written: boolean }> {
    const filePath = this.resolveKey(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    try {
      await writeFile(filePath, bytes, { flag: "wx" });
      return { written: true };
    } catch (error) {
      if (isAlreadyExists(error)) {
        return { written: false };
      }
      throw error;
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const buffer = await readFile(this.resolveKey(key));
      return new Uint8Array(buffer);
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  async health(): Promise<ArchiveHealth> {
    try {
      await mkdir(this.rootDir, { recursive: true });
      const probe = path.join(this.rootDir, ".health");
      await writeFile(probe, "ok", { flag: "w" });
      return {
        ok: true,
        storage: "local-filesystem",
        checkedAt: new Date().toISOString(),
        detail: this.rootDir,
      };
    } catch (error) {
      return {
        ok: false,
        storage: "local-filesystem",
        checkedAt: new Date().toISOString(),
        detail: error instanceof Error ? error.message : "storage_unavailable",
      };
    }
  }

  private resolveKey(key: string): string {
    if (!key || key.includes("..") || path.isAbsolute(key)) {
      throw new Error("Invalid archive storage key");
    }
    const normalized = key.replace(/\\/g, "/");
    return path.resolve(this.rootDir, ...normalized.split("/"));
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
