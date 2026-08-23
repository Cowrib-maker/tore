"use client";

import { useState } from "react";

import { parseSafeCitationsFromUnknown } from "@/application/ai/legal-ai-citation";
import type { LegalAiSafeCitation } from "@/application/ai/legal-ai-citation";
import {
  interpretLegalAiChatAccess,
  type LegalAiAccessGate,
} from "@/components/legal-ai/interpret-legal-ai-chat-access";
import { requestCitizenCheckout } from "@/components/legal-ai/request-citizen-checkout";

export type ChatMessage = {
  role: "USER" | "ASSISTANT";
  content: string;
  citations?: LegalAiSafeCitation[];
};

export function useLegalAiChatSession(initial?: {
  messages?: ChatMessage[];
  conversationId?: string;
  checkoutEnabled?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initial?.messages ?? [],
  );
  const [conversationId, setConversationId] = useState<string | undefined>(
    initial?.conversationId,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accessGate, setAccessGate] = useState<LegalAiAccessGate | null>(null);

  async function sendMessage(
    text: string,
    mode: "CITIZEN" | "PROFESSIONAL" = "CITIZEN",
  ): Promise<"ok" | "gated" | "error"> {
    setError("");
    setAccessGate(null);
    setMessages((current) => [...current, { role: "USER", content: text }]);
    setLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId, mode }),
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
        const checkout = await requestCitizenCheckout({
          enabled: initial?.checkoutEnabled,
        });
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
      setMessages((current) => [
        ...current,
        {
          role: "ASSISTANT",
          content: interpreted.content,
          citations: parseSafeCitationsFromUnknown(interpreted.citations),
        },
      ]);
      return "ok";
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "AI үйлчилгээтэй холбогдоход алдаа гарлаа.",
      );
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
  };
}
