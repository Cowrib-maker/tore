/**
 * "Тогтоох хэсэг" — ЗХШХШтХ §54.1.1-54.1.8 admissibility gate.
 *
 * Source: general-methodology p.6-12. §54.1.1's four sub-questions
 * (1.1-1.4) are mandatory for every case ("шалгуулагч ... заавал шалгах
 * шаардлагатай" p.7). §54.1.2-54.1.8 are explicitly case-dependent
 * ("Тухайн тохиолдлын өгөгдлөөс хамаарч ... зарим нөхцөлийг шалгахгvй
 * байж болно" p.7, repeated per-item p.11-12) — a case that does not
 * reach one of these simply omits that LegalElement from the case's own
 * curated test instance (see this module's own architecture note in
 * index.ts); `required: true` here is canonical/structural metadata
 * only ("if this element is being checked, it must be satisfied"), not
 * a claim that every case must check it.
 */
import { emptyTemporal } from "../../types";
import type { LegalElement, LegalTest } from "../../models";
import { methodologyProvenance } from "./provenance";

function gateProvenance(locator: string, note: string) {
  return [methodologyProvenance(locator, `Эрх зvйн тохиолдол шийдвэрлэх аргачлал, ${locator} — ${note}`)];
}

export const ADMISSIBILITY_TEST_ID = "administrative:admissibility";

// §54.1.1 sub-questions — always checked (p.7-10).
const IS_LEGAL_DISPUTE: LegalElement = {
  id: "administrative:admissibility:1.1-legal-dispute",
  label: "Эрх зvйн маргаан мөн үү?",
  description:
    "Маргаж буй этгээдийн хувьд эрх зvйн (эерэг, сөрөг) vр дагавар vvсгэсэн, эрх зvйн хvвьд шалгах боломжтой тохиолдол мөн эсэх (ЗХШХШтХ §13.1). Улс төрийн шийдвэр (ЗЕХ §3.1.7) эсхvл захиргааны дотогш чиглэсэн шийдвэр — эрх зvйн маргаан гэж vзэхгvй.",
  required: true,
  order: 1,
  conceptId: null,
  temporal: emptyTemporal(),
  provenance: gateProvenance("х.7-8", "1.1. Тухайн тохиолдол нь эрх зvйн маргаан мөн vv?"),
};

const IS_PUBLIC_LAW_DISPUTE: LegalElement = {
  id: "administrative:admissibility:1.2-public-law-dispute",
  label: "Нийтийн эрх зvйн маргаан мөн үү?",
  description:
    "Маргааны зvйл, маргааныг шийдвэрлэх хэм хэмжээ, тухайн хэм хэмжээ нийтийн эрх зvйн хэм хэмжээ мөн эсэхийг шалгана.",
  required: true,
  order: 2,
  conceptId: null,
  temporal: emptyTemporal(),
  provenance: gateProvenance("х.8-9", "1.2. Тухайн эрх зvйн маргаан нь \"нийтийн эрх зvйн маргаан\" мөн vv?"),
};

const NOT_CONSTITUTIONAL_COURT: LegalElement = {
  id: "administrative:admissibility:1.3-not-constitutional-court",
  label: "Vндсэн хуулийн цэцийн маргаан биш байх",
  description:
    "Тухайн нийтийн эрх зvйн маргаан нь Vндсэн хуулийн §66.2, ҮХЦтХ §8.2, ҮХЦМХШАтХ §13-т тоочсон ҮХЦ-ийн харьяалах маргаанд хамаарахгvй байх.",
  required: true,
  order: 3,
  conceptId: null,
  temporal: emptyTemporal(),
  provenance: gateProvenance("х.9", "1.3. Тухайн нийтийн эрх зvйн маргаан нь \"Vндсэн хуулийн цэцийн маргаан\" мөн vv?"),
};

const NOT_OTHER_COURT: LegalElement = {
  id: "administrative:admissibility:1.4-not-other-court",
  label: "Бусад шvvхийн маргаан биш байх",
  description:
    "Тухайн маргаан нь эрvvгийн, иргэний шvvхийн, эсхvл арбитрын харьяалан шийдвэрлэх маргаан биш байх.",
  required: true,
  order: 4,
  conceptId: null,
  temporal: emptyTemporal(),
  provenance: gateProvenance("х.9", "1.4. Тухайн маргаан нь \"өөр шvvхийн маргаан\" мөн vv?"),
};

// §54.1.2-54.1.8 — case-dependent (p.11-12).
const SPECIAL_VENUE: LegalElement = {
  id: "administrative:admissibility:54.1.2-venue",
  label: "Нутаг дэвсгэрийн/тусгай журмын шvvхийн харьяалал",
  description:
    "Захиргааны маргааныг шийдвэрлэх шvvхийн нутаг дэвсгэрийн болон тусгай журмын зохицуулалттай холбоотой нөхцөл өгөгдсөн тохиолдолд шалгана (ЗХШХШтХ §15, §16).",
  required: true,
  order: 5,
  conceptId: null,
  temporal: emptyTemporal(),
  provenance: gateProvenance("х.11", "§54.1.2 — Нутаг дэвсгэрийн харьяалал/Шvvхийн харьяалал"),
};

const PRIOR_PROCEDURE: LegalElement = {
  id: "administrative:admissibility:54.1.3-prior-procedure",
  label: "Урьдчилан шийдвэрлэх ажиллагаа хийх шаардлагыг биелvvлсэн эсэх",
  description:
    "ЗЕХ §92-94-д заасан урьдчилан шийдвэрлэх ажиллагааны шаардлагыг биелvvлсэн эсэх, энэ журмыг хэрэглэх боломжтой эсэх.",
  required: true,
  order: 6,
  conceptId: null,
  temporal: emptyTemporal(),
  provenance: gateProvenance("х.11", "§54.1.3 — Урьдчилан шийдвэрлэх ажиллагаа"),
};

const CLAIMANT_CAPACITY: LegalElement = {
  id: "administrative:admissibility:54.1.4-capacity",
  label: "Нэхэмжлэгч эрх зvйн бvрэн чадвар/чадамжтай эсэх",
  description: "ЗХШХШтХ §18, §19-ийг шалгах шаардлагатай эсэхийг тодорхойлно.",
  required: true,
  order: 7,
  conceptId: null,
  temporal: emptyTemporal(),
  provenance: gateProvenance("х.11", "§54.1.4 — Нэхэмжлэгчийн чадамж"),
};

const STANDING: LegalElement = {
  id: "administrative:admissibility:54.1.5-standing",
  label: "Төлөөлөх болон нэхэмжлэл гаргах эрхтэй эсэх",
  description:
    "Маргаж буй этгээд \"эрх нь зөрчигдсөн этгээд\" мөн эсэх, захиргааны байгууллагын хvвьд нэхэмжлэл гаргахаар хуульд заасан эсэх, нийтийн эрх ашгийг төлөөлөх этгээдийн хvвьд §18.3-ийн шаардлага хангасан эсэх (§27, §28, §29).",
  required: true,
  order: 8,
  conceptId: null,
  temporal: emptyTemporal(),
  provenance: gateProvenance("х.11-12", "§54.1.5 — Төлөөлөх/нэхэмжлэл гаргах эрх"),
};

const NO_PRIOR_JUDGMENT: LegalElement = {
  id: "administrative:admissibility:54.1.6-no-prior-judgment",
  label: "Маргаж буй зvйлийн талаар гарсан өөр хvчин төгöлдöр шvvхийн шийдвэр байгаа эсэх",
  description: "Тухайн тохиолдлын өгөгдлөөс хамаарч дvгнэлт хийнэ.",
  required: true,
  order: 9,
  conceptId: null,
  temporal: emptyTemporal(),
  provenance: gateProvenance("х.12", "§54.1.6 — Өөр хvчин төгöлдöр шvvхийн шийдвэр"),
};

const SUCCESSION: LegalElement = {
  id: "administrative:admissibility:54.1.7-succession",
  label: "Хууль ёсны эрх залгамжлал байгаа эсэх",
  description: "Тухайн тохиолдлын өгөгдлөөс хамаарч ЗХШХШтХ §26-г тайлбарлан хэрэглэнэ.",
  required: true,
  order: 10,
  conceptId: null,
  temporal: emptyTemporal(),
  provenance: gateProvenance("х.12", "§54.1.7 — Эрх залгамжлал"),
};

const FILING_DEADLINE: LegalElement = {
  id: "administrative:admissibility:54.1.8-deadline",
  label: "Нэхэмжлэл гаргах хугацааг хvндэтгэн vзэх шалтгаангvйгээр хэтрvvлсэн эсэх",
  description: "Тухайн тохиолдлын өгөгдлөөс хамаарч ЗХШХШтХ §14.5-ийг тайлбарлан хэрэглэнэ.",
  required: true,
  order: 11,
  conceptId: null,
  temporal: emptyTemporal(),
  provenance: gateProvenance("х.12", "§54.1.8 — Хугацаа"),
};

/** §54.1.1's four sub-questions — mandatory for every case (p.7). */
export const ADMISSIBILITY_MANDATORY_ELEMENTS: readonly LegalElement[] = [
  IS_LEGAL_DISPUTE,
  IS_PUBLIC_LAW_DISPUTE,
  NOT_CONSTITUTIONAL_COURT,
  NOT_OTHER_COURT,
];

/** §54.1.2-54.1.8 — case-dependent; include only what the fact pattern reaches. */
export const ADMISSIBILITY_CONDITIONAL_ELEMENTS: readonly LegalElement[] = [
  SPECIAL_VENUE,
  PRIOR_PROCEDURE,
  CLAIMANT_CAPACITY,
  STANDING,
  NO_PRIOR_JUDGMENT,
  SUCCESSION,
  FILING_DEADLINE,
];

export const ADMISSIBILITY_ALL_ELEMENTS: readonly LegalElement[] = [
  ...ADMISSIBILITY_MANDATORY_ELEMENTS,
  ...ADMISSIBILITY_CONDITIONAL_ELEMENTS,
];

export function createAdmissibilityTest(
  elements: readonly LegalElement[] = ADMISSIBILITY_MANDATORY_ELEMENTS,
): LegalTest {
  return {
    id: ADMISSIBILITY_TEST_ID,
    name: "Тогтоох хэсэг (ЗХШХШтХ §54.1)",
    doctrineId: null,
    ruleId: null,
    temporal: emptyTemporal(),
    provenance: gateProvenance("х.6-12", "Тогтоох хэсэг"),
    elements: [...elements],
  };
}
