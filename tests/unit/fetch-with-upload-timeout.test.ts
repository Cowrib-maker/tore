import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchWithUploadTimeout,
  UPLOAD_TIMEOUT_ERROR,
} from "@/lib/read-upload-response";

/**
 * Regression for the attachment pipeline getting stuck on its loading
 * spinner: neither useDocumentUploadQueue nor the raw `fetch()` calls in
 * lawyer-ai-workbench.tsx / legal-ai-chat.tsx had ANY bound on how long to
 * wait for a response — a request that never settles (observed live for a
 * real-world DOCX; see docx-text-extractor.ts for the server-side half of
 * this fix) left the attachment tile spinning forever with no way to retry
 * or remove it.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchWithUploadTimeout", () => {
  // A mock fetch that honors its signal exactly like a real browser fetch()
  // does (rejects with AbortError once the signal aborts) — a hung request
  // settles only because the caller's own signal eventually aborts it,
  // never on its own.
  function hangingFetchHonoringSignal() {
    return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
  }

  it("times out a request that never settles, instead of hanging forever", async () => {
    vi.stubGlobal("fetch", hangingFetchHonoringSignal());
    const controller = new AbortController();

    await expect(
      fetchWithUploadTimeout(
        "/api/lawyer/ai/documents",
        { method: "POST", body: new FormData(), signal: controller.signal },
        20, // ms — short on purpose, this test must not take real seconds
      ),
    ).rejects.toThrow(UPLOAD_TIMEOUT_ERROR);
  });

  it("the timeout error is a plain Error, never a DOMException \"AbortError\" (regression)", async () => {
    // useDocumentUploadQueue's run() treats any AbortError as "the user
    // already removed this card, nothing to show" and silently drops the
    // item without ever marking it failed — if a timeout surfaced that way,
    // the tile would still look stuck with no visible error. A plain Error
    // instead flows into the OTHER branch and becomes a retryable item.
    vi.stubGlobal("fetch", hangingFetchHonoringSignal());
    const controller = new AbortController();

    try {
      await fetchWithUploadTimeout(
        "/api/lawyer/ai/documents",
        { method: "POST", body: new FormData(), signal: controller.signal },
        20,
      );
      expect.unreachable("expected fetchWithUploadTimeout to reject");
    } catch (error) {
      expect(error instanceof DOMException && error.name === "AbortError").toBe(false);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(UPLOAD_TIMEOUT_ERROR);
    }
  });

  it("a genuine user cancel (external signal aborted) still surfaces as a real AbortError, not the timeout message", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }),
    );

    const pending = fetchWithUploadTimeout(
      "/api/lawyer/ai/documents",
      { method: "POST", body: new FormData(), signal: controller.signal },
      5_000, // long — must not be what fires here
    );
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("resolves normally well within the timeout for a fast, successful request", async () => {
    const okResponse = new Response(JSON.stringify({ id: "doc-1" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
    vi.stubGlobal("fetch", vi.fn(async () => okResponse));
    const controller = new AbortController();

    const response = await fetchWithUploadTimeout(
      "/api/lawyer/ai/documents",
      { method: "POST", body: new FormData(), signal: controller.signal },
      5_000,
    );
    expect(response.status).toBe(201);
  });

  it("a genuine network error (not a timeout, not an abort) still propagates as-is", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const controller = new AbortController();

    await expect(
      fetchWithUploadTimeout(
        "/api/lawyer/ai/documents",
        { method: "POST", body: new FormData(), signal: controller.signal },
        5_000,
      ),
    ).rejects.toThrow("Failed to fetch");
  });
});
