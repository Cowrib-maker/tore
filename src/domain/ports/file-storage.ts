/**
 * Object storage port — used for lawyer credentials, profile photos,
 * contracts, evidence, and message attachments.
 *
 * Application code must never assume a filesystem path or S3 bucket layout.
 * Store the opaque `key` returned by `upload`; resolve access via this port.
 */

export const FILE_PURPOSES = [
  "lawyer-credential",
  "profile-photo",
  "contract",
  "evidence",
  "message-attachment",
] as const;

export type FilePurpose = (typeof FILE_PURPOSES)[number];

export type UploadFileInput = {
  purpose: FilePurpose;
  /** Tenant/owner scope for key namespacing (user id, profile id, matter id, …). */
  ownerId: string;
  fileName: string;
  contentType: string;
  body: Uint8Array;
};

export type StoredObject = {
  /** Opaque storage key — persist this, not a local path. */
  key: string;
  contentType: string;
  sizeBytes: number;
  originalFileName: string;
};

export type StoredObjectBody = {
  body: Uint8Array;
  contentType: string;
  originalFileName?: string;
};

export type GetUrlOptions = {
  /** Signed URL lifetime for private objects (S3). Ignored by local download routes. */
  expiresInSeconds?: number;
};

export interface FileStorage {
  upload(input: UploadFileInput): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  getObject(key: string): Promise<StoredObjectBody>;
  /**
   * Returns an application-relative or signed URL for authorized download.
   * Never exposes raw host filesystem paths.
   */
  getUrl(key: string, options?: GetUrlOptions): Promise<string>;
}
