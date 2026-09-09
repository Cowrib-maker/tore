import { describe, expect, it } from "vitest";

import { gradeStudentProblemStructurally, maxRubricTotal } from "@/domain/student/grade-problem";
import { findStudentLegalProblemById } from "@/domain/student/legal-problems";

const problem = findStudentLegalProblemById("criminal-case-study-1")!;

describe("maxRubricTotal", () => {
  it("sums the weights of every rubric item", () => {
    expect(maxRubricTotal(problem.rubric)).toBe(100);
  });
});

describe("gradeStudentProblemStructurally", () => {
  it("gives zero credit and mode: fallback for a too-short answer", () => {
    const grade = gradeStudentProblemStructurally(problem, "Богино хариулт.");
    expect(grade.evaluation.mode).toBe("fallback");
    expect(grade.total).toBe(0);
    expect(grade.maxTotal).toBe(100);
    expect(grade.rubric.every((item) => !item.satisfied)).toBe(true);
  });

  it("awards credit only for rubric sections whose keywords are present in a long-enough answer", () => {
    const answer =
      "Энэ хэрэгт шийдвэрлэх асуудал нь А-ийн үйлдэл эрүүгийн хариуцлага хүлээлгэхүйц эсэх юм. " +
      "Баримтаас үзэхэд А сандал шидэж В-д гэмтэл учруулсан бөгөөд энэ нь тогтоогдсон баримт. " +
      "Учир нь бүрэлдэхүүний шалгуур хангагдсан тул зөрчил гарсан гэж үзнэ. Эцэст нь дүгнэлт гэвэл А хариуцлага хүлээх ёстой.";
    const grade = gradeStudentProblemStructurally(problem, answer);
    const byId = Object.fromEntries(grade.rubric.map((item) => [item.id, item]));
    expect(byId.issue.satisfied).toBe(true);
    expect(byId.legalReasoning.satisfied).toBe(true);
    expect(byId.facts.satisfied).toBe(true);
    expect(byId.conclusion.satisfied).toBe(true);
    // "applicableLaw" keywords (хууль/эрх зүйн/зүйл/legalinfo.mn) are not
    // present in this particular answer, so it stays unsatisfied — this
    // fallback is a keyword check, not a legal-correctness check.
    expect(byId.applicableLaw.satisfied).toBe(false);
    expect(grade.total).toBeGreaterThan(0);
    expect(grade.total).toBeLessThan(grade.maxTotal);
  });

  it("never claims mode: ai — the fallback grader always labels itself as a structural check", () => {
    const grade = gradeStudentProblemStructurally(
      problem,
      "Асуудал хууль баримт учир дүгнэлт ".repeat(10),
    );
    expect(grade.evaluation.mode).toBe("fallback");
    expect(grade.evaluation.label).toContain("боломжгүй");
  });

  it("flags needsSourceVerification when the answer cites an article number, without judging it right or wrong", () => {
    const withCitation = gradeStudentProblemStructurally(
      problem,
      "Эрүүгийн хуулийн 11.1 зүйлийг баримт болгон дүгнэлт гаргалаа.",
    );
    expect(withCitation.needsSourceVerification).toBe(true);
    expect(withCitation.evaluation.sourceIntegrityNote).toContain("нягтлах");

    const withoutCitation = gradeStudentProblemStructurally(
      problem,
      "Ерөнхий байдлаар дүгнэлт бичив, тоо дурдаагүй.",
    );
    expect(withoutCitation.needsSourceVerification).toBe(false);
  });

  it("only suggests missing law sources when the applicableLaw rubric item is unsatisfied", () => {
    const noLawAnswer = gradeStudentProblemStructurally(
      problem,
      "Асуудал баримт учир дүгнэлт " + "нэмэлт үг ".repeat(10),
    );
    const noLawByStat = noLawAnswer.rubric.find((item) => item.id === "applicableLaw");
    expect(noLawByStat?.satisfied).toBe(false);
    expect(noLawAnswer.evaluation.missingProvisions.length).toBeGreaterThan(0);
  });
});
