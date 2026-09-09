"use client";

import { useState, useTransition } from "react";

import { evaluateStudentProblemAction } from "@/application/actions/student.actions";
import { studentProblemActionErrorMessage } from "@/application/actions/student-action-messages";
import type { StudentLegalProblem, StudentProblemGrade } from "@/domain/student";
import type { Dictionary } from "@/i18n/types";

type StudentCopy = Dictionary["publicHome"]["studentPage"];

const MIN_ANSWER_CHARS = 60;

export function StudentCaseStudyForm({
  problem,
  copy,
}: {
  problem: StudentLegalProblem;
  copy: StudentCopy;
}) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<StudentProblemGrade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const c = copy.caseStudy;

  function submit() {
    setError(null);
    startTransition(async () => {
      const graded = await evaluateStudentProblemAction({
        problemId: problem.id,
        answer,
      });
      if ("error" in graded) {
        setError(studentProblemActionErrorMessage(graded.error));
        return;
      }
      setResult(graded);
    });
  }

  function retry() {
    setResult(null);
    setError(null);
  }

  if (result) {
    return <CaseStudyResult result={result} copy={copy} onRetry={retry} />;
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-5">
        <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
          {c.factPatternHeading}
        </h2>
        <p className="mt-3 whitespace-pre-line text-[14px] leading-7 text-[#0B1F3A]">
          {problem.factPattern}
        </p>
      </section>

      <section className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-5">
        <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
          {c.promptHeading}
        </h2>
        <p className="mt-3 whitespace-pre-line text-[14px] leading-7 text-[#0B1F3A]">
          {problem.prompt}
        </p>
      </section>

      {problem.sources.length > 0 ? (
        <section className="rounded-2xl border border-[#0B1F3A]/10 bg-[#F7F6F2] p-5">
          <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
            {c.sourcesHeading}
          </h2>
          <ul className="mt-3 space-y-2">
            {problem.sources.map((source) => (
              <li key={source.url} className="text-[13px] leading-6 text-[#5C6570]">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-semibold text-[#0B1F3A] underline decoration-[#1A7A72]/40 underline-offset-2"
                >
                  {source.title}
                </a>{" "}
                — {source.publisher}. {source.note}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div>
        <label
          htmlFor="case-study-answer"
          className="text-[13px] font-semibold text-[#0B1F3A]"
        >
          {c.answerLabel}
        </label>
        <textarea
          id="case-study-answer"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder={c.answerPlaceholder}
          rows={12}
          className="mt-2 w-full rounded-2xl border border-[#0B1F3A]/15 bg-white p-4 text-[14px] leading-7 text-[#0B1F3A] outline-none transition focus:border-[#1A7A72]"
        />
        <p className="mt-1 text-[12px] text-[#8A939D]">
          {answer.trim().length}/{MIN_ANSWER_CHARS}+
        </p>
      </div>

      {error ? (
        <p className="text-[13px] text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={pending || answer.trim().length < MIN_ANSWER_CHARS}
        aria-busy={pending}
        onClick={submit}
        className="inline-flex h-11 items-center justify-center rounded-full bg-[#0B1F3A] px-5 text-[13px] font-semibold text-white transition hover:bg-[#16365F] disabled:opacity-60"
      >
        {pending ? "Илгээж байна…" : c.submit}
      </button>
    </div>
  );
}

function CaseStudyResult({
  result,
  copy,
  onRetry,
}: {
  result: StudentProblemGrade;
  copy: StudentCopy;
  onRetry: () => void;
}) {
  const c = copy.caseStudy;
  const evaluation = result.evaluation;
  const percent = Math.round((result.total / result.maxTotal) * 100);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold tracking-wide text-[#8A939D] uppercase">
              {c.scoreLabel}
            </p>
            <p className="mt-1 text-[1.75rem] font-semibold tracking-tight text-[#0B1F3A]">
              {result.total}/{result.maxTotal}
              <span className="ml-2 text-[15px] font-medium text-[#5C6570]">
                ({percent}%)
              </span>
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              evaluation.mode === "ai"
                ? "bg-[#E8F4F1] text-[#1A7A72]"
                : "bg-[#F1EEE6] text-[#8A6D1F]"
            }`}
          >
            {evaluation.mode === "ai" ? c.aiModeLabel : c.fallbackModeLabel}
          </span>
        </div>
        <p className="mt-3 text-[13px] leading-6 text-[#5C6570]">
          {evaluation.label}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
          {c.resultHeading}
        </h2>
        <ul className="space-y-2">
          {result.rubric.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-[#0B1F3A]/10 bg-white px-4 py-3"
            >
              <div>
                <p className="text-[14px] font-medium text-[#0B1F3A]">
                  {item.label}
                </p>
                <p className="text-[12px] leading-5 text-[#8A939D]">
                  {item.guidance}
                </p>
              </div>
              <span
                className={`shrink-0 text-[14px] font-semibold ${
                  item.satisfied ? "text-[#1A7A72]" : "text-[#8A939D]"
                }`}
              >
                {item.score}/{item.weight}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <FeedbackList heading={c.strengthsHeading} items={evaluation.strengths} tone="positive" />
      <FeedbackList heading={c.weaknessesHeading} items={evaluation.weaknesses} tone="neutral" />
      <FeedbackList heading={c.missingIssuesHeading} items={evaluation.missingIssues} tone="neutral" />
      <FeedbackList heading={c.missingProvisionsHeading} items={evaluation.missingProvisions} tone="neutral" />
      <FeedbackList heading={c.suggestionsHeading} items={evaluation.suggestions} tone="neutral" />

      {evaluation.sourceIntegrityNote ? (
        <section className="rounded-2xl border border-[#0B1F3A]/10 bg-[#F7F6F2] p-5">
          <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
            {c.sourceIntegrityHeading}
          </h2>
          <p className="mt-2 text-[13px] leading-6 text-[#5C6570]">
            {evaluation.sourceIntegrityNote}
          </p>
        </section>
      ) : null}

      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-11 items-center justify-center rounded-full border border-[#0B1F3A]/15 bg-white px-5 text-[13px] font-semibold text-[#0B1F3A] transition hover:bg-[#EEF4F2]"
      >
        {c.retry}
      </button>
    </div>
  );
}

function FeedbackList({
  heading,
  items,
  tone,
}: {
  heading: string;
  items: readonly string[];
  tone: "positive" | "neutral";
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2
        className={`text-[13px] font-semibold tracking-[0.12em] uppercase ${
          tone === "positive" ? "text-[#1A7A72]" : "text-[#8A939D]"
        }`}
      >
        {heading}
      </h2>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li
            key={index}
            className="rounded-xl border border-[#0B1F3A]/10 bg-white px-4 py-2.5 text-[13px] leading-6 text-[#0B1F3A]"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
