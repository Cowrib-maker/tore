"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

import { LegalAiAccessGateCard } from "@/components/legal-ai/legal-ai-access-gate";
import { LegalAiEntitlementBanner } from "@/components/legal-ai/legal-ai-entitlement-banner";
import { useLegalAiChatSession } from "@/components/legal-ai/use-legal-ai-chat-session";

export function HeroLegalAiComposer({
  placeholder,
  checkoutEnabled = false,
}: {
  placeholder: string;
  checkoutEnabled?: boolean;
}) {
  const [question, setQuestion] = useState("");
  const { messages, loading, error, accessGate, sendMessage } =
    useLegalAiChatSession({ checkoutEnabled });
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading, accessGate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || loading) return;
    setQuestion("");
    const result = await sendMessage(text);
    if (result === "gated") {
      setQuestion(text);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-3">
      <LegalAiEntitlementBanner />
      {messages.length > 0 ? (
        <div
          ref={transcriptRef}
          className="max-h-80 space-y-3 overflow-y-auto rounded-2xl border border-[#0B1F3A]/10 bg-white p-4 text-left shadow-[0_16px_40px_-20px_rgba(11,31,58,0.3)]"
        >
          {messages.map((item, index) => (
            <div
              key={index}
              className={
                item.role === "USER" ? "flex justify-end" : "flex justify-start"
              }
            >
              <div
                className={
                  item.role === "USER"
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-[#0B1F3A] px-3 py-2 text-[13px] leading-5 whitespace-pre-wrap text-white"
                    : "max-w-[85%] rounded-2xl rounded-tl-md border border-[#0B1F3A]/8 bg-[#F8FAFC] px-3 py-2 text-[13px] leading-5 whitespace-pre-wrap text-[#0A0F14]"
                }
              >
                {item.content}
              </div>
            </div>
          ))}
          {loading ? (
            <p className="text-xs text-[#8A939D]">
              TORE Legal AI бичиж байна...
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
      {accessGate ? <LegalAiAccessGateCard gate={accessGate} /> : null}

      <form
        onSubmit={handleSubmit}
        className="flex w-full items-center gap-2 rounded-full border border-[#0B1F3A]/12 bg-white py-2 pr-2 pl-5 shadow-[0_16px_40px_-20px_rgba(11,31,58,0.35)] transition focus-within:border-[#0B1F3A]/30"
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={placeholder}
          disabled={loading}
          className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-[#0A0F14] outline-none placeholder:text-[#9AA3AD]"
        />
        <button
          type="submit"
          aria-label="Илгээх"
          disabled={!question.trim() || loading}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A] text-white transition hover:bg-[#173A66] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp className="size-4" />
        </button>
      </form>
    </div>
  );
}
