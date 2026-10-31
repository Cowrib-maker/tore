// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startAction = vi.fn();
const assessAction = vi.fn();
const reviewAction = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("@/application/actions/student-exam.actions", () => ({
  startExamAction: (...a: unknown[]) => startAction(...a),
  submitSelfAssessmentAction: (...a: unknown[]) => assessAction(...a),
  setProblemReviewAction: (...a: unknown[]) => reviewAction(...a),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh }) }));

import type { AttemptResult } from "@/application/student-exam/exam-service";
import { ProblemReviewRow } from "@/components/student/exam/problem-review-row";
import { ResultView } from "@/components/student/exam/result-view";
import { SelfAssessmentForm } from "@/components/student/exam/self-assessment-form";
import { StartExamForm } from "@/components/student/exam/start-exam-form";
import { studentSidebarItems } from "@/components/student/student-shell";
import { defaultRubric } from "@/domain/student/exam/rubric";
import { EXAM_AREAS } from "@/domain/student/exam/types";
import { getLawyerExamCopy } from "@/i18n/lawyer-exam";
import { locales } from "@/i18n/config";

const copy = getLawyerExamCopy("mn");

beforeEach(() => {
  for (const m of [startAction, assessAction, reviewAction, push, refresh]) m.mockReset();
});
afterEach(cleanup);

describe("StartExamForm", () => {
  const counts = { CRIMINAL: 6, CIVIL: 4, ADMINISTRATIVE: 0, CONSTITUTIONAL: 2 };

  it("disables areas with no problems and selects the available ones", () => {
    render(<StartExamForm counts={counts} copy={copy} />);
    const admin = screen.getByRole("checkbox", { name: new RegExp(copy.areas.ADMINISTRATIVE) }) as HTMLInputElement;
    expect(admin.disabled).toBe(true);
    expect(admin.checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: new RegExp(copy.areas.CRIMINAL) }) as HTMLInputElement).checked).toBe(true);
  });

  it("sends the chosen areas, count, time and weights, then opens the attempt", async () => {
    startAction.mockResolvedValue({ ok: true, attemptId: "att9", resumed: false });
    render(<StartExamForm counts={counts} copy={copy} />);
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(copy.areas.CIVIL) })); // deselect civil
    fireEvent.change(screen.getByLabelText(copy.exam.count), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText(copy.exam.minutes), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText(`${copy.areas.CRIMINAL}: ${copy.exam.weights}`), { target: { value: "3" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.exam.start }));
    });
    expect(startAction).toHaveBeenCalledWith({
      areas: ["CRIMINAL", "CONSTITUTIONAL"],
      count: 4,
      minutes: 45,
      areaWeights: { CRIMINAL: 3, CONSTITUTIONAL: 1 },
    });
    expect(push).toHaveBeenCalledWith("/student/lawyer-exam/attempt/att9");
  });

  it("tells the student when an unfinished exam was resumed", async () => {
    startAction.mockResolvedValue({ ok: true, attemptId: "att1", resumed: true });
    render(<StartExamForm counts={counts} copy={copy} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.exam.start }));
    });
    expect(push).toHaveBeenCalledWith("/student/lawyer-exam/attempt/att1?resumed=1");
  });

  it("shows localized server errors and stays on the form", async () => {
    startAction.mockResolvedValue({ ok: false, error: "not_enough_problems" });
    render(<StartExamForm counts={counts} copy={copy} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.exam.start }));
    });
    expect(screen.getByRole("alert").textContent).toBe(copy.errors.not_enough_problems);
    expect(push).not.toHaveBeenCalled();
  });

  it("cannot start with no area selected", () => {
    render(<StartExamForm counts={counts} copy={copy} />);
    for (const a of ["CRIMINAL", "CIVIL", "CONSTITUTIONAL"] as const) fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(copy.areas[a]) }));
    expect((screen.getByRole("button", { name: copy.exam.start }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("SelfAssessmentForm", () => {
  const problems = [
    { id: "p1", label: "Эрүүгийн · Бодлого-1", criteria: defaultRubric().criteria },
    { id: "p2", label: "Эрүүгийн · Бодлого-2", criteria: defaultRubric().criteria },
  ];

  const rateAll = (value: number) => {
    for (const radio of screen.getAllByRole("radio")) {
      if ((radio as HTMLInputElement).closest("label")?.textContent === String(value)) fireEvent.click(radio);
    }
  };

  it("is explicit that this is the student's own assessment and that no AI is used", () => {
    render(<SelfAssessmentForm attemptId="a1" problems={problems} copy={copy} />);
    expect(screen.getByText(copy.result.assess.aiNone)).toBeTruthy();
    expect(screen.getByText(copy.result.assess.intro)).toBeTruthy();
  });

  it("refuses to save until every criterion of every problem is rated", async () => {
    render(<SelfAssessmentForm attemptId="a1" problems={problems} copy={copy} />);
    fireEvent.click(screen.getByRole("button", { name: copy.result.assess.save }));
    expect(screen.getByRole("alert").textContent).toBe(copy.result.assess.incomplete);
    expect(assessAction).not.toHaveBeenCalled();
  });

  it("sends ONLY the ratings (no score) and refreshes on success", async () => {
    assessAction.mockResolvedValue({ ok: true, scoreTotal: 200, scoreMax: 200 });
    render(<SelfAssessmentForm attemptId="a1" problems={problems} copy={copy} />);
    rateAll(4);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.result.assess.save }));
    });
    const [attemptId, payload] = assessAction.mock.calls[0]!;
    expect(attemptId).toBe("a1");
    expect(Object.keys(payload).sort()).toEqual(["p1", "p2"]);
    expect(payload.p1).toEqual({ issues: 4, law: 4, interpretation: 4, application: 4, counter: 4, conclusion: 4 });
    expect(JSON.stringify(payload)).not.toMatch(/score|total/i);
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByText(copy.result.assess.saved)).toBeTruthy();
  });

  it("shows server errors such as an already saved assessment", async () => {
    assessAction.mockResolvedValue({ ok: false, error: "already_finalized" });
    render(<SelfAssessmentForm attemptId="a1" problems={problems} copy={copy} />);
    rateAll(2);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.result.assess.save }));
    });
    expect(screen.getByRole("alert").textContent).toBe(copy.errors.already_finalized);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a generic error (not stuck pending) when the save call itself throws, e.g. a dropped connection", async () => {
    assessAction.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SelfAssessmentForm attemptId="a1" problems={problems} copy={copy} />);
    rateAll(3);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.result.assess.save }));
    });
    expect(screen.getByRole("alert").textContent).toBe(copy.genericError);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: copy.result.assess.save })).toBeTruthy();
  });
});

describe("ResultView", () => {
  function result(over: Partial<AttemptResult> = {}): AttemptResult {
    return {
      attemptId: "a1",
      mode: "EXAM",
      status: "SUBMITTED",
      startedAt: "2026-10-22T09:00:00.000Z",
      submittedAt: "2026-10-22T09:30:00.000Z",
      finalized: false,
      scoreTotal: null,
      scoreMax: null,
      weakCriteria: [],
      retryProblemIds: [],
      previous: null,
      items: [
        {
          problem: {
            id: "p1", area: "CRIMINAL", ordinal: 1, ordinalLabel: "Бодлого-1", statement: "Нөхцөл А.\n\nНөхцөл Б.", questions: ["Асуулт: ?"],
            topic: null, difficulty: null, sourceFile: "criminal.docx",
            sourceLocator: { heading: "Бодлого-1", page: null, paragraphStart: 3, paragraphEnd: 30 },
            reviewStatus: "IMPORTED", reviewFlags: ["POSSIBLY_OUTDATED_LAW"],
          },
          key: {
            modelAnswer: "ЖИШИГ ХАРИУЛТ ТЕКСТ",
            answerOutline: ["Бодолтын процесс"],
            legalProvisions: [{ text: "Эрүүгийн хуулийн 91 дүгээр зүйл", origin: "SOURCE_PATTERN" }],
            courtCitations: [{ text: "УДШ-ийн тогтоол. Дугаар 23", origin: "SOURCE_PATTERN" }],
            rubric: defaultRubric(),
            provenance: "SOURCE_DOCX",
          },
          answerText: "Миний хариулт",
          methodChecks: [0, 1],
          selfRatings: null,
          breakdown: null,
          autoIndicators: { provisionsMentioned: [], provisionsExpected: 1, answerLength: 13 },
        },
      ],
      ...over,
    };
  }

  it("shows the model answer labelled as source-derived (not official), with citations and warnings", () => {
    render(<ResultView result={result()} copy={copy} />);
    expect(screen.getByText("ЖИШИГ ХАРИУЛТ ТЕКСТ")).toBeTruthy();
    expect(screen.getByText(copy.result.modelAnswerNote)).toBeTruthy();
    expect(screen.getByText("Миний хариулт")).toBeTruthy();
    expect(screen.getByText("Эрүүгийн хуулийн 91 дүгээр зүйл")).toBeTruthy();
    expect(screen.getByText("УДШ-ийн тогтоол. Дугаар 23")).toBeTruthy();
    expect(screen.getByText(copy.result.extractedNote)).toBeTruthy();
    expect(screen.getByText(copy.badges.POSSIBLY_OUTDATED_LAW)).toBeTruthy();
    expect(screen.getByText(copy.badges.lawNotVerified)).toBeTruthy();
    expect(screen.getByText(copy.badges.notReviewed)).toBeTruthy();
    expect(screen.getByText(/criminal\.docx · Бодлого-1/)).toBeTruthy();
  });

  it("presents the automatic indicator as guidance, never as a score", () => {
    render(<ResultView result={result()} copy={copy} />);
    expect(screen.getByText(/оноо биш/)).toBeTruthy();
  });

  it("offers the self-assessment until it is saved, then shows scores, weak criteria and comparison", () => {
    const { rerender } = render(<ResultView result={result()} copy={copy} />);
    expect(screen.getByText(copy.result.pending)).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.result.assess.save })).toBeTruthy();

    const rubric = defaultRubric();
    rerender(
      <ResultView
        copy={copy}
        result={result({
          finalized: true,
          scoreTotal: 62.5,
          scoreMax: 100,
          weakCriteria: [{ id: "law", average: 1 }, { id: "conclusion", average: 4 }],
          retryProblemIds: ["p1"],
          previous: { attemptId: "old", percent: 50, deltaPercent: 12.5 },
          items: [
            {
              ...result().items[0]!,
              selfRatings: { issues: 4, law: 1, interpretation: 2, application: 3, counter: 0, conclusion: 4 },
              breakdown: {
                total: 62.5, max: 100,
                perCriterion: rubric.criteria.map((c, i) => ({ id: c.id, weight: c.weight, rating: [4, 1, 2, 3, 0, 4][i]!, points: (c.weight * [4, 1, 2, 3, 0, 4][i]!) / 4 })),
              },
            },
          ],
        })}
      />,
    );
    expect(screen.getByText(/62.5 \/ 100/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: copy.result.assess.save })).toBeNull();
    expect(screen.getByText(/50% → 62.5% \(\+12.5\)/)).toBeTruthy();
    expect(screen.getAllByText(copy.result.assess.criteria.law, { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: new RegExp(copy.result.retryStudy) }).getAttribute("href")).toBe("/student/lawyer-exam/problems/p1?fresh=1");
  });

  it("handles a problem whose source had no model answer", () => {
    const r = result();
    r.items[0]!.key.modelAnswer = null;
    render(<ResultView result={r} copy={copy} />);
    expect(screen.getByText(copy.result.noModelAnswer)).toBeTruthy();
  });

  it("marks an expired attempt", () => {
    render(<ResultView result={result({ status: "EXPIRED" })} copy={copy} />);
    expect(screen.getByText(copy.result.statusExpired)).toBeTruthy();
  });
});

describe("ProblemReviewRow (admin)", () => {
  const item = {
    id: "p1", area: "CRIMINAL" as const, ordinal: 10, ordinalLabel: "Бодлого-10", statement: "Нөхцөл", questions: [], topic: null, difficulty: null,
    sourceFile: "criminal.docx", sourceLocator: { heading: "Бодлого-10", page: null, paragraphStart: 1, paragraphEnd: 9 },
    reviewStatus: "NEEDS_REVIEW" as const, reviewFlags: ["EMPTY_MODEL_ANSWER" as const, "OCR_NOISE_SUSPECTED" as const], reviewNote: null, hasModelAnswer: false,
  };

  it("lists the reasons for review and flags a missing model answer", () => {
    render(<ul><ProblemReviewRow item={item} copy={copy} /></ul>);
    expect(screen.getByText(copy.admin.flags.EMPTY_MODEL_ANSWER)).toBeTruthy();
    expect(screen.getByText(copy.admin.flags.OCR_NOISE_SUSPECTED)).toBeTruthy();
    expect(screen.getByText(copy.admin.noAnswer)).toBeTruthy();
  });

  it("sends the decision with note, topic and difficulty and reflects the new status", async () => {
    reviewAction.mockResolvedValue({ ok: true });
    render(<ul><ProblemReviewRow item={item} copy={copy} /></ul>);
    fireEvent.change(screen.getByLabelText(copy.admin.note), { target: { value: "Хянасан" } });
    fireEvent.change(screen.getByLabelText(copy.admin.topic), { target: { value: "Гэрээ" } });
    fireEvent.change(screen.getByLabelText(copy.admin.difficulty), { target: { value: "4" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.admin.approve }));
    });
    expect(reviewAction).toHaveBeenCalledWith({ problemId: "p1", status: "APPROVED", note: "Хянасан", topic: "Гэрээ", difficulty: 4 });
    await waitFor(() => expect(screen.getAllByText(copy.admin.statuses.APPROVED).length).toBeGreaterThan(0));
    expect(screen.getByText(copy.admin.saved)).toBeTruthy();
  });

  it("shows an error when the server refuses", async () => {
    reviewAction.mockResolvedValue({ ok: false, error: "forbidden" });
    render(<ul><ProblemReviewRow item={item} copy={copy} /></ul>);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.admin.reject }));
    });
    expect(screen.getByRole("alert").textContent).toBe(copy.errors.forbidden);
    expect(screen.getByText(copy.admin.statuses.NEEDS_REVIEW)).toBeTruthy();
  });

  it("shows a generic error (not stuck pending) when the review call itself throws, e.g. a dropped connection", async () => {
    reviewAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ul><ProblemReviewRow item={item} copy={copy} /></ul>);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.admin.approve }));
    });
    expect(screen.getByRole("alert").textContent).toBe(copy.genericError);
    expect(screen.getByText(copy.admin.statuses.NEEDS_REVIEW)).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.admin.approve }).hasAttribute("disabled")).toBe(false);
  });

  it("recovers and saves normally after a transient failure", async () => {
    reviewAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ul><ProblemReviewRow item={item} copy={copy} /></ul>);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.admin.approve }));
    });
    expect(screen.getByRole("alert").textContent).toBe(copy.genericError);
    reviewAction.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.admin.approve }));
    });
    expect(reviewAction).toHaveBeenCalledTimes(2);
    expect(screen.getByText(copy.admin.saved)).toBeTruthy();
    expect(screen.getAllByText(copy.admin.statuses.APPROVED).length).toBeGreaterThan(0);
  });
});

describe("localization and navigation", () => {
  const leaves = (v: unknown, path = ""): Array<[string, string]> =>
    typeof v === "string" ? [[path, v]] : Array.isArray(v) ? v.flatMap((x, i) => leaves(x, `${path}[${i}]`)) : Object.entries(v as object).flatMap(([k, x]) => leaves(x, `${path}.${k}`));

  it("every locale has exactly the same keys, none empty", () => {
    const mn = leaves(getLawyerExamCopy("mn"));
    for (const locale of locales) {
      const other = leaves(getLawyerExamCopy(locale));
      expect(other.map(([k]) => k)).toEqual(mn.map(([k]) => k));
      expect(other.filter(([, v]) => v.trim() === "")).toEqual([]);
    }
  });

  it("every locale keeps the same {placeholders} as Mongolian", () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    const mn = leaves(getLawyerExamCopy("mn"));
    for (const locale of locales) {
      const other = Object.fromEntries(leaves(getLawyerExamCopy(locale)));
      for (const [k, v] of mn) expect(names(other[k]!), `${locale}${k}`).toBe(names(v));
    }
  });

  it("Mongolian is the default and the primary text", () => {
    expect(getLawyerExamCopy("mn").title).toMatch(/Хуульчийн/);
    expect(getLawyerExamCopy("mn").areas.CRIMINAL).toBe("Эрүүгийн эрх зүй");
    for (const a of EXAM_AREAS) expect(getLawyerExamCopy("mn").areas[a].length).toBeGreaterThan(3);
  });

  it("the Student sidebar links to the module and highlights it only there", () => {
    const item = (active: "home" | "library" | "lawyer-exam") => studentSidebarItems(active).find((i) => i.key === "lawyer-exam")!;
    expect(item("lawyer-exam")).toMatchObject({ href: "/student/lawyer-exam", active: true });
    expect(item("home").active).toBe(false);
    // existing Student navigation is untouched
    const keys = studentSidebarItems("home").map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(["home", "ai", "library", "case-study", "tests", "materials", "notes", "saved", "billing"]));
  });
});
