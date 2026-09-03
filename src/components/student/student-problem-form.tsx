"use client";

import { useState, useTransition } from "react";

import { gradeStudentProblemAction } from "@/application/actions/student.actions";
import type { StudentLegalProblem, StudentProblemGrade } from "@/domain/student";

export function StudentProblemForm({
  problem,
}: {
  problem: StudentLegalProblem;
}) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<StudentProblemGrade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const graded = await gradeStudentProblemAction({
        problemId: problem.id,
        answer,
      });
      if ("error" in graded) {
        setError("Хариулт дор хаяж 80 тэмдэгттэй байх шаардлагатай.");
        return;
      }
      setResult(graded);
    });
  }

  if (result) {
    return (
      <section aria-live="polite" className="space-y-5">
        <div className="border-y border-[#0B1F3A]/10 py-5">
          <p className="text-[13px] font-semibold text-[#1A7A72]">Бүтцийн үнэлгээ</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-[#0B1F3A]">
            {result.total}/100
          </p>
        </div>
        <dl className="divide-y divide-[#0B1F3A]/10 border-y border-[#0B1F3A]/10">
          {result.rubric.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-4 py-3">
              <div>
                <dt className="text-[14px] font-semibold text-[#0B1F3A]">{item.label}</dt>
                <dd className="mt-1 text-[13px] leading-5 text-[#5C6570]">{item.guidance}</dd>
              </div>
              <span className="shrink-0 text-[14px] font-semibold text-[#0B1F3A]">
                {item.score}/{item.weight}
              </span>
            </div>
          ))}
        </dl>
        <p className={`text-[13px] leading-6 ${result.needsSourceVerification ? "text-amber-800" : "text-[#5C6570]"}`}>
          {result.feedback}
        </p>
        <section className="border-y border-[#0B1F3A]/10 py-5">
          <h2 className="text-[15px] font-semibold text-[#0B1F3A]">
            {result.evaluation.label}
          </h2>
          <p className="mt-2 text-[13px] leading-6 text-[#5C6570]">
            {result.evaluation.sourceIntegrityNote}
          </p>
          <EvaluationList title="Давуу тал" items={result.evaluation.strengths} />
          <EvaluationList title="Сайжруулах тал" items={result.evaluation.weaknesses} />
          <EvaluationList title="Орхигдсон асуудал" items={result.evaluation.missingIssues} />
          <EvaluationList title="Нягтлах зохицуулалт" items={result.evaluation.missingProvisions} />
          <EvaluationList title="Сайжруулах санал" items={result.evaluation.suggestions} />
        </section>
        <button
          type="button"
          onClick={() => setResult(null)}
          className="inline-flex h-11 items-center justify-center rounded-full border border-[#0B1F3A]/15 bg-white px-5 text-[13px] font-semibold text-[#0B1F3A] transition hover:bg-[#EEF4F2]"
        >
          Хариултаа засах
        </button>
      </section>
    );
  }

  function EvaluationList({ title, items }: { title: string; items: readonly string[] }) {
    if (items.length === 0) return null;
    return (
      <div className="mt-5">
        <h3 className="text-[13px] font-semibold text-[#0B1F3A]">{title}</h3>
        <ul className="mt-2 space-y-1 text-[13px] leading-6 text-[#5C6570]">
          {items.map((item) => <li key={item}>— {item}</li>)}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-[14px] leading-7 text-[#5C6570]">{problem.intro}</p>
      <section className="border-y border-[#0B1F3A]/10 py-5">
        <h2 className="text-[15px] font-semibold text-[#0B1F3A]">Нөхцөл байдал</h2>
        <p className="mt-3 text-[14px] leading-7 text-[#5C6570]">{problem.factPattern}</p>
      </section>
      <p className="text-[15px] font-medium leading-7 text-[#0B1F3A]">{problem.prompt}</p>
      <section className="border-y border-[#0B1F3A]/10 py-4">
        <h2 className="text-[14px] font-semibold text-[#0B1F3A]">Нягтлах эх сурвалж</h2>
        {problem.sources.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block text-[13px] font-semibold text-[#0B1F3A] underline underline-offset-4 hover:text-[#1A7A72]"
          >
            {source.title} — {source.publisher}
          </a>
        ))}
      </section>
      <dl className="divide-y divide-[#0B1F3A]/10 border-y border-[#0B1F3A]/10">
        {problem.rubric.map((item) => (
          <div key={item.id} className="py-3">
            <dt className="text-[14px] font-semibold text-[#0B1F3A]">
              {item.label} <span className="text-[#5C6570]">({item.weight})</span>
            </dt>
            <dd className="mt-1 text-[13px] leading-5 text-[#5C6570]">{item.guidance}</dd>
          </div>
        ))}
      </dl>
      <textarea
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        rows={12}
        className="w-full rounded-xl border border-[#0B1F3A]/15 bg-white px-4 py-3 text-[14px] leading-7 text-[#0B1F3A] outline-none transition focus:border-[#1A7A72] focus:ring-2 focus:ring-[#1A7A72]/20"
        placeholder="Асуудал: …&#10;Хэрэглэх эрх зүй: …&#10;Баримт: …&#10;Эрх зүйн үндэслэл: …&#10;Дүгнэлт: …"
      />
      {error ? <p role="alert" className="text-[13px] text-red-700">{error}</p> : null}
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={submit}
        className="inline-flex h-11 items-center justify-center rounded-full bg-[#0B1F3A] px-5 text-[13px] font-semibold text-white transition hover:bg-[#16365F] disabled:opacity-60"
      >
        {pending ? "Үнэлж байна…" : "Бүтцээр үнэлэх"}
      </button>
    </div>
  );
}
