/**
 * Формал эрх зvйн шаардлага (p.13-14).
 *
 * IMPORTANT — two different counts describe this test, and both are
 * correct at their own level; do not conflate them:
 *
 *   - 4 CATEGORIES (concepts), matching the source's own top-level
 *     numbering (p.13-14, "1. Эрх хэмжээ... 2. Журам... 3. Хэлбэр...
 *     4. Бусад этгээдийн оролцоо..."): competence, procedure, form,
 *     participation. See {@link FORMAL_LEGALITY_CATEGORIES}.
 *   - 6 EVALUABLE LegalElements, because category 1 ("эрх хэмжээ") is
 *     itself three independently-cited, independently-evaluated
 *     sub-dimensions in the source (territory / function / hierarchy —
 *     p.13, each with its own example; p.31: "Эдгээрийг нэгтгээд...").
 *     Categories 2-4 (procedure, form, participation) are each exactly
 *     one LegalElement. 3 + 1 + 1 + 1 = 6. See
 *     {@link FORMAL_LEGALITY_ELEMENTS}.
 *
 * Source: applied in Case 1 (p.21-22, 3/4 categories reached — no
 * participation issue) and Case 2 (p.30-31, all 4 categories reached).
 *
 * Architecture note (final gate review, unchanged): the three competence
 * sub-dimensions are modeled as THREE separate LegalElement values
 * sharing one LegalConcept via `conceptId`, not as one parent element
 * with nested sub-checks — LegalElement has no parent/child field, and
 * DefaultSubsumptionEngine evaluates the elements array flatly, so this
 * preserves per-dimension subsumption results and provenance without any
 * schema change. LegalElement itself is not modified.
 */
import { LegalDomain, emptyTemporal } from "../../types";
import type { LegalConcept, LegalElement, LegalTest } from "../../models";
import { methodologyProvenance } from "./provenance";

function formalProvenance(locator: string, note: string) {
  return [methodologyProvenance(locator, `Эрх зvйн тохиолдол шийдвэрлэх аргачлал, ${locator} — ${note}`)];
}

export const FORMAL_LEGALITY_TEST_ID = "administrative:formal-legality";

export const COMPETENCE_CONCEPT: LegalConcept = {
  id: "concept:administrative-competence",
  label: "Эрх хэмжээ",
  description:
    "Захиргааны акт нь захиргааны байгууллагын эрх хэмжээний хvрээнд хамаарч буй эсэх — нутаг дэвсгэр, чиг vvрэг, шатлан захирах ёсны 3 хамаарлаар шалгана (х.13).",
  domain: LegalDomain.ADMINISTRATIVE,
  temporal: emptyTemporal(),
  provenance: formalProvenance("х.13", "1. Захиргааны акт нь эрх хэмжээний хvрээнд хамаарч буй эсэх"),
};

const COMPETENCE_TERRITORY: LegalElement = {
  id: "administrative:formal:1a-territory",
  label: "Нутаг дэвсгэрийн хамаарал",
  description:
    "Захиргааны байгууллагын vйл ажиллагаа тодорхой нутаг дэвсгэрийн хvрээгээр хязгаарлагдах тохиолдолд шийдвэр гаргагч этгээдийн шийдвэр захиргааны акт vйлчлэх ёстой нутаг дэвсгэрийнхээ хvрээнд хамаарч буй эсэх (жишээ: А аймгийн Засаг дарга Б аймгийн нутаг дэвсгэрт vйлчлэх акт гаргасан эсэх).",
  required: true,
  order: 1,
  conceptId: COMPETENCE_CONCEPT.id,
  temporal: emptyTemporal(),
  provenance: formalProvenance("х.13", "а. Нутаг дэвсгэрийн хамаарал"),
};

const COMPETENCE_FUNCTION: LegalElement = {
  id: "administrative:formal:1b-function",
  label: "Чиг vvргийн хамаарал",
  description:
    "Захиргааны байгууллагын чиг vvрэг гэдэг нь тухайн байгууллагын эрхлэх ажлын бvрэлдэхvvн хэсэг буюу хуулиар заасан vйл ажиллагааны гол чиглэл мөн эсэх (жишээ: ашигт малтмалын тусгай зөвшөөрлийг Кадастрын хэлтэст олгосон байхад өөр хэлтсийн даргаас гаргавал чиг vvргийн хамаарлыг зөрчсөн).",
  required: true,
  order: 2,
  conceptId: COMPETENCE_CONCEPT.id,
  temporal: emptyTemporal(),
  provenance: formalProvenance("х.13", "б. Чиг vvргийн хамаарал"),
};

const COMPETENCE_HIERARCHY: LegalElement = {
  id: "administrative:formal:1c-hierarchy",
  label: "Шатлан захирах ёсны хамаарал",
  description:
    "Захиргааны байгууллагын дотоод иерархи тогтолцоонд нэг нь нөгөөдөө захирагдах, гуравдагч этгээд захирагдах ёсыг зөрчсөн эсэх (жишээ: Нийслэлийн Засаг даргын эрх хэмжээний асуудлыг дvvргийн Засаг дарга шийдвэрлэвэл зөрчсөн).",
  required: true,
  order: 3,
  conceptId: COMPETENCE_CONCEPT.id,
  temporal: emptyTemporal(),
  provenance: formalProvenance("х.13", "в. Шатлан захирах ёсны хамаарал"),
};

const DECISION_PROCEDURE: LegalElement = {
  id: "administrative:formal:2-decision-procedure",
  label: "Шийдвэр гаргах ажиллагааны журмыг хангасан эсэх",
  description:
    "Актыг гаргах талаар хуулиар тусгайлан заасан журам байвал тvvнийг хангасан эсэх; тусгай хууль байхгvй бол ЗЕХ (§12-32, сонсох ажиллагаа г.м.)-ийг хэрэглэнэ.",
  required: true,
  order: 4,
  conceptId: null,
  temporal: emptyTemporal(),
  provenance: formalProvenance("х.13", "2. Шийдвэр гаргах ажиллагааны журмыг хангасан эсэх"),
};

const FORM_REQUIREMENT: LegalElement = {
  id: "administrative:formal:3-form",
  label: "Хэлбэрийн шаардлагыг хангасан эсэх",
  description:
    "Захиргааны актын илрэх хэлбэр (аман, бичгэн, vйлдэл, эс vйлдэхvй) хуулийн тусгай шаардлагыг хангасан эсэх; зарчмын хvвьд ЗЕХ §40-өөр бичгийн шаардлага хангасан байна.",
  required: true,
  order: 5,
  conceptId: null,
  temporal: emptyTemporal(),
  provenance: formalProvenance("х.13-14", "3. Хэлбэрийн шаардлагыг хангасан эсэх"),
};

const OTHER_PARTICIPATION: LegalElement = {
  id: "administrative:formal:4-participation",
  label: "Бусад этгээдийн оролцоог хангах",
  description:
    "Зарим захиргааны актад тухайлсан асуудлын шинж чанараас хамаарч нэмэлт болзол (урьдчилан зөвшөөрөл авах, өөр байгууллагатай зөвшилцөх, хамтран хэлэлцэж шийдвэрлэх) тавигдсан эсэх, тавигдсан бол хангасан эсэх.",
  required: true,
  order: 6,
  conceptId: null,
  temporal: emptyTemporal(),
  provenance: formalProvenance("х.14", "4. Бусад этгээдийн оролцоог хангах"),
};

/** Full canonical catalog — 6 elements (item 1's 3 sub-dimensions + items 2-4). */
export const FORMAL_LEGALITY_ELEMENTS: readonly LegalElement[] = [
  COMPETENCE_TERRITORY,
  COMPETENCE_FUNCTION,
  COMPETENCE_HIERARCHY,
  DECISION_PROCEDURE,
  FORM_REQUIREMENT,
  OTHER_PARTICIPATION,
];

/**
 * Documents the 4-category / 6-element relationship explicitly and
 * testably, without adding any field to LegalElement itself — this is
 * purely a read-only index grouping the same LegalElement ids already in
 * {@link FORMAL_LEGALITY_ELEMENTS} by their source-level category (p.13-14
 * numbering). `conceptId` already does the same grouping for competence
 * specifically; this covers all 4 categories uniformly for documentation
 * and UI/explanation purposes.
 */
export type FormalLegalityCategory = {
  id: string;
  label: string;
  elementIds: readonly string[];
};

export const FORMAL_LEGALITY_CATEGORIES: readonly FormalLegalityCategory[] = [
  {
    id: "competence",
    label: "1. Эрх хэмжээний хvрээнд хамаарч буй эсэх",
    elementIds: [
      COMPETENCE_TERRITORY.id,
      COMPETENCE_FUNCTION.id,
      COMPETENCE_HIERARCHY.id,
    ],
  },
  {
    id: "procedure",
    label: "2. Шийдвэр гаргах ажиллагааны журмыг хангасан эсэх",
    elementIds: [DECISION_PROCEDURE.id],
  },
  {
    id: "form",
    label: "3. Хэлбэрийн шаардлагыг хангасан эсэх",
    elementIds: [FORM_REQUIREMENT.id],
  },
  {
    id: "participation",
    label: "4. Бусад этгээдийн оролцоог хангах",
    elementIds: [OTHER_PARTICIPATION.id],
  },
];

export function createFormalLegalityTest(
  elements: readonly LegalElement[] = FORMAL_LEGALITY_ELEMENTS,
): LegalTest {
  return {
    id: FORMAL_LEGALITY_TEST_ID,
    name: "Формал эрх зvйн шаардлага",
    doctrineId: null,
    ruleId: null,
    temporal: emptyTemporal(),
    provenance: formalProvenance("х.13-14", "Формал эрх зvйн шаардлага"),
    elements: [...elements],
  };
}
