import { S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import { S3FileStorage } from "@/infrastructure/storage/s3-file-storage";

/**
 * Isolated test double at the AWS SDK boundary: mocks S3Client.send and
 * getSignedUrl, never a real network call and never the app's own
 * S3FileStorage abstraction — so every assertion here exercises the real
 * key-building, encryption, and authorization-gating code in
 * s3-file-storage.ts, not a stand-in for it. No S3FileStorage test existed
 * before this file; LocalFileStorage had coverage, S3FileStorage (the path
 * every Vercel deployment actually uses) had none.
 */
const getSignedUrlMock = vi.fn(async (..._args: unknown[]) => "https://signed.example/object?sig=abc");

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}));

function makeStorage() {
  return new S3FileStorage({
    bucket: "test-bucket",
    region: "us-east-1",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  getSignedUrlMock.mockClear();
});

describe("S3FileStorage", () => {
  it("throws ValidationError when constructed without a bucket", () => {
    expect(
      () =>
        new S3FileStorage({
          bucket: "",
          region: "us-east-1",
          accessKeyId: "a",
          secretAccessKey: "b",
        }),
    ).toThrow(ValidationError);
  });

  it("upload() sends a correctly-keyed, encrypted PutObjectCommand and returns safe metadata", async () => {
    const sendSpy = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const storage = makeStorage();
    const body = new TextEncoder().encode("hello world");

    const result = await storage.upload({
      purpose: "legal-ai-document",
      ownerId: "lawyer-1",
      fileName: "contract.pdf",
      contentType: "application/pdf",
      body,
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const command = sendSpy.mock.calls[0]![0] as unknown as {
      input: {
        Bucket: string;
        Key: string;
        ContentType: string;
        ServerSideEncryption: string;
        Metadata: { originalfilename: string };
      };
    };
    expect(command.input.Bucket).toBe("test-bucket");
    expect(command.input.Key).toMatch(/^legal-ai-document\/lawyer-1\/[0-9a-f-]{36}-contract\.pdf$/);
    expect(command.input.ContentType).toBe("application/pdf");
    expect(command.input.ServerSideEncryption).toBe("AES256");
    expect(command.input.Metadata.originalfilename).toBe("contract.pdf");

    expect(result.key).toBe(command.input.Key);
    expect(result.sizeBytes).toBe(body.byteLength);
    expect(result.originalFileName).toBe("contract.pdf");
    // The returned metadata never leaks the bucket name or raw AWS key shape
    // beyond the app's own opaque object key.
    expect(JSON.stringify(result)).not.toMatch(/test-bucket|AKIA|secret/i);
  });

  it("upload() sanitizes an unsafe file name in both the storage key and the returned metadata", async () => {
    vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const storage = makeStorage();

    const result = await storage.upload({
      purpose: "legal-ai-document",
      ownerId: "lawyer-1",
      fileName: "../../etc/passwd; rm -rf.pdf",
      contentType: "application/pdf",
      body: new Uint8Array([1, 2, 3]),
    });

    expect(result.key).not.toMatch(/\.\.|\/etc\//);
    expect(result.originalFileName).not.toContain("..");
    expect(result.originalFileName).not.toContain("/");
  });

  it("delete() sends a DeleteObjectCommand for exactly the given key", async () => {
    const sendSpy = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const storage = makeStorage();

    await storage.delete("legal-ai-document/lawyer-1/uuid-contract.pdf");

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const command = sendSpy.mock.calls[0]![0] as { input: { Bucket: string; Key: string } };
    expect(command.input.Bucket).toBe("test-bucket");
    expect(command.input.Key).toBe("legal-ai-document/lawyer-1/uuid-contract.pdf");
  });

  it("delete() rejects a path-traversal key before ever calling S3", async () => {
    const sendSpy = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const storage = makeStorage();

    await expect(storage.delete("../../etc/passwd")).rejects.toBeInstanceOf(ValidationError);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("getObject() returns the body, content type, and original filename on success", async () => {
    const body = new TextEncoder().encode("file contents");
    vi.spyOn(S3Client.prototype, "send").mockResolvedValue({
      ContentType: "application/pdf",
      Metadata: { originalfilename: "contract.pdf" },
      Body: { transformToByteArray: async () => body },
    } as never);
    const storage = makeStorage();

    const result = await storage.getObject("legal-ai-document/lawyer-1/uuid-contract.pdf");

    expect(result.contentType).toBe("application/pdf");
    expect(result.originalFileName).toBe("contract.pdf");
    expect(Array.from(result.body)).toEqual(Array.from(body));
  });

  it("getObject() maps a missing body to NotFoundError, not a crash", async () => {
    vi.spyOn(S3Client.prototype, "send").mockResolvedValue({ Body: undefined } as never);
    const storage = makeStorage();

    await expect(
      storage.getObject("legal-ai-document/lawyer-1/uuid-missing.pdf"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getObject() maps an S3 NoSuchKey error to the app's NotFoundError, not a raw AWS error", async () => {
    const awsError = Object.assign(new Error("not found"), { name: "NoSuchKey" });
    vi.spyOn(S3Client.prototype, "send").mockRejectedValue(awsError);
    const storage = makeStorage();

    await expect(
      storage.getObject("legal-ai-document/lawyer-1/uuid-gone.pdf"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getUrl() for a SENSITIVE purpose always returns a short-lived signed URL, capped at 120s, even if a longer expiry or a publicBaseUrl is configured", async () => {
    const storage = new S3FileStorage({
      bucket: "test-bucket",
      region: "us-east-1",
      accessKeyId: "a",
      secretAccessKey: "b",
      // A sensitive document must never resolve to a permanent public URL,
      // even when one is configured for non-sensitive assets.
      publicBaseUrl: "https://cdn.example.com",
    });

    const url = await storage.getUrl("legal-ai-document/lawyer-1/uuid-contract.pdf", {
      expiresInSeconds: 99_999,
    });

    expect(url).toBe("https://signed.example/object?sig=abc");
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    const expiresIn = (getSignedUrlMock.mock.calls[0]![2] as unknown as { expiresIn: number })
      .expiresIn;
    expect(expiresIn).toBeLessThanOrEqual(120);
    const commandArg = getSignedUrlMock.mock.calls[0]![1] as unknown as {
      input: { ResponseContentDisposition?: string };
    };
    expect(commandArg.input.ResponseContentDisposition).toBe("attachment");
  });

  it("getUrl() for a NON-sensitive purpose with publicBaseUrl returns a direct public URL, never calling getSignedUrl", async () => {
    const storage = new S3FileStorage({
      bucket: "test-bucket",
      region: "us-east-1",
      accessKeyId: "a",
      secretAccessKey: "b",
      publicBaseUrl: "https://cdn.example.com/",
    });

    const url = await storage.getUrl("homepage-image/uuid-banner.png");

    expect(url).toBe("https://cdn.example.com/homepage-image/uuid-banner.png");
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it("getUrl() for a NON-sensitive purpose with no publicBaseUrl falls back to a signed URL with a sensible default expiry", async () => {
    const storage = makeStorage();
    const url = await storage.getUrl("homepage-image/uuid-banner.png");

    expect(url).toBe("https://signed.example/object?sig=abc");
    const expiresIn = (getSignedUrlMock.mock.calls[0]![2] as unknown as { expiresIn: number })
      .expiresIn;
    expect(expiresIn).toBe(60 * 15);
  });
});
