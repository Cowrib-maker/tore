"use client";

import { FormEvent, useState } from "react";

type Message = {
  role: "USER" | "ASSISTANT";
  content: string;
};

export function LegalAiChat() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = message.trim();

    if (!text || loading) {
      return;
    }

    setError("");
    setMessage("");

    setMessages((current) => [
      ...current,
      {
        role: "USER",
        content: text,
      },
    ]);

    setLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          conversationId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "AI үйлчилгээтэй холбогдоход алдаа гарлаа.");
      }

      setConversationId(data.conversationId);

      setMessages((current) => [
        ...current,
        {
          role: "ASSISTANT",
          content: data.message.content,
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

  return (
    <section className="mx-auto flex min-h-[680px] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-[#0B1F3A]/10 bg-white shadow-[0_24px_80px_rgba(11,31,58,0.10)]">
      <header className="border-b border-[#0B1F3A]/10 bg-[#F8FAFC] px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7B8490]">
          TORE Legal AI
        </p>

        <h1 className="mt-1 text-xl font-semibold text-[#0A0F14]">
          Хууль зүйн туслах
        </h1>

        <p className="mt-1 text-sm text-[#66717D]">
          Хууль зүйн асуудлаа бичиж, нөхцөл байдлаа тодорхойлоорой.
        </p>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto bg-white p-6">
        {messages.length === 0 ? (
          <div className="flex min-h-[420px] items-center justify-center">
            <div className="max-w-lg text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#EEF3F8] text-lg font-bold text-[#0B1F3A]">
                T
              </div>

              <h2 className="mt-5 text-lg font-semibold text-[#0A0F14]">
                Танд ямар хууль зүйн асуудал байна вэ?
              </h2>

              <p className="mt-2 text-sm leading-6 text-[#66717D]">
                Асуудлаа аль болох дэлгэрэнгүй бичээрэй. TORE Legal AI
                таны нөхцөл байдлыг ойлгож, холбогдох дараагийн алхмуудыг
                тодорхойлоход тусална.
              </p>

              <div className="mt-6 grid gap-2 text-left sm:grid-cols-2">
                {[
                  "Гэрээгээ цуцлах эрхтэй юу?",
                  "Ажлаас үндэслэлгүй халсан бол яах вэ?",
                  "Өр төлбөрөө хэрхэн нэхэмжлэх вэ?",
                  "Шүүхэд нэхэмжлэл гаргахын өмнө юу хийх вэ?",
                ].map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setMessage(example)}
                    className="rounded-xl border border-[#E5E7EB] px-4 py-3 text-left text-sm text-[#3F4852] transition hover:border-[#0B1F3A]/30 hover:bg-[#F8FAFC]"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((item, index) => (
            <div
              key={`${item.role}-${index}`}
              className={
                item.role === "USER"
                  ? "flex justify-end"
                  : "flex justify-start gap-3"
              }
            >
              {item.role === "ASSISTANT" && (
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF3F8] text-sm font-bold text-[#0B1F3A]">
                  T
                </div>
              )}

              <div
                className={
                  item.role === "USER"
                    ? "max-w-[82%] rounded-2xl rounded-br-md bg-[#0B1F3A] px-4 py-3 text-sm leading-6 text-white"
                    : "max-w-[82%] rounded-2xl rounded-tl-md border border-[#0B1F3A]/8 bg-[#F8FAFC] px-4 py-4 text-sm leading-6 text-[#3F4852]"
                }
              >
                {item.content}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#EEF3F8] text-sm font-bold text-[#0B1F3A]">
              T
            </div>

            <div className="rounded-2xl rounded-tl-md border border-[#0B1F3A]/8 bg-[#F8FAFC] px-4 py-3 text-sm text-[#66717D]">
              TORE Legal AI хариулж байна...
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-[#0B1F3A]/10 bg-white p-4"
      >
        <div className="flex items-end gap-3 rounded-2xl border border-[#D9DEE5] bg-[#F8FAFC] p-2 focus-within:border-[#0B1F3A]/40">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Хууль зүйн асуудлаа энд бичнэ үү..."
            rows={2}
            className="min-h-12 flex-1 resize-none bg-transparent px-3 py-2 text-sm text-[#0A0F14] outline-none placeholder:text-[#9AA3AD]"
            disabled={loading}
          />

          <button
            type="submit"
            disabled={!message.trim() || loading}
            className="rounded-xl bg-[#0B1F3A] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#173A66] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Илгээх
          </button>
        </div>

        <p className="mt-2 px-2 text-[11px] text-[#8A939D]">
          TORE Legal AI нь мэдээлэл, урьдчилсан чиглэл өгөх зориулалттай.
          Шаардлагатай тохиолдолд мэргэшсэн өмгөөлөгч, хуульчтай зөвлөлдөнө үү.
        </p>
      </form>
    </section>
  );
}