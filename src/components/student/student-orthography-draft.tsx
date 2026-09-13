"use client";

import { useState } from "react";

import {
  OrthographyCheckButton,
  OrthographyStatusBar,
  useOrthographyAutoCheck,
  useOrthographyCheck,
} from "@/components/orthography/orthography-checker";
import { SpellcheckTextarea } from "@/components/orthography/spellcheck-textarea";

/**
 * Student draft pad: write a short Gutachten / claim outline and run the
 * paid Mongolian orthography checker. Misspelled words are underlined
 * in place; clicking one opens a ranked-suggestion popup for that word.
 */
export function StudentOrthographyDraft({
  billingHref = "/#chat",
}: {
  billingHref?: string;
}) {
  const [draft, setDraft] = useState("");
  const ortho = useOrthographyCheck();
  useOrthographyAutoCheck(draft, ortho.check, { minLength: 10, clear: ortho.clear });

  return (
    <section className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
          Зөв бичгийн алдаа шалгагч
        </h2>
        <OrthographyCheckButton
          loading={ortho.loading}
          disabled={!draft.trim()}
          pressed={ortho.open}
          onClick={() => void ortho.check(draft, { mode: "manual" })}
        />
      </div>
      <p className="mt-2 text-[13px] leading-6 text-[#5C6570]">
        Бодлого/Gutachten ноорог бичихэд зөв бичгийн алдааг автоматаар шалгана.
        Зөвхөн төлбөртэй багцтай хэрэглэгчид.
      </p>
      <div className="mt-4 rounded-xl border border-[#D9DEE5] bg-[#F8FAFC] focus-within:border-[#0B1F3A]/35">
        <SpellcheckTextarea
          value={draft}
          suggestions={ortho.result?.suggestions ?? []}
          onChange={setDraft}
          rows={5}
          placeholder="Жишээ: Хүны эрхийг зөрчсөн эсэхийг шалгана…"
          className="rounded-xl text-sm text-[#0A0F14]"
        />
      </div>
      <OrthographyStatusBar
        loading={ortho.loading}
        gateMessage={ortho.gateMessage}
        needsBilling={ortho.needsBilling}
        billingHref={billingHref}
        includeLatinToCyrillic={ortho.includeLatinToCyrillic}
        onIncludeLatinChange={(value) => {
          ortho.setIncludeLatinToCyrillic(value);
          void ortho.check(draft, { includeLatinToCyrillic: value, mode: "manual" });
        }}
      />
    </section>
  );
}
