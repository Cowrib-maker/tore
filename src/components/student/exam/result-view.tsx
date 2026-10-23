import Link from "next/link";

import type { AttemptResult } from "@/application/student-exam/exam-service";
import { STUDENT_WARNING_FLAGS, type RubricCriterionId } from "@/domain/student/exam/types";
import { fmt, type LawyerExamCopy } from "@/i18n/lawyer-exam";

import { SelfAssessmentForm } from "./self-assessment-form";

const card = "rounded-2xl border border-[#0B1F3A]/10 bg-white p-4 sm:p-5";
const h3 = "text-[13px] font-semibold uppercase tracking-wide text-[#8A939D]";

export function ResultView({ result, copy }: { result: AttemptResult; copy: LawyerExamCopy }) {
  const percent = result.scoreTotal !== null && result.scoreMax ? Math.round((result.scoreTotal / result.scoreMax) * 1000) / 10 : null;

  return (
    <div className="space-y-6">
      <section className={card}>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#0B5CFF]">
          {result.status === "EXPIRED" ? copy.result.statusExpired : copy.result.statusSubmitted}
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-2">
          <div>
            <p className={h3}>{copy.result.total}</p>
            {percent !== null ? (
              <p className="text-[2rem] font-semibold tracking-tight text-[#0B1F3A]">
                {result.scoreTotal} / {result.scoreMax} <span className="text-[1rem] font-medium text-[#5C6570]">({percent}%)</span>
              </p>
            ) : (
              <p className="text-[15px] text-[#5C6570]">{copy.result.pending}</p>
            )}
          </div>
          {result.previous ? (
            <p className="text-[13px] text-[#1B2733]">
              {fmt(copy.result.previous, {
                prev: result.previous.percent,
                now: percent ?? "—",
                delta: `${result.previous.deltaPercent > 0 ? "+" : ""}${result.previous.deltaPercent}`,
              })}
            </p>
          ) : percent !== null ? (
            <p className="text-[13px] text-[#8A939D]">{copy.result.noPrevious}</p>
          ) : null}
        </div>
        <p className="mt-3 text-[12px] leading-5 text-[#8A939D]">{copy.result.assess.aiNone}</p>
      </section>

      {result.weakCriteria.length > 0 ? (
        <section className={card}>
          <h2 className={h3}>{copy.result.weakTitle}</h2>
          <ul className="mt-2 space-y-1 text-[14px] text-[#1B2733]">
            {result.weakCriteria
              .filter((c) => c.average < 3)
              .map((c) => (
                <li key={c.id}>
                  {copy.result.assess.criteria[c.id as RubricCriterionId]} — <span className="font-semibold">{c.average}/4</span>
                </li>
              ))}
          </ul>
          {result.retryProblemIds.length > 0 ? (
            <>
              <h2 className={`${h3} mt-4`}>{copy.result.retryTitle}</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {result.retryProblemIds.map((id) => {
                  const item = result.items.find((i) => i.problem.id === id)!;
                  return (
                    <li key={id}>
                      <Link
                        href={`/student/lawyer-exam/problems/${id}?fresh=1`}
                        className="inline-flex h-9 items-center rounded-full border border-[#0B1F3A]/20 px-3 text-[13px] font-semibold text-[#0B1F3A] hover:bg-[#F7F6F2]"
                      >
                        {copy.areas[item.problem.area]} · {item.problem.ordinalLabel} — {copy.result.retryStudy}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {result.items.map((item, i) => {
        const p = item.problem;
        const warnings = p.reviewFlags.filter((f) => (STUDENT_WARNING_FLAGS as readonly string[]).includes(f));
        return (
          <article key={p.id} className={`${card} space-y-5`} lang="mn">
            <header>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#0B5CFF]">
                {i + 1}. {copy.areas[p.area]} · {p.ordinalLabel}
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {p.reviewStatus === "APPROVED" ? (
                  <li className="rounded-full bg-[#E8F4F1] px-2.5 py-0.5 text-[11px] font-semibold text-[#1A7A72]">{copy.badges.approved}</li>
                ) : (
                  <li className="rounded-full bg-[#F7F6F2] px-2.5 py-0.5 text-[11px] font-semibold text-[#5C6570]">{copy.badges.notReviewed}</li>
                )}
                <li className="rounded-full bg-[#F7F6F2] px-2.5 py-0.5 text-[11px] font-semibold text-[#5C6570]">{copy.badges.lawNotVerified}</li>
                {warnings.map((f) => (
                  <li key={f} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                    {copy.badges[f as "POSSIBLY_OUTDATED_LAW" | "OCR_NOISE_SUSPECTED" | "MODEL_ANSWER_TRUNCATED_OR_SHORT"]}
                  </li>
                ))}
              </ul>
            </header>

            <details>
              <summary className="cursor-pointer text-[13px] font-semibold text-[#0B1F3A]">{copy.problem.statement}</summary>
              <div className="mt-2 space-y-3 text-[14px] leading-7 text-[#1B2733]">
                {p.statement.split("\n\n").map((para, k) => (
                  <p key={k} className="whitespace-pre-wrap">
                    {para}
                  </p>
                ))}
                {p.questions.map((q, k) => (
                  <p key={`q${k}`} className="whitespace-pre-wrap font-medium text-[#0B1F3A]">
                    {q}
                  </p>
                ))}
              </div>
            </details>

            <div>
              <h3 className={h3}>{copy.result.yourAnswer}</h3>
              <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[#F7F6F2] p-3 text-[14px] leading-7 text-[#1B2733]">
                {item.answerText.trim() ? item.answerText : copy.result.noAnswer}
              </p>
              <p className="mt-1 text-[12px] text-[#8A939D]">{fmt(copy.result.methodChecks, { n: item.methodChecks.length })}</p>
            </div>

            <div>
              <h3 className={h3}>{copy.result.modelAnswer}</h3>
              <p className="mt-1 text-[12px] leading-5 text-amber-800">{copy.result.modelAnswerNote}</p>
              {item.key.modelAnswer ? (
                <div className="mt-2 space-y-3 rounded-xl border border-[#0B1F3A]/10 p-3 text-[14px] leading-7 text-[#1B2733]">
                  {item.key.modelAnswer.split("\n\n").map((para, k) => (
                    <p key={k} className="whitespace-pre-wrap">
                      {para}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[14px] text-[#5C6570]">{copy.result.noModelAnswer}</p>
              )}
              <p className="mt-2 text-[12px] text-[#8A939D]">
                {copy.problem.source}: {fmt(copy.problem.sourceLine, { file: p.sourceFile, heading: p.sourceLocator.heading, from: p.sourceLocator.paragraphStart, to: p.sourceLocator.paragraphEnd })} · {copy.problem.pageUnknown}
              </p>
              <p className="mt-2 text-[13px] text-[#5C6570]">{copy.result.compare}</p>
            </div>

            {item.key.answerOutline.length > 0 ? (
              <div>
                <h3 className={h3}>{copy.result.outline}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-[#1B2733]">
                  {item.key.answerOutline.map((o, k) => (
                    <li key={k}>{o}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {item.key.legalProvisions.length > 0 || item.key.courtCitations.length > 0 ? (
              <div className="space-y-3">
                {item.key.legalProvisions.length > 0 ? (
                  <div>
                    <h3 className={h3}>{copy.result.provisions}</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-[#1B2733]">
                      {item.key.legalProvisions.map((c) => (
                        <li key={c.text}>{c.text}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {item.key.courtCitations.length > 0 ? (
                  <div>
                    <h3 className={h3}>{copy.result.courtCitations}</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-[#1B2733]">
                      {item.key.courtCitations.map((c) => (
                        <li key={c.text}>{c.text}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="text-[12px] text-[#8A939D]">{copy.result.extractedNote}</p>
              </div>
            ) : null}

            {item.autoIndicators && item.autoIndicators.provisionsExpected > 0 ? (
              <div className="rounded-xl bg-[#F7F6F2] p-3">
                <h3 className={h3}>{copy.result.indicators}</h3>
                <p className="mt-1 text-[13px] leading-6 text-[#1B2733]">
                  {fmt(copy.result.indicatorsBody, { expected: item.autoIndicators.provisionsExpected, found: item.autoIndicators.provisionsMentioned.length })}
                </p>
              </div>
            ) : null}

            {item.breakdown ? (
              <div>
                <h3 className={h3}>
                  {copy.result.problemScore}: {item.breakdown.total}/{item.breakdown.max}
                </h3>
                <h4 className="mt-2 text-[12px] font-semibold text-[#5C6570]">{copy.result.perCriterion}</h4>
                <ul className="mt-1 grid gap-1 text-[13px] text-[#1B2733] sm:grid-cols-2">
                  {item.breakdown.perCriterion.map((c) => (
                    <li key={c.id} className="flex justify-between gap-3">
                      <span>{copy.result.assess.criteria[c.id]}</span>
                      <span className="font-semibold tabular-nums">
                        {c.points}/{c.weight}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        );
      })}

      {!result.finalized ? (
        <section className={card}>
          <h2 className="text-[16px] font-bold text-[#0B1F3A]">{copy.result.assess.title}</h2>
          <div className="mt-3">
            <SelfAssessmentForm
              attemptId={result.attemptId}
              copy={copy}
              problems={result.items.map((i) => ({
                id: i.problem.id,
                label: `${copy.areas[i.problem.area]} · ${i.problem.ordinalLabel}`,
                criteria: i.key.rubric.criteria.map((c) => ({ id: c.id, weight: c.weight })),
              }))}
            />
          </div>
        </section>
      ) : null}

      <Link
        href="/student/lawyer-exam"
        className="inline-flex h-11 items-center justify-center rounded-full border border-[#0B1F3A]/15 bg-white px-5 text-[13px] font-semibold text-[#0B1F3A] transition hover:bg-[#EEF4F2]"
      >
        {copy.result.toHub}
      </Link>
    </div>
  );
}
