import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { rateLimitHttpResponse } from "@/application/common/rate-limit-http";
import {
  LEGAL_AI_DOCUMENT_RATE_LIMIT,
  legalAiDocumentRateLimitKey,
} from "@/infrastructure/security/rate-limiter";
import { isSensitiveStorageKey } from "@/infrastructure/storage/file-access";

describe("legal AI document upload route contracts", () => {
  const route = readFileSync(
    path.join(process.cwd(), "src/app/api/lawyer/ai/documents/route.ts"),
    "utf8",
  );

  it("is lawyer-only, email-verified, billed, and rate-limited", () => {
    expect(route).toContain("requireActor(UserRole.LAWYER)");
    expect(route).toContain("assertEmailVerified");
    expect(route).toContain("EntitlementFeature.DOCUMENT_ANALYSIS");
    expect(route).toContain("recordLawyerFeatureUsage");
    expect(route).toContain("legalAiDocumentRateLimitKey");
    expect(route).toContain("attachConversationDocumentUseCase");
  });

  it("increments DOCUMENT_ANALYSIS only after a successful attachment", () => {
    const attachCall = route.indexOf("await attachConversationDocumentUseCase");
    const usageCall = route.indexOf("await recordLawyerFeatureUsage");
    expect(attachCall).toBeGreaterThan(0);
    expect(usageCall).toBeGreaterThan(attachCall);
  });

  it("returns safe metadata fields and never storageKey or credentials", () => {
    expect(route).toContain("extractStatus: result.extractStatus");
    expect(route).toContain("pageCount: result.pageCount");
    expect(route).not.toMatch(/storageKey: result/);
    expect(route).not.toMatch(/S3_|FILE_STORAGE_LOCAL_ROOT|secret/i);
  });

  it("uses an opaque user-scoped rate-limit key", () => {
    expect(LEGAL_AI_DOCUMENT_RATE_LIMIT).toEqual({
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    expect(legalAiDocumentRateLimitKey("user-123")).toBe("ai-document:user-123");
    expect(legalAiDocumentRateLimitKey("user-123")).not.toMatch(/@|sk-|QPAY|OPENAI/i);
    expect(rateLimitHttpResponse(9).status).toBe(429);
  });

  it("marks legal-ai-document keys as sensitive authenticated downloads", () => {
    expect(isSensitiveStorageKey("legal-ai-document/u1/uuid-a.pdf")).toBe(true);
    expect(isSensitiveStorageKey("profile-photo/u1/a.jpg")).toBe(false);
  });

  it("does not accept client-supplied storage keys or file URLs", () => {
    expect(route).toContain('formData.get("file")');
    expect(route).toContain('formData.get("conversationId")');
    expect(route).not.toMatch(/formData\.get\(["']storageKey["']\)/);
    expect(route).not.toMatch(/formData\.get\(["'](?:url|key|path)["']\)/);
  });
});
