"use client";

import { useState } from "react";

import { OrthographyChecker } from "@/components/orthography/orthography-checker";

/**
 * Student draft pad: write a short Gutachten / claim outline and run the
 * paid Mongolian orthography checker.
 */
export function StudentOrthographyDraft({
  billingHref = "/#chat",
}: {
  billingHref?: string;
}) {
  const [draft, setDraft] = useState("");

  return (
    <section className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-5">
      <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
        Зөв бичгийн алдаа шалгагч
      </h2>
      <p className="mt-2 text-[13px] leading-6 text-[#5C6570]">
        Бодлого/Gutachten ноорог бичиж, монгол зөв бичгийн дүрмийн алдааг
        шалгана. Зөвхөн төлбөртэй багцтай хэрэглэгчид.
      </p>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={5}
        placeholder="Жишээ: Хүны эрхийг зөрчсөн эсэхийг шалгана…"
        className="mt-4 w-full resize-y rounded-xl border border-[#D9DEE5] bg-[#F8FAFC] px-3 py-2.5 text-sm leading-6 text-[#0A0F14] outline-none placeholder:text-[#9AA3AD] focus:border-[#0B1F3A]/35"
      />
      <OrthographyChecker
        text={draft}
        onApplySuggestion={setDraft}
        billingHref={billingHref}
      />
    </section>
  );
}
