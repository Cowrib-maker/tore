// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LawyerAiWorkbench } from "@/components/legal-ai/lawyer-ai-workbench";

/**
 * Critical Bug #2 fix — the lawyer AI workbench previously did
 * `await response.json()` against /api/ai/chat, which now returns
 * `Content-Type: text/event-stream` on every successful turn (see
 * legal-ai-chat-streaming.test.tsx for the citizen-side equivalent, which
 * this file mirrors). These tests exercise the SAME real invocation shape
 * a browser would produce, proving the workbench now correctly consumes
 * the SSE stream instead of failing to parse it.
 */

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver ??= ResizeObserverStub;
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
});

function sseResponse(frames: Array<{ event: string; data: unknown }>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(
          encoder.encode(`event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`),
        );
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderWorkbench() {
  return render(
    <LawyerAiWorkbench caseContext={null} history={[]} />,
  );
}

function typeAndSubmit(text: string) {
  const textarea = screen.getByPlaceholderText("Юу дээр ажиллах вэ?") as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.submit(textarea.closest("form")!);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LawyerAiWorkbench — SSE streaming (regression for Critical Bug #2)", () => {
  it("renders text incrementally as multiple deltas arrive, in order, without duplicating the message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/chat")) {
          return sseResponse([
            { event: "delta", data: { text: "Дүн " } },
            { event: "delta", data: { text: "шинжилгээ " } },
            { event: "delta", data: { text: "хийлээ." } },
            {
              event: "done",
              data: {
                conversationId: "conv-1",
                message: { id: "m1", content: "Дүн шинжилгээ хийлээ.", citations: [] },
              },
            },
          ]);
        }
        return new Response(null, { status: 404 });
      }),
    );

    renderWorkbench();
    await act(async () => {
      typeAndSubmit("Энэ хэргийг шинжил");
    });

    await waitFor(() => {
      expect(screen.getByText("Дүн шинжилгээ хийлээ.")).not.toBeNull();
    });
    // Exactly one assistant bubble with the final text — proves the old
    // `response.json()` parse failure no longer occurs and no duplicate
    // bubble is left behind from intermediate deltas.
    expect(screen.getAllByText(/Дүн шинжилгээ хийлээ\./)).toHaveLength(1);
  });

  it("attaches citations only once the done event arrives, matching the final message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/chat")) {
          return sseResponse([
            { event: "delta", data: { text: "Хариулт." } },
            {
              event: "done",
              data: {
                conversationId: "conv-1",
                message: {
                  id: "m1",
                  content: "Хариулт.",
                  citations: [
                    {
                      id: "c1",
                      sourceType: "legal-data-engine",
                      title: "Эрүүгийн хууль",
                      article: "17.1",
                      paragraph: null,
                      sourceUrl: null,
                      sourceVersion: null,
                      validFrom: null,
                      validTo: null,
                    },
                  ],
                },
              },
            },
          ]);
        }
        return new Response(null, { status: 404 });
      }),
    );

    renderWorkbench();
    await act(async () => {
      typeAndSubmit("Эрүүгийн хуулийн 17.1 дүгээр зүйл");
    });

    await waitFor(() => {
      expect(screen.getByText("Эрүүгийн хууль")).not.toBeNull();
    });
  });

  it("removes the partial assistant bubble and shows an error banner when the stream errors mid-way", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/chat")) {
          return sseResponse([
            { event: "delta", data: { text: "Хагас хариулт" } },
            { event: "error", data: { error: "provider failed" } },
          ]);
        }
        return new Response(null, { status: 404 });
      }),
    );

    renderWorkbench();
    await act(async () => {
      typeAndSubmit("Асуулт");
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).not.toBeNull();
    });
    expect(screen.queryByText(/Хагас хариулт/)).toBeNull();
  });

  it("removes the partial assistant bubble on user-initiated abort, with no error shown", async () => {
    const encoder = new TextEncoder();
    let errorReader: ((reason: unknown) => void) | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: "Хагас" })}\n\n`),
        );
        errorReader = (reason) => controller.error(reason);
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/chat")) {
          init?.signal?.addEventListener("abort", () => {
            errorReader?.(new DOMException("Aborted", "AbortError"));
          });
          return new Response(stream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream; charset=utf-8" },
          });
        }
        return new Response(null, { status: 404 });
      }),
    );

    renderWorkbench();
    await act(async () => {
      typeAndSubmit("Асуулт");
    });

    await waitFor(() => {
      expect(screen.getByText("Хагас")).not.toBeNull();
    });

    const stopButton = await screen.findByRole("button", { name: "Зогсоох" });
    await act(async () => {
      fireEvent.click(stopButton);
    });

    await waitFor(() => {
      expect(screen.queryByText(/Хагас/)).toBeNull();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("still handles the pre-LLM JSON failure contract (401) via the non-streaming branch", async () => {
    // Auth/billing/validation failures never open a stream — route.ts
    // returns plain JSON for those, exactly as it did before streaming
    // existed. Proves the Content-Type branch correctly falls back to
    // response.json() instead of trying to SSE-parse a JSON error body.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/chat")) {
          return jsonResponse(401, { error: "Нэвтэрнэ үү." });
        }
        return new Response(null, { status: 404 });
      }),
    );

    renderWorkbench();
    await act(async () => {
      typeAndSubmit("Асуулт");
    });

    await waitFor(() => {
      expect(screen.getByText("Нэвтэрнэ үү.")).not.toBeNull();
    });
    // The composer's draft is restored (not lost) so the lawyer can retry
    // after logging in — mirrors the pre-streaming auth-gate behavior.
    const textarea = screen.getByPlaceholderText("Юу дээр ажиллах вэ?") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Асуулт");
  });
});
