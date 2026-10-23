"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { startExamAction } from "@/application/actions/student-exam.actions";
import { EXAM_LIMITS } from "@/application/student-exam/exam-limits";
import { EXAM_AREAS, type ExamArea } from "@/domain/student/exam/types";
import { fmt, type LawyerExamCopy } from "@/i18n/lawyer-exam";

export function StartExamForm({
  counts,
  copy,
}: {
  counts: Record<ExamArea, number>;
  copy: LawyerExamCopy;
}) {
  const router = useRouter();
  const available = EXAM_AREAS.filter((a) => counts[a] > 0);
  const [areas, setAreas] = useState<ExamArea[]>(available);
  const [count, setCount] = useState(5);
  const [minutes, setMinutes] = useState(60);
  const [weights, setWeights] = useState<Record<ExamArea, number>>({ CRIMINAL: 1, CIVIL: 1, ADMINISTRATIVE: 1, CONSTITUTIONAL: 1 });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pool = areas.reduce((sum, a) => sum + counts[a], 0);

  function toggle(area: ExamArea) {
    setAreas((prev) => (prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await startExamAction({
        areas,
        count,
        minutes,
        areaWeights: Object.fromEntries(areas.map((a) => [a, weights[a]])),
      });
      if (result.ok) {
        router.push(`/student/lawyer-exam/attempt/${result.attemptId}${result.resumed ? "?resumed=1" : ""}`);
        return;
      }
      setError(copy.errors[result.error as keyof typeof copy.errors] ?? copy.genericError);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6" aria-busy={pending}>
      <fieldset>
        <legend className="text-[14px] font-semibold text-[#0B1F3A]">{copy.exam.areas}</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {EXAM_AREAS.map((area) => {
            const disabled = counts[area] === 0;
            const checked = areas.includes(area);
            return (
              <div
                key={area}
                className={`rounded-xl border p-3 ${checked ? "border-[#0B5CFF] bg-[#E8F0FE]" : "border-[#0B1F3A]/15 bg-white"} ${disabled ? "opacity-50" : ""}`}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    disabled={disabled}
                    checked={checked}
                    onChange={() => toggle(area)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold text-[#0B1F3A]">{copy.areas[area]}</span>
                    <span className="block text-[12px] text-[#5C6570]">{fmt(copy.exam.available, { n: counts[area] })}</span>
                  </span>
                </label>
                {checked ? (
                  <label className="mt-2 flex items-center justify-between gap-2 text-[12px] text-[#5C6570]">
                    <span>{copy.exam.weights}</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      step={1}
                      value={weights[area]}
                      onChange={(e) => setWeights((w) => ({ ...w, [area]: Math.min(10, Math.max(1, Number(e.target.value) || 1)) }))}
                      className="h-9 w-16 rounded-lg border border-[#0B1F3A]/15 bg-white px-2 text-center text-[14px]"
                      aria-label={`${copy.areas[area]}: ${copy.exam.weights}`}
                    />
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-[#8A939D]">{copy.exam.weightsHint}</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-[14px] font-semibold text-[#0B1F3A]">
          {copy.exam.count}
          <input
            type="number"
            min={EXAM_LIMITS.minCount}
            max={Math.min(EXAM_LIMITS.maxCount, Math.max(pool, EXAM_LIMITS.minCount))}
            value={count}
            onChange={(e) => setCount(Math.floor(Number(e.target.value) || 0))}
            className="mt-2 h-11 w-full rounded-xl border border-[#0B1F3A]/15 bg-white px-3 text-[15px] font-normal"
          />
        </label>
        <label className="block text-[14px] font-semibold text-[#0B1F3A]">
          {copy.exam.minutes}
          <input
            type="number"
            min={EXAM_LIMITS.minMinutes}
            max={EXAM_LIMITS.maxMinutes}
            step={5}
            value={minutes}
            onChange={(e) => setMinutes(Math.floor(Number(e.target.value) || 0))}
            className="mt-2 h-11 w-full rounded-xl border border-[#0B1F3A]/15 bg-white px-3 text-[15px] font-normal"
          />
        </label>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || areas.length === 0}
        className="inline-flex h-12 items-center justify-center rounded-full bg-[#0B1F3A] px-6 text-[14px] font-semibold text-white transition hover:bg-[#16365F] disabled:opacity-50"
      >
        {pending ? copy.exam.starting : copy.exam.start}
      </button>
    </form>
  );
}
