"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Send, X } from "lucide-react";

import { ToreLogo } from "@/components/brand/tore-logo";
import {
  OPEN_LEGAL_AI_WIDGET_EVENT,
  type OpenLegalAiWidgetDetail,
} from "@/components/legal-ai/legal-ai-widget-events";
import { LegalAiAccessGateCard } from "@/components/legal-ai/legal-ai-access-gate";
import { LegalAiDutyNotice } from "@/components/legal-ai/legal-ai-duty-notice";
import { useLegalAiChatSession } from "@/components/legal-ai/use-legal-ai-chat-session";

const HIDDEN_PATH_PREFIX = "/legal-ai";

export function FloatingLegalAiWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const { messages, conversationId, loading, error, accessGate, sendMessage } =
    useLegalAiChatSession();
  useEffect(() => {
    function handleOpenRequest(event: Event) {
      setOpen(true);
      const detail = (event as CustomEvent<OpenLegalAiWidgetDetail>).detail;
      if (detail?.message) {
        void sendMessage(detail.message);
      }
    }
    window.addEventListener(OPEN_LEGAL_AI_WIDGET_EVENT, handleOpenRequest);
    return () =>
      window.removeEventListener(OPEN_LEGAL_AI_WIDGET_EVENT, handleOpenRequest);
  }, [sendMessage]);

  // usePathname() can be null during SSR; never render the chrome until the
  // path is known, otherwise "/" SSR may emit the FAB and the client removes it.
  if (
    !pathname ||
    pathname === "/" ||
    pathname.startsWith(HIDDEN_PATH_PREFIX)
  ) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || loading) {
      return;
    }
    setMessage("");
    await sendMessage(text);
  }

  const fullChatHref = conversationId
    ? `/legal-ai?conversationId=${conversationId}`
    : "/legal-ai";

  return (
    <div className="fixed right-4 bottom-4 z-50 sm:right-6 sm:bottom-6">
      {open ? (
        <div className="flex h-[30rem] w-[21rem] flex-col overflow-hidden rounded-2xl border border-[#0B1F3A]/10 bg-white shadow-[0_24px_60px_rgba(11,31,58,0.22)] sm:w-[23rem]">
          <div className="flex items-center justify-between bg-[#0B1F3A] px-4 py-3">
            <Link
              href={fullChatHref}
              className="flex min-w-0 items-center gap-2 text-white transition hover:opacity-85"
            >
              <ToreLogo variant="mark" tone="on-dark" markClassName="size-5" />
              <span className="truncate text-sm font-semibold">
                TORE Chat
              </span>
            </Link>
            <button
              type="button"
              aria-label="Хаах"
              onClick={() => setOpen(false)}
              className="shrink-0 rounded-md p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.length === 0 ? (
              <p className="mt-8 text-center text-sm leading-6 text-[#5C6570]">
                Хууль зүйн асуудлаа энд бичээрэй. Дэлгэрэнгүй ажиллахыг
                хүсвэл дээрх нэрэн дээр дараарай.
              </p>
            ) : (
              messages.map((item, index) => (
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
              ))
            )}
            {loading ? (
              <p className="text-xs text-[#8A939D]">
                TORE Chat бичиж байна...
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-xs text-red-600">
                {error}
              </p>
            ) : null}
            {accessGate ? (
              <LegalAiAccessGateCard
                gate={accessGate}
                onPaid={() =>
                  void sendMessage(accessGate.question, undefined, {
                    resume: true,
                  })
                }
              />
            ) : null}
          </div>

          <LegalAiDutyNotice variant="citizen" className="border-t border-[#0B1F3A]/8 px-3 py-2" />
          <form onSubmit={handleSubmit} className="p-2">
            <div className="flex items-center gap-2 rounded-xl border border-[#D9DEE5] bg-[#F8FAFC] px-2 py-1.5">
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Асуултаа бичнэ үү..."
                className="min-w-0 flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-[#9AA3AD]"
                disabled={loading}
              />
              <button
                type="submit"
                aria-label="Илгээх"
                disabled={!message.trim() || loading}
                className="shrink-0 rounded-lg bg-[#0B1F3A] p-2 text-white transition hover:bg-[#173A66] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="size-3.5" />
              </button>
            </div>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="TORE Chat нээх"
          className="flex size-14 items-center justify-center rounded-full bg-[#0B1F3A] text-white shadow-[0_16px_40px_rgba(11,31,58,0.35)] transition hover:bg-[#173A66]"
        >
          <MessageCircle className="size-6" />
        </button>
      )}
    </div>
  );
}
