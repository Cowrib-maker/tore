import type {
  StudentLegalProblem,
  StudentLegalSource,
  StudentLesson,
  StudentProblemRubricItem,
  StudentTheoryCourse,
  StudentTrackId,
} from "./types";

const LEGALINFO_URL = "https://legalinfo.mn/mn";

const sourceByTrack: Record<StudentTrackId, StudentLegalSource> = {
  criminal: {
    title: "Монгол Улсын Эрүүгийн хууль",
    publisher: "Эрх зүйн мэдээллийн нэгдсэн систем",
    url: LEGALINFO_URL,
    note: "Ишлэл эсвэл зүйл, заалт хэрэглэхийн өмнө хүчин төгөлдөр эхийг эндээс нягтална.",
  },
  civil: {
    title: "Монгол Улсын Иргэний хууль",
    publisher: "Эрх зүйн мэдээллийн нэгдсэн систем",
    url: LEGALINFO_URL,
    note: "Ишлэл эсвэл зүйл, заалт хэрэглэхийн өмнө хүчин төгөлдөр эхийг эндээс нягтална.",
  },
  administrative: {
    title: "Монгол Улсын Захиргааны ерөнхий хууль",
    publisher: "Эрх зүйн мэдээллийн нэгдсэн систем",
    url: LEGALINFO_URL,
    note: "Ишлэл эсвэл зүйл, заалт хэрэглэхийн өмнө хүчин төгөлдөр эхийг эндээс нягтална.",
  },
};

const subjectByTrack: Record<StudentTrackId, string> = {
  criminal: "Эрүүгийн эрх зүй",
  civil: "Иргэний эрх зүй",
  administrative: "Захиргааны эрх зүй",
};

export const PROBLEM_RUBRIC: readonly StudentProblemRubricItem[] = [
  {
    id: "issue",
    label: "Асуудал",
    weight: 20,
    guidance: "Шийдвэрлэх эрх зүйн асуултыг нэг өгүүлбэрээр тодорхойл.",
  },
  {
    id: "applicableLaw",
    label: "Хэрэглэх эрх зүй",
    weight: 20,
    guidance: "Зөвхөн доорх албан ёсны эхээс нягталсан хуулиа нэрлэ.",
  },
  {
    id: "legalReasoning",
    label: "Эрх зүйн үндэслэл",
    weight: 25,
    guidance: "Шалгуур бүрийг баримттай холбож, яагаад гэдгээ тайлбарла.",
  },
  {
    id: "facts",
    label: "Баримт",
    weight: 20,
    guidance: "Өгөгдсөн баримтыг л ашиглаж, дутуу зүйлийг таамаглахгүй.",
  },
  {
    id: "conclusion",
    label: "Дүгнэлт",
    weight: 15,
    guidance: "Болзолтой, тодорхой дүгнэлт гарга.",
  },
];

export function getTheoryCourseContent(lesson: StudentLesson): StudentTheoryCourse {
  const exampleSections = lesson.sections.filter((section) =>
    /жишээ|example/i.test(section.heading),
  );
  const concepts = lesson.sections.slice(0, 4).map((section) => section.heading);

  return {
    subject: subjectByTrack[lesson.trackId],
    topic: lesson.summary,
    lesson: lesson.title,
    objectives: concepts.slice(0, 3).map(
      (concept) => `“${concept}” ойлголтыг баримтад тулган тайлбарлах`,
    ),
    concepts,
    explanation: lesson.sections,
    legalSources: [sourceByTrack[lesson.trackId]],
    examples:
      exampleSections.length > 0
        ? exampleSections.map((section) => section.body)
        : [
            "Жишээг шийдэхдээ зөвхөн өгөгдсөн баримтыг тэмдэглэж, дутуу нөхцөлийг тусад нь үлдээнэ.",
          ],
    review: concepts.slice(0, 3).map(
      (concept) => `“${concept}” нь энэ сэдвийн дүгнэлтэд ямар үүрэгтэй вэ?`,
    ),
  };
}

const problemByTrack: Record<
  StudentTrackId,
  Pick<StudentLegalProblem, "title" | "intro" | "factPattern" | "prompt">
> = {
  criminal: {
    title: "Эрүүгийн эрх зүй — кейс бодлого",
    intro: "Бүтцийг баримтад тулган бичих дадлага. Автомат үнэлгээ нь зөвхөн хариултын бүтцийг шалгана.",
    factPattern:
      "А нь Б-д уурлаж «цохино» гэж хэлсэн. А гараа өргөөгүй, Б гэмтээгүй. Өөр нөхцөл тогтоогдоогүй.",
    prompt:
      "Асуудал, хэрэглэх эрх зүй, баримт, үндэслэл, дүгнэлт гэсэн дарааллаар нөхцөлт дүн шинжилгээ бич.",
  },
  civil: {
    title: "Иргэний эрх зүй — кейс бодлого",
    intro: "Нэхэмжлэлийн аргыг баримтад тулган бичих дадлага. Автомат үнэлгээ нь зөвхөн хариултын бүтцийг шалгана.",
    factPattern:
      "А нь Б-д машин зарахаар ярилцаж, үнэ тохирсон. Бичгээр гэрээ байгуулаагүй. А машинаа өгөөгүй бөгөөд Б мөнгө шаардаж байна.",
    prompt:
      "Шаардлагыг тодруулж, эрх үүссэн эсэх, баримт ба боломжит татгалзлыг салгаж дүн шинжилгээ бич.",
  },
  administrative: {
    title: "Захиргааны эрх зүй — кейс бодлого",
    intro: "Захиргааны актын шинжилгээг баримтад тулган бичих дадлага. Автомат үнэлгээ нь зөвхөн хариултын бүтцийг шалгана.",
    factPattern:
      "Байгууллага А-д «зөвлөмж» илгээсэн боловч тодорхой үүрэг оноогоогүй. Бусад нөхцөл тогтоогдоогүй.",
    prompt:
      "Маргаж буй зүйл акт мөн эсэхээс эхэлж, урьдчилсан нөхцөл, хууль зүйн үндэслэл, баримт, дүгнэлтээ салгаж бич.",
  },
};

export function getStudentProblem(trackId: StudentTrackId): StudentLegalProblem {
  const problem = problemByTrack[trackId];
  return {
    id: `${trackId}-problem`,
    trackId,
    ...problem,
    sources: [sourceByTrack[trackId]],
    rubric: PROBLEM_RUBRIC,
  };
}
