// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveAction = vi.fn();
const submitAction = vi.fn();
const replace = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("@/application/actions/student-exam.actions", () => ({
  saveAnswerAction: (...a: unknown[]) => saveAction(...a),
  submitAttemptAction: (...a: unknown[]) => submitAction(...a),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push, refresh }) }));

import type { RunnerView } from "@/application/student-exam/exam-service";
import { ExamRunner } from "@/components/student/exam/exam-runner";
import { getLawyerExamCopy } from "@/i18n/lawyer-exam";

const copy = getLawyerExamCopy("mn");
const NOW = new Date("2026-10-22T09:00:00.000Z");

function problem(n: number, over: Partial<RunnerView["problems"][number]> = {}): RunnerView["problems"][number] {
  return {
    id: `p${n}`,
    area: "CRIMINAL",
    ordinal: n,
    ordinalLabel: `Бодлого-${n}`,
    statement: `Нөхцөл ${n}, эхний догол.\n\nХоёр дахь догол ${n}.`,
    questions: [`Асуулт: ${n}-р асуулт?`],
    topic: null,
    difficulty: null,
    sourceFile: "criminal.docx",
    sourceLocator: { heading: `Бодлого-${n}`, page: null, paragraphStart: 10, paragraphEnd: 20 },
    reviewStatus: "IMPORTED",
    reviewFlags: [],
    position: n - 1,
    answerText: "",
    methodChecks: [],
    answerUpdatedAt: null,
    ...over,
  };
}

function view(over: Partial<RunnerView> = {}): RunnerView {
  return {
    attemptId: "att1",
    mode: "EXAM",
    status: "IN_PROGRESS",
    serverNow: NOW.toISOString(),
    deadlineAt: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
    problems: [problem(1), problem(2), problem(3)],
    ...over,
  };
}

const flush = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(NOW);
  window.localStorage.clear();
  for (const m of [saveAction, submitAction, replace, push, refresh]) m.mockReset();
  saveAction.mockResolvedValue({ ok: true, savedAt: NOW.toISOString() });
  submitAction.mockResolvedValue({ ok: true, status: "SUBMITTED", alreadyClosed: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const textarea = () => screen.getByLabelText(copy.answer.label) as HTMLTextAreaElement;

describe("reading the problem", () => {
  it("shows the full original wording, paragraph structure, source and the not-reviewed context", async () => {
    render(<ExamRunner view={view()} copy={copy} />);
    await flush(0);
    expect(screen.getByText("Нөхцөл 1, эхний догол.")).toBeTruthy();
    expect(screen.getByText("Хоёр дахь догол 1.")).toBeTruthy();
    expect(screen.getByText("Асуулт: 1-р асуулт?")).toBeTruthy();
    expect(screen.getByText(/criminal\.docx · Бодлого-1/)).toBeTruthy();
    expect(screen.getByText(new RegExp(copy.problem.pageUnknown))).toBeTruthy();
  });

  it("never renders anything that looks like a model answer or key during the attempt", async () => {
    const { container } = render(<ExamRunner view={view()} copy={copy} />);
    await flush(0);
    expect(container.textContent).not.toContain(copy.result.modelAnswer);
    expect(screen.getByText(copy.submit.examHint)).toBeTruthy();
  });

  it("shows legal-review warnings for flagged problems", async () => {
    render(<ExamRunner view={view({ problems: [problem(1, { reviewFlags: ["POSSIBLY_OUTDATED_LAW", "NO_ANSWER_MARKER"] })] })} copy={copy} />);
    await flush(0);
    expect(screen.getByText(copy.badges.POSSIBLY_OUTDATED_LAW)).toBeTruthy();
  });

  it("moves between problems and shows progress", async () => {
    render(<ExamRunner view={view()} copy={copy} />);
    await flush(0);
    expect(screen.getByText("Бодлого 1/3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: copy.problem.next }));
    expect(screen.getByText("Бодлого 2/3")).toBeTruthy();
    expect(screen.getByText("Нөхцөл 2, эхний догол.")).toBeTruthy();
  });
});

describe("autosave", () => {
  it("saves the typed answer after a short pause with the attempt and problem ids", async () => {
    render(<ExamRunner view={view()} copy={copy} />);
    await flush(0);
    fireEvent.change(textarea(), { target: { value: "Миний хариулт" } });
    expect(saveAction).not.toHaveBeenCalled();
    await flush(900);
    expect(saveAction).toHaveBeenCalledTimes(1);
    expect(saveAction).toHaveBeenCalledWith("att1", { problemId: "p1", answerText: "Миний хариулт", methodChecks: [] });
    expect(screen.getByText(copy.answer.saved)).toBeTruthy();
  });

  it("coalesces rapid typing into one save", async () => {
    render(<ExamRunner view={view()} copy={copy} />);
    await flush(0);
    for (const v of ["М", "Ми", "Мин", "Миний"]) {
      fireEvent.change(textarea(), { target: { value: v } });
      await flush(200);
    }
    await flush(900);
    expect(saveAction).toHaveBeenCalledTimes(1);
    expect(saveAction.mock.calls[0]![1].answerText).toBe("Миний");
  });

  it("keeps each problem's answer separate", async () => {
    render(<ExamRunner view={view()} copy={copy} />);
    await flush(0);
    fireEvent.change(textarea(), { target: { value: "A1" } });
    fireEvent.click(screen.getByRole("button", { name: copy.problem.next }));
    expect(textarea().value).toBe("");
    fireEvent.change(textarea(), { target: { value: "A2" } });
    await flush(900);
    const payloads = saveAction.mock.calls.map((c) => [c[1].problemId, c[1].answerText]);
    expect(payloads).toEqual(expect.arrayContaining([["p1", "A1"], ["p2", "A2"]]));
  });

  it("saves the method checklist too", async () => {
    render(<ExamRunner view={view()} copy={copy} />);
    await flush(0);
    fireEvent.click(screen.getByLabelText(new RegExp(copy.method.steps[2]!)));
    await flush(900);
    expect(saveAction).toHaveBeenCalledWith("att1", expect.objectContaining({ methodChecks: [2] }));
  });

  it("shows a failure with Retry, keeps the text, and a retry succeeds", async () => {
    saveAction.mockResolvedValueOnce({ ok: false, error: "failed" });
    render(<ExamRunner view={view()} copy={copy} />);
    await flush(0);
    fireEvent.change(textarea(), { target: { value: "ноорог" } });
    await flush(900);
    expect(screen.getByText(copy.answer.saveFailed)).toBeTruthy();
    expect(textarea().value).toBe("ноорог");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.answer.retry }));
    });
    await flush(0);
    expect(saveAction).toHaveBeenCalledTimes(2);
    expect(screen.getByText(copy.answer.saved)).toBeTruthy();
  });

  it("goes to the result when the server says the attempt is closed or expired", async () => {
    saveAction.mockResolvedValueOnce({ ok: false, error: "expired" });
    render(<ExamRunner view={view()} copy={copy} />);
    await flush(0);
    fireEvent.change(textarea(), { target: { value: "x" } });
    await flush(900);
    expect(replace).toHaveBeenCalledWith("/student/lawyer-exam/attempt/att1/result");
  });

  it("shows a failure with Retry (not a save stuck forever) when the save call itself throws, e.g. a dropped connection", async () => {
    saveAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ExamRunner view={view()} copy={copy} />);
    await flush(0);
    fireEvent.change(textarea(), { target: { value: "ноорог" } });
    await flush(900);
    expect(screen.getByText(copy.answer.saveFailed)).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.answer.retry })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.answer.retry }));
    });
    await flush(0);
    expect(saveAction).toHaveBeenCalledTimes(2);
    expect(screen.getByText(copy.answer.saved)).toBeTruthy();
  });
});

describe("refresh and recovery", () => {
  it("restores the server-saved answer on reload", async () => {
    render(<ExamRunner view={view({ problems: [problem(1, { answerText: "серверт хадгалагдсан", methodChecks: [0, 1] })] })} copy={copy} />);
    await flush(0);
    expect(textarea().value).toBe("серверт хадгалагдсан");
    expect((screen.getByLabelText(new RegExp(copy.method.steps[1]!)) as HTMLInputElement).checked).toBe(true);
  });

  it("restores a newer unsaved local draft and saves it", async () => {
    window.localStorage.setItem("tore:lawyer-exam:draft:att1:p1", JSON.stringify({ text: "шинэ ноорог", checks: [3], at: NOW.getTime() + 5000 }));
    render(<ExamRunner view={view({ problems: [problem(1, { answerText: "хуучин", answerUpdatedAt: new Date(NOW.getTime() - 60_000).toISOString() })] })} copy={copy} />);
    await flush(0);
    expect(textarea().value).toBe("шинэ ноорог");
    expect(screen.getByText(copy.answer.restoredDraft)).toBeTruthy();
    await flush(900);
    expect(saveAction).toHaveBeenCalledWith("att1", { problemId: "p1", answerText: "шинэ ноорог", methodChecks: [3] });
    expect(window.localStorage.getItem("tore:lawyer-exam:draft:att1:p1")).toBeNull(); // cleared once the server has it
  });

  it("ignores an older local draft", async () => {
    window.localStorage.setItem("tore:lawyer-exam:draft:att1:p1", JSON.stringify({ text: "хуучин ноорог", checks: [], at: NOW.getTime() - 120_000 }));
    render(<ExamRunner view={view({ problems: [problem(1, { answerText: "сервер", answerUpdatedAt: new Date(NOW.getTime() - 60_000).toISOString() })] })} copy={copy} />);
    await flush(0);
    expect(textarea().value).toBe("сервер");
    expect(saveAction).not.toHaveBeenCalled();
  });

  it("keeps a local backup while typing so a refresh before the autosave loses nothing", async () => {
    render(<ExamRunner view={view()} copy={copy} />);
    await flush(0);
    fireEvent.change(textarea(), { target: { value: "дөнгөж бичсэн" } });
    const backup = JSON.parse(window.localStorage.getItem("tore:lawyer-exam:draft:att1:p1")!);
    expect(backup.text).toBe("дөнгөж бичсэн");
  });
});

describe("timer", () => {
  it("counts down from the server deadline, corrected for a skewed device clock", async () => {
    // The device clock is 10 minutes AHEAD of the server; the countdown must still show 30:00, not 20:00.
    vi.setSystemTime(new Date(NOW.getTime() + 10 * 60_000));
    render(<ExamRunner view={view()} copy={copy} />);
    await flush(0);
    expect(screen.getByRole("timer").textContent).toContain("30:00");
    await flush(5000);
    expect(screen.getByRole("timer").textContent).toContain("29:55");
  });

  it("shows hours for long exams and warns in the last five minutes", async () => {
    render(<ExamRunner view={view({ deadlineAt: new Date(NOW.getTime() + 90 * 60_000).toISOString() })} copy={copy} />);
    await flush(0);
    expect(screen.getByRole("timer").textContent).toContain("1:30:00");
    cleanup();
    render(<ExamRunner view={view({ deadlineAt: new Date(NOW.getTime() + 4 * 60_000).toISOString() })} copy={copy} />);
    await flush(0);
    expect(screen.getByRole("timer").className).toContain("text-red-600");
  });

  it("when time runs out it saves, submits once and moves to the result", async () => {
    render(<ExamRunner view={view({ deadlineAt: new Date(NOW.getTime() + 3000).toISOString() })} copy={copy} />);
    await flush(0);
    fireEvent.change(textarea(), { target: { value: "соцгоор бичсэн" } });
    await flush(3500);
    await flush(1000);
    expect(saveAction).toHaveBeenCalledWith("att1", expect.objectContaining({ answerText: "соцгоор бичсэн" }));
    expect(submitAction).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/student/lawyer-exam/attempt/att1/result");
  });

  it("study attempts have no timer", async () => {
    render(<ExamRunner view={view({ mode: "STUDY", deadlineAt: null, problems: [problem(1)] })} copy={copy} />);
    await flush(0);
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getByText(copy.submit.studyHint)).toBeTruthy();
  });
});

describe("submitting", () => {
  it("asks for confirmation, mentions unanswered problems, and can be cancelled", async () => {
    render(<ExamRunner view={view()} copy={copy} />);
    await flush(0);
    fireEvent.change(textarea(), { target: { value: "нэг" } });
    fireEvent.click(screen.getByRole("button", { name: copy.submit.exam }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Хариулаагүй бодлого: 2")).toBeTruthy();
    expect(submitAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: copy.submit.cancel }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(submitAction).not.toHaveBeenCalled();
  });

  it("flushes pending answers first, then submits exactly once even if clicked repeatedly", async () => {
    let release!: (v: unknown) => void;
    submitAction.mockReturnValue(new Promise((r) => (release = r)));
    render(<ExamRunner view={view()} copy={copy} />);
    await flush(0);
    fireEvent.change(textarea(), { target: { value: "сүүлчийн өөрчлөлт" } });
    fireEvent.click(screen.getByRole("button", { name: copy.submit.exam }));
    const confirm = screen.getByRole("button", { name: copy.submit.confirm });
    await act(async () => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    await flush(300);
    expect(saveAction).toHaveBeenCalledWith("att1", expect.objectContaining({ answerText: "сүүлчийн өөрчлөлт" }));
    expect(submitAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: copy.submit.sending })).toBeTruthy();
    await act(async () => release({ ok: true, status: "SUBMITTED", alreadyClosed: false }));
    expect(replace).toHaveBeenCalledWith("/student/lawyer-exam/attempt/att1/result");
  });

  it("does not submit when the final save fails, and shows the error", async () => {
    saveAction.mockResolvedValue({ ok: false, error: "failed" });
    render(<ExamRunner view={view()} copy={copy} />);
    await flush(0);
    fireEvent.change(textarea(), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: copy.submit.exam }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.submit.confirm }));
    });
    await flush(300);
    expect(submitAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(copy.errors.failed);
  });

  it("shows a localized error when the server refuses the submit, and allows another try", async () => {
    submitAction.mockResolvedValueOnce({ ok: false, error: "rate_limited" });
    render(<ExamRunner view={view()} copy={copy} />);
    await flush(0);
    fireEvent.click(screen.getByRole("button", { name: copy.submit.exam }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.submit.confirm }));
    });
    await flush(100);
    expect(screen.getByRole("alert").textContent).toContain(copy.errors.rate_limited);
    expect(replace).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.submit.confirm }));
    });
    await flush(100);
    expect(submitAction).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenCalled();
  });

  it("shows a generic error and releases the submit button (not stuck forever) when submitAttemptAction itself throws", async () => {
    submitAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ExamRunner view={view()} copy={copy} />);
    await flush(0);
    fireEvent.click(screen.getByRole("button", { name: copy.submit.exam }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.submit.confirm }));
    });
    await flush(100);
    expect(screen.getByRole("alert").textContent).toContain(copy.genericError);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: copy.submit.exam })).toBeTruthy();
    submitAction.mockResolvedValueOnce({ ok: true, status: "SUBMITTED", alreadyClosed: false });
    fireEvent.click(screen.getByRole("button", { name: copy.submit.exam }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.submit.confirm }));
    });
    await flush(100);
    expect(replace).toHaveBeenCalledWith("/student/lawyer-exam/attempt/att1/result");
  });
});
