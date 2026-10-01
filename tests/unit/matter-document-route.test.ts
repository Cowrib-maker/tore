import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { rateLimitHttpResponse } from "@/application/common/rate-limit-http";
import {
  LEGAL_AI_DOCUMENT_RATE_LIMIT,
  legalAiDocumentRateLimitKey,
} from "@/infrastructure/security/rate-limiter";
import { isSensitiveStorageKey } from "@/infrastructure/storage/file-access";

describe("Matter document upload route contracts", () => {
  const route = readFileSync(
    path.join(process.cwd(), "src/app/api/matters/[matterId]/documents/route.ts"),
    "utf8",
  );

  it("requires an authenticated actor before anything else — a guest (no session) is rejected", () => {
    const requireActorCall = route.indexOf("await requireActor()");
    expect(requireActorCall).toBeGreaterThan(0);
    const formDataCall = route.indexOf("request.formData()");
    expect(formDataCall).toBeGreaterThan(requireActorCall);
  });

  it("is email-verified and rate-limited like other document uploads", () => {
    expect(route).toContain("assertEmailVerified");
    expect(route).toContain("legalAiDocumentRateLimitKey");
    expect(route).toContain("consumeRateLimit");
  });

  it("re-verifies Matter ownership inside the use case, never trusting the route param alone", () => {
    expect(route).toContain("attachMatterDocumentUseCase");
    // The route itself must not call requireOwnedMatter directly bypassing
    // the use case — ownership enforcement lives in attachMatterDocumentUseCase.
    expect(route).not.toContain("requireOwnedMatter(");
  });

  it("returns safe metadata fields and never storageKey, extracted text, or credentials", () => {
    expect(route).toContain("extractStatus: result.extractStatus");
    expect(route).toContain("pageCount: result.pageCount");
    expect(route).not.toMatch(/storageKey: result/);
    expect(route).not.toMatch(/extractedText/);
    expect(route).not.toMatch(/S3_|FILE_STORAGE_LOCAL_ROOT|secret/i);
  });

  it("does not accept a client-supplied ownerId, uploadedByUserId, or storage key", () => {
    expect(route).not.toMatch(/formData\.get\(["'](?:ownerId|uploadedByUserId|storageKey|url|key|path)["']\)/);
  });

  it("does not create a download endpoint (M2 scope)", () => {
    expect(route).not.toContain("getUrl");
    expect(route).not.toContain("getObject");
  });

  it("uses the same opaque user-scoped rate-limit key as other document uploads", () => {
    expect(LEGAL_AI_DOCUMENT_RATE_LIMIT).toEqual({
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    expect(legalAiDocumentRateLimitKey("user-123")).toBe("ai-document:user-123");
    expect(rateLimitHttpResponse(9).status).toBe(429);
  });

  it("marks matter-document keys as sensitive authenticated downloads", () => {
    expect(isSensitiveStorageKey("matter-document/u1/uuid-a.pdf")).toBe(true);
    expect(isSensitiveStorageKey("profile-photo/u1/a.jpg")).toBe(false);
  });
});
