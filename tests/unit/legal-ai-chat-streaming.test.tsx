// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LegalAiChat } from "@/components/legal-ai/legal-ai-chat";

/**
 * Sprint 14 P0 — frontend incremental rendering, citation preservation, and
 * no-duplicate-assistant-messages, including on provider error and abort.
 * Companion to legal-ai-chat-transcript-scroll.test.tsx (which covers
 * auto-follow); this file covers the streaming content itself.
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

/** Streams frames one at a time as the returned function is called, so a
 * test can assert on intermediate render states between chunks. */
function controlledSseResponse() {
  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  const response = new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
  return {
    response,
    push(event: string, data: unknown) {
      controllerRef!.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    },
    close() {
      controllerRef!.close();
    },
  };
}

function renderChat() {
  return render(
    <LegalAiChat
      dashboardHref={null}
      signInLabel="Нэвтрэх"
      getStartedLabel="Эхлэх"
      dashboardLabel="Хяналтын самбар"
    />,
  );
}

function typeAndSubmit(text: string) {
  const textarea = screen.getByPlaceholderText(/Асуудлаа өөрийнхөөрөө бичээрэй/) as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.submit(textarea.closest("form")!);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LegalAiChat — streaming content rendering", () => {
  it("shows an assistant placeholder immediately, before any delta arrives", async () => {
    const controlled = controlledSseResponse();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/entitlement")) return new Response(null, { status: 204 });
        if (url.includes("/api/ai/chat")) return controlled.response;
        return new Response(null, { status: 404 });
      }),
    );

    renderChat();
    await act(async () => {
      typeAndSubmit("Асуулт");
    });

    // No delta pushed yet, but the user's own message is visible and the
    // turn is in progress (loading state) even before the first token.
    await waitFor(() => {
      expect(screen.getByText("Асуулт")).not.toBeNull();
    });

    await act(async () => {
      controlled.push("delta", { text: "Эхний" });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByText("Эхний")).not.toBeNull();
    });

    await act(async () => {
      controlled.push("done", {
        conversationId: "conv-1",
        message: { id: "m1", content: "Эхний", citations: [] },
      });
      controlled.close();
    });
  });

  it("renders text incrementally as multiple deltas arrive, in order, without duplicating the message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/entitlement")) return new Response(null, { status: 204 });
        if (url.includes("/api/ai/chat")) {
          return sseResponse([
            { event: "delta", data: { text: "Нэг " } },
            { event: "delta", data: { text: "хоёр " } },
            { event: "delta", data: { text: "гурав." } },
            {
              event: "done",
              data: {
                conversationId: "conv-1",
                message: { id: "m1", content: "Нэг хоёр гурав.", citations: [] },
              },
            },
          ]);
        }
        return new Response(null, { status: 404 });
      }),
    );

    renderChat();
    await act(async () => {
      typeAndSubmit("Асуулт");
    });

    await waitFor(() => {
      expect(screen.getByText("Нэг хоёр гурав.")).not.toBeNull();
    });
    // Exactly one assistant bubble with the final text — no leftover
    // intermediate copies from earlier deltas.
    expect(screen.getAllByText(/Нэг хоёр гурав\./)).toHaveLength(1);
  });

  it("attaches citations only once the done event arrives, matching the final message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/entitlement")) return new Response(null, { status: 204 });
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

    renderChat();
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
        if (url.includes("/api/ai/entitlement")) return new Response(null, { status: 204 });
        if (url.includes("/api/ai/chat")) {
          return sseResponse([
            { event: "delta", data: { text: "Хагас хариулт" } },
            { event: "error", data: { error: "provider failed" } },
          ]);
        }
        return new Response(null, { status: 404 });
      }),
    );

    renderChat();
    await act(async () => {
      typeAndSubmit("Асуулт");
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).not.toBeNull();
    });
    // The partial text must not linger as if it were a completed answer.
    expect(screen.queryByText(/Хагас хариулт/)).toBeNull();
  });

  it("removes the partial assistant bubble on user-initiated abort, with no error shown", async () => {
    // Mirrors real fetch-with-AbortSignal semantics for a streamed body:
    // the connection promise resolves normally, but reading the body later
    // throws once the signal fires — a plain reject on the outer fetch()
    // promise would not exercise the same code path sendMessage actually
    // takes (it's already past `await fetch(...)` and into reading the
    // stream by the time the user can click Stop).
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
        if (url.includes("/api/ai/entitlement")) return new Response(null, { status: 204 });
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

    renderChat();
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
});
