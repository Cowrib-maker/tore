"use client";

import { useState, useTransition } from "react";

import {
  requestAttemptHintAction,
  submitWrittenAttemptAction,
} from "@/application/actions/written-exam.actions";
import { writtenExamActionErrorMessage } from "@/application/actions/written-exam-action-messages";
import type {
  AttemptRevision,
  ElementFeedback,
  Hint,
  TutorDimension,
  WrittenExamAttempt,
  WrittenExamProblem,
} from "@/domain/student/written-exam-types";

const MIN_ANSWER_CHARS = 60;

const STATUS_LABEL: Record<ElementFeedback["status"], string> = {
  SATISFIED: "Хангасан",
  NOT_SATISFIED: "Хангаагvй",
  UNCERTAIN: "Тодорхойгvй",
  NOT_EVALUATED: "Vнэлэгдээгvй",
  INDETERMINATE: "Тодорхойгvй",
  MISSING_FACT: "Баримт дутуу",
  MISSING_EVIDENCE: "Нотолгоо дутуу",
};

const STATUS_TONE: Record<ElementFeedback["status"], string> = {
  SATISFIED: "bg-[#E8F4F1] text-[#1A7A72]",
  NOT_SATISFIED: "bg-[#FBEAEA] text-[#B3403A]",
  UNCERTAIN: "bg-[#FDF3E3] text-[#8A6D1F]",
  NOT_EVALUATED: "bg-[#EEEFF1] text-[#5C6570]",
  INDETERMINATE: "bg-[#FDF3E3] text-[#8A6D1F]",
  MISSING_FACT: "bg-[#EEEFF1] text-[#5C6570]",
  MISSING_EVIDENCE: "bg-[#EEEFF1] text-[#5C6570]",
};

const DIMENSION_LABEL: Record<string, string> = {
  issueSpotting: "Асуудал тодорхойлолт",
  authoritySelection: "Хэрэглэх эрх зvй",
  methodology: "Аргачлал",
  subsumption: "Дvгнэлт хийх (subsumption)",
  conclusion: "Эцсийн дvгнэлт",
};

export function StudentWrittenExamForm({
  problem,
  initialAttempt,
}: {
  problem: WrittenExamProblem;
  initialAttempt: WrittenExamAttempt | null;
}) {
  const [attempt, setAttempt] = useState<WrittenExamAttempt | null>(initialAttempt);
  const latestRevision = attempt?.answerHistory[attempt.answerHistory.length - 1] ?? null;
  const [answer, setAnswer] = useState(latestRevision?.answer ?? "");
  const [error, setError] = useState<string | null>(null);
  const [hintError, setHintError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [hintPending, startHintTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await submitWrittenAttemptAction({
        problemId: problem.id,
        answer,
        attemptId: attempt?.id,
      });
      if ("error" in result) {
        setError(writtenExamActionErrorMessage(result.error));
        return;
      }
      setAttempt(result);
    });
  }

  function requestHint() {
    if (!attempt) return;
    setHintError(null);
    startHintTransition(async () => {
      const result = await requestAttemptHintAction({ attemptId: attempt.id });
      if ("error" in result) {
        setHintError(writtenExamActionErrorMessage(result.error));
        return;
      }
      setAttempt((prev) => (prev ? { ...prev, hintsRevealed: [...prev.hintsRevealed, result] } : prev));
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-5">
        <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
          Нөхцөл байдал
        </h2>
        <p className="mt-3 whitespace-pre-line text-[14px] leading-7 text-[#0B1F3A]">
          {problem.factPattern}
        </p>
      </section>

      <section className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-5">
        <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
          Даалгавар
        </h2>
        <p className="mt-3 whitespace-pre-line text-[14px] leading-7 text-[#0B1F3A]">
          {problem.prompt}
        </p>
      </section>

      {problem.sources.length > 0 ? (
        <section className="rounded-2xl border border-[#0B1F3A]/10 bg-[#F7F6F2] p-5">
          <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
            Эх сурвалж
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

      {attempt?.hintsRevealed.length ? (
        <section className="space-y-2">
          <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
            Санамжууд
          </h2>
          <ul className="space-y-1.5">
            {attempt.hintsRevealed.map((hint, index) => (
              <li
                key={`${hint.elementId}-${index}`}
                className="rounded-xl border border-[#1A7A72]/20 bg-[#E8F4F1] px-4 py-2.5 text-[13px] leading-6 text-[#0B1F3A]"
              >
                <span className="font-semibold">{hint.label}:</span> {hint.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div>
        <label htmlFor="written-exam-answer" className="text-[13px] font-semibold text-[#0B1F3A]">
          {attempt ? "Хариултаа засварла" : "Таны хариулт"}
        </label>
        <textarea
          id="written-exam-answer"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="Хариултаа энд бичнэ vv…"
          rows={14}
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

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || answer.trim().length < MIN_ANSWER_CHARS}
          aria-busy={pending}
          onClick={submit}
          className="inline-flex h-11 items-center justify-center rounded-full bg-[#0B1F3A] px-5 text-[13px] font-semibold text-white transition hover:bg-[#16365F] disabled:opacity-60"
        >
          {pending ? "Илгээж байна…" : attempt ? "Дахин илгээх" : "Илгээх"}
        </button>
        {attempt ? (
          <button
            type="button"
            disabled={hintPending}
            aria-busy={hintPending}
            onClick={requestHint}
            className="inline-flex h-11 items-center justify-center rounded-full border border-[#1A7A72]/30 bg-white px-5 text-[13px] font-semibold text-[#1A7A72] transition hover:bg-[#E8F4F1] disabled:opacity-60"
          >
            {hintPending ? "Санамж хvсэж байна…" : "Санамж авах"}
          </button>
        ) : null}
      </div>
      {hintError ? (
        <p className="text-[13px] text-[#8A6D1F]" role="alert">
          {hintError}
        </p>
      ) : null}

      {latestRevision ? <WrittenExamEvaluation attempt={attempt!} revision={latestRevision} /> : null}

      {attempt && attempt.answerHistory.length > 1 ? (
        <AttemptHistory answerHistory={attempt.answerHistory} />
      ) : null}
    </div>
  );
}

function WrittenExamEvaluation({
  attempt,
  revision,
}: {
  attempt: WrittenExamAttempt;
  revision: AttemptRevision;
}) {
  const evaluation = revision.evaluation;
  const dimensions: readonly [string, TutorDimension][] = [
    ["issueSpotting", evaluation.issueSpotting],
    ["authoritySelection", evaluation.authoritySelection],
    ["methodology", evaluation.methodology],
    ["subsumption", evaluation.subsumption],
    ["conclusion", evaluation.conclusion],
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold tracking-wide text-[#8A939D] uppercase">
              Эцсийн vнэлгээ
            </p>
            {attempt.finalGrade ? (
              <p className="mt-1 text-[1.75rem] font-semibold tracking-tight text-[#0B1F3A]">
                {attempt.finalGrade.total}/{attempt.finalGrade.maxTotal}
                <span className="ml-2 text-[15px] font-medium text-[#5C6570]">
                  ({attempt.finalGrade.percent}%)
                </span>
              </p>
            ) : (
              <p className="mt-1 text-[14px] text-[#5C6570]">
                Одоогоор бvх шаардлагатай шалгуур хангагдаагvй байна — дор буй санамж, тайлбарыг vзээд хариултаа сайжруул.
              </p>
            )}
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              evaluation.mode === "ai" ? "bg-[#E8F4F1] text-[#1A7A72]" : "bg-[#F1EEE6] text-[#8A6D1F]"
            }`}
          >
            {evaluation.mode === "ai" ? "AI зөвлөх" : "Автомат шалгалт"}
          </span>
        </div>
        <p className="mt-3 text-[13px] leading-6 text-[#5C6570]">{evaluation.overallFeedback}</p>
        {evaluation.needsSourceVerification ? (
          <p className="mt-2 text-[12px] leading-5 text-[#8A6D1F]">
            Хариултад дурдсан зvйл, заалтын дугаарыг албан ёсны эх сурвалжаас (legalinfo.mn) нягтална уу — AI vнэн зөвийг баталгаажуулаагvй.
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
          Vнэлгээний хэмжvvр
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {dimensions.map(([key, dim]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 rounded-xl border border-[#0B1F3A]/10 bg-white px-4 py-3"
            >
              <div>
                <p className="text-[13px] font-medium text-[#0B1F3A]">{DIMENSION_LABEL[key]}</p>
                <p className="text-[12px] leading-5 text-[#8A939D]">{dim.note}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  dim.status === "strong"
                    ? "bg-[#E8F4F1] text-[#1A7A72]"
                    : dim.status === "developing"
                      ? "bg-[#FDF3E3] text-[#8A6D1F]"
                      : "bg-[#FBEAEA] text-[#B3403A]"
                }`}
              >
                {dim.status === "strong" ? "Сайн" : dim.status === "developing" ? "Хөгжиж буй" : "Дутуу"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
          Шалгуур бvрээр
        </h2>
        <ul className="space-y-2">
          {evaluation.elementFeedback.map((item) => (
            <li key={item.elementId} className="rounded-xl border border-[#0B1F3A]/10 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[14px] font-medium text-[#0B1F3A]">{item.label}</p>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_TONE[item.status]}`}
                >
                  {STATUS_LABEL[item.status]}
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-6 text-[#5C6570]">{item.explanation}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AttemptHistory({ answerHistory }: { answerHistory: readonly AttemptRevision[] }) {
  const previous = answerHistory.slice(0, -1).reverse();
  return (
    <section className="space-y-2">
      <h2 className="text-[13px] font-semibold tracking-[0.12em] text-[#1A7A72] uppercase">
        Өмнөх оролдлого
      </h2>
      <ul className="space-y-2">
        {previous.map((revision, index) => (
          <li
            key={index}
            className="rounded-xl border border-[#0B1F3A]/10 bg-[#F7F6F2] px-4 py-3 text-[13px] leading-6 text-[#5C6570]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8A939D]">
              {new Date(revision.submittedAt).toLocaleString("mn-MN")}
            </p>
            <p className="mt-1 line-clamp-3 whitespace-pre-line">{revision.answer}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
