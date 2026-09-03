"use client";

import { useState, useTransition } from "react";

import { gradeStudentQuizAction } from "@/application/actions/student.actions";
import type {
  StudentGradeBand,
  StudentPublicQuiz,
  StudentQuizGrade,
} from "@/domain/student";
import type { Dictionary } from "@/i18n/types";

type StudentCopy = Dictionary["publicHome"]["studentPage"];

const QUIZ_ERROR_MESSAGES: Record<string, string> = {
  invalid: "Хариултын мэдээлэл буруу байна. Дахин оролдоно уу.",
  not_found: "Тест олдсонгүй эсвэл хугацаа дууссан байна.",
};

export function StudentQuizForm({
  quiz,
  copy,
}: {
  quiz: StudentPublicQuiz;
  copy: StudentCopy;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<StudentQuizGrade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const unanswered = quiz.questions.filter((question) => {
      if (question.type !== "matching") return !answers[question.id];
      return question.options.some(
        (option) => !answers[question.id]?.includes(`${option.id}:`),
      );
    }).length;
    if (
      unanswered > 0 &&
      !window.confirm(
        `${unanswered} асуултад хариулаагүй байна. Үргэлжлүүлж илгээх үү?`,
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const graded = await gradeStudentQuizAction({
        quizId: quiz.id,
        answers,
      });
      if ("error" in graded) {
        setError(QUIZ_ERROR_MESSAGES[graded.error] ?? "Шалгалт илгээхэд алдаа гарлаа.");
        return;
      }
      setResult(graded);
    });
  }

  function retry() {
    setResult(null);
    setAnswers({});
    setError(null);
  }

  if (result) {
    return (
      <QuizResult
        result={result}
        copy={copy}
        onRetry={retry}
      />
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-[14px] leading-7 text-[#5C6570]">{quiz.intro}</p>

      {quiz.questions.map((question, index) => (
        <fieldset
          key={question.id}
          className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-5"
        >
          <legend className="px-1 text-[12px] font-semibold tracking-wide text-[#1A7A72]">
            {String(index + 1).padStart(2, "0")}
          </legend>
          {question.factPattern ? (
            <p className="mt-2 rounded-xl bg-[#F7F6F2] px-3 py-2 text-[13px] leading-6 text-[#5C6570]">
              {question.factPattern}
            </p>
          ) : null}
          <p className="mt-3 text-[15px] font-medium leading-7 text-[#0B1F3A]">
            {question.prompt}
          </p>
          <QuestionAnswer
            question={question}
            answer={answers[question.id] ?? ""}
            onChange={(answer) =>
              setAnswers((previous) => ({ ...previous, [question.id]: answer }))
            }
          />
        </fieldset>
      ))}

      {error ? (
        <p className="text-[13px] text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={submit}
        className="inline-flex h-11 items-center justify-center rounded-full bg-[#0B1F3A] px-5 text-[13px] font-semibold text-white transition hover:bg-[#16365F] disabled:opacity-60"
      >
        {pending ? "Илгээж байна…" : copy.submitQuiz}
      </button>
    </div>
  );
}

function QuestionAnswer({
  question,
  answer,
  onChange,
}: {
  question: StudentPublicQuiz["questions"][number];
  answer: string;
  onChange: (answer: string) => void;
}) {
  const type = question.type ?? "single";
  if (type === "short-answer") {
    return (
      <input
        value={answer}
        onChange={(event) => onChange(event.target.value)}
        className="mt-4 w-full rounded-xl border border-[#0B1F3A]/15 bg-white px-3 py-3 text-[14px] text-[#0B1F3A] outline-none transition focus:border-[#1A7A72] focus:ring-2 focus:ring-[#1A7A72]/20"
        aria-label={question.prompt}
      />
    );
  }

  if (type === "matching") {
    const selected = new Map(
      answer
        .split(",")
        .map((pair) => pair.split(":", 2))
        .filter((pair): pair is [string, string] => pair.length === 2),
    );
    const choices = question.matchingOptions ?? [];
    return (
      <div className="mt-4 space-y-3">
        {question.options.map((option) => (
          <label key={option.id} className="grid gap-2 text-[14px] text-[#0B1F3A] sm:grid-cols-2 sm:items-center">
            <span>{option.label}</span>
            <select
              value={selected.get(option.id) ?? ""}
              onChange={(event) => {
                selected.set(option.id, event.target.value);
                onChange(
                  [...selected.entries()]
                    .filter(([, value]) => value)
                    .map(([left, right]) => `${left}:${right}`)
                    .join(","),
                );
              }}
              className="rounded-lg border border-[#0B1F3A]/15 bg-white px-3 py-2 text-[#0B1F3A] outline-none focus:border-[#1A7A72] focus:ring-2 focus:ring-[#1A7A72]/20"
            >
              <option value="">Сонгоно уу</option>
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {question.options.map((option) => {
        const selected =
          type === "multiple"
            ? answer.split(",").includes(option.id)
            : answer === option.id;
        return (
          <label
            key={option.id}
            className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-3 text-[14px] leading-6 transition ${
              selected
                ? "border-[#1A7A72] bg-[#E8F4F1] text-[#0B1F3A]"
                : "border-[#0B1F3A]/10 bg-white text-[#5C6570] hover:border-[#0B1F3A]/25"
            }`}
          >
            <input
              type={type === "multiple" ? "checkbox" : "radio"}
              className="mt-1"
              name={question.id}
              value={option.id}
              checked={selected}
              onChange={() => {
                if (type === "multiple") {
                  const values = new Set(answer.split(",").filter(Boolean));
                  if (selected) {
                    values.delete(option.id);
                  } else {
                    values.add(option.id);
                  }
                  onChange([...values].join(","));
                  return;
                }
                onChange(option.id);
              }}
            />
            <span>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function QuizResult({
  result,
  copy,
  onRetry,
}: {
  result: StudentQuizGrade;
  copy: StudentCopy;
  onRetry: () => void;
}) {
  const missed = result.reviews.filter((item) => !item.correct);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-5">
        <div className="flex flex-wrap gap-6">
          <ScoreStat
            label={copy.scoreLabel}
            value={`${result.percent}%`}
            detail={`${result.correct}/${result.total}`}
          />
          <ScoreStat
            label={copy.gradeLabel}
            value={gradeLabel(copy, result.band)}
            detail={
              result.missed > 0
                ? `${result.missed}`
                : copy.allCorrect
            }
          />
        </div>
      </section>

      {missed.length === 0 ? (
        <p className="text-[14px] text-[#1A7A72]">{copy.allCorrect}</p>
      ) : (
        <section className="space-y-4">
          <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
            {copy.missedHeading}
          </h2>
          {missed.map((item) => (
            <article
              key={item.questionId}
              className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-5"
            >
              {item.factPattern ? (
                <p className="rounded-xl bg-[#F7F6F2] px-3 py-2 text-[13px] leading-6 text-[#5C6570]">
                  {item.factPattern}
                </p>
              ) : null}
              <p className="mt-3 text-[15px] font-medium leading-7 text-[#0B1F3A]">
                {item.prompt}
              </p>
              <dl className="mt-4 space-y-2 text-[13px] leading-6">
                <div>
                  <dt className="font-semibold text-[#8A939D]">
                    {copy.yourAnswer}
                  </dt>
                  <dd className="text-[#5C6570]">
                    {item.chosenLabel ?? copy.unanswered}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[#1A7A72]">
                    {copy.correctAnswer}
                  </dt>
                  <dd className="text-[#0B1F3A]">{item.correctLabel}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[13px] leading-6 text-[#5C6570]">
                {item.explanation}
              </p>
            </article>
          ))}
        </section>
      )}

      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-11 items-center justify-center rounded-full border border-[#0B1F3A]/15 bg-white px-5 text-[13px] font-semibold text-[#0B1F3A] transition hover:bg-[#EEF4F2]"
      >
        {copy.retryQuiz}
      </button>
    </div>
  );
}

function ScoreStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div>
      <p className="text-[12px] font-semibold tracking-wide text-[#8A939D] uppercase">
        {label}
      </p>
      <p className="mt-1 text-[1.75rem] font-semibold tracking-tight text-[#0B1F3A]">
        {value}
      </p>
      <p className="text-[12px] text-[#5C6570]">{detail}</p>
    </div>
  );
}

function gradeLabel(copy: StudentCopy, band: StudentGradeBand): string {
  return copy.grades[band];
}
