import type {
  StudentDifficulty,
  StudentQuizQuestion,
  StudentTrackId,
} from "./types";

const trackConcept: Record<StudentTrackId, string> = {
  criminal: "бүрэлдэхүүний шинжилгээ",
  civil: "нэхэмжлэлийн шинжилгээ",
  administrative: "захиргааны актын шинжилгээ",
};

const difficultyPrompt: Record<StudentDifficulty, string> = {
  easy: "үндсэн ойлголтыг таньж",
  medium: "баримттай холбож",
  hard: "эсрэг хувилбарыг ялгаж",
  expert: "нотолгооны цоорхой ба эсрэг тайлбарыг зэрэгцүүлэн задлан",
};

/**
 * Builds new assessment prompts from curriculum concepts, not copied source
 * language. Each generated set intentionally includes every supported test type.
 */
export function generateOriginalStudentQuestions(
  trackId: StudentTrackId,
  difficulty: StudentDifficulty,
): readonly StudentQuizQuestion[] {
  const concept = trackConcept[trackId];
  const action = difficultyPrompt[difficulty];
  const prefix = `${trackId}-${difficulty}`;

  return [
    {
      id: `${prefix}-single`,
      type: "single",
      difficulty,
      prompt: `${concept}-д ${action} эхний алхам юу вэ?`,
      options: [
        { id: "a", label: "Дүгнэлтийг урьдчилж бичих" },
        { id: "b", label: "Асуудал ба өгөгдсөн баримтыг ялгах" },
        { id: "c", label: "Байхгүй баримтыг нөхөх" },
      ],
      correctOptionId: "b",
      explanation: "Шинжилгээ нь таамаг бус, өгөгдсөн баримт ба асуултаас эхэлнэ.",
    },
    {
      id: `${prefix}-multiple`,
      type: "multiple",
      difficulty,
      prompt: `${concept}-ийн баримтад тулгуурлах зарчмыг сонгоно уу.`,
      options: [
        { id: "a", label: "Тогтоогдсон баримтыг тусад нь тэмдэглэх" },
        { id: "b", label: "Дутуу баримтыг таамаг гэж тэмдэглэх" },
        { id: "c", label: "Таамгийг тогтоогдсон мэт бичих" },
        { id: "d", label: "Шалгуурыг баримт бүртэй холбох" },
      ],
      correctOptionIds: ["a", "b", "d"],
      explanation: "Баримт, таамаг, шалгуурын холбоог салгаж бичих нь суурь дадал.",
    },
    {
      id: `${prefix}-truefalse`,
      type: "truefalse",
      difficulty,
      prompt: "Тогтоогдоогүй нөхцөлийг дүгнэлтийг батлахын тулд зохиож болно.",
      options: [
        { id: "true", label: "Үнэн" },
        { id: "false", label: "Худал" },
      ],
      correctOptionId: "false",
      explanation: "Дутуу нөхцөлийг нөхөхгүй; нягтлах шаардлагатай гэж тэмдэглэнэ.",
    },
    {
      id: `${prefix}-matching`,
      type: "matching",
      difficulty,
      prompt: "Шинжилгээний хэсгийг зөв тайлбартай нь тааруулна уу.",
      options: [
        { id: "баримт", label: "Өгөгдсөн нөхцөл" },
        { id: "шалгуур", label: "Шалгах эрх зүйн нөхцөл" },
        { id: "дүгнэлт", label: "Нөхцөлт үр дүн" },
      ],
      matchingOptions: [
        { id: "өгөгдсөн", label: "Өгөгдсөн нөхцөл" },
        { id: "хуулийн нөхцөл", label: "Хуулийн нөхцөл" },
        { id: "үр дүн", label: "Үр дүн" },
      ],
      matchingPairs: [
        { left: "баримт", right: "өгөгдсөн" },
        { left: "шалгуур", right: "хуулийн нөхцөл" },
        { left: "дүгнэлт", right: "үр дүн" },
      ],
      explanation: "Баримт, шалгуур, үр дүнг нэг өгүүлбэрт хутгахгүй.",
    },
    {
      id: `${prefix}-short`,
      type: "short-answer",
      difficulty,
      prompt: "Баримт хангалтгүй үед хийх нэг үйлдлийг нэг үгээр бичнэ үү.",
      options: [],
      acceptedAnswers: ["нягтлах", "тэмдэглэх"],
      explanation: "Дутуу баримтыг нягтлах шаардлагатай гэж тэмдэглэнэ.",
    },
  ];
}
