// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  StudentQuizForm,
  studentQuizAnswersStorageKey,
} from "@/components/student/student-quiz-form";
import { gradeStudentQuizAction } from "@/application/actions/student.actions";
import { mn } from "@/i18n/dictionaries/mn";
import type { StudentPublicQuiz } from "@/domain/student";

vi.mock("@/application/actions/student.actions", () => ({
  gradeStudentQuizAction: vi.fn(),
}));

const copy = mn.publicHome.studentPage;

const quiz: StudentPublicQuiz = {
  id: "regression-quiz",
  trackId: "criminal",
  kind: "test",
  title: "Regression quiz",
  intro: "intro",
  questions: [
    {
      id: "q1",
      prompt: "Question one",
      options: [
        { id: "a", label: "Option A" },
        { id: "b", label: "Option B" },
      ],
    },
    {
      id: "q2",
      prompt: "Question two",
      options: [
        { id: "a", label: "Option A" },
        { id: "b", label: "Option B" },
      ],
    },
  ],
};

function radio(questionId: string, optionId: "a" | "b"): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(
    `input[name="${questionId}"][value="${optionId}"]`,
  );
  if (!el) throw new Error(`radio ${questionId}/${optionId} not found`);
  return el;
}

/**
 * Regression: the quiz form kept answers only in React state, so a page
 * refresh mid-quiz silently erased everything the student had already
 * selected — the exact "refreshing the page does not unexpectedly erase
 * progress" requirement from the Student examination checklist. It now
 * mirrors in-progress answers to sessionStorage (never the graded result)
 * and restores them on mount.
 */
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe("StudentQuizForm answer persistence", () => {
  it("persists a selected answer to sessionStorage as the student answers", () => {
    render(<StudentQuizForm quiz={quiz} copy={copy} />);

    fireEvent.click(radio("q1", "a"));

    const stored = sessionStorage.getItem(studentQuizAnswersStorageKey(quiz.id));
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!)).toMatchObject({ q1: "a" });
  });

  it("restores a previously saved in-progress answer after remounting (simulating a refresh)", () => {
    sessionStorage.setItem(
      studentQuizAnswersStorageKey(quiz.id),
      JSON.stringify({ q1: "b" }),
    );

    render(<StudentQuizForm quiz={quiz} copy={copy} />);

    expect(radio("q1", "b").checked).toBe(true);
    expect(radio("q1", "a").checked).toBe(false);
  });

  it("clears the stored draft once the quiz is successfully submitted — a graded result is never kept as a draft", async () => {
    vi.mocked(gradeStudentQuizAction).mockResolvedValue({
      quizId: quiz.id,
      total: 2,
      correct: 2,
      missed: 0,
      percent: 100,
      band: "excellent",
      reviews: [],
    });

    render(<StudentQuizForm quiz={quiz} copy={copy} />);
    fireEvent.click(radio("q1", "a"));
    fireEvent.click(radio("q2", "a"));
    expect(sessionStorage.getItem(studentQuizAnswersStorageKey(quiz.id))).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: copy.submitQuiz }));
    await screen.findByText(copy.retryQuiz);

    expect(sessionStorage.getItem(studentQuizAnswersStorageKey(quiz.id))).toBeNull();
  });

  it("clears the stored draft when the student clicks retry after seeing results", async () => {
    vi.mocked(gradeStudentQuizAction).mockResolvedValue({
      quizId: quiz.id,
      total: 2,
      correct: 1,
      missed: 1,
      percent: 50,
      band: "pass",
      reviews: [],
    });

    render(<StudentQuizForm quiz={quiz} copy={copy} />);
    fireEvent.click(radio("q1", "a"));
    fireEvent.click(radio("q2", "a"));
    fireEvent.click(screen.getByRole("button", { name: copy.submitQuiz }));
    const retryButton = await screen.findByRole("button", { name: copy.retryQuiz });

    fireEvent.click(retryButton);

    expect(sessionStorage.getItem(studentQuizAnswersStorageKey(quiz.id))).toBeNull();
    // Back to the question form, with no answer selected.
    expect(radio("q1", "a").checked).toBe(false);
  });
});
