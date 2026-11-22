/**
 * Administrative written-exam problem — the first (and, for this sprint,
 * only) domain populated on the new source-backed written-exam pipeline.
 * Criminal/Civil stay on the Empty doctrine frameworks and are populated
 * later the same way (see written-exam-types.ts's domain-agnostic shapes).
 *
 * The rubric is NOT hand-authored: it is `buildRubricFromLegalTest` run
 * over one combined `LegalTest` whose 19 elements are the concatenation of
 * the four existing, unmodified administrative doctrine builders —
 * `createAdmissibilityTest` (4), `createActClassificationTest` (6),
 * `createFormalLegalityTest` (6), `createSubstantiveLegalityTest` (3).
 * Nothing here defines a new LegalElement or LegalTest from scratch; this
 * module only concatenates catalogs that already exist and re-numbers
 * `order` across the combined sequence so hints/dimensions stay ordered.
 *
 * factPattern/prompt/sources are the SAME text as the legacy
 * `administrative-case-study-1` StudentLegalProblem (legal-problems.ts,
 * untouched) — this is a new grading pipeline for the same case, not a
 * new case.
 */
import {
  createActClassificationTest,
  createAdmissibilityTest,
  createFormalLegalityTest,
  createSubstantiveLegalityTest,
} from "@/engine/doctrine";
import type { LegalElement, LegalTest } from "@/engine/doctrine";
import { buildRubricFromLegalTest } from "./rubric-from-legal-test";
import { StudentTrackId } from "./types";
import type { WrittenExamProblem } from "./written-exam-types";

const ACT_CLASSIFICATION_LOCATOR = "х.10-16";

export const ADMINISTRATIVE_WRITTEN_EXAM_TEST_ID = "administrative:written-exam:combined";

export function buildCombinedAdministrativeLegalTest(): LegalTest {
  const admissibility = createAdmissibilityTest();
  const actClassification = createActClassificationTest(ACT_CLASSIFICATION_LOCATOR);
  const formalLegality = createFormalLegalityTest();
  const substantiveLegality = createSubstantiveLegalityTest();

  const parts: LegalElement[][] = [
    admissibility.elements,
    actClassification.elements,
    formalLegality.elements,
    substantiveLegality.elements,
  ];
  let order = 0;
  const elements: LegalElement[] = parts.flat().map((element) => ({
    ...element,
    order: ++order,
  }));

  return {
    id: ADMINISTRATIVE_WRITTEN_EXAM_TEST_ID,
    name: "Захиргааны эрх зүй — бүрэн бичгийн шалгалтын шалгуур (admissibility + act + formal + substantive)",
    doctrineId: null,
    ruleId: null,
    elements,
    temporal: admissibility.temporal,
    provenance: admissibility.provenance,
  };
}

export const ADMINISTRATIVE_WRITTEN_EXAM_MERITS_TEST_ID = "administrative:written-exam:merits";

/**
 * Merits-only combined test (act classification + formal + substantive —
 * NOT admissibility, which `analyzeAdministrativeCase` already gates
 * separately via its own top-level facts/evidence). Used only when
 * calling `analyzeAdministrativeCase` as `merits.legalTest` — the
 * student-facing rubric uses the full 19-element
 * `buildCombinedAdministrativeLegalTest` instead, since the written-exam
 * UX grades one flat rubric rather than running the two-phase
 * admissibility-then-merits orchestrator flow.
 */
export function buildAdministrativeMeritsLegalTest(): LegalTest {
  const actClassification = createActClassificationTest(ACT_CLASSIFICATION_LOCATOR);
  const formalLegality = createFormalLegalityTest();
  const substantiveLegality = createSubstantiveLegalityTest();

  const parts: LegalElement[][] = [
    actClassification.elements,
    formalLegality.elements,
    substantiveLegality.elements,
  ];
  let order = 0;
  const elements: LegalElement[] = parts.flat().map((element) => ({
    ...element,
    order: ++order,
  }));

  return {
    id: ADMINISTRATIVE_WRITTEN_EXAM_MERITS_TEST_ID,
    name: "Захиргааны эрх зүй — мөн чанарын шалгуур (act + formal + substantive)",
    doctrineId: null,
    ruleId: null,
    elements,
    temporal: formalLegality.temporal,
    provenance: formalLegality.provenance,
  };
}

const LEGALINFO_URL = "https://legalinfo.mn/mn";

export function buildAdministrativeWrittenExamProblem(): WrittenExamProblem {
  const legalTest = buildCombinedAdministrativeLegalTest();
  return {
    id: "administrative-written-exam-1",
    trackId: StudentTrackId.ADMINISTRATIVE,
    title: "Захиргааны эрх зүй — бичгийн шалгалт (AI зөвлөх)",
    intro:
      "Доорх баримтыг Монголын гурван үеийн (нэхэмжлэлийн урьдчилсан нөхцөл → захиргааны акт мөн эсэх → хууль ёсны байдал: хэлбэр ба бодит тал) аргачлалаар бичгээр бүрэн задал. Хариултыг илгээсний дараа AI зөвлөх элемент бүрээр тайлбар, санамж өгнө.",
    factPattern:
      "Орон нутгийн засаг захиргааны байгууллага иргэн Ж-ийн худалдааны зөвшөөрлийг сонсгол хийлгүйгээр цуцалсан. Шийдвэрт цуцлах үндэслэл тодорхой бичигдээгүй. Ж энэ шийдвэрийг гомдол гаргах хугацаандаа шүүхэд нэхэмжилжээ.",
    prompt:
      "Энэхүү шийдвэр захиргааны акт мөн эсэх, нэхэмжлэлийн урьдчилсан нөхцөл хангагдсан эсэх, хэлбэр ба бодит тал дахь хууль ёсны байдлыг баримтад тулгуурлан бичгээр бүрэн шинжлээд, эцэст нь дүгнэлт гарга.",
    sources: [
      {
        title: "Монгол Улсын Захиргааны ерөнхий хууль",
        publisher: "Эрх зүйн мэдээллийн нэгдсэн систем",
        url: LEGALINFO_URL,
        note: "Зүйл, заалт ашиглахын өмнө хүчин төгөлдөр эхийг эндээс нягтал.",
      },
    ],
    legalTest,
    rubric: buildRubricFromLegalTest(legalTest),
  };
}
