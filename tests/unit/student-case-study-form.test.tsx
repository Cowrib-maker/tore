// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const evaluateStudentProblemAction = vi.fn();
vi.mock("@/application/actions/student.actions", () => ({
  evaluateStudentProblemAction: (...args: unknown[]) =>
    evaluateStudentProblemAction(...args),
}));

import { StudentCaseStudyForm } from "@/components/student/student-case-study-form";
import type { StudentLegalProblem, StudentProblemGrade } from "@/domain/student";
import type { Dictionary } from "@/i18n/types";

type StudentCopy = Dictionary["publicHome"]["studentPage"];

const copy = {
  caseStudy: {
    factPatternHeading: "Баримт",
    sourcesHeading: "Эх сурвалж",
    promptHeading: "Даалгавар",
    answerLabel: "Таны дүн шинжилгээ",
    answerPlaceholder: "Бичнэ үү…",
    submit: "Шалгуулах",
    resultHeading: "Үнэлгээ",
    aiModeLabel: "AI-аар үнэлэгдсэн",
    fallbackModeLabel: "Бүтцийн автомат шалгалт",
    scoreLabel: "Оноо",
    strengthsHeading: "Сайн тал",
    weaknessesHeading: "Дутагдаж буй тал",
    missingIssuesHeading: "Дурдаагүй асуудал",
    missingProvisionsHeading: "Дурдаагүй хууль, зүйл",
    suggestionsHeading: "Санал зөвлөмж",
    sourceIntegrityHeading: "Эх сурвалжийн тэмдэглэл",
    retry: "Дахин оролдох",
  },
} as unknown as StudentCopy;

const problem: StudentLegalProblem = {
  id: "p1",
  trackId: "civil",
  title: "t",
  intro: "i",
  factPattern: "Баримт...",
  prompt: "Дүн шинжилгээ хийнэүү.",
  sources: [],
  rubric: [],
};

const LONG_ANSWER =
  "Энэ бол зургаан арван тэмдэгтээс урт хариулт бичих зорилготой тестийн текст юм. ";

function grade(overrides: Partial<StudentProblemGrade> = {}): StudentProblemGrade {
  return {
    problemId: "p1",
    total: 8,
    maxTotal: 10,
    rubric: [],
    needsSourceVerification: false,
    feedback: "",
    evaluation: {
      mode: "ai",
      label: "Сайн",
      strengths: [],
      weaknesses: [],
      missingIssues: [],
      missingProvisions: [],
      suggestions: [],
      sourceIntegrityNote: "",
    },
    ...overrides,
  };
}

beforeEach(() => {
  evaluateStudentProblemAction.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function typeAnswerAndSubmit() {
  const textarea = screen.getByLabelText("Таны дүн шинжилгээ");
  fireEvent.change(textarea, { target: { value: LONG_ANSWER } });
  fireEvent.click(screen.getByRole("button", { name: "Шалгуулах" }));
}

describe("StudentCaseStudyForm", () => {
  it("shows the graded result and moves focus to it", async () => {
    evaluateStudentProblemAction.mockResolvedValue(grade());
    render(<StudentCaseStudyForm problem={problem} copy={copy} />);

    await act(async () => typeAnswerAndSubmit());

    await waitFor(() => expect(screen.getByText("Оноо")).toBeTruthy());
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
  });

  it("shows a handled error (too short) without losing the typed answer", async () => {
    evaluateStudentProblemAction.mockResolvedValue({ error: "too_short" });
    render(<StudentCaseStudyForm problem={problem} copy={copy} />);

    await act(async () => typeAnswerAndSubmit());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("хэтэрхий богино");
    expect((screen.getByLabelText("Таны дүн шинжилгээ") as HTMLTextAreaElement).value).toBe(
      LONG_ANSWER,
    );
  });

  it("recovers from a transport failure instead of hanging on 'sending' forever", async () => {
    evaluateStudentProblemAction.mockRejectedValue(new Error("network down"));
    render(<StudentCaseStudyForm problem={problem} copy={copy} />);

    await act(async () => typeAnswerAndSubmit());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Шалгуулах" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("never calls the grading action more than once per submit, even if clicked again while pending", async () => {
    let resolveAction: (value: StudentProblemGrade) => void = () => {};
    evaluateStudentProblemAction.mockImplementation(
      () => new Promise((resolve) => { resolveAction = resolve; }),
    );
    render(<StudentCaseStudyForm problem={problem} copy={copy} />);

    const textarea = screen.getByLabelText("Таны дүн шинжилгээ");
    fireEvent.change(textarea, { target: { value: LONG_ANSWER } });
    const button = screen.getByRole("button", { name: /Шалгуулах|Илгээж байна/ });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(evaluateStudentProblemAction).toHaveBeenCalledTimes(1);
    await act(async () => resolveAction(grade()));
  });
});
