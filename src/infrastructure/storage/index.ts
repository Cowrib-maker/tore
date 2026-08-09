import path from "node:path";

import type { FileStorage } from "@/domain/ports/file-storage";
import { env } from "@/lib/env";
import { LocalFileStorage } from "@/infrastructure/storage/local-file-storage";
import { S3FileStorage } from "@/infrastructure/storage/s3-file-storage";

let cached: FileStorage | null = null;

/**
 * Composition-root factory. Application/use-cases receive `FileStorage` via DI —
 * never import this factory from domain code.
 */
export function createFileStorage(): FileStorage {
  if (env.FILE_STORAGE === "s3") {
    return new S3FileStorage({
      bucket: env.S3_BUCKET!,
      region: env.S3_REGION!,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      publicBaseUrl: env.S3_PUBLIC_BASE_URL,
    });
  }

  const rootDir = path.isAbsolute(env.FILE_STORAGE_LOCAL_ROOT)
    ? env.FILE_STORAGE_LOCAL_ROOT
    : path.join(process.cwd(), env.FILE_STORAGE_LOCAL_ROOT);

  return new LocalFileStorage({
    rootDir,
    appUrl: env.NEXT_PUBLIC_APP_URL,
  });
}

export function getFileStorage(): FileStorage {
  if (!cached) {
    cached = createFileStorage();
  }
  return cached;
}

/** Test helper — resets singleton between cases. */
export function resetFileStorageForTests(): void {
  cached = null;
}
