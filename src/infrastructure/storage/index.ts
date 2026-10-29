import path from "node:path";

import type { FileStorage } from "@/domain/ports/file-storage";
import { env } from "@/lib/env";
import { LocalFileStorage } from "@/infrastructure/storage/local-file-storage";
import { S3FileStorage } from "@/infrastructure/storage/s3-file-storage";

let cached: FileStorage | null = null;

/**
 * True for every Vercel deployment (production AND preview alike) — Vercel
 * sets this for the function runtime itself, never for local `next dev` or
 * `vercel dev`. Confirmed empirically: on a preview deployment with
 * FILE_STORAGE unset (TORE_ALLOW_LOCAL_STORAGE=1 bypasses
 * assertProductionEnvGuards' boot-time check, as documented there for
 * "exceptional deploys"), LocalFileStorage.upload() reached
 * `mkdir('/var/task/.data', ...)` and failed with ENOENT — the deployed
 * function bundle's filesystem is read-only, so local disk storage can
 * never work there regardless of that bypass flag.
 */
function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1";
}

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

  if (isVercelRuntime()) {
    // Fail clearly the moment a route actually needs storage, instead of
    // letting every caller (document upload, profile photos, verification
    // uploads, case documents...) rediscover the same opaque
    // `ENOENT: mkdir '/var/task/...'` one request at a time. This is a
    // deployment-configuration gap, not an application defect: set
    // FILE_STORAGE=s3 plus S3_BUCKET/S3_REGION/S3_ACCESS_KEY_ID/
    // S3_SECRET_ACCESS_KEY for this environment (Vercel project settings).
    throw new Error(
      "FILE_STORAGE=s3 (with S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY) is required on Vercel. " +
        "Local file storage cannot persist writes on Vercel's read-only serverless filesystem — " +
        "TORE_ALLOW_LOCAL_STORAGE only bypasses the boot-time check in assertProductionEnvGuards " +
        "(env-guards.ts); it does not make local storage viable here.",
    );
  }

  const rootDir = path.isAbsolute(env.FILE_STORAGE_LOCAL_ROOT)
    ? env.FILE_STORAGE_LOCAL_ROOT
    : path.join(
        /* turbopackIgnore: true */ process.cwd(),
        env.FILE_STORAGE_LOCAL_ROOT,
      );

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
