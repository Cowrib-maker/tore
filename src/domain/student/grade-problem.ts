import type {
  StudentLegalProblem,
  StudentProblemEvaluation,
  StudentProblemGrade,
  StudentProblemRubricItem,
  StudentProblemRubricScore,
} from "./types";

const MIN_ANSWER_LENGTH_FOR_ANY_CREDIT = 80;

const signals: Record<StudentProblemRubricItem["id"], RegExp> = {
  issue: /асуудал|маргаан|асуулт/i,
  applicableLaw: /хууль|эрх зүйн|legalinfo\.mn|зүйл/i,
  legalReasoning: /учир|иймээс|тул|хамаарах|шалгуур|бүрэлдэхүүн/i,
  facts: /баримт|нөхцөл|тогтоогд|таамаг/i,
  conclusion: /дүгнэлт|шийдвэр|үр дүн/i,
};

const articleReferencePattern = /\b\d+(?:\.\d+){0,2}\s*(?:дугаар\s*)?зүйл/i;

export function maxRubricTotal(rubric: readonly StudentProblemRubricItem[]): number {
  return rubric.reduce((total, item) => total + item.weight, 0);
}

/**
 * Keyword/length structural check — NOT a legal-reasoning grader. Used only
 * when the real AI evaluator is unconfigured or fails, so the student always
 * gets *some* feedback instead of a hard error. Never scores a citation as
 * "correct": an article-number mention only ever triggers a verification
 * note, because this function has no way to check it against real law.
 */
export function gradeStudentProblemStructurally(
  problem: StudentLegalProblem,
  answer: string,
): StudentProblemGrade {
  const normalized = answer.trim();
  const rubric: StudentProblemRubricScore[] = problem.rubric.map((item) => {
    const satisfied =
      normalized.length >= MIN_ANSWER_LENGTH_FOR_ANY_CREDIT && signals[item.id].test(normalized);
    return { ...item, score: satisfied ? item.weight : 0, satisfied };
  });
  const needsSourceVerification = articleReferencePattern.test(normalized);

  return {
    problemId: problem.id,
    total: rubric.reduce((total, item) => total + item.score, 0),
    maxTotal: maxRubricTotal(problem.rubric),
    rubric,
    needsSourceVerification,
    feedback: needsSourceVerification
      ? "Зүйл, заалтын ишлэл илэрлээ. Үүнийг албан ёсны эхээс (legalinfo.mn) нягталж байж ашиглана уу."
      : "Энэ бол хариултын бүтцийн автомат шалгалт (AI боломжгүй үед) — эрх зүйн зөвлөгөө, дүгнэлт биш.",
    evaluation: buildFallbackEvaluation({ problem, rubric, needsSourceVerification }),
  };
}

function buildFallbackEvaluation(input: {
  problem: StudentLegalProblem;
  rubric: readonly StudentProblemRubricScore[];
  needsSourceVerification: boolean;
}): StudentProblemEvaluation {
  const missing = input.rubric.filter((item) => !item.satisfied);
  return {
    mode: "fallback",
    label: "AI үнэлгээ одоогоор боломжгүй — бүтцийн автомат шалгалт",
    strengths: input.rubric
      .filter((item) => item.satisfied)
      .map((item) => `${item.label} хэсэг хариултад байна.`),
    weaknesses: missing.map((item) => `${item.label} хэсэг дутуу эсвэл тодорхойгүй байна.`),
    missingIssues: missing
      .filter((item) => item.id !== "applicableLaw")
      .map((item) => item.label),
    missingProvisions: missing.some((item) => item.id === "applicableLaw")
      ? input.problem.sources.map(
          (source) => `${source.title}-ийн холбогдох зохицуулалтыг эхээр нягтална уу.`,
        )
      : [],
    suggestions: missing.map((item) => item.guidance),
    sourceIntegrityNote: input.needsSourceVerification
      ? "Зүйл, заалтын дугаар илэрсэн тул албан ёсны эхээр гараар нягтлах шаардлагатай."
      : "Энэ шалгалт нь эрх зүйн зөв эсэхийг тогтоохгүй; зөвхөн хариултын бүтцийг шалгана.",
  };
}
