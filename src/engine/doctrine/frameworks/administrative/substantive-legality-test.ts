/**
 * Материаллаг эрх зvйн шаардлага — 3 canonical зvйл.
 *
 * Source: general-methodology p.14-15, applied in Case 1 (p.22-23) and
 * Case 2 (p.32).
 *
 * Architecture note (final gate review): "Эрх зvйн vндэслэлтэй байх"
 * stays ONE LegalElement — the source never gives its two dimensions
 * (хvчин төгöлдöр эсэх / зöв хэрэглэсэн эсэх) an independent worked
 * example the way it does for the three "эрх хэмжээ" sub-checks, so
 * splitting it into siblings would not be source-faithful. Both
 * dimensions are instead preserved without any schema change: each gets
 * its own provenance entry (own locator), and the element's description
 * states both verbatim. A case-specific evaluation's explanation string
 * (written when this element is subsumed against facts) is expected to
 * address both dimensions by name, mirroring how the source's own prose
 * covers both in one paragraph (p.14-15, p.22-23, p.32).
 */
import { emptyTemporal } from "../../types";
import type { LegalElement, LegalTest } from "../../models";
import { methodologyProvenance } from "./provenance";

export const SUBSTANTIVE_LEGALITY_TEST_ID = "administrative:substantive-legality";

const LEGAL_BASIS: LegalElement = {
  id: "administrative:substantive:1-legal-basis",
  label: "Эрх зvйн vндэслэлтэй байх",
  description:
    "(1) Хvчин төгöлдöр эсэх: захиргааны актын vндэслэл болгосон хэм хэмжээ буюу хуулийн зvйл, заалт нь бусад эрх зvйн хэм хэмжээтэй (хуультай), эсхvл дээд хvчин чадал бvхий хэм хэмжээтэй нийцсэн байх. (2) Зöв хэрэглэсэн эсэх: хэрэглэх ёстой хуулийг хэрэглэсэн, хуулийн урьдчилсан нöхцöл бодит байдалд бvрдсэн, хуулийг зöв тайлбарлан хэрэглэсэн байх.",
  required: true,
  order: 1,
  conceptId: null,
  temporal: emptyTemporal(),
  provenance: [
    methodologyProvenance(
      "х.14-15",
      "Эрх зvйн тохиолдол шийдвэрлэх аргачлал, х.14-15 — Эрх зvйн vндэслэл нь хvчин төгöлдöр эсэх",
    ),
    methodologyProvenance(
      "х.15",
      "Эрх зvйн тохиолдол шийдвэрлэх аргачлал, х.15 — Эрх зvйн vндэслэлийг зöв хэрэглэсэн эсэх",
    ),
  ],
};

const CONTENT_CLARITY: LegalElement = {
  id: "administrative:substantive:2-content-clarity",
  label: "Захиргааны актын агуулга тодорхой байх",
  description:
    "ЗЕХ §39.1: захиргааны актын агуулга ойлгомжтой, тодорхой байна — хэн ч уншсан агуулгын хувьд ойлгомжтой, хоёрдмол утгагvй байхыг шаардана.",
  required: true,
  order: 2,
  conceptId: null,
  temporal: emptyTemporal(),
  provenance: [
    methodologyProvenance(
      "х.15",
      "Эрх зvйн тохиолдол шийдвэрлэх аргачлал, х.15 — Захиргааны актын агуулга тодорхой байх (ЗЕХ §39.1)",
    ),
  ],
};

const DISCRETION: LegalElement = {
  id: "administrative:substantive:3-discretion",
  label: "\"Сонгох боломж\"-ийг зöв хэрэглэсэн байх",
  description:
    "Хуулиар захиргаанд өөрийн vзэмжээр сонгох хуулийн боломж олгосон байдаг тохиолдолд, захиргааны акт нь тухайн сонгох боломжийн хvрээнд гаргасан эсэх, сонгох боломжийг зöв хэрэглэсэн эсэхэд дvгнэлт хийнэ.",
  required: true,
  order: 3,
  conceptId: null,
  temporal: emptyTemporal(),
  provenance: [
    methodologyProvenance(
      "х.16",
      "Эрх зvйн тохиолдол шийдвэрлэх аргачлал, х.16 — \"Сонгох боломж\"-ийг зöв хэрэглэсэн байх",
    ),
  ],
};

export const SUBSTANTIVE_LEGALITY_ELEMENTS: readonly LegalElement[] = [
  LEGAL_BASIS,
  CONTENT_CLARITY,
  DISCRETION,
];

export function createSubstantiveLegalityTest(
  elements: readonly LegalElement[] = SUBSTANTIVE_LEGALITY_ELEMENTS,
): LegalTest {
  return {
    id: SUBSTANTIVE_LEGALITY_TEST_ID,
    name: "Материаллаг эрх зvйн шаардлага",
    doctrineId: null,
    ruleId: null,
    temporal: emptyTemporal(),
    provenance: [
      methodologyProvenance(
        "х.14-16",
        "Эрх зvйн тохиолдол шийдвэрлэх аргачлал, х.14-16 — Материаллаг эрх зvйн шаардлага",
      ),
    ],
    elements: [...elements],
  };
}
