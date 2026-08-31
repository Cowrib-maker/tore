"use client";

import { useEffect, useRef, useState } from "react";

import { parseSafeCitationsFromUnknown } from "@/application/ai/legal-ai-citation";
import type { LegalAiSafeCitation } from "@/application/ai/legal-ai-citation";
import { LEGAL_AI_CHAT_RETRY_MESSAGE } from "@/components/legal-ai/legal-ai-chat-errors";
import {
  interpretLegalAiChatAccess,
  type LegalAiAccessGate,
} from "@/components/legal-ai/interpret-legal-ai-chat-access";
import { requestLawyerCheckout } from "@/components/legal-ai/request-lawyer-checkout";

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

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId: conversationIdRef.current,
        }),
      });

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
      });

      if (interpreted.type === "auth") {
        setAccessGate(interpreted.gate);
        return "gated";
      }

      if (interpreted.type === "billing") {
        const checkout =
          initial?.billingAudience === "lawyer"
            ? await requestLawyerCheckout()
            : { view: null, error: undefined };
        setAccessGate({
          ...interpreted.gate,
          checkout: checkout.view,
          checkoutError: checkout.error,
        });
        return "gated";
      }

      if (interpreted.type === "error") {
        throw new Error(interpreted.message);
      }

      setConversationId(interpreted.conversationId);
      conversationIdRef.current = interpreted.conversationId;
      setMessages((current) => [
        ...current,
        {
          role: "ASSISTANT",
          content: interpreted.content,
          citations: parseSafeCitationsFromUnknown(interpreted.citations),
        },
      ]);
      return "ok";
    } catch {
      setError(LEGAL_AI_CHAT_RETRY_MESSAGE);
      return "error";
    } finally {
      setLoading(false);
    }
  }

  return {
    messages,
    conversationId,
    loading,
    error,
    accessGate,
    sendMessage,
    setMessages,
    /**
     * Lets a caller sync in a conversationId obtained from a side-channel
     * (e.g. a PDF upload endpoint that creates/reuses the conversation
     * before the first chat message is sent).
     */
    setConversationId,
  };
}
