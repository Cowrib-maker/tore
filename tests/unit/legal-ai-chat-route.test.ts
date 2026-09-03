import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("POST /api/ai/chat citation contract", () => {
  const route = readFileSync(
    path.join(process.cwd(), "src/app/api/ai/chat/route.ts"),
    "utf8",
  );

  it("returns safe citation metadata alongside message content", () => {
    expect(route).toContain("content: result.message.content");
    expect(route).toContain("citations: (result.message.citations ?? [])");
    expect(route).toContain("sourceType: citation.sourceType");
    expect(route).toContain("article: citation.article");
    expect(route).toContain("paragraph: citation.paragraph");
    expect(route).toContain("sourceUrl: citation.sourceUrl");
    expect(route).toContain("sourceVersion: citation.sourceVersion");
    expect(route).toContain("validFrom: citation.validFrom");
    expect(route).toContain("validTo: citation.validTo");
  });

  it("does not expose engine tokens, storage credentials, or archive hashes", () => {
    expect(route).not.toMatch(/ENGINE_SERVICE_TOKEN/);
    expect(route).not.toMatch(/contentHash|archiveRecordId|storageKey/);
    expect(route).not.toMatch(/S3_|OPENAI_API_KEY/);
    expect(route).not.toContain("excerpt:");
    expect(route).not.toContain("reference:");
  });

  it("derives capability from the authenticated role, not client mode", () => {
    expect(route).toContain("actorRole: actor?.role");
    expect(route).toContain("Capability is derived from the authenticated role");
    expect(route).not.toContain("mode: body.mode");
  });

  it("rejects a replaced session instead of falling through to guest", () => {
    expect(route).toContain("SessionReplacedError");
    expect(route).toContain("lookup.replaced");
    expect(route).not.toContain("getSessionUser");
  });

  it("uses the shared production-aware guest cookie options", () => {
    expect(route).toContain("guestCookieOptions(guest.expiresAt)");
  });
});
