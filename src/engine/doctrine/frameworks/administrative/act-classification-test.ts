/**
 * "Захиргааны акт мөн эсэх" 6 шинж — ЗЕХ §37.1.
 *
 * Source: general-methodology's own worked illustration (p.10), applied
 * verbatim and identically in both Case 1 (p.19-20) and Case 2 (p.29-30).
 * All 6 features required cumulatively — both worked cases conclude
 * "6 шинжийг бvхэлд нь агуулж байх тул захиргааны акт мөн байна."
 */
import { emptyTemporal } from "../../types";
import type { LegalTest } from "../../models";
import { methodologyProvenance } from "./provenance";

function acProvenance(locator: string) {
  return [
    methodologyProvenance(
      "х.10",
      "Эрх зvйн тохиолдол шийдвэрлэх аргачлал, х.10 — 'Захиргааны акт мөн эсэх' 6 шинж (ЗЕХ §37.1)",
    ),
    methodologyProvenance(
      locator,
      `Эрх зvйн тохиолдол шийдвэрлэх аргачлал, ${locator} — тохиолдолд хэрэглэсэн жишээ`,
    ),
  ];
}

export const ACT_CLASSIFICATION_TEST_ID = "administrative:act-classification";

export function createActClassificationTest(
  appliedAtLocator: string,
): LegalTest {
  return {
    id: ACT_CLASSIFICATION_TEST_ID,
    name: "Захиргааны акт мөн эсэх (ЗЕХ §37.1)",
    doctrineId: null,
    ruleId: null,
    temporal: emptyTemporal(),
    provenance: acProvenance(appliedAtLocator),
    elements: [
      {
        id: "administrative:act:1-issuing-body",
        label: "Захиргааны байгууллагаас гаргасан байх",
        description:
          "Маргаан буй шийдвэрийг/vйл ажиллагааг захиргааны байгууллагаас гаргасан/явуулсан байх ёстой (ЗЕХ §5.1.1-5.1.5).",
        required: true,
        order: 1,
        conceptId: null,
        temporal: emptyTemporal(),
        provenance: acProvenance(appliedAtLocator),
      },
      {
        id: "administrative:act:2-definite-occasion",
        label: "Тодорхой нэг тохиолдол байх (зохицуулах)",
        description:
          "Захиргааны акт нь тухайлсан тодорхой нэг тохиолдлыг зохицуулдаг — хаяглагдаж буй этгээд тодорхой, ижил төстэй тохиолдолд дахин давтан хэрэглэх боломжгvй.",
        required: true,
        order: 2,
        conceptId: null,
        temporal: emptyTemporal(),
        provenance: acProvenance(appliedAtLocator),
      },
      {
        id: "administrative:act:3-public-law-scope",
        label: "Нийтийн эрх зvйн хvрээнд байх",
        description:
          "Захиргааны байгууллагын шийдвэрийн vндэслэл болж буй эрх зvйн хэм хэмжээ нийтийн эрх зvйн хэм хэмжээнд хамаарч байх.",
        required: true,
        order: 3,
        conceptId: null,
        temporal: emptyTemporal(),
        provenance: acProvenance(appliedAtLocator),
      },
      {
        id: "administrative:act:4-outward-facing",
        label: "Гадагш чиглэсэн байх",
        description:
          "Шийдвэрийн vйлчлэл нь захиргааны байгууллагын дотоод харилцаанд хамаарахгvй, харин гадна орших этгээдэд (хvн, хуулийн этгээд) чиглэсэн байх.",
        required: true,
        order: 4,
        conceptId: null,
        temporal: emptyTemporal(),
        provenance: acProvenance(appliedAtLocator),
      },
      {
        id: "administrative:act:5-direct-legal-effect",
        label: "Эрх зvйн шууд vр дагавар бий болгосон буюу зохицуулалт агуулсан байх",
        description:
          "Шийдвэрээр тодорхой этгээдийн хувьд эрх зvйн vр дагавар (эрх, vvрэг vvсгэсэн, өөрчилсөн, дуусгавар болгосон, эсхvл эрх зvйн байдлыг тодорхойлсон) бий болсон байх.",
        required: true,
        order: 5,
        conceptId: null,
        temporal: emptyTemporal(),
        provenance: acProvenance(appliedAtLocator),
      },
      {
        id: "administrative:act:6-directive-measure",
        label: "Захирамжилсан арга хэмжээ байх",
        description:
          "Захиргааны байгууллагын буюу нэг талын хvсэл зоригийг илэрхийлсэн, төрийн албадлагаар хангагдах чадвартай захирамжилсан шинжтэй байх.",
        required: true,
        order: 6,
        conceptId: null,
        temporal: emptyTemporal(),
        provenance: acProvenance(appliedAtLocator),
      },
    ],
  };
}
