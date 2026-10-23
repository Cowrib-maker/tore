"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { submitSelfAssessmentAction } from "@/application/actions/student-exam.actions";
import { RATING_MAX } from "@/domain/student/exam/rubric";
import type { RubricCriterionId, SelfRatings } from "@/domain/student/exam/types";
import { fmt, type LawyerExamCopy } from "@/i18n/lawyer-exam";

export type AssessmentProblem = {
  id: string;
  label: string;
  criteria: Array<{ id: RubricCriterionId; weight: number }>;
};

/**
 * The student rates their own answer against the rubric AFTER seeing the model answer. Only the ratings are sent; the server
 * validates them against the stored rubric and computes every score. Saving locks the assessment.
 */
export function SelfAssessmentForm({
  attemptId,
  problems,
  copy,
}: {
  attemptId: string;
  problems: AssessmentProblem[];
  copy: LawyerExamCopy;
}) {
  const router = useRouter();
  const [ratings, setRatings] = useState<Record<string, SelfRatings>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const complete = problems.every((p) => p.criteria.every((c) => ratings[p.id]?.[c.id] !== undefined));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) {
      setError(copy.result.assess.incomplete);
      return;
    }
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof submitSelfAssessmentAction>>;
      try {
        result = await submitSelfAssessmentAction(attemptId, ratings);
      } catch {
        setError(copy.genericError);
        return;
      }
      if (result.ok) {
        setDone(true);
        router.refresh();
        return;
      }
      setError(copy.errors[result.error as keyof typeof copy.errors] ?? copy.genericError);
    });
  }

  if (done) {
    return (
      <p role="status" className="rounded-lg bg-[#E8F4F1] px-3 py-2 text-[13px] text-[#1A7A72]">
        {copy.result.assess.saved}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6" aria-busy={pending}>
      <p className="text-[13px] leading-6 text-[#5C6570]">{copy.result.assess.intro}</p>
      <p className="text-[12px] text-[#8A939D]">{copy.result.assess.aiNone}</p>
      {problems.map((p) => (
        <fieldset key={p.id} className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-4">
          <legend className="px-1 text-[13px] font-semibold text-[#0B1F3A]">{p.label}</legend>
          <div className="space-y-4">
            {p.criteria.map((c) => (
              <div key={c.id}>
                <p className="text-[14px] font-medium text-[#1B2733]">
                  {copy.result.assess.criteria[c.id]}{" "}
                  <span className="text-[11px] font-normal text-[#8A939D]">({fmt(copy.result.assess.weight, { n: c.weight })})</span>
                </p>
                <div role="radiogroup" aria-label={copy.result.assess.criteria[c.id]} className="mt-2 flex flex-wrap gap-2">
                  {Array.from({ length: RATING_MAX + 1 }, (_, value) => {
                    const checked = ratings[p.id]?.[c.id] === value;
                    return (
                      <label
                        key={value}
                        title={copy.result.assess.scale[value]}
                        className={`flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg border px-3 text-[14px] font-semibold transition ${
                          checked ? "border-[#0B1F3A] bg-[#0B1F3A] text-white" : "border-[#0B1F3A]/15 bg-white text-[#0B1F3A] hover:border-[#0B1F3A]/40"
                        }`}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name={`${p.id}-${c.id}`}
                          checked={checked}
                          onChange={() => setRatings((r) => ({ ...r, [p.id]: { ...r[p.id], [c.id]: value } }))}
                        />
                        {value}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="text-[12px] text-[#8A939D]">
        {copy.result.assess.scale[0]} · {copy.result.assess.scale[2]} · {copy.result.assess.scale[4]}. {copy.result.assess.lockedNote}
      </p>
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center rounded-full bg-[#0B1F3A] px-5 text-[13px] font-semibold text-white disabled:opacity-60"
      >
        {pending ? copy.result.assess.saving : copy.result.assess.save}
      </button>
    </form>
  );
}
