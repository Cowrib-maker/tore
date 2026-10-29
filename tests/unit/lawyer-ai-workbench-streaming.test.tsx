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
    // Same assertion the real-browser E2E case (lawyer-journey.e2e.test.ts,
    // "legal AI research") makes against a live OpenAI call — reproduced
    // here deterministically via the mocked `done` event above, so citation
    // rendering is covered without ever depending on a reachable/valid
    // OpenAI key.
    expect(screen.getByText("TORE-ийн дүгнэлт", { exact: true })).not.toBeNull();
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

  it("routes a mid-stream 402 error frame to the billing paywall, not the generic retry message (regression)", async () => {
    // Quota/entitlement failures discovered inside createTurn() arrive as an
    // SSE "error" frame AFTER the route already committed to text/event-
    // stream (see route.ts) — unlike the pre-LLM 401/402 JSON case above,
    // this frame used to be discarded and replaced with a bare "stream
    // error", so a lawyer who exhausted their quota mid-conversation got
    // stuck on a useless Retry button with no way to pay. It must go
    // through the same interpretLegalAiChatAccess gate as the non-streaming
    // branch, exactly like legal-ai-chat.tsx already does.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/chat")) {
          return sseResponse([
            { event: "delta", data: { text: "Хагас хариулт" } },
            { event: "error", data: { error: "Таны багцын асуултын хязгаар дууссан.", status: 402 } },
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
      expect(screen.getByText("QR кодоор төлөх")).not.toBeNull();
    });
    // The partial streamed text is gone and no generic retry alert is shown
    // instead — the billing gate replaced both.
    expect(screen.queryByText(/Хагас хариулт/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Дахин оролдох" })).toBeNull();
  });

  it("treats a stream that closes after some text but WITHOUT a done/error frame as a failed turn (no truncated answer shown as final)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/chat")) {
          return sseResponse([{ event: "delta", data: { text: "Таслагдсан хариулт" } }]);
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
    expect(screen.queryByText(/Таслагдсан хариулт/)).toBeNull();
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

  it("treats a Stop followed by a CLEAN stream close (no done frame) as a quiet cancellation: partial bubble removed, no error shown", async () => {
    // Unlike the abort test above (where the read rejects with AbortError), here the connection ends normally after the user
    // pressed Stop — the loop exits without a terminal frame. That must still be the silent cancel path, not the retry error.
    const encoder = new TextEncoder();
    let closeStream: (() => void) | null = null;
    let sawAbortSignal = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: "Хагас" })}\n\n`),
        );
        closeStream = () => controller.close();
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/chat")) {
          init?.signal?.addEventListener("abort", () => {
            sawAbortSignal = true; // the stream is deliberately NOT errored: it will be closed cleanly below
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
    expect(sawAbortSignal).toBe(true);
    await act(async () => {
      closeStream?.();
    });

    await waitFor(() => {
      expect(screen.queryByText(/Хагас/)).toBeNull();
    });
    expect(screen.queryByRole("alert")).toBeNull();
    // The turn is over: the Stop button is gone and the composer is usable again.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Зогсоох" })).toBeNull();
    });
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

  it("a genuine send failure shows a Retry button that resends the same question without retyping it", async () => {
    // Unlike the 401 case above, a genuine network/stream failure clears
    // the composer on submit (the normal chat-UX behavior), so without a
    // retry action the lawyer would have to remember and retype their
    // whole question — reproduced here, then fixed by the Retry button.
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (!url.includes("/api/ai/chat")) return new Response(null, { status: 404 });
        callCount += 1;
        if (callCount === 1) {
          // stream ends without a terminal frame — a genuine failure
          return sseResponse([{ event: "delta", data: { text: "Таслагдсан" } }]);
        }
        return sseResponse([
          { event: "done", data: { conversationId: "conv-1", message: { id: "m1", content: "Эцсийн хариулт.", citations: [] } } },
        ]);
      }),
    );

    renderWorkbench();
    await act(async () => {
      typeAndSubmit("Миний асуулт");
    });

    const retryButton = await screen.findByRole("button", { name: "Дахин оролдох" });
    expect(callCount).toBe(1);

    await act(async () => {
      fireEvent.click(retryButton);
    });

    await waitFor(() => {
      expect(screen.getByText("Эцсийн хариулт.")).not.toBeNull();
    });
    expect(callCount).toBe(2);
    // Resuming the failed turn, not a second copy of the question.
    expect(screen.getAllByText("Миний асуулт")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Дахин оролдох" })).toBeNull();
  });

  it("the composer never shows the Latin→Cyrillic checkbox — it used to always clutter the default view", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        return url.includes("/api/ai/chat") ? sseResponse([]) : new Response(null, { status: 404 });
      }),
    );
    renderWorkbench();
    expect(
      screen.queryByText(/Латин үсгээр бичсэн монгол үгийг кириллээр санал болгох/),
    ).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
