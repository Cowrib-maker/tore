"use client";

import { useState } from "react";

import { parseSafeCitationsFromUnknown } from "@/application/ai/legal-ai-citation";
import type { LegalAiSafeCitation } from "@/application/ai/legal-ai-citation";
import { loginHrefForLegalAi } from "@/domain/services/rbac";

export type ChatMessage = {
  role: "USER" | "ASSISTANT";
  content: string;
  citations?: LegalAiSafeCitation[];
};

export function useLegalAiChatSession(initial?: {
  messages?: ChatMessage[];
  conversationId?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initial?.messages ?? [],
  );
  const [conversationId, setConversationId] = useState<string | undefined>(
    initial?.conversationId,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendMessage(
    text: string,
    mode: "CITIZEN" | "PROFESSIONAL" = "CITIZEN",
  ) {
    setError("");
    setMessages((current) => [...current, { role: "USER", content: text }]);
    setLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId, mode }),
      });

      const data = (await response.json()) as {
        error?: string;
        conversationId?: string;
        message?: { content?: string; citations?: unknown };
      };

      if (response.status === 401) {
        window.location.assign(loginHrefForLegalAi(text));
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error ?? "AI үйлчилгээтэй холбогдоход алдаа гарлаа.",
        );
      }

      setConversationId(data.conversationId);
      setMessages((current) => [
        ...current,
        {
          role: "ASSISTANT",
          content: data.message?.content ?? "",
          citations: parseSafeCitationsFromUnknown(data.message?.citations),
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "AI үйлчилгээтэй холбогдоход алдаа гарлаа.",
      );
    } finally {
      setLoading(false);
    }
  }

  return {
    messages,
    conversationId,
    loading,
    error,
    sendMessage,
    setMessages,
  };
}
