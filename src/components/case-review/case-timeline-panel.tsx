"use client";

import { useActionState } from "react";

import {
  extractCaseTimelineAction,
  type CaseTimelineActionState,
} from "@/application/actions/case-review.actions";
import type { CaseTimelineEntry } from "@/domain/entities/case-timeline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initial: CaseTimelineActionState = {};

const CONFIDENCE_LABEL: Record<CaseTimelineEntry["confidence"], string> = {
  HIGH: "Тодорхой",
  MEDIUM: "Дунд зэрэг",
  LOW: "Бага",
  UNCERTAIN: "Тодорхойгүй",
};

const CONFIDENCE_CLASS: Record<CaseTimelineEntry["confidence"], string> = {
  HIGH: "bg-[#E7F2EA] text-[#1E5B3A]",
  MEDIUM: "bg-[#E7F0FB] text-[#173A66]",
  LOW: "bg-[#FBF3E3] text-[#8A6B2A]",
  UNCERTAIN: "bg-[#FCEBEA] text-[#B3261E]",
};

function formatParsedDate(value: Date | string | null): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function CaseTimelinePanel({
  caseId,
  initialEntries,
}: {
  caseId: string;
  initialEntries: CaseTimelineEntry[];
}) {
  const [state, formAction, pending] = useActionState(extractCaseTimelineAction, initial);
  const entries = state.entries ?? initialEntries;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#0B1F3A]">Хугацааны хэлхээс</h2>
          <p className="text-[13px] text-[#5C6570]">
            Хэргийн баримт бичгүүдээс автоматаар илэрсэн огноо, үйл явдал (AI биш,
            дэс дараалалт олборлолт).
          </p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="caseId" value={caseId} />
          <Button type="submit" disabled={pending}>
            {pending ? "Ялгаж байна…" : "Дахин ялгах"}
          </Button>
        </form>
      </div>

      {state.error ? (
        <p className="rounded-lg bg-[#FCEBEA] px-3 py-2 text-[13px] text-[#B3261E]">
          {state.error}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#0B1F3A]/15 p-6 text-center text-[13px] text-[#8A939D]">
          Огноо илрээгүй байна.
        </p>
      ) : (
        <ol className="space-y-3 border-l-2 border-[#0B1F3A]/10 pl-4">
          {entries.map((entry) => {
            const parsed = formatParsedDate(entry.parsedDate);
            return (
              <li key={entry.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#0B1F3A]" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[#0B1F3A]">
                    {parsed ?? entry.rawDateText}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.04em]",
                      CONFIDENCE_CLASS[entry.confidence],
                    )}
                  >
                    {CONFIDENCE_LABEL[entry.confidence]}
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-5 text-[#3F4852]">{entry.eventText}</p>
                <p className="mt-0.5 text-[12px] italic text-[#8A939D]">
                  “{entry.sourceExcerpt}”
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
