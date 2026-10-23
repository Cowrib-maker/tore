"use client";

import { useState, useTransition } from "react";

import { setProblemReviewAction } from "@/application/actions/student-exam.actions";
import type { ReviewListItem } from "@/domain/repositories/student-exam-repository";
import type { ReviewStatus } from "@/domain/student/exam/types";
import { fmt, type LawyerExamCopy } from "@/i18n/lawyer-exam";

export function ProblemReviewRow({ item, copy }: { item: ReviewListItem; copy: LawyerExamCopy }) {
  const [status, setStatus] = useState<ReviewStatus>(item.reviewStatus);
  const [note, setNote] = useState(item.reviewNote ?? "");
  const [topic, setTopic] = useState(item.topic ?? "");
  const [difficulty, setDifficulty] = useState(item.difficulty ? String(item.difficulty) : "");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(next: ReviewStatus) {
    setMessage(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof setProblemReviewAction>>;
      try {
        result = await setProblemReviewAction({
          problemId: item.id,
          status: next,
          note,
          topic: topic.trim() || null,
          difficulty: difficulty ? Number(difficulty) : null,
        });
      } catch {
        setMessage({ kind: "error", text: copy.genericError });
        return;
      }
      if (result.ok) {
        setStatus(next);
        setMessage({ kind: "ok", text: copy.admin.saved });
      } else {
        setMessage({ kind: "error", text: copy.errors[result.error as keyof typeof copy.errors] ?? copy.genericError });
      }
    });
  }

  const input = "mt-1 w-full rounded-lg border border-[#0B1F3A]/15 bg-white px-3 py-2 text-[14px]";
  const btn = "h-10 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50";

  return (
    <li className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-[#0B5CFF]">
            {copy.areas[item.area]} · {item.ordinalLabel}
          </p>
          <p className="mt-0.5 text-[12px] text-[#8A939D]">
            {fmt(copy.problem.sourceLine, {
              file: item.sourceFile,
              heading: item.sourceLocator.heading,
              from: item.sourceLocator.paragraphStart,
              to: item.sourceLocator.paragraphEnd,
            })}
          </p>
        </div>
        <span className="rounded-full bg-[#F7F6F2] px-2.5 py-0.5 text-[11px] font-semibold text-[#0B1F3A]">
          {copy.admin.statuses[status]}
        </span>
      </div>
      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[13px] leading-6 text-[#1B2733]">{item.statement}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {item.reviewFlags.map((f) => (
          <li key={f} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
            {copy.admin.flags[f as keyof typeof copy.admin.flags] ?? f}
          </li>
        ))}
        {!item.hasModelAnswer ? (
          <li className="rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700">{copy.admin.noAnswer}</li>
        ) : null}
      </ul>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-[12px] font-semibold text-[#5C6570] sm:col-span-3">
          {copy.admin.note}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} className={input} />
        </label>
        <label className="text-[12px] font-semibold text-[#5C6570] sm:col-span-2">
          {copy.admin.topic}
          <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} className={input} />
        </label>
        <label className="text-[12px] font-semibold text-[#5C6570]">
          {copy.admin.difficulty}
          <input type="number" min={1} max={5} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={input} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={() => apply("APPROVED")} className={`${btn} bg-[#1A7A72] text-white`}>
          {pending ? copy.admin.saving : copy.admin.approve}
        </button>
        <button type="button" disabled={pending} onClick={() => apply("REJECTED")} className={`${btn} border border-red-300 text-red-700`}>
          {copy.admin.reject}
        </button>
        <button type="button" disabled={pending} onClick={() => apply("NEEDS_REVIEW")} className={`${btn} border border-[#0B1F3A]/20 text-[#0B1F3A]`}>
          {copy.admin.needsReview}
        </button>
        {message ? (
          <span role={message.kind === "error" ? "alert" : "status"} className={`text-[12px] ${message.kind === "error" ? "text-red-700" : "text-[#1A7A72]"}`}>
            {message.text}
          </span>
        ) : null}
      </div>
    </li>
  );
}
