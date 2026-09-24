"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUp, Paperclip, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * Shared "AI workspace composer" visual — the same submit path the public
 * homepage's Legal AI chat already uses (`/legal-ai?q=`), just reframed
 * for an authenticated workspace shell (Firm/Team/Student). A real,
 * working entry point into Legal AI, not a decorative search box —
 * attachment/knowledge-source selection stay visibly inert ("Тун
 * удахгүй") since no organization-scoped document/knowledge feature
 * exists yet to back them.
 */
export function WorkspaceAiComposer({
  placeholder,
  attachLabel,
  aiLabel,
  knowledgeLabel,
  comingSoonLabel,
}: {
  placeholder: string;
  attachLabel: string;
  aiLabel: string;
  knowledgeLabel: string;
  comingSoonLabel: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    router.push(`/legal-ai?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-3 shadow-[0_1px_2px_rgba(11,31,58,0.04),0_12px_28px_-16px_rgba(11,31,58,0.18)] sm:p-4">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        rows={2}
        className="max-h-40 w-full resize-none border-0 bg-transparent px-1 py-1 text-[15px] text-[#0B1F3A] placeholder:text-[#8A939D] focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#0B1F3A]/6 pt-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-[#0B1F3A]/10 bg-[#F7F8FB] px-3 py-1.5 text-[12.5px] font-medium text-[#5C6570] opacity-70">
            <Paperclip className="size-3.5" />
            {attachLabel}
            <Badge variant="secondary" className="ml-0.5 text-[9px]">
              {comingSoonLabel}
            </Badge>
          </span>
          <span className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-[#0B1F3A]/10 bg-[#F7F8FB] px-3 py-1.5 text-[12.5px] font-medium text-[#5C6570] opacity-70">
            <Sparkles className="size-3.5" />
            {aiLabel}
          </span>
          <span className="hidden cursor-not-allowed items-center gap-1.5 rounded-full border border-[#0B1F3A]/10 bg-[#F7F8FB] px-3 py-1.5 text-[12.5px] font-medium text-[#5C6570] opacity-70 sm:inline-flex">
            {knowledgeLabel}
            <Badge variant="secondary" className="ml-0.5 text-[9px]">
              {comingSoonLabel}
            </Badge>
          </span>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          aria-label={aiLabel}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0B5CFF] text-white transition hover:bg-[#0B4ECC] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  );
}
