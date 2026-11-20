// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

import { LEGAL_AI_CHAT_RETRY_MESSAGE } from "@/components/legal-ai/legal-ai-chat-errors";
import { useLegalAiChatSession } from "@/components/legal-ai/use-legal-ai-chat-session";

/**
 * The SSE stream behind /api/ai/chat can end without its terminal frame (`done` or `error`) — a connection closed cleanly mid-answer.
 * That must be a failed turn, never a truncated answer shown as final. Companion to legal-ai-chat-streaming.test.tsx (LegalAiChat) and
 * lawyer-ai-workbench-streaming.test.tsx (workbench), which cover the other two consumers of the same stream.
 */
function sseResponse(frames: Array<{ event: string; data: unknown }>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(`event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useLegalAiChatSession — stream ending without a terminal frame", () => {
  it("a complete turn (delta + done) is unchanged: one final assistant message, no error, conversation id kept", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([
      { event: "delta", data: { text: "Хариулт." } },
      { event: "done", data: { conversationId: "conv-1", message: { id: "m1", content: "Хариулт.", citations: [] } } },
    ])));
    const { result } = renderHook(() => useLegalAiChatSession());
    let outcome: string | undefined;
    await act(async () => { outcome = await result.current.sendMessage("Асуулт"); });
    expect(outcome).toBe("ok");
    expect(result.current.error).toBe("");
    expect(result.current.conversationId).toBe("conv-1");
    expect(result.current.messages.map((m) => [m.role, m.content])).toEqual([["USER", "Асуулт"], ["ASSISTANT", "Хариулт."]]);
  });

  it("text without a done/error frame is an error: the partial bubble is removed and the retry message is shown", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([{ event: "delta", data: { text: "Таслагдсан хариулт" } }])));
    const { result } = renderHook(() => useLegalAiChatSession());
    let outcome: string | undefined;
    await act(async () => { outcome = await result.current.sendMessage("Асуулт"); });
    expect(outcome).toBe("error");
    expect(result.current.error).toBe(LEGAL_AI_CHAT_RETRY_MESSAGE);
    expect(result.current.messages.map((m) => m.content)).toEqual(["Асуулт"]);
    expect(result.current.conversationId).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });

  it("a stream that ends cleanly right after the user pressed Stop is the quiet abort path: no error message, partial bubble removed", async () => {
    const encoder = new TextEncoder();
    let closeStream: (() => void) | null = null;
    vi.stubGlobal("fetch", vi.fn(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: "Хагас" })}\n\n`));
          closeStream = () => controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
    }));
    const { result } = renderHook(() => useLegalAiChatSession());
    let pending: Promise<string> | undefined;
    await act(async () => { pending = result.current.sendMessage("Асуулт"); await new Promise((r) => setTimeout(r, 20)); });
    await act(async () => { result.current.stop(); closeStream?.(); await pending; });
    expect(result.current.error).toBe("");
    expect(result.current.messages.map((m) => m.content)).toEqual(["Асуулт"]);
    expect(result.current.loading).toBe(false);
  });

  it("an empty stream (no frames) is an error, not a silent success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([])));
    const { result } = renderHook(() => useLegalAiChatSession());
    let outcome: string | undefined;
    await act(async () => { outcome = await result.current.sendMessage("Асуулт"); });
    expect(outcome).toBe("error");
    expect(result.current.error).toBe(LEGAL_AI_CHAT_RETRY_MESSAGE);
    expect(result.current.messages.map((m) => m.content)).toEqual(["Асуулт"]);
  });
});
