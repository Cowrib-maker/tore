"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Paperclip, Sparkles } from "lucide-react";

/**
 * Real entry point into the existing Legal AI flow — never a local fake
 * responder. Submitting navigates to /legal-ai with the draft carried over
 * (LawyerAiWorkbench's initialDraft), where the actual conversation,
 * streaming, entitlement and attachment handling already live. This
 * intentionally does not duplicate that engine here.
 */
export function LawyerWorkspaceAiComposer() {
  const router = useRouter();
  const [draft, setDraft] = useState("");

  function goToLegalAi(question: string) {
    const text = question.trim();
    router.push(text ? `/legal-ai?q=${encodeURIComponent(text)}` : "/legal-ai");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    goToLegalAi(draft);
  }

  return (
    <section className="relative overflow-hidden rounded-xl border border-[#0B1F3A]/10 bg-white p-4 shadow-[0_8px_24px_-4px_rgba(15,32,56,0.06)] transition-all focus-within:border-[#0B5CFF] focus-within:ring-2 focus-within:ring-[#0B5CFF]/10">
      <div className="mb-2.5 flex items-center gap-2 border-b border-[#0B1F3A]/8 pb-2.5">
        <span className="flex size-5 items-center justify-center rounded bg-[#0B5CFF] text-white">
          <Sparkles className="size-3" />
        </span>
        <span className="text-[14px] font-bold text-[#0B1F3A]">TORE Legal AI</span>
      </div>

      <form onSubmit={handleSubmit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          rows={2}
          placeholder="Хэрэг, хууль, баримт бичгийн талаар асуу..."
          className="w-full resize-none border-0 bg-transparent p-0 text-sm text-[#0B1F3A] placeholder:text-[#8A939D] focus:ring-0"
        />

        <div className="mt-1 flex flex-wrap items-center justify-between gap-2.5 border-t border-[#0B1F3A]/6 pt-2.5">
          <button
            type="button"
            onClick={() => goToLegalAi(draft)}
            className="inline-flex items-center gap-1 rounded-md border border-[#0B1F3A]/10 bg-white px-2.5 py-1 text-xs font-medium text-[#3F4852] transition-colors hover:bg-[#F8FAFC]"
          >
            <Paperclip className="size-3.5 text-[#8A939D]" />
            Файл хавсаргах (Legal AI-д)
          </button>

          <button
            type="submit"
            className="flex h-8 items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-4 text-[13px] font-medium text-white transition-all hover:bg-[#132A47]"
          >
            Legal AI руу
            <ArrowUp className="size-4 rotate-45" />
          </button>
        </div>
      </form>
    </section>
  );
}
