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

  async upload(input: UploadFileInput): Promise<StoredObject> {
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
