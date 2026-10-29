// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LawyerAiWorkbench } from "@/components/legal-ai/lawyer-ai-workbench";

/**
 * Regression for the forced-scroll bug found during the lawyer-workspace
 * audit: the transcript used to call `scrollTo(bottom)` unconditionally on
 * every `messages`/`loading` change, including every streamed delta — a
 * lawyer who scrolled up mid-answer to re-read earlier text got yanked back
 * to the bottom on the very next token. Mirrors the near-bottom tracking
 * legal-ai-chat.tsx already had (legal-ai-chat-transcript-scroll.test.tsx),
 * using the same jsdom scroll-metric stubbing technique (jsdom has no
 * layout engine, so scrollHeight/clientHeight/scrollTop must be stubbed
 * directly on the transcript container).
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

function stubScrollMetrics(
  el: HTMLElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop: number },
) {
  Object.defineProperty(el, "scrollHeight", { value: metrics.scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: metrics.clientHeight, configurable: true });
  Object.defineProperty(el, "scrollTop", {
    value: metrics.scrollTop,
    configurable: true,
    writable: true,
  });
}

function renderWorkbench() {
  return render(<LawyerAiWorkbench caseContext={null} history={[]} />);
}

function typeDraft(text: string): HTMLFormElement {
  const textarea = screen.getByPlaceholderText("Юу дээр ажиллах вэ?") as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: text } });
  return textarea.closest("form")!;
}

function getTranscript(): HTMLElement {
  // Only the message transcript carries overflow-y-auto on a plain <div> in
  // the default (no attachments, side panel closed) render — see the
  // `ref={transcriptRef}` container in lawyer-ai-workbench.tsx. Before
  // `conversationMode` is true, tailwind-merge drops overflow-y-auto in
  // favor of the empty-state branch's overflow-hidden (same `overflow`
  // property, later in the merge), so this must only be called once draft
  // text or a message has flipped conversationMode to true.
  const el = document.querySelector("div.overflow-y-auto");
  if (!el) throw new Error("transcript container not found");
  return el as HTMLElement;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LawyerAiWorkbench — transcript auto-follow (regression for forced-scroll bug)", () => {
  it("auto-scrolls to bottom when a new message arrives while already near the bottom", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/chat")) {
          return sseResponse([
            {
              event: "done",
              data: { conversationId: "conv-1", message: { id: "m1", content: "Хариулт.", citations: [] } },
            },
          ]);
        }
        return new Response(null, { status: 404 });
      }),
    );

    renderWorkbench();
    const form = typeDraft("Асуулт");
    // Typing flipped conversationMode to true, so the transcript now
    // actually carries overflow-y-auto (see getTranscript's comment).
    const transcript = getTranscript();
    transcript.scrollTo = vi.fn();
    stubScrollMetrics(transcript, { scrollHeight: 200, clientHeight: 200, scrollTop: 0 });

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByText("Хариулт.")).not.toBeNull();
    });
    expect(transcript.scrollTo).toHaveBeenCalled();
  });

  it("does not force-scroll while the lawyer has scrolled up to re-read earlier text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/chat")) {
          return sseResponse([
            { event: "delta", data: { text: "Эхний" } },
            { event: "delta", data: { text: " хэсэг" } },
            {
              event: "done",
              data: { conversationId: "conv-1", message: { id: "m1", content: "Эхний хэсэг", citations: [] } },
            },
          ]);
        }
        return new Response(null, { status: 404 });
      }),
    );

    renderWorkbench();
    const form = typeDraft("Асуулт");
    const transcript = getTranscript();
    transcript.scrollTo = vi.fn();
    // Far from the bottom: the lawyer scrolled up to read earlier content.
    stubScrollMetrics(transcript, { scrollHeight: 1000, clientHeight: 200, scrollTop: 0 });
    fireEvent.scroll(transcript);

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByText("Эхний хэсэг")).not.toBeNull();
    });
    // Neither the initial submit nor any streamed delta nor the final
    // message pulled the lawyer's scroll position back down.
    expect(transcript.scrollTo).not.toHaveBeenCalled();
  });
});
