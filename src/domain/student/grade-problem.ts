import type {
  StudentLegalProblem,
  StudentProblemEvaluation,
  StudentProblemGrade,
  StudentProblemRubricItem,
} from "./types";

const signals: Record<StudentProblemRubricItem["id"], RegExp> = {
  issue: /асуудал|маргаан|асуулт/i,
  applicableLaw: /хууль|эрх зүйн|legalinfo\.mn/i,
  legalReasoning: /учир|иймээс|тул|хамаарах|шалгуур/i,
  facts: /баримт|нөхцөл|тогтоогд/i,
  conclusion: /дүгнэлт|шийдвэр|үр дүн/i,
};

const articleReferencePattern = /\b\d+(?:\.\d+){0,2}\s*(?:дугаар\s*)?зүйл/i;

/**
 * This is a transparent structure check, not an automated legal opinion.
 * It never awards correctness for an unverified legal article reference.
 */
export function gradeStudentProblem(
  problem: StudentLegalProblem,
  answer: string,
): StudentProblemGrade {
  const normalized = answer.trim();
  const rubric = problem.rubric.map((item) => {
    const satisfied = normalized.length >= 80 && signals[item.id].test(normalized);
    return { ...item, score: satisfied ? item.weight : 0, satisfied };
  });
  const needsSourceVerification = articleReferencePattern.test(normalized);

  return {
    problemId: problem.id,
    total: rubric.reduce((total, item) => total + item.score, 0),
    rubric,
    needsSourceVerification,
    feedback: needsSourceVerification
      ? "Зүйл, заалтын ишлэл илэрлээ. Үүнийг албан ёсны эхээс нягталж байж ашиглана уу."
      : "Энэ нь хариултын бүтцийн өөрийн үнэлгээ бөгөөд эрх зүйн зөвлөгөө эсвэл хууль зүйн дүгнэлт биш.",
    evaluation: createFallbackProblemEvaluation({
      problem,
      rubric,
      needsSourceVerification,
    }),
  };
}

export function createFallbackProblemEvaluation(input: {
  problem: StudentLegalProblem;
  rubric: StudentProblemGrade["rubric"];
  needsSourceVerification: boolean;
}): StudentProblemEvaluation {
  const missing = input.rubric.filter((item) => !item.satisfied);
  return {
    mode: "fallback",
    label: "AI үнэлгээ одоогоор боломжгүй — бүтцийн шалгалт",
    strengths: input.rubric
      .filter((item) => item.satisfied)
      .map((item) => `${item.label} хэсэг хариултад байна.`),
    weaknesses: missing.map((item) => `${item.label} хэсэг дутуу эсвэл тодорхойгүй байна.`),
    missingIssues: missing
      .filter((item) => item.id !== "applicableLaw")
      .map((item) => item.label),
    missingProvisions: missing.some((item) => item.id === "applicableLaw")
      ? input.problem.sources.map(
          (source) => `${source.title}-ийн холбогдох зохицуулалтыг эхээс нягтална уу.`,
        )
      : [],
    suggestions: missing.map((item) => item.guidance),
    sourceIntegrityNote: input.needsSourceVerification
      ? "Зүйл, заалтын дугаар илэрсэн тул албан ёсны эхээр гараар нягтлах шаардлагатай."
      : "Энэ шалгалт нь эрх зүйн зөв эсэхийг тогтоохгүй; зөвхөн хариултын бүтцийг шалгана.",
  };
}
