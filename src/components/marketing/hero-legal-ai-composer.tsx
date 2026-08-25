"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

import { LegalAiAccessGateCard } from "@/components/legal-ai/legal-ai-access-gate";
import { LegalAiEntitlementBanner } from "@/components/legal-ai/legal-ai-entitlement-banner";
import { useLegalAiChatSession } from "@/components/legal-ai/use-legal-ai-chat-session";

export function HeroLegalAiComposer({
  placeholder,
  submitLabel = "Илгээх",
  typingLabel = "TORE Chat бичиж байна...",
  checkoutEnabled = false,
}: {
  placeholder: string;
  submitLabel?: string;
  typingLabel?: string;
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
    <div className="mx-auto w-full max-w-2xl space-y-3">
      <LegalAiEntitlementBanner />
      {messages.length > 0 ? (
        <div
          ref={transcriptRef}
          className="max-h-80 space-y-3 overflow-y-auto rounded-3xl border border-[#0B1F3A]/10 bg-white p-4 text-left shadow-[0_20px_50px_-24px_rgba(11,31,58,0.28)]"
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
                    : "max-w-[85%] rounded-2xl rounded-tl-md border border-[#0B1F3A]/8 bg-[#E8F4F1] px-3 py-2 text-[13px] leading-5 whitespace-pre-wrap text-[#0A0F14]"
                }
              >
                {item.content}
              </div>
            </div>
          ))}
          {loading ? (
            <p className="text-xs text-[#8A939D]">{typingLabel}</p>
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
        className="rounded-3xl border border-[#0B1F3A]/10 bg-white p-3 shadow-[0_22px_50px_-24px_rgba(11,31,58,0.32)] transition focus-within:border-[#1A7A72]/45"
      >
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={placeholder}
          disabled={loading}
          rows={4}
          className="min-h-[6.5rem] w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-6 text-[#0A0F14] outline-none placeholder:text-[#9AA3AD]"
        />
        <div className="flex items-center justify-end pt-1">
          <button
            type="submit"
            aria-label={submitLabel}
            disabled={!question.trim() || loading}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A] text-white transition hover:bg-[#173A66] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
