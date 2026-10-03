import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/domain/errors/domain-error";

const requireActor = vi.fn();
const attach = vi.fn();

vi.mock("@/application/common/require-actor", () => ({
  requireActor: () => requireActor(),
}));
vi.mock("@/application/common/require-verified-email", () => ({
  assertEmailVerified: async () => undefined,
}));
vi.mock("@/infrastructure/security/rate-limiter", () => ({
  consumeRateLimit: async () => ({ ok: true }),
  LEGAL_AI_DOCUMENT_RATE_LIMIT: { limit: 10, windowMs: 1000 },
  legalAiDocumentRateLimitKey: (id: string) => id,
}));
vi.mock("@/application/use-cases/matters/attach-matter-document", () => ({
  attachMatterDocumentUseCase: (...args: unknown[]) => attach(...args),
}));
vi.mock("@/infrastructure/repositories", () => ({
  matterDocumentRepository: {},
  matterRepository: {},
}));
vi.mock("@/infrastructure/storage", () => ({ getFileStorage: () => ({}) }));
vi.mock("@/infrastructure/ai/document-text-extractor", () => ({
  getLegalAiDocumentExtractor: () => ({}),
}));

import {
  MATTER_DOCUMENT_MAX_BYTES,
  MATTER_DOCUMENT_PROCESSING_TIMEOUT_MS,
  MATTER_DOCUMENT_ROUTE_MAX_DURATION_SECONDS,
} from "@/application/use-cases/matters/matter-document-policy";
import { DocumentUploadError } from "@/domain/errors/document-upload-errors";

import { maxDuration, POST } from "@/app/api/matters/[matterId]/documents/route";

const ctx = { params: Promise.resolve({ matterId: "m1" }) };

function uploadRequest(file: File, headers: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", file);
  return new Request("http://localhost/api/matters/m1/documents", {
    method: "POST",
    body: form,
    headers,
  });
}

describe("POST /api/matters/[matterId]/documents", () => {
  beforeEach(() => {
    requireActor.mockReset().mockResolvedValue({ userId: "u1", role: "CLIENT" });
    attach.mockReset();
  });

  it("declares a bounded function duration", () => {
    expect(maxDuration).toBeGreaterThan(0);
    expect(maxDuration).toBe(MATTER_DOCUMENT_ROUTE_MAX_DURATION_SECONDS);
    expect(MATTER_DOCUMENT_PROCESSING_TIMEOUT_MS).toBeLessThan(maxDuration * 1000);
  });

  it("rejects an unauthenticated upload before touching the use case", async () => {
    requireActor.mockRejectedValue(new UnauthorizedError());
    const res = await POST(uploadRequest(new File(["x"], "a.txt")), ctx);
    expect(res.status).toBe(401);
    expect(attach).not.toHaveBeenCalled();
  });

  it("rejects an over-limit declared body with JSON FILE_TOO_LARGE (413)", async () => {
    const res = await POST(
      uploadRequest(new File(["x"], "a.txt"), {
        "content-length": String(MATTER_DOCUMENT_MAX_BYTES + 1024 * 1024),
      }),
      ctx,
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(attach).not.toHaveBeenCalled();
  });

  it("returns the typed code and a client-safe message for use-case failures", async () => {
    attach.mockRejectedValue(
      new DocumentUploadError("OCR_UNSUPPORTED", "Скан дэмжигдэхгүй"),
    );
    const res = await POST(uploadRequest(new File(["x"], "a.pdf")), ctx);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Скан дэмжигдэхгүй",
      code: "OCR_UNSUPPORTED",
    });
  });

  it("hides internals on an unexpected error (JSON 500, no stack/path)", async () => {
    attach.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.5:5432 /var/task/x.js"));
    const res = await POST(uploadRequest(new File(["x"], "a.pdf")), ctx);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("ECONNREFUSED");
    expect(text).not.toContain("/var/task");
    expect(JSON.parse(text)).toMatchObject({ code: "UPLOAD_FAILED" });
  });
});
