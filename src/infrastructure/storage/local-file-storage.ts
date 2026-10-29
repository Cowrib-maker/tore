import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import type {
  FileStorage,
  GetUrlOptions,
  StoredObject,
  StoredObjectBody,
  UploadFileInput,
} from "@/domain/ports/file-storage";
import {
  assertSafeStorageKey,
  buildObjectKey,
  sanitizeFileName,
} from "@/infrastructure/storage/object-key";

type LocalFileStorageOptions = {
  /** Absolute root directory from configuration — never hardcoded by callers. */
  rootDir: string;
  /** Public app origin used only to advertise download route prefix. */
  appUrl: string;
};

export class LocalFileStorage implements FileStorage {
  private readonly rootDir: string;
  private readonly appUrl: string;

  constructor(options: LocalFileStorageOptions) {
    if (!options.rootDir) {
      throw new ValidationError("FILE_STORAGE_LOCAL_ROOT is required for local storage");
    }
    this.rootDir = path.resolve(options.rootDir);
    this.appUrl = options.appUrl.replace(/\/$/, "");
  }

  private resolvePath(key: string): string {
    assertSafeStorageKey(key);
    const resolved = path.resolve(this.rootDir, key);
    const relative = path.relative(this.rootDir, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new ValidationError("Invalid storage key");
    }
    return resolved;
  }

  /**
   * True for every Vercel deployment (production AND preview alike) — Vercel
   * sets this for the function runtime itself, never for local `next dev` or
   * `vercel dev`. Checked lazily, inside upload() rather than the factory or
   * constructor (see createFileStorage()'s doc comment for why): confirmed
   * on the real deployed preview that FILE_STORAGE unset + TORE_ALLOW_LOCAL_
   * STORAGE=1 (which only bypasses assertProductionEnvGuards' boot-time
   * check, for "exceptional deploys") let a LocalFileStorage get built, and
   * its first real upload then failed with
   * `ENOENT: no such file or directory, mkdir '/var/task/.data'` — the
   * deployed function bundle's filesystem is read-only, so local disk
   * storage can never work there regardless of that bypass flag.
   */
  private static isVercelRuntime(): boolean {
    return process.env.VERCEL === "1";
  }

  async upload(input: UploadFileInput): Promise<StoredObject> {
    if (LocalFileStorage.isVercelRuntime()) {
      // Fail clearly instead of letting mkdir/writeFile surface an opaque
      // ENOENT below — this is a deployment-configuration gap (see the
      // doc comment above), not an application defect.
      throw new Error(
        "FILE_STORAGE=s3 (with S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY) is required on Vercel. " +
          "Local file storage cannot persist writes on Vercel's read-only serverless filesystem — " +
          "TORE_ALLOW_LOCAL_STORAGE only bypasses the boot-time check in assertProductionEnvGuards " +
          "(env-guards.ts); it does not make local storage viable here.",
      );
    }
    const key = buildObjectKey(input.purpose, input.ownerId, input.fileName);
    const absolute = this.resolvePath(key);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, input.body);

    return {
      key,
      contentType: input.contentType,
      sizeBytes: input.body.byteLength,
      originalFileName: sanitizeFileName(input.fileName),
    };
  }

  async delete(key: string): Promise<void> {
    const absolute = this.resolvePath(key);
    try {
      await unlink(absolute);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return;
      throw error;
    }
  }

  async getObject(key: string): Promise<StoredObjectBody> {
    const absolute = this.resolvePath(key);
    try {
      const body = await readFile(absolute);
      const originalFileName = path.basename(key).replace(/^[0-9a-f-]{36}-/i, "");
      return {
        body,
        contentType: guessContentType(originalFileName),
        originalFileName,
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw new NotFoundError("StoredFile", key);
      }
      throw error;
    }
  }

  async getUrl(key: string, options?: GetUrlOptions): Promise<string> {
    void options;
    assertSafeStorageKey(key);
    // Application download route — never a filesystem path.
    const encoded = key
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return `${this.appUrl}/api/files/${encoded}`;
  }
}

function guessContentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
