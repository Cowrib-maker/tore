/**
 * Compose production / development legal archive stack from environment.
 * Never hardcodes credentials.
 */

import { mkdir } from "node:fs/promises";

import {
  ArchiveService,
  InMemoryArchiveRepository,
  LocalFilesystemArchiveStorage,
  S3ArchiveStorage,
  createArchiveService,
  type IArchiveRepository,
  type IArchiveStorage,
} from "@/engine/data/archive";
import { PrismaArchiveRepository } from "@/infrastructure/archive/prisma-archive.repository";
import { getPrismaClient } from "@/infrastructure/database/prisma-client";
import type { Env } from "@/lib/env-schema";

export type LegalArchiveStack = {
  archive: ArchiveService;
  storage: IArchiveStorage;
  repository: IArchiveRepository;
  storageKind: "local" | "s3";
  metadataKind: "memory" | "postgres";
};

export type CreateLegalArchiveOptions = {
  env: Pick<
    Env,
    | "ARCHIVE_STORAGE"
    | "ARCHIVE_LOCAL_ROOT"
    | "ARCHIVE_S3_PREFIX"
    | "ARCHIVE_S3_BUCKET"
    | "S3_BUCKET"
    | "S3_REGION"
    | "S3_ACCESS_KEY_ID"
    | "S3_SECRET_ACCESS_KEY"
    | "S3_ENDPOINT"
    | "S3_FORCE_PATH_STYLE"
    | "NODE_ENV"
  >;
  /**
   * When true (default in production-shaped stacks), use Prisma metadata.
   * Tests may force in-memory metadata.
   */
  usePostgresMetadata?: boolean;
  storage?: IArchiveStorage;
  repository?: IArchiveRepository;
};

export async function createLegalArchiveStack(
  options: CreateLegalArchiveOptions,
): Promise<LegalArchiveStack> {
  const { env } = options;
  const storageKind = env.ARCHIVE_STORAGE ?? "local";

  let storage: IArchiveStorage;
  if (options.storage) {
    storage = options.storage;
  } else if (storageKind === "s3") {
    const bucket = env.ARCHIVE_S3_BUCKET || env.S3_BUCKET;
    if (!bucket) {
      throw new Error(
        "ARCHIVE_STORAGE=s3 requires ARCHIVE_S3_BUCKET or S3_BUCKET",
      );
    }
    if (!env.S3_REGION || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error(
        "ARCHIVE_STORAGE=s3 requires S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY",
      );
    }
    storage = new S3ArchiveStorage({
      bucket,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      keyPrefix: env.ARCHIVE_S3_PREFIX,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  } else {
    const root = env.ARCHIVE_LOCAL_ROOT || ".data/legal-archive";
    await mkdir(root, { recursive: true });
    storage = new LocalFilesystemArchiveStorage(root);
  }

  const usePostgres =
    options.usePostgresMetadata ??
    (options.repository == null && env.NODE_ENV !== "test");

  const repository: IArchiveRepository =
    options.repository ??
    (usePostgres
      ? new PrismaArchiveRepository(getPrismaClient())
      : new InMemoryArchiveRepository());

  return {
    archive: createArchiveService({ repository, storage }),
    storage,
    repository,
    storageKind: storageKind === "s3" ? "s3" : "local",
    metadataKind: usePostgres ? "postgres" : "memory",
  };
}
