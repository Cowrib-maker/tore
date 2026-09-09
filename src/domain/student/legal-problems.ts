import { StudentTrackId } from "./types";
import type { StudentLegalProblem, StudentLegalSource, StudentProblemRubricItem } from "./types";

const LEGALINFO_URL = "https://legalinfo.mn/mn";

const sourceByTrack: Record<StudentTrackId, StudentLegalSource> = {
  criminal: {
    title: "Монгол Улсын Эрүүгийн хууль",
    publisher: "Эрх зүйн мэдээллийн нэгдсэн систем",
    url: LEGALINFO_URL,
    note: "Зүйл, заалт ашиглахын өмнө хүчин төгөлдөр эхийг эндээс нягтал.",
  },
  civil: {
    title: "Монгол Улсын Иргэний хууль",
    publisher: "Эрх зүйн мэдээллийн нэгдсэн систем",
    url: LEGALINFO_URL,
    note: "Зүйл, заалт ашиглахын өмнө хүчин төгөлдөр эхийг эндээс нягтал.",
  },
  administrative: {
    title: "Монгол Улсын Захиргааны ерөнхий хууль",
    publisher: "Эрх зүйн мэдээллийн нэгдсэн систем",
    url: LEGALINFO_URL,
    note: "Зүйл, заалт ашиглахын өмнө хүчин төгөлдөр эхийг эндээс нягтал.",
  },
};

/**
 * Shared rubric for every free-text case study, regardless of track: it
 * scores how the answer is STRUCTURED (issue → law → reasoning → facts →
 * conclusion), not whether a cited article number is actually correct —
 * neither the AI grader nor the structural fallback can verify that against
 * the real law, so both are told to flag citations for manual verification
 * instead of scoring them as right or wrong.
 */
export const STUDENT_PROBLEM_RUBRIC: readonly StudentProblemRubricItem[] = [
  {
    id: "issue",
    label: "Асуудлын тодорхойлолт",
    weight: 15,
    guidance: "Шийдвэрлэх эрх зүйн асуудлыг эхэнд нэг-хоёр өгүүлбэрээр тодорхойл.",
  },
  {
    id: "applicableLaw",
    label: "Хэрэглэх эрх зүй",
    weight: 20,
    guidance:
      "Ямар хууль, зүйл, заалт хамаарахыг нэрлэ — гэхдээ бодит дугаарыг зөвхөн албан ёсны эхээс (legalinfo.mn) нягталсны дараа ашигла.",
  },
  {
    id: "legalReasoning",
    label: "Эрх зүйн үндэслэл (Subsumtion)",
    weight: 30,
    guidance:
      "Хууль зүйн шалгуур (бүрэлдэхүүн/элемент) бүрийг баримттай тусад нь холбож, яагаад хангагдсан эсэхийг тайлбарла.",
  },
  {
    id: "facts",
    label: "Баримт ба таамгийн ялгаа",
    weight: 20,
    guidance:
      "Баримтад заасан зүйлийг өөрийн таамаглалаас тодорхой ялга. Дутуу баримтыг нөхөж бичихгүй, харин цоорхой гэж тэмдэглэ.",
  },
  {
    id: "conclusion",
    label: "Дүгнэлт",
    weight: 15,
    guidance: "Дээрх шинжилгээнээс үндэслэлтэй, тодорхой дүгнэлт гарга.",
  },
];

const LEGAL_PROBLEMS: readonly StudentLegalProblem[] = [
  {
    id: "criminal-case-study-1",
    trackId: StudentTrackId.CRIMINAL,
    title: "Эрүүгийн эрх зүй — кейс шинжилгээ (Gutachtenstil)",
    intro:
      "Доорх баримтыг Gutachtenstil (бүрэлдэхүүн → хууль бус байдал → буруутай байдал → дүгнэлт) аргачлалаар бичгээр бүрэн задал. Зохиомол зүйл, заалт бүү ашигла.",
    factPattern:
      "А, В хоёрын хооронд мөнгөн зээлийн маргаан гарчээ. А В-ийн гэрт очиж, өрөө буцааж өгөхийг шаардсан. В татгалзсанд А сандал шидэж В-д гэмтэл учруулсан. Гэрч Г үзэгдлийг харсан гэж мэдүүлсэн. В эмнэлэгт хандаж хөнгөн зэргийн гэмтэл авсан тухай магадлагаа бий.",
    prompt:
      "А-ийн үйлдэлд ямар бүрэлдэхүүн (объект, объектив тал, субъект, субъектив тал) тогтоогдож болохыг, хууль бус байдал, буруутай байдлыг баримтад тулгуурлан бичгээр бүрэн шинжлээд, эцэст нь дүгнэлт гарга.",
    sources: [sourceByTrack.criminal],
    rubric: STUDENT_PROBLEM_RUBRIC,
  },
  {
    id: "civil-case-study-1",
    trackId: StudentTrackId.CIVIL,
    title: "Иргэний эрх зүй — кейс шинжилгээ (Anspruchsmethode)",
    intro:
      "Доорх баримтыг Anspruchsmethode (шаардлага үүссэн → дуусгавар болсон уу → хэрэгжүүлэх боломжтой юу → дүгнэлт) аргачлалаар бичгээр бүрэн задал.",
    factPattern:
      "Нэхэмжлэгч Д, хариуцагч Е нартай компьютер худалдах бэлэн бэлтгэлийн гэрээ байгуулсан. Е төлбөрийг бүрэн төлсөн боловч Д хугацаанд нь бараа хүлээлгэн өгөөгүй. Д барааг өөр хүнд худалдсан гэж Е үзэж байна. Гэрээнд хугацаа хожимдвол торгууль ногдуулна гэсэн заалт бий.",
    prompt:
      "Е ямар шаардлага (гэрээний биелэлт, гэм хорын нөхөн төлбөр, торгууль гэх мэт) Д-д тавьж болохыг, шаардлага бүрийн үндэслэл, эсэргүүцэх боломжит үндэслэлийг баримтад тулгуурлан бичгээр бүрэн шинжлээд, эцэст нь дүгнэлт гарга.",
    sources: [sourceByTrack.civil],
    rubric: STUDENT_PROBLEM_RUBRIC,
  },
  {
    id: "administrative-case-study-1",
    trackId: StudentTrackId.ADMINISTRATIVE,
    title: "Захиргааны эрх зүй — кейс шинжилгээ (Verwaltungsakt)",
    intro:
      "Доорх баримтыг Монголын гурван үе (урьдчилсан нөхцөл → хууль ёсны байдал → үр дагавар) буюу Verwaltungsakt аргачлалаар бичгээр бүрэн задал.",
    factPattern:
      "Орон нутгийн засаг захиргааны байгууллага иргэн Ж-ийн худалдааны зөвшөөрлийг сонсгол хийлгүйгээр цуцалсан. Шийдвэрт цуцлах үндэслэл тодорхой бичигдээгүй. Ж энэ шийдвэрийг гомдол гаргах хугацаандаа шүүхэд нэхэмжилжээ.",
    prompt:
      "Энэхүү шийдвэр захиргааны акт мөн эсэх, нэхэмжлэлийн урьдчилсан нөхцөл хангагдсан эсэх, хэлбэр ба бодит тал дахь хууль ёсны байдал, боломжит үр дагаврыг (илэрхий хууль бус/хүчингүй болгох/даалгах) баримтад тулгуурлан бичгээр бүрэн шинжлээд, эцэст нь дүгнэлт гарга.",
    sources: [sourceByTrack.administrative],
    rubric: STUDENT_PROBLEM_RUBRIC,
  },
];

export function getStudentLegalProblem(
  trackId: StudentTrackId,
): StudentLegalProblem | null {
  return LEGAL_PROBLEMS.find((problem) => problem.trackId === trackId) ?? null;
}

export function findStudentLegalProblemById(
  problemId: string,
): StudentLegalProblem | null {
  return LEGAL_PROBLEMS.find((problem) => problem.id === problemId) ?? null;
}
