import Link from "next/link";
import { ArrowUp, Sparkles } from "lucide-react";

/**
 * Launcher, not a composer. The real conversation — text input, attachments,
 * streaming, citations, entitlement — lives only on /legal-ai; this card
 * deliberately has no input or upload of its own so there is one canonical
 * Legal AI composer and one attachment pipeline.
 */
export function LawyerWorkspaceAiComposer() {
  return (
    <section className="relative overflow-hidden rounded-xl border border-[#0B1F3A]/10 bg-white p-4 shadow-[0_8px_24px_-4px_rgba(15,32,56,0.06)]">
      <div className="mb-2.5 flex items-center gap-2 border-b border-[#0B1F3A]/8 pb-2.5">
        <span className="flex size-5 items-center justify-center rounded bg-[#0B5CFF] text-white">
          <Sparkles className="size-3" />
        </span>
        <span className="text-[14px] font-bold text-[#0B1F3A]">TORE Legal AI</span>
      </div>

      <p className="text-sm leading-6 text-[#3F4852]">
        Хэрэг, хууль, баримт бичгийн талаар AI-аас судалгаа, дүн шинжилгээ аваарай.
      </p>

      <div className="mt-3 flex justify-end">
        <Link
          href="/legal-ai"
          className="flex h-8 items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-4 text-[13px] font-medium text-white transition-all hover:bg-[#132A47]"
        >
          AI чат нээх
          <ArrowUp className="size-4 rotate-45" />
        </Link>
      </div>
    </section>
  );
}
