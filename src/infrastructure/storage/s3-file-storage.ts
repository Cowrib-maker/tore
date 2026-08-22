import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import type {
  FileStorage,
  GetUrlOptions,
  StoredObject,
  StoredObjectBody,
  UploadFileInput,
} from "@/domain/ports/file-storage";
import { isSensitiveFilePurpose } from "@/infrastructure/storage/file-access";
import {
  assertSafeStorageKey,
  buildObjectKey,
  sanitizeFileName,
} from "@/infrastructure/storage/object-key";

export type S3FileStorageOptions = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  /** Optional public/CDN base; otherwise signed GET URLs are used. */
  publicBaseUrl?: string;
};

export class S3FileStorage implements FileStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl?: string;

  constructor(options: S3FileStorageOptions) {
    if (!options.bucket) {
      throw new ValidationError("S3_BUCKET is required for S3 storage");
    }
    this.bucket = options.bucket;
    this.publicBaseUrl = options.publicBaseUrl?.replace(/\/$/, "");
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle ?? Boolean(options.endpoint),
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async upload(input: UploadFileInput): Promise<StoredObject> {
    const key = buildObjectKey(input.purpose, input.ownerId, input.fileName);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
        Metadata: {
          originalfilename: sanitizeFileName(input.fileName),
        },
      }),
    );

    return {
      key,
      contentType: input.contentType,
      sizeBytes: input.body.byteLength,
      originalFileName: sanitizeFileName(input.fileName),
    };
  }

  async delete(key: string): Promise<void> {
    assertSafeStorageKey(key);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async getObject(key: string): Promise<StoredObjectBody> {
    assertSafeStorageKey(key);
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      if (!result.Body) {
        throw new NotFoundError("StoredFile", key);
      }
      const bytes = await result.Body.transformToByteArray();
      return {
        body: bytes,
        contentType: result.ContentType ?? "application/octet-stream",
        originalFileName: result.Metadata?.originalfilename,
      };
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === "NoSuchKey" || name === "NotFound") {
        throw new NotFoundError("StoredFile", key);
      }
      throw error;
    }
  }

  async getUrl(key: string, options?: GetUrlOptions): Promise<string> {
    assertSafeStorageKey(key);
    const purpose = key.split("/")[0] ?? "";

    // Sensitive objects never use a permanent public/CDN base URL.
    // Callers should prefer /api/files for session-authorized access.
    if (isSensitiveFilePurpose(purpose)) {
      const expiresIn = Math.min(options?.expiresInSeconds ?? 60, 120);
      return getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseContentDisposition: "attachment",
        }),
        { expiresIn },
      );
    }

    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
    }
    const expiresIn = options?.expiresInSeconds ?? 60 * 15;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn },
    );
  }
}
