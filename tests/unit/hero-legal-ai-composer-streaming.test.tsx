// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { HeroLegalAiComposer } from "@/components/marketing/hero-legal-ai-composer";

/**
 * Regression coverage for the bug where a real legal question submitted
 * through the homepage/marketing composer never showed an answer: the
 * hook backing this composer (useLegalAiChatSession) parsed the
 * /api/ai/chat response with response.json(), but that endpoint always
 * returns a text/event-stream body once past the initial auth/rate-limit
 * checks -- so ANY successful (or mid-turn-failed) turn threw a JSON
 * parse error, silently swallowed into a barely-visible retry message
 * while the user's own question sat in the transcript looking like
 * nothing had happened. These tests exercise the real SSE contract.
 */

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver ??= ResizeObserverStub;
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

function renderComposer() {
  return render(
    <HeroLegalAiComposer placeholder="Асуудлаа бичнэ үү..." suggestionsLabel="Жишээ нь:" />,
  );
}

function typeAndSubmit(text: string) {
  const textarea = screen.getByPlaceholderText("Асуудлаа бичнэ үү...") as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.submit(textarea.closest("form")!);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HeroLegalAiComposer — real SSE contract from /api/ai/chat", () => {
  it("renders the real assistant answer from a streamed (SSE) response, not a parse-error retry message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/entitlement")) return new Response(null, { status: 204 });
        if (url.includes("/api/ai/chat")) {
          return sseResponse([
            { event: "delta", data: { text: "Хариулт " } },
            { event: "delta", data: { text: "бэлэн боллоо." } },
            {
              event: "done",
              data: {
                conversationId: "conv-1",
                message: { id: "m1", content: "Хариулт бэлэн боллоо.", citations: [] },
              },
            },
          ]);
        }
        return new Response(null, { status: 404 });
      }),
    );

    renderComposer();
    await act(async () => {
      typeAndSubmit("Хөдөлмөрийн гэрээ цуцлах шаардлага юу вэ?");
    });

    await waitFor(() => {
      expect(screen.getByText("Хариулт бэлэн боллоо.")).not.toBeNull();
    });
    // The old (broken) code path caught a JSON-parse SyntaxError and showed
    // this generic retry message instead of any real answer.
    expect(screen.queryByText(/дахин оролдоно уу/i)).toBeNull();
  });

  it("shows the billing gate (not a generic error) when the entitlement is exhausted mid-stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/entitlement")) return new Response(null, { status: 204 });
        if (url.includes("/api/ai/chat")) {
          return sseResponse([
            {
              event: "error",
              data: {
                error: "Шинэ хууль зүйн асуулт асуухад төлбөртэй багц шаардлагатай.",
                code: "BILLING_REQUIRED",
                status: 402,
              },
            },
          ]);
        }
        return new Response(null, { status: 404 });
      }),
    );

    renderComposer();
    await act(async () => {
      typeAndSubmit("Шинэ асуулт");
    });

    await waitFor(() => {
      expect(screen.getByRole("dialog")).not.toBeNull();
    });
    expect(
      screen.getByText("Шинэ хууль зүйн асуулт асуухад төлбөртэй багц шаардлагатай."),
    ).not.toBeNull();
  });
});
