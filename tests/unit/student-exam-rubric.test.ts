import { describe, expect, it } from "vitest";

import { defaultRubric, isValidRubric, provisionsMentioned, scoreFromRatings } from "@/domain/student/exam/rubric";
import { EXAM_AREAS, REVIEW_FLAGS, STUDENT_VISIBLE_STATUSES, parseExamArea } from "@/domain/student/exam/types";

const all = (n: number) => ({ issues: n, law: n, interpretation: n, application: n, counter: n, conclusion: n });

describe("rubric", () => {
  it("covers exactly the six criteria of the brief and the weights add up to 100", () => {
    const r = defaultRubric();
    expect(r.criteria.map((c) => c.id)).toEqual(["issues", "law", "interpretation", "application", "counter", "conclusion"]);
    expect(r.criteria.reduce((s, c) => s + c.weight, 0)).toBe(100);
    expect(isValidRubric(r)).toBe(true);
  });

  it("rejects malformed rubrics", () => {
    const base = defaultRubric();
    expect(isValidRubric({ criteria: [] })).toBe(false);
    expect(isValidRubric({ criteria: base.criteria.slice(1) })).toBe(false); // weights no longer sum to 100
    expect(isValidRubric({ criteria: [...base.criteria, base.criteria[0]!] })).toBe(false); // duplicate criterion
    expect(isValidRubric({ criteria: [{ id: "issues", weight: 100 }, { id: "bogus" as never, weight: 0 }] })).toBe(false);
  });

  it("scores by weight: full marks 100, none 0, half 50", () => {
    expect(scoreFromRatings(defaultRubric(), all(4))!.total).toBe(100);
    expect(scoreFromRatings(defaultRubric(), all(0))!.total).toBe(0);
    expect(scoreFromRatings(defaultRubric(), all(2))!.total).toBe(50);
  });

  it("does not grade on the final answer alone: every criterion contributes its own points", () => {
    const onlyConclusion = scoreFromRatings(defaultRubric(), { ...all(0), conclusion: 4 })!;
    expect(onlyConclusion.total).toBe(10);
    const breakdown = Object.fromEntries(onlyConclusion.perCriterion.map((c) => [c.id, c.points]));
    expect(breakdown).toMatchObject({ issues: 0, law: 0, interpretation: 0, application: 0, counter: 0, conclusion: 10 });
  });

  it("returns null for incomplete or out-of-range ratings instead of guessing", () => {
    expect(scoreFromRatings(defaultRubric(), { issues: 4 })).toBeNull();
    expect(scoreFromRatings(defaultRubric(), { ...all(4), law: 5 })).toBeNull();
    expect(scoreFromRatings(defaultRubric(), { ...all(4), law: 1.5 })).toBeNull();
    expect(scoreFromRatings(defaultRubric(), { ...all(4), law: Number.NaN })).toBeNull();
    expect(scoreFromRatings({ criteria: [{ id: "issues", weight: 50 }] }, all(4))).toBeNull();
  });
});

describe("provision coverage indicator (orientation only)", () => {
  const key = {
    legalProvisions: [
      { text: "Эрүүгийн хуулийн 91 дүгээр зүйл", origin: "SOURCE_PATTERN" as const },
      { text: "Иргэний хуулийн 58.6-р зүйл", origin: "SOURCE_PATTERN" as const },
      { text: "Захиргааны хуулийн зүйл", origin: "SOURCE_PATTERN" as const }, // no number: cannot be matched
    ],
  };

  it("finds provisions whose article number appears in the answer", () => {
    expect(provisionsMentioned(key, "Үүнийг ЭХ-ийн 91 дүгээр зүйлээр зүйлчилнэ.")).toEqual(["Эрүүгийн хуулийн 91 дүгээр зүйл"]);
    expect(provisionsMentioned(key, "58.6 зүйл болон 91")).toEqual(["Эрүүгийн хуулийн 91 дүгээр зүйл", "Иргэний хуулийн 58.6-р зүйл"]);
  });

  it("does not match a number inside a longer number", () => {
    expect(provisionsMentioned(key, "Нийт 1910 төгрөг, 191 хүн")).toEqual([]);
  });

  it("is empty for an empty answer", () => {
    expect(provisionsMentioned(key, "")).toEqual([]);
  });
});

describe("domain constants", () => {
  it("supports the four required areas and parses them strictly", () => {
    expect(EXAM_AREAS).toEqual(["CRIMINAL", "CIVIL", "ADMINISTRATIVE", "CONSTITUTIONAL"]);
    expect(parseExamArea("CIVIL")).toBe("CIVIL");
    expect(parseExamArea("civil")).toBeNull();
    expect(parseExamArea(5)).toBeNull();
  });

  it("students only see imported-and-clean or approved problems", () => {
    expect([...STUDENT_VISIBLE_STATUSES].sort()).toEqual(["APPROVED", "IMPORTED"]);
    expect(REVIEW_FLAGS).toContain("POSSIBLY_OUTDATED_LAW");
  });
});
