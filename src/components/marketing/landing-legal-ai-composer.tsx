"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import {
  legalAiHref,
  loginHrefForLegalAi,
} from "@/domain/services/rbac";

type LandingLegalAiComposerProps = {
  placeholder: string;
  submitLabel: string;
  guestHint: string;
  mode: "guest" | "client" | "other";
  dashboardHref: string;
};

export function LandingLegalAiComposer({
  placeholder,
  submitLabel,
  guestHint,
  mode,
  dashboardHref,
}: LandingLegalAiComposerProps) {
  const router = useRouter();
  const [question, setQuestion] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text) {
      return;
    }
    if (mode === "client") {
      router.push(legalAiHref(text));
      return;
    }
    if (mode === "other") {
      router.push(dashboardHref);
      return;
    }
    router.push(loginHrefForLegalAi(text));
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 border-t border-[#0B1F3A]/8 pt-4">
      <textarea
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-xl border border-[#D9DEE5] bg-[#F8FAFC] px-3 py-2.5 text-[12px] leading-5 text-[#0A0F14] outline-none placeholder:text-[#9AA3AD] focus:border-[#0B1F3A]/40"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {mode === "guest" ? (
          <p className="text-[10px] leading-4 text-[#7B8490]">{guestHint}</p>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={!question.trim()}
          className="rounded-lg bg-[#0B1F3A] px-4 py-2 text-[11px] font-semibold text-white hover:bg-[#173A66] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
