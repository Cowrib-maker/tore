/**
 * S3-compatible {@link IArchiveStorage} for production legal-source blobs.
 *
 * Credentials and bucket come from the caller (environment) — never hardcoded.
 * Works with AWS S3, MinIO, R2, and other S3-compatible endpoints.
 */

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

import type { ArchiveHealth, IArchiveStorage } from "./types";

export type S3ArchiveStorageOptions = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional key prefix (e.g. legal-archive). No leading/trailing slashes. */
  keyPrefix?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  /** Injectable client for unit tests. */
  client?: S3Client;
};

function assertSafeKey(key: string): void {
  if (!key || key.includes("..") || key.startsWith("/")) {
    throw new Error(`Invalid archive storage key: ${key}`);
  }
}

export class S3ArchiveStorage implements IArchiveStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly keyPrefix: string;

  constructor(options: S3ArchiveStorageOptions) {
    if (!options.bucket.trim()) {
      throw new Error("S3 archive bucket is required");
    }
    if (!options.accessKeyId || !options.secretAccessKey) {
      throw new Error("S3 archive credentials are required");
    }
    this.bucket = options.bucket;
    this.keyPrefix = (options.keyPrefix ?? "").replace(/^\/+|\/+$/g, "");
    if (options.client) {
      this.client = options.client;
      return;
    }
    const config: S3ClientConfig = {
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle ?? Boolean(options.endpoint),
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    };
    this.client = new S3Client(config);
  }

  private fullKey(key: string): string {
    assertSafeKey(key);
    return this.keyPrefix ? `${this.keyPrefix}/${key}` : key;
  }

  async putIfAbsent(
    key: string,
    bytes: Uint8Array,
  ): Promise<{ written: boolean }> {
    const objectKey = this.fullKey(key);
    if (await this.hasObject(objectKey)) {
      return { written: false };
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: bytes,
        ContentType: "application/octet-stream",
        Metadata: {
          sha256: key.includes("/") ? (key.split("/").pop() ?? "") : key,
        },
      }),
    );
    return { written: true };
  }

  async get(key: string): Promise<Uint8Array | null> {
    const objectKey = this.fullKey(key);
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        }),
      );
      if (!result.Body) {
        return null;
      }
      return await result.Body.transformToByteArray();
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    return this.hasObject(this.fullKey(key));
  }

  async health(): Promise<ArchiveHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const probeKey = this.fullKey(
        `artifacts/.health/${Date.now().toString(16)}`,
      );
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: probeKey,
          Body: new TextEncoder().encode("ok"),
          ContentType: "text/plain",
        }),
      );
      return {
        ok: true,
        storage: "s3",
        checkedAt,
        detail: `${this.bucket}/${this.keyPrefix || "(root)"}`,
      };
    } catch (error) {
      return {
        ok: false,
        storage: "s3",
        checkedAt,
        detail: error instanceof Error ? error.message : "s3_unavailable",
      };
    }
  }

  private async hasObject(objectKey: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        }),
      );
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error == null) {
    return false;
  }
  const name = (error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } })
    .name;
  const code = (error as { Code?: string; code?: string }).Code
    ?? (error as { code?: string }).code;
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
    ?.httpStatusCode;
  return (
    name === "NotFound" ||
    name === "NoSuchKey" ||
    code === "NotFound" ||
    code === "NoSuchKey" ||
    status === 404
  );
}
