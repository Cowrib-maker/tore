// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LegalAiChat } from "@/components/legal-ai/legal-ai-chat";

/**
 * Sprint 14 launch-critical UX — streaming-ready transcript auto-scroll.
 *
 * Exercises the real LegalAiChat component (not a stand-in), with fetch
 * mocked for the two network calls it makes: the entitlement banner's
 * mount-time GET (irrelevant here, mocked to a harmless failure) and the
 * actual /api/ai/chat POST that lands a new assistant message. jsdom has no
 * layout engine, so scrollHeight/clientHeight/scrollTop are stubbed
 * directly on the transcript container, matching the technique already
 * used for the composer scroll tests.
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

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/ai/entitlement")) {
        return new Response(null, { status: 204 });
      }
      if (url.includes("/api/ai/chat")) {
        return sseResponse([
          { event: "delta", data: { text: "Хари" } },
          { event: "delta", data: { text: "улт" } },
          {
            event: "done",
            data: {
              conversationId: "conv-1",
              message: { id: "msg-1", content: "Хариулт", citations: [] },
            },
          },
        ]);
      }
      return new Response(null, { status: 404 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

function renderChat() {
  return render(
    <LegalAiChat
      initialMessages={[{ role: "USER", content: "Асуулт 1" }]}
      dashboardHref={null}
      signInLabel="Нэвтрэх"
      getStartedLabel="Эхлэх"
      dashboardLabel="Хяналтын самбар"
    />,
  );
}

function getTranscript(): HTMLElement {
  // The scrollable transcript is the only element with this exact
  // combination in the non-empty layout — see legal-ai-chat.tsx's
  // `overflow-y-auto` container holding the message list.
  const candidates = document.querySelectorAll(".overflow-y-auto");
  const el = Array.from(candidates).find((node) => node.querySelector(".max-w-3xl"));
  if (!el) throw new Error("transcript container not found");
  return el as HTMLElement;
}

describe("LegalAiChat — transcript auto-follow / new-response control", () => {
  it("auto-scrolls to bottom when a new message arrives while already near the bottom", async () => {
    renderChat();
    const transcript = getTranscript();
    transcript.scrollTo = vi.fn();
    stubScrollMetrics(transcript, { scrollHeight: 200, clientHeight: 200, scrollTop: 0 });

    const textarea = screen.getByPlaceholderText(/Асуудлаа өөрийнхөөрөө бичээрэй/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Асуулт 2" } });
    const form = textarea.closest("form")!;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByText("Хариулт")).not.toBeNull();
    });
    expect(transcript.scrollTo).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Шинэ хариулт/i })).toBeNull();
  });

  it("does not force-scroll and shows the new-response control when the user has scrolled up", async () => {
    renderChat();
    const transcript = getTranscript();
    transcript.scrollTo = vi.fn();
    // Far from the bottom: user is reading earlier content.
    stubScrollMetrics(transcript, { scrollHeight: 1000, clientHeight: 200, scrollTop: 0 });
    fireEvent.scroll(transcript);

    const textarea = screen.getByPlaceholderText(/Асуудлаа өөрийнхөөрөө бичээрэй/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Асуулт 2" } });
    const form = textarea.closest("form")!;
    const scrollToCallsBefore = (transcript.scrollTo as ReturnType<typeof vi.fn>).mock.calls.length;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByText("Хариулт")).not.toBeNull();
    });
    const scrollToCallsAfter = (transcript.scrollTo as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(scrollToCallsAfter).toBe(scrollToCallsBefore);

    const jumpButton = await screen.findByRole("button", { name: /Шинэ хариулт/i });
    expect(jumpButton).not.toBeNull();
  });

  it("clicking the new-response control scrolls to the bottom and hides itself", async () => {
    renderChat();
    const transcript = getTranscript();
    transcript.scrollTo = vi.fn();
    stubScrollMetrics(transcript, { scrollHeight: 1000, clientHeight: 200, scrollTop: 0 });
    fireEvent.scroll(transcript);

    const textarea = screen.getByPlaceholderText(/Асуудлаа өөрийнхөөрөө бичээрэй/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Асуулт 2" } });
    await act(async () => {
      fireEvent.submit(textarea.closest("form")!);
    });

    const jumpButton = await screen.findByRole("button", { name: /Шинэ хариулт/i });
    fireEvent.click(jumpButton);

    expect(transcript.scrollTo).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Шинэ хариулт/i })).toBeNull();
    });
  });

  it("scrolling back near the bottom clears the new-response control without clicking it", async () => {
    renderChat();
    const transcript = getTranscript();
    transcript.scrollTo = vi.fn();
    stubScrollMetrics(transcript, { scrollHeight: 1000, clientHeight: 200, scrollTop: 0 });
    fireEvent.scroll(transcript);

    const textarea = screen.getByPlaceholderText(/Асуудлаа өөрийнхөөрөө бичээрэй/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Асуулт 2" } });
    await act(async () => {
      fireEvent.submit(textarea.closest("form")!);
    });
    await screen.findByRole("button", { name: /Шинэ хариулт/i });

    stubScrollMetrics(transcript, { scrollHeight: 1000, clientHeight: 200, scrollTop: 795 });
    fireEvent.scroll(transcript);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Шинэ хариулт/i })).toBeNull();
    });
  });
});
