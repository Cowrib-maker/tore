// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const gradeStudentQuizAction = vi.fn();
vi.mock("@/application/actions/student.actions", () => ({
  gradeStudentQuizAction: (...args: unknown[]) => gradeStudentQuizAction(...args),
}));

import { StudentQuizForm } from "@/components/student/student-quiz-form";
import type { StudentPublicQuiz, StudentQuizGrade } from "@/domain/student";
import type { Dictionary } from "@/i18n/types";

type StudentCopy = Dictionary["publicHome"]["studentPage"];

const copy = {
  submitQuiz: "Дуусгаж шалгах",
  retryQuiz: "Дахин өгөх",
  yourAnswer: "Таны хариу",
  correctAnswer: "Зөв хариу",
  missedHeading: "Алдсан асуултууд",
  allCorrect: "Бүх асуултад зөв хариулсан.",
  unanswered: "Хариулаагүй",
  scoreLabel: "Оноо",
  gradeLabel: "Үнэлгээ",
  grades: {
    excellent: "Онц",
    good: "Сайн",
    average: "Дунд",
    pass: "Хангалттай",
    fail: "Хангалтгүй",
  },
} as unknown as StudentCopy;

const quiz: StudentPublicQuiz = {
  id: "q1",
  trackId: "civil",
  kind: "test",
  title: "t",
  intro: "Асуултуудад хариулаарай.",
  questions: [
    {
      id: "a1",
      prompt: "Асуулт 1?",
      options: [
        { id: "o1", label: "Сонголт 1" },
        { id: "o2", label: "Сонголт 2" },
      ],
    },
  ],
};

function quizGrade(overrides: Partial<StudentQuizGrade> = {}): StudentQuizGrade {
  return {
    quizId: "q1",
    total: 1,
    correct: 1,
    missed: 0,
    percent: 100,
    band: "excellent",
    reviews: [],
    ...overrides,
  };
}

beforeEach(() => {
  gradeStudentQuizAction.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function answerAndSubmit() {
  fireEvent.click(screen.getByLabelText("Сонголт 1"));
  fireEvent.click(screen.getByRole("button", { name: "Дуусгаж шалгах" }));
}

describe("StudentQuizForm", () => {
  it("shows the grade and moves focus to the result", async () => {
    gradeStudentQuizAction.mockResolvedValue(quizGrade());
    render(<StudentQuizForm quiz={quiz} copy={copy} />);

    await act(async () => answerAndSubmit());

    await waitFor(() => expect(screen.getByText("Оноо")).toBeTruthy());
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
  });

  it("recovers from a transport failure instead of hanging on 'sending' forever", async () => {
    gradeStudentQuizAction.mockRejectedValue(new Error("network down"));
    render(<StudentQuizForm quiz={quiz} copy={copy} />);

    await act(async () => answerAndSubmit());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Дуусгаж шалгах" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("never calls the grading action more than once per submit, even if clicked again while pending", async () => {
    let resolveAction: (value: StudentQuizGrade) => void = () => {};
    gradeStudentQuizAction.mockImplementation(
      () => new Promise((resolve) => { resolveAction = resolve; }),
    );
    render(<StudentQuizForm quiz={quiz} copy={copy} />);

    fireEvent.click(screen.getByLabelText("Сонголт 1"));
    const button = screen.getByRole("button", { name: /Дуусгаж шалгах|Илгээж байна/ });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(gradeStudentQuizAction).toHaveBeenCalledTimes(1);
    await act(async () => resolveAction(quizGrade()));
  });
});
