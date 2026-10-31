"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { saveAnswerAction, submitAttemptAction } from "@/application/actions/student-exam.actions";
import type { RunnerView } from "@/application/student-exam/exam-service";
import { ANSWER_MAX_CHARS, STUDENT_WARNING_FLAGS, type ReviewFlag } from "@/domain/student/exam/types";
import { fmt, type LawyerExamCopy } from "@/i18n/lawyer-exam";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";
type Draft = { text: string; checks: number[]; status: SaveStatus };

const AUTOSAVE_DELAY_MS = 800;
const draftKey = (attemptId: string, problemId: string) => `tore:lawyer-exam:draft:${attemptId}:${problemId}`;

function readBackup(attemptId: string, problemId: string): { text: string; checks: number[]; at: number } | null {
  try {
    const raw = window.localStorage.getItem(draftKey(attemptId, problemId));
    if (!raw) return null;
    const v = JSON.parse(raw) as { text?: unknown; checks?: unknown; at?: unknown };
    if (typeof v.text !== "string" || typeof v.at !== "number") return null;
    return { text: v.text, checks: Array.isArray(v.checks) ? (v.checks as number[]).filter((n) => Number.isInteger(n)) : [], at: v.at };
  } catch {
    return null;
  }
}
function writeBackup(attemptId: string, problemId: string, text: string, checks: number[]) {
  try {
    window.localStorage.setItem(draftKey(attemptId, problemId), JSON.stringify({ text, checks, at: Date.now() }));
  } catch {
    // Storage full or blocked: the server autosave still protects the answer.
  }
}
function clearBackup(attemptId: string, problemId: string) {
  try {
    window.localStorage.removeItem(draftKey(attemptId, problemId));
  } catch {
    // ignore
  }
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

export function ExamRunner({ view, copy }: { view: RunnerView; copy: LawyerExamCopy }) {
  const router = useRouter();
  const isExam = view.mode === "EXAM";
  const problems = view.problems;

  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(problems.map((p) => [p.id, { text: p.answerText, checks: p.methodChecks, status: "idle" as SaveStatus }])),
  );
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  const draftsRef = useRef(drafts);
  const inFlight = useRef<Set<string>>(new Set());
  const again = useRef<Set<string>>(new Set());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const closedRef = useRef(false);
  const autoSubmitted = useRef(false);
  const submittingRef = useRef(false);

  const update = useCallback((problemId: string, patch: Partial<Draft>) => {
    const next = { ...draftsRef.current, [problemId]: { ...draftsRef.current[problemId]!, ...patch } };
    draftsRef.current = next;
    setDrafts(next);
  }, []);

  const goToResult = useCallback(() => {
    closedRef.current = true;
    router.replace(`/student/lawyer-exam/attempt/${view.attemptId}/result`);
  }, [router, view.attemptId]);

  /** Saves one problem; if the text changed while the request was in flight, saves again afterwards. */
  const save = useCallback(
    async (problemId: string): Promise<boolean> => {
      if (closedRef.current) return true;
      if (inFlight.current.has(problemId)) {
        again.current.add(problemId);
        return true;
      }
      inFlight.current.add(problemId);
      let ok = true;
      try {
        do {
          again.current.delete(problemId);
          const snapshot = draftsRef.current[problemId]!;
          update(problemId, { status: "saving" });
          let result: Awaited<ReturnType<typeof saveAnswerAction>>;
          try {
            result = await saveAnswerAction(view.attemptId, {
              problemId,
              answerText: snapshot.text,
              methodChecks: snapshot.checks,
            });
          } catch {
            // The server action call itself failed (e.g. network drop), not a business-level rejection: treat it the same
            // as a generic save failure so the user sees the retry affordance instead of a save status stuck forever.
            update(problemId, { status: "error" });
            ok = false;
            break;
          }
          if (result.ok) {
            const current = draftsRef.current[problemId]!;
            if (current.text === snapshot.text && current.checks.join() === snapshot.checks.join()) {
              update(problemId, { status: "saved" });
              clearBackup(view.attemptId, problemId);
            } else {
              again.current.add(problemId);
            }
          } else if (result.error === "closed" || result.error === "expired") {
            goToResult();
            ok = false;
            break;
          } else {
            update(problemId, { status: "error" });
            ok = false;
            break;
          }
        } while (again.current.has(problemId));
      } finally {
        inFlight.current.delete(problemId);
      }
      return ok;
    },
    [goToResult, update, view.attemptId],
  );

  const schedule = useCallback(
    (problemId: string) => {
      const existing = timers.current.get(problemId);
      if (existing) clearTimeout(existing);
      timers.current.set(
        problemId,
        setTimeout(() => {
          timers.current.delete(problemId);
          void save(problemId);
        }, AUTOSAVE_DELAY_MS),
      );
    },
    [save],
  );

  const flushAll = useCallback(async (): Promise<boolean> => {
    let allOk = true;
    for (const [id, t] of timers.current) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    for (const p of problems) {
      const d = draftsRef.current[p.id]!;
      if (d.status === "dirty" || d.status === "error" || d.status === "saving") {
        if (!(await save(p.id))) allOk = false;
      }
    }
    // Wait for any save that is still in flight.
    for (let i = 0; i < 50 && inFlight.current.size > 0; i++) await new Promise((r) => setTimeout(r, 100));
    return allOk;
  }, [problems, save]);

  const onText = (problemId: string, text: string) => {
    const d = draftsRef.current[problemId]!;
    update(problemId, { text, status: "dirty" });
    writeBackup(view.attemptId, problemId, text, d.checks);
    schedule(problemId);
  };

  const onCheck = (problemId: string, step: number) => {
    const d = draftsRef.current[problemId]!;
    const checks = d.checks.includes(step) ? d.checks.filter((s) => s !== step) : [...d.checks, step].sort((a, b) => a - b);
    update(problemId, { checks, status: "dirty" });
    writeBackup(view.attemptId, problemId, d.text, checks);
    schedule(problemId);
  };

  // Restore a newer unsaved local draft (page closed/refreshed before the last autosave landed).
  useEffect(() => {
    let any = false;
    for (const p of problems) {
      const backup = readBackup(view.attemptId, p.id);
      if (!backup) continue;
      const serverAt = p.answerUpdatedAt ? Date.parse(p.answerUpdatedAt) : 0;
      if (backup.at > serverAt && backup.text !== p.answerText) {
        update(p.id, { text: backup.text, checks: backup.checks, status: "dirty" });
        schedule(p.id);
        any = true;
      } else {
        clearBackup(view.attemptId, p.id);
      }
    }
    if (any) setTimeout(() => setRestored(true), 0);
    // Runs once per attempt on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown from the SERVER deadline, corrected for the difference between the server clock and this device's clock.
  useEffect(() => {
    if (!isExam || !view.deadlineAt) return;
    const skew = Date.parse(view.serverNow) - Date.now();
    const deadline = Date.parse(view.deadlineAt);
    const tick = () => setRemainingMs(deadline - (Date.now() + skew));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [isExam, view.deadlineAt, view.serverNow]);

  const submit = useCallback(async () => {
    // A ref (not state) guards re-entry: several clicks can arrive before React re-renders with submitting = true.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const release = () => {
      submittingRef.current = false;
      setSubmitting(false);
    };
    const saved = await flushAll();
    if (!saved && !closedRef.current) {
      setSubmitError(copy.errors.failed);
      release();
      return;
    }
    let result: Awaited<ReturnType<typeof submitAttemptAction>>;
    try {
      result = await submitAttemptAction(view.attemptId);
    } catch {
      setSubmitError(copy.genericError);
      release();
      return;
    }
    if (result.ok) {
      goToResult();
      return;
    }
    setSubmitError(copy.errors[result.error as keyof typeof copy.errors] ?? copy.genericError);
    release();
  }, [copy, flushAll, goToResult, view.attemptId]);

  // When the clock reaches zero the server closes the attempt; save what we have and move on to the result.
  const timeUp = isExam && remainingMs !== null && remainingMs <= 0;
  useEffect(() => {
    if (!timeUp || autoSubmitted.current) return;
    autoSubmitted.current = true;
    void submit();
  }, [timeUp, submit]);

  // Flush on tab hide / page leave so a refresh or closing the tab loses at most a keystroke.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushAll();
    };
    const onPageHide = () => void flushAll();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [flushAll]);

  const current = problems[index]!;
  const draft = drafts[current.id]!;
  const answered = useMemo(() => problems.filter((p) => drafts[p.id]!.text.trim().length > 0).length, [problems, drafts]);
  const warnings = current.reviewFlags.filter((f): f is ReviewFlag => (STUDENT_WARNING_FLAGS as readonly string[]).includes(f));
  const lowTime = remainingMs !== null && remainingMs <= 5 * 60_000;

  const saveLabel =
    draft.status === "saving" ? copy.answer.saving : draft.status === "saved" ? copy.answer.saved : draft.status === "error" ? copy.answer.saveFailed : draft.status === "dirty" ? copy.answer.saving : "";

  return (
    <div className="mx-auto w-full max-w-3xl pb-28">
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-[#0B1F3A]/10 bg-white/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-b-xl">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] font-semibold text-[#5C6570]">
            {fmt(copy.problem.position, { n: index + 1, total: problems.length })}
          </p>
          {isExam ? (
            <p
              role="timer"
              aria-live="off"
              className={`text-[15px] font-bold tabular-nums ${lowTime ? "text-red-600" : "text-[#0B1F3A]"}`}
            >
              <span className="mr-2 text-[11px] font-semibold uppercase tracking-wide text-[#8A939D]">{copy.exam.timeLeft}</span>
              {remainingMs === null ? "—" : formatClock(remainingMs)}
            </p>
          ) : null}
          <p className="text-[12px] text-[#5C6570]">{fmt(copy.exam.progress, { done: answered, total: problems.length })}</p>
        </div>
        {isExam ? (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#0B1F3A]/10" aria-hidden>
            <div className="h-full bg-[#0B5CFF] transition-all" style={{ width: `${Math.round((answered / problems.length) * 100)}%` }} />
          </div>
        ) : null}
        {timeUp ? (
          <p role="status" className="mt-2 rounded-md bg-amber-50 px-3 py-1.5 text-[12px] text-amber-800">
            {copy.exam.timeUp}
          </p>
        ) : null}
      </div>

      {problems.length > 1 ? (
        <nav aria-label={copy.problem.label} className="mb-4 flex flex-wrap gap-2">
          {problems.map((p, i) => {
            const done = drafts[p.id]!.text.trim().length > 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index ? "step" : undefined}
                className={`h-9 min-w-9 rounded-lg border px-2 text-[13px] font-semibold transition ${
                  i === index
                    ? "border-[#0B1F3A] bg-[#0B1F3A] text-white"
                    : done
                      ? "border-[#1A7A72]/40 bg-[#E8F4F1] text-[#1A7A72]"
                      : "border-[#0B1F3A]/15 bg-white text-[#0B1F3A]"
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </nav>
      ) : null}

      <article className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-4 sm:p-6" lang="mn">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0B5CFF]">
          {copy.areas[current.area]} · {current.ordinalLabel}
        </p>
        {warnings.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {warnings.map((f) => (
              <li key={f} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                {copy.badges[f as "POSSIBLY_OUTDATED_LAW" | "OCR_NOISE_SUSPECTED" | "MODEL_ANSWER_TRUNCATED_OR_SHORT"]}
              </li>
            ))}
          </ul>
        ) : null}
        <h2 className="mt-4 text-[13px] font-semibold text-[#8A939D]">{copy.problem.statement}</h2>
        <div className="mt-1 space-y-3 text-[15px] leading-7 text-[#1B2733]">
          {current.statement.split("\n\n").map((para, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {para}
            </p>
          ))}
        </div>
        {current.questions.length > 0 ? (
          <>
            <h3 className="mt-5 text-[13px] font-semibold text-[#8A939D]">{copy.problem.questions}</h3>
            <div className="mt-1 space-y-2 text-[15px] font-medium leading-7 text-[#0B1F3A]">
              {current.questions.map((q, i) => (
                <p key={i} className="whitespace-pre-wrap">
                  {q}
                </p>
              ))}
            </div>
          </>
        ) : null}
        <p className="mt-4 text-[11px] leading-5 text-[#8A939D]">
          {copy.problem.source}:{" "}
          {fmt(copy.problem.sourceLine, {
            file: current.sourceFile,
            heading: current.sourceLocator.heading,
            from: current.sourceLocator.paragraphStart,
            to: current.sourceLocator.paragraphEnd,
          })}{" "}
          · {copy.problem.pageUnknown}
        </p>
      </article>

      <section className="mt-5">
        <div className="flex items-center justify-between">
          <label htmlFor="exam-answer" className="text-[14px] font-semibold text-[#0B1F3A]">
            {copy.answer.label}
          </label>
          <p className="flex items-center gap-2 text-[12px]" aria-live="polite">
            <span className={draft.status === "error" ? "text-red-600" : "text-[#5C6570]"}>{saveLabel}</span>
            {draft.status === "error" ? (
              <button type="button" className="font-semibold underline" onClick={() => void save(current.id)}>
                {copy.answer.retry}
              </button>
            ) : null}
          </p>
        </div>
        {restored ? (
          <p role="status" className="mt-2 rounded-md bg-[#E8F4F1] px-3 py-1.5 text-[12px] text-[#1A7A72]">
            {copy.answer.restoredDraft}
          </p>
        ) : null}
        <textarea
          id="exam-answer"
          lang="mn"
          value={draft.text}
          maxLength={ANSWER_MAX_CHARS}
          onChange={(e) => onText(current.id, e.target.value)}
          onBlur={() => void save(current.id)}
          placeholder={copy.answer.placeholder}
          className="mt-2 min-h-[18rem] w-full resize-y rounded-xl border border-[#0B1F3A]/15 bg-white p-3 text-[15px] leading-7 text-[#1B2733] outline-none focus:border-[#0B5CFF] focus:ring-2 focus:ring-[#0B5CFF]/20 sm:min-h-[22rem]"
        />
        <p className="mt-1 text-right text-[11px] text-[#8A939D]">{fmt(copy.answer.chars, { n: draft.text.length })}</p>
      </section>

      <section className="mt-5 rounded-2xl border border-[#0B1F3A]/10 bg-[#F7F6F2] p-4">
        <h3 className="text-[13px] font-semibold text-[#0B1F3A]">{copy.method.title}</h3>
        <p className="mt-1 text-[12px] leading-5 text-[#5C6570]">{copy.method.hint}</p>
        <ol className="mt-3 space-y-2">
          {copy.method.steps.map((label, step) => (
            <li key={step}>
              <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-6 text-[#1B2733]">
                <input
                  type="checkbox"
                  className="mt-1.5 size-4"
                  checked={draft.checks.includes(step)}
                  onChange={() => onCheck(current.id, step)}
                />
                <span>
                  <span className="mr-1.5 font-semibold text-[#0B5CFF]">{step + 1}.</span>
                  {label}
                </span>
              </label>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-4 text-[12px] leading-5 text-[#5C6570]">{isExam ? copy.submit.examHint : copy.submit.studyHint}</p>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#0B1F3A]/10 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
            className="h-11 rounded-full border border-[#0B1F3A]/15 px-4 text-[13px] font-semibold text-[#0B1F3A] disabled:opacity-40"
          >
            {copy.problem.prev}
          </button>
          {index < problems.length - 1 ? (
            <button
              type="button"
              onClick={() => setIndex(index + 1)}
              className="h-11 rounded-full border border-[#0B1F3A]/15 px-4 text-[13px] font-semibold text-[#0B1F3A]"
            >
              {copy.problem.next}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            disabled={submitting}
            onClick={() => setConfirming(true)}
            className="h-11 rounded-full bg-[#0B1F3A] px-5 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {isExam ? copy.submit.exam : copy.submit.study}
          </button>
        </div>
      </div>

      {confirming ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 id="confirm-title" className="text-[16px] font-bold text-[#0B1F3A]">
              {copy.submit.confirmTitle}
            </h2>
            <p className="mt-2 text-[14px] leading-6 text-[#5C6570]">{copy.submit.confirmBody}</p>
            {problems.length - answered > 0 ? (
              <p className="mt-2 text-[13px] font-medium text-amber-800">{fmt(copy.submit.unanswered, { n: problems.length - answered })}</p>
            ) : null}
            {submitError ? (
              <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
                {submitError}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setConfirming(false);
                  setSubmitError(null);
                }}
                className="h-11 rounded-full border border-[#0B1F3A]/15 px-4 text-[13px] font-semibold text-[#0B1F3A] disabled:opacity-50"
              >
                {copy.submit.cancel}
              </button>
              <button
                type="button"
                disabled={submitting}
                aria-busy={submitting}
                onClick={() => void submit()}
                className="h-11 rounded-full bg-[#0B1F3A] px-5 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                {submitting ? copy.submit.sending : copy.submit.confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
