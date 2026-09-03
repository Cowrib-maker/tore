import { describe, expect, it } from "vitest";

import {
  generateOriginalStudentQuestions,
  getStudentProblem,
  getStudentTheoryCourse,
  gradeStudentProblem,
  gradeStudentQuiz,
  StudentTrackId,
} from "@/domain/student";
import {
  evaluateStudentProblem,
  evaluateStudentProblemWithUsage,
  recordStudentProblemAiTokenUsage,
} from "@/application/use-cases/student/evaluate-problem";
import {
  authorizeStudentProblemEvaluation,
  type StudentProblemEvaluationAuthorizationDeps,
} from "@/application/use-cases/student/authorize-problem-evaluation";
import type { LegalAiCompletionPort } from "@/application/ai/legal-ai.types";
import type { LegalQuestionAccessPort } from "@/application/legal-ai/legal-question-access";
import { UserRole } from "@/domain/enums";

describe("student learning content", () => {
  it("provides complete Mongolian theory course sections with an official source", () => {
    const course = getStudentTheoryCourse(
      StudentTrackId.ADMINISTRATIVE,
      "admin-act",
    );

    expect(course).not.toBeNull();
    expect(course?.subject).toBe("Захиргааны эрх зүй");
    expect(course?.objectives.length).toBeGreaterThan(0);
    expect(course?.concepts.length).toBeGreaterThan(0);
    expect(course?.explanation.length).toBeGreaterThan(0);
    expect(course?.examples.length).toBeGreaterThan(0);
    expect(course?.review.length).toBeGreaterThan(0);
    expect(course?.legalSources[0]?.url).toBe("https://legalinfo.mn/mn");
    expect(JSON.stringify(course)).not.toMatch(
      /\b\d+(?:\.\d+){0,2}\s*(?:дугаар\s*)?зүйл/i,
    );
  });

  it("generates original test questions across all supported types at each difficulty", () => {
    for (const difficulty of ["easy", "medium", "hard", "expert"] as const) {
      const questions = generateOriginalStudentQuestions(
        StudentTrackId.CIVIL,
        difficulty,
      );
      expect(questions.map((question) => question.type)).toEqual([
        "single",
        "multiple",
        "truefalse",
        "matching",
        "short-answer",
      ]);
      expect(questions.every((question) => question.difficulty === difficulty)).toBe(
        true,
      );
    }
  });

  it("grades all test response formats without exposing source answers", () => {
    const questions = generateOriginalStudentQuestions(
      StudentTrackId.CRIMINAL,
      "medium",
    );
    const quiz = {
      id: "test",
      trackId: StudentTrackId.CRIMINAL,
      kind: "test" as const,
      title: "test",
      intro: "test",
      questions,
    };

    const grade = gradeStudentQuiz(quiz, {
      [questions[0]!.id]: "b",
      [questions[1]!.id]: "a,b,d",
      [questions[2]!.id]: "false",
      [questions[3]!.id]: "баримт:өгөгдсөн,шалгуур:хуулийн нөхцөл,дүгнэлт:үр дүн",
      [questions[4]!.id]: "нягтлах",
    });

    expect(grade).toMatchObject({ correct: 5, total: 5, percent: 100 });
  });

  it("scores the fixed 100-point case rubric without claiming legal correctness", () => {
    const problem = getStudentProblem(StudentTrackId.CIVIL);
    const grade = gradeStudentProblem(
      problem,
      "Асуудал нь нэхэмжлэлийн маргаан мөн. Хэрэглэх эрх зүйг албан ёсны хууль, legalinfo.mn-ээс нягтална. Баримт, нөхцөл тогтоогдсон хэмжээнд шалгуурт хамаарах учир дүгнэлт гаргана. Иймээс шийдвэр нь болзолтой үр дүн байна.",
    );

    expect(grade.total).toBe(100);
    expect(grade.rubric.map((item) => item.weight)).toEqual([20, 20, 25, 20, 15]);
    expect(grade.needsSourceVerification).toBe(false);
    expect(grade.feedback).toContain("бүтцийн");
  });

  it("flags an article citation for manual source verification", () => {
    const grade = gradeStudentProblem(
      getStudentProblem(StudentTrackId.CRIMINAL),
      "Асуудал нь маргаан. Хэрэглэх хууль нь эх сурвалжаас нягтлагдана. Баримт, нөхцөл нь шалгуурт хамаарах тул дүгнэлт, шийдвэр гарна. Иймээс 12 дугаар зүйл хэрэглэнэ гэж бичив.",
    );

    expect(grade.needsSourceVerification).toBe(true);
  });

  it("uses AI feedback when the configured completion returns grounded JSON", async () => {
    const problem = getStudentProblem(StudentTrackId.CIVIL);
    const grade = gradeStudentProblem(
      problem,
      "Асуудал, хууль, баримт, нөхцөл, шалгуур, учир, дүгнэлт, шийдвэр гэсэн бүтэцтэй хангалттай урт хариулт. Энэ нь тухайн нөхцөлд хамаарах эсэхийг тайлбарласан болно.",
    );
    const completion: LegalAiCompletionPort = {
      isConfigured: () => true,
      complete: async () => ({
        content: JSON.stringify({
          strengths: ["Баримтыг дүгнэлттэй холбосон байна."],
          weaknesses: ["Татгалзлын хувилбарыг тодруулаагүй байна."],
          missingIssues: ["Нотолгооны хангалттай эсэх"],
          missingProvisions: [
            "Монгол Улсын Иргэний хууль-ийн холбогдох зохицуулалтыг эхээс нягтлах.",
          ],
          suggestions: ["Талуудын шаардлагыг тусад нь дүгнэ."],
        }),
        model: "test-model",
        inputTokens: 1,
        outputTokens: 1,
      }),
    };

    const evaluation = await evaluateStudentProblem(
      { problem, grade, answer: "хариулт" },
      completion,
    );

    expect(evaluation).toMatchObject({
      mode: "ai",
      model: "test-model",
      strengths: ["Баримтыг дүгнэлттэй холбосон байна."],
    });
    expect(evaluation.sourceIntegrityNote).not.toMatch(/дугаар зүйл/i);
  });

  it("falls back when AI output fabricates an article number", async () => {
    const problem = getStudentProblem(StudentTrackId.CRIMINAL);
    const grade = gradeStudentProblem(problem, "Асуудал ба баримтыг нягтална.");
    const completion: LegalAiCompletionPort = {
      isConfigured: () => true,
      complete: async () => ({
        content: JSON.stringify({
          strengths: ["12 дугаар зүйлд нийцнэ."],
          weaknesses: [],
          missingIssues: [],
          missingProvisions: [],
          suggestions: [],
        }),
        model: "test-model",
        inputTokens: 1,
        outputTokens: 1,
      }),
    };

    const evaluation = await evaluateStudentProblem(
      { problem, grade, answer: "хариулт" },
      completion,
    );

    expect(evaluation.mode).toBe("fallback");
    expect(evaluation.label).toContain("AI үнэлгээ");
  });

  it("labels deterministic fallback as unavailable and not legal correctness", async () => {
    const problem = getStudentProblem(StudentTrackId.ADMINISTRATIVE);
    const grade = gradeStudentProblem(problem, "Асуудал ба баримтыг нягтална.");
    const completion: LegalAiCompletionPort = {
      isConfigured: () => false,
      complete: async () => {
        throw new Error("must not be called");
      },
    };

    const evaluation = await evaluateStudentProblem(
      { problem, grade, answer: "хариулт" },
      completion,
    );

    expect(evaluation.mode).toBe("fallback");
    expect(evaluation.label).toContain("боломжгүй");
    expect(evaluation.sourceIntegrityNote).toContain("эрх зүйн зөв эсэхийг тогтоохгүй");
  });

  it("denies unauthenticated AI evaluation without authorizing or consuming access", async () => {
    const authorizePaidCitizen = async () => {
      throw new Error("must not authorize");
    };
    const result = await authorizeStudentProblemEvaluation({
      requireActor: async () => {
        throw new Error("no session");
      },
      requireVerifiedEmail: async () => {},
      isRateLimited: async () => false,
      authorizePaidCitizen,
      authorizePaidLawyer: async () => {
        throw new Error("must not authorize");
      },
      consumeCitizen: async () => {
        throw new Error("must not consume");
      },
      consumeLawyer: async () => {
        throw new Error("must not consume");
      },
    });

    expect(result).toMatchObject({
      allowed: false,
      message: expect.stringContaining("баталгаажсан"),
    });
  });

  it("permits only verified paid users and consumes after a successful evaluation", async () => {
    const calls: string[] = [];
    const deps: StudentProblemEvaluationAuthorizationDeps = {
      requireActor: async () => ({ userId: "student-1", role: UserRole.CLIENT }),
      requireVerifiedEmail: async () => {
        calls.push("verified");
      },
      isRateLimited: async () => false,
      authorizePaidCitizen: async () => {
        calls.push("paid");
        return { usageId: "usage-1" };
      },
      authorizePaidLawyer: async () => {
        throw new Error("wrong role");
      },
      consumeCitizen: async (usageId) => {
        calls.push(`consumed:${usageId}`);
      },
      consumeLawyer: async () => {
        throw new Error("wrong role");
      },
    };

    const result = await authorizeStudentProblemEvaluation(deps);
    expect(result.allowed).toBe(true);
    if (result.allowed) await result.consume();
    expect(calls).toEqual(["verified", "paid", "consumed:usage-1"]);
  });

  it("does not authorize provider use when the student AI rate limit is reached", async () => {
    const result = await authorizeStudentProblemEvaluation({
      requireActor: async () => ({ userId: "student-1", role: UserRole.LAWYER }),
      requireVerifiedEmail: async () => {},
      isRateLimited: async () => true,
      authorizePaidCitizen: async () => {
        throw new Error("must not authorize");
      },
      authorizePaidLawyer: async () => {
        throw new Error("must not authorize");
      },
      consumeCitizen: async () => {},
      consumeLawyer: async () => {},
    });

    expect(result).toMatchObject({
      allowed: false,
      message: expect.stringContaining("түр хязгаарлагдсан"),
    });
  });

  it("forwards successful provider tokens to the shared paid access accounting port", async () => {
    const problem = getStudentProblem(StudentTrackId.CIVIL);
    const grade = gradeStudentProblem(problem, "Асуудал ба баримтыг нягтална.");
    const completion: LegalAiCompletionPort = {
      isConfigured: () => true,
      complete: async () => ({
        content: JSON.stringify({
          strengths: ["Баримтыг салгасан."],
          weaknesses: [],
          missingIssues: [],
          missingProvisions: [],
          suggestions: [],
        }),
        model: "test-model",
        inputTokens: 17,
        outputTokens: 9,
      }),
    };
    const evaluated = await evaluateStudentProblemWithUsage(
      { problem, grade, answer: "хариулт" },
      completion,
    );
    const recorded: unknown[] = [];
    const access = {
      async recordTokenUsage(subject: unknown, usage: unknown) {
        recorded.push({ subject, usage });
      },
    } as LegalQuestionAccessPort;

    expect(evaluated.evaluation.mode).toBe("ai");
    expect(evaluated.usage).toEqual({ inputTokens: 17, outputTokens: 9 });
    if (!evaluated.usage) throw new Error("expected AI usage");
    await recordStudentProblemAiTokenUsage({
      access,
      subject: {
        kind: "user",
        userId: "student-1",
        role: UserRole.CLIENT,
      },
      usage: evaluated.usage,
    });
    expect(recorded).toEqual([
      {
        subject: { kind: "user", userId: "student-1", role: UserRole.CLIENT },
        usage: { inputTokens: 17, outputTokens: 9 },
      },
    ]);
  });

  it("does not hide token-accounting enforcement failures", async () => {
    const access = {
      async recordTokenUsage() {
        throw new Error("token ceiling reached");
      },
    } as unknown as LegalQuestionAccessPort;

    await expect(
      recordStudentProblemAiTokenUsage({
        access,
        subject: {
          kind: "user",
          userId: "student-1",
          role: UserRole.LAWYER,
        },
        usage: { inputTokens: 1, outputTokens: 1 },
      }),
    ).rejects.toThrow("token ceiling reached");
  });
});
