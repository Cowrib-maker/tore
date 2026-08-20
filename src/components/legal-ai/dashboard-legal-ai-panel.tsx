"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

import { useLegalAiChatSession } from "@/components/legal-ai/use-legal-ai-chat-session";

export function DashboardLegalAiPanel({
  mode = "PROFESSIONAL",
}: {
  mode?: "CITIZEN" | "PROFESSIONAL";
}) {
  const [message, setMessage] = useState("");
  const { messages, loading, error, sendMessage } = useLegalAiChatSession();
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || loading) return;
    setMessage("");
    await sendMessage(text, mode);
  }

  return (
    <div className="flex flex-col">
      <div
        ref={transcriptRef}
        className="max-h-[26rem] min-h-[10rem] space-y-3 overflow-y-auto bg-[#FAFBFC] p-4 sm:p-5"
      >
        {messages.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-[#5C6570]">
            Хэргийн талаар асуултаа энд бичээрэй — TORE Legal AI баталгаатай
            эх сурвалж дээр үндэслэн хариулна.
          </p>
        ) : (
          messages.map((item, index) =>
            item.role === "USER" ? (
              <div
                key={index}
                className="ml-6 rounded-2xl rounded-tr-md bg-[#0B1F3A] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-white"
              >
                {item.content}
              </div>
            ) : (
              <div
                key={index}
                className="mr-2 space-y-3 rounded-2xl rounded-tl-md border border-[#0B1F3A]/10 bg-white p-4"
              >
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-[#0A0F14]">
                  {item.content}
                </p>
              </div>
            ),
          )
        )}
        {loading ? (
          <p className="text-[12px] text-[#8A939D]">
            TORE Legal AI бичиж байна...
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-[12px] text-red-600">
            {error}
          </p>
        ) : null}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-[#0B1F3A]/8 p-3"
      >
        <div className="flex items-center gap-2 rounded-xl border border-[#D9DEE5] bg-[#F8FAFC] px-2.5 py-1.5">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Хэргийн талаар асуух..."
            disabled={loading}
            className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-[#9AA3AD]"
          />
          <button
            type="submit"
            aria-label="Илгээх"
            disabled={!message.trim() || loading}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#0B1F3A] text-white transition hover:bg-[#173A66] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="size-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
