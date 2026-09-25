"use client";

import { useEffect, useRef, useState } from "react";

import { parseSafeCitationsFromUnknown } from "@/application/ai/legal-ai-citation";
import type { LegalAiSafeCitation } from "@/application/ai/legal-ai-citation";
import { LEGAL_AI_CHAT_RETRY_MESSAGE } from "@/components/legal-ai/legal-ai-chat-errors";
import {
  interpretLegalAiChatAccess,
  type LegalAiAccessGate,
} from "@/components/legal-ai/interpret-legal-ai-chat-access";
import { parseSseStream } from "@/lib/parse-sse-stream";

export type ChatMessage = {
  role: "USER" | "ASSISTANT";
  content: string;
  citations?: LegalAiSafeCitation[];
};

export function useLegalAiChatSession(initial?: {
  messages?: ChatMessage[];
  conversationId?: string;
  checkoutEnabled?: boolean;
  billingAudience?: "citizen" | "lawyer";
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initial?.messages ?? [],
  );
  const [conversationId, setConversationId] = useState<string | undefined>(
    initial?.conversationId,
  );
  const conversationIdRef = useRef(conversationId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accessGate, setAccessGate] = useState<LegalAiAccessGate | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  async function sendMessage(
    text: string,
    _mode?: "CITIZEN" | "PROFESSIONAL",
    options?: { resume?: boolean },
  ): Promise<"ok" | "gated" | "error"> {
    setError("");
    setAccessGate(null);
    if (!options?.resume) {
      setMessages((current) => [...current, { role: "USER", content: text }]);
    }
    setLoading(true);

    // Tracks whether a streaming ASSISTANT placeholder has been appended
    // yet, mirroring legal-ai-chat.tsx's own pattern — an incomplete turn
    // must never linger as a visible (and un-persisted) "successful"
    // message if the stream errors or aborts partway through.
    let streamingMessageAdded = false;
    const removeStreamingPlaceholder = () => {
      if (!streamingMessageAdded) return;
      setMessages((current) => current.slice(0, -1));
      streamingMessageAdded = false;
    };
    const appendStreamingDelta = (delta: string) => {
      if (!streamingMessageAdded) {
        streamingMessageAdded = true;
        setMessages((current) => [...current, { role: "ASSISTANT", content: delta }]);
        return;
      }
      setMessages((current) => {
        const next = current.slice();
        const last = next[next.length - 1];
        if (!last || last.role !== "ASSISTANT") return current;
        next[next.length - 1] = { ...last, content: last.content + delta };
        return next;
      });
    };

    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId: conversationIdRef.current,
        }),
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        // Every non-streaming response is a pre-LLM failure (auth/billing/
        // rate-limit/validation) — the route only ever returns plain JSON
        // before it commits to a stream. Once it commits, EVERY outcome
        // (success, or a failure discovered mid-turn such as exhausted
        // entitlement) arrives as an SSE frame instead — see below.
        const data = (await response.json()) as {
          error?: string;
          code?: string;
          conversationId?: string;
          message?: { content?: string; citations?: unknown };
        };

        const interpreted = interpretLegalAiChatAccess({
          status: response.status,
          body: data,
          question: text,
          audience: initial?.billingAudience,
        });

        if (interpreted.type === "auth" || interpreted.type === "billing") {
          // Checkout is no longer auto-created here — the gate card lets
          // the user pick a payment method (QR / bank transfer / QPay)
          // first, for both audiences, then creates the checkout for
          // whichever one they choose.
          setAccessGate(interpreted.gate);
          return "gated";
        }
        if (interpreted.type === "error") {
          throw new Error(interpreted.message);
        }
        return "ok";
      }

      if (!response.body) {
        throw new Error("empty stream body");
      }

      for await (const frame of parseSseStream(response.body)) {
        if (frame.event === "delta") {
          const { text: delta } = frame.data as { text: string };
          if (delta) appendStreamingDelta(delta);
        } else if (frame.event === "done") {
          const payload = frame.data as {
            conversationId?: string;
            message?: { content?: string; citations?: unknown };
          };
          setConversationId(payload.conversationId);
          conversationIdRef.current = payload.conversationId;
          const finalMessage: ChatMessage = {
            role: "ASSISTANT",
            content: payload.message?.content ?? "",
            citations: parseSafeCitationsFromUnknown(payload.message?.citations),
          };
          if (streamingMessageAdded) {
            setMessages((current) => {
              const next = current.slice();
              next[next.length - 1] = finalMessage;
              return next;
            });
          } else {
            setMessages((current) => [...current, finalMessage]);
          }
        } else if (frame.event === "error") {
          removeStreamingPlaceholder();
          // A mid-stream error (createTurn() throwing after the route has
          // already committed to text/event-stream — e.g. exhausted
          // entitlement) arrives as this SSE frame, not as the
          // non-streaming JSON response handled above. It must go through
          // the same access-gate interpretation, or a real "you need to
          // pay/log in" case degrades into an opaque retry error with no
          // way to check out.
          const payload = frame.data as { error?: string; status?: number };
          const interpreted = interpretLegalAiChatAccess({
            status: payload.status ?? 500,
            body: payload,
            question: text,
            audience: initial?.billingAudience,
          });
          if (interpreted.type === "auth" || interpreted.type === "billing") {
            setAccessGate(interpreted.gate);
            return "gated";
          }
          throw new Error(interpreted.type === "error" ? interpreted.message : "stream error");
        }
      }
      return "ok";
    } catch (err) {
      removeStreamingPlaceholder();
      if (err instanceof DOMException && err.name === "AbortError") {
        return "error";
      }
      setError(LEGAL_AI_CHAT_RETRY_MESSAGE);
      return "error";
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return {
    messages,
    conversationId,
    loading,
    error,
    accessGate,
    sendMessage,
    stop,
    setMessages,
    /**
     * Lets a caller sync in a conversationId obtained from a side-channel
     * (e.g. a PDF upload endpoint that creates/reuses the conversation
     * before the first chat message is sent).
     */
    setConversationId,
  };
}
