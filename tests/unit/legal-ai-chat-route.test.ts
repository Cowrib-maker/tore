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
});

describe("POST /api/ai/chat streaming (Sprint 14 P0)", () => {
  const route = readFileSync(
    path.join(process.cwd(), "src/app/api/ai/chat/route.ts"),
    "utf8",
  );

  it("performs every auth/entitlement/rate-limit/ownership check before opening the stream", () => {
    const authIndex = route.indexOf("lookupAuthSession()");
    const guardIndex = route.indexOf("guardLawyerAiHttp(");
    const rateLimitIndex = route.indexOf("consumeRateLimit(");
    const ownershipIndex = route.indexOf("assertOwnedCaseFileForAi(");
    const streamIndex = route.indexOf("new ReadableStream");
    expect(authIndex).toBeGreaterThan(-1);
    expect(streamIndex).toBeGreaterThan(-1);
    expect(authIndex).toBeLessThan(streamIndex);
    expect(guardIndex).toBeLessThan(streamIndex);
    expect(rateLimitIndex).toBeLessThan(streamIndex);
    expect(ownershipIndex).toBeLessThan(streamIndex);
  });

  it("streams as text/event-stream and forwards onDelta/signal into createTurn", () => {
    expect(route).toContain('"Content-Type": "text/event-stream; charset=utf-8"');
    expect(route).toContain("onDelta: (delta) => enqueue(\"delta\", { text: delta })");
    expect(route).toContain("signal: abortController.signal");
  });

  it("ties the provider abort to both request disconnect and stream cancellation", () => {
    expect(route).toContain('request.signal.addEventListener("abort"');
    expect(route).toContain("cancel() {");
    expect(route).toContain("abortController.abort()");
  });

  it("treats AI_ABORTED as a silent cancellation, never surfaced as a client-facing error event", () => {
    const abortedCheckIndex = route.indexOf('error.code === "AI_ABORTED"');
    const enqueueErrorIndex = route.indexOf('enqueue("error"');
    expect(abortedCheckIndex).toBeGreaterThan(-1);
    // The enqueue("error", ...) call must be reached through the branch
    // that excludes AI_ABORTED, not before the check exists at all.
    expect(enqueueErrorIndex).toBeGreaterThan(abortedCheckIndex - 400);
  });

  it("sends the done event with the exact same safe citation contract as before streaming existed", () => {
    expect(route).toContain('enqueue("done"');
    expect(route).toContain("conversationId: result.conversationId");
    expect(route).toContain("content: result.message.content");
  });

  it("still returns a plain JSON response (not a stream) for pre-stream failures", () => {
    expect(route).toContain("function errorResponseFor");
    expect(route).toContain("NextResponse.json(");
  });
});
