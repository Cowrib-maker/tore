"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

import { LegalAiAccessGateCard } from "@/components/legal-ai/legal-ai-access-gate";
import { LegalAiDutyNotice } from "@/components/legal-ai/legal-ai-duty-notice";
import { LegalAiEntitlementBanner } from "@/components/legal-ai/legal-ai-entitlement-banner";
import { useLegalAiChatSession } from "@/components/legal-ai/use-legal-ai-chat-session";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";

export function HeroLegalAiComposer({
  placeholder,
  submitLabel = "Илгээх",
  typingLabel = "TORE Chat бичиж байна...",
  checkoutEnabled = false,
  suggestionsLabel,
  suggestions,
}: {
  placeholder: string;
  submitLabel?: string;
  typingLabel?: string;
  checkoutEnabled?: boolean;
  suggestionsLabel?: string;
  suggestions?: string[];
}) {
  const [question, setQuestion] = useState("");
  const { messages, loading, error, accessGate, sendMessage } =
    useLegalAiChatSession({ checkoutEnabled });
  const transcriptRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useAutoResizeTextarea(textareaRef, question);

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
          className="max-h-80 space-y-3 overflow-y-auto rounded-3xl border border-ai-border bg-ai-surface p-4 text-left shadow-[0_20px_50px_-24px_rgba(11,31,58,0.28)]"
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
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-ai-accent px-3 py-2 text-[13px] leading-5 whitespace-pre-wrap text-ai-accent-foreground"
                    : "max-w-[85%] rounded-2xl rounded-tl-md border border-ai-border bg-ai-surface-muted px-3 py-2 text-[13px] leading-5 whitespace-pre-wrap text-ai-text"
                }
              >
                {item.content}
              </div>
            </div>
          ))}
          {loading ? (
            <p className="text-xs text-ai-text-subtle">{typingLabel}</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
      {accessGate ? (
        <LegalAiAccessGateCard
          gate={accessGate}
          onPaid={() =>
            void sendMessage(accessGate.question, undefined, { resume: true })
          }
        />
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="rounded-3xl border border-ai-border bg-ai-surface p-3 shadow-[0_22px_50px_-24px_rgba(11,31,58,0.32)] transition focus-within:border-[#0B5CFF]/45"
      >
        <textarea
          ref={textareaRef}
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
          rows={1}
          className="min-h-12 w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-6 text-ai-text outline-none placeholder:text-ai-text-subtle"
        />
        <div className="flex items-center justify-end pt-1">
          <button
            type="submit"
            aria-label={submitLabel}
            disabled={!question.trim() || loading}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ai-accent text-ai-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </form>

      {suggestions?.length && messages.length === 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-2 text-left sm:justify-start">
          <span className="text-xs font-medium text-[#5C6570]">
            {suggestionsLabel}
          </span>
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setQuestion(item);
                textareaRef.current?.focus();
              }}
              className="rounded-full border border-[#0B1F3A]/10 bg-white px-3 py-1 text-xs font-medium text-[#0B1F3A] transition hover:border-[#0B5CFF]/40 hover:bg-[#E8F0FE] hover:text-[#0B5CFF]"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}

      <LegalAiDutyNotice variant="citizen" className="px-1 text-center" />
    </div>
  );
}
