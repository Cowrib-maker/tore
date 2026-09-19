/**
 * Shared source-backed fixtures for the administrative-doctrine tests.
 *
 * Case 1 = "ЗАХИРГААНЫ ЭРХ ЗvЙН ТОХИОЛДОЛ №1" (У компани / tax penalty),
 * handbook p.17-23.
 * Case 2 = "ЗАХИРГААНЫ ЭРХ ЗvЙН ТОХИОЛДОЛ №2" (Болд / school principal
 * dismissal), handbook p.24-33.
 * Micro 1 = presidential pardon example, p.8.
 * Micro 2 = MP / police officer example, p.8-9.
 *
 * Facts use EXPLICIT elementId/mappingRelation assignment (deterministic —
 * no lexical guessing) with one linked evidence item per SUPPORTS fact, per
 * DeterministicFactElementMapper's own adequacy rules.
 */
import { FactElementRelation } from "@/engine/doctrine";
import type { LegalEvidence, LegalFact } from "@/engine/doctrine";

function fact(
  id: string,
  statement: string,
  elementId: string,
  relation: (typeof FactElementRelation)[keyof typeof FactElementRelation] = FactElementRelation.SUPPORTS,
): LegalFact {
  return {
    id,
    statement,
    elementId,
    disputed: false,
    mappingRelation: relation,
  };
}

function evidence(id: string, factId: string, description: string): LegalEvidence {
  return { id, factId, description, sourceId: null };
}

function supportPair(
  idBase: string,
  statement: string,
  elementId: string,
  evidenceDescription: string,
): { fact: LegalFact; evidence: LegalEvidence } {
  return {
    fact: fact(idBase, statement, elementId, FactElementRelation.SUPPORTS),
    evidence: evidence(`${idBase}:ev`, idBase, evidenceDescription),
  };
}

export const APPLICABLE_AT = "2024-01-01";

// ---------------------------------------------------------------------------
// Case 1 — У компани (p.17-23)
// ---------------------------------------------------------------------------

const c1 = {
  admissibility11: supportPair(
    "c1:adm:1.1",
    "Татварын улсын байцаагч Ц 'У' ХХК-ийг 15.0 сая төгрөгөөр торгосон нь компанийн эрх, ашиг сонирхолд шууд сөрөг эрх зvйн vр дагавар vvсгэсэн.",
    "administrative:admissibility:1.1-legal-dispute",
    "Шийтгэлийн хуудас №17 (2022.10.27)",
  ),
  admissibility12: supportPair(
    "c1:adm:1.2",
    "Маргааныг Зөрчлийн тухай хууль, Татварын ерөнхий хууль, Нэмэгдсэн өртгийн албан татварын тухай хууль зэрэг нийтийн эрх зvйн хэм хэмжээгээр зохицуулна.",
    "administrative:admissibility:1.2-public-law-dispute",
    "Зөрчлийн тухай хуулийн §11.19.8.3",
  ),
  admissibility13: supportPair(
    "c1:adm:1.3",
    "Маргаан нь Vндсэн хуулийн §66.2, ҮХЦтХ §8.2-т тоочсон ҮХЦ-ийн харьяалах 4 төрлийн маргаанд хамаарахгvй.",
    "administrative:admissibility:1.3-not-constitutional-court",
    "ҮХЦтХ §8.2 харьцуулалт",
  ),
  admissibility14: supportPair(
    "c1:adm:1.4",
    "Маргаан нь эрvvгийн, иргэний, арбитрын харьяалалд хамаарахгvй — захиргааны хэргийн шvvхийн харьяалал.",
    "administrative:admissibility:1.4-not-other-court",
    "ЗХШХШтХ §13.1 харьцуулалт",
  ),
  act1: supportPair(
    "c1:act:1",
    "Шийтгэлийн хуудсыг Сvхбаатар дvvргийн татварын хэлтсийн улсын байцаагч Ц гаргасан — захиргааны байгууллагаас гаргасан.",
    "administrative:act:1-issuing-body",
    "Улсын байцаагчийн эрх зvйн байдал (ЗЕХ §5.1.1)",
  ),
  act2: supportPair(
    "c1:act:2",
    "Шийтгэлийн хуудас 'У' ХХК-д чиглэсэн, тодорхой нэг тохиолдлыг зохицуулсан, өөр тохиолдолд дахин хэрэглэгдэхгvй.",
    "administrative:act:2-definite-occasion",
    "Шийтгэлийн хуудас №17",
  ),
  act3: supportPair(
    "c1:act:3",
    "Актын vндэслэл болсон Зөрчлийн тухай хууль, татварын хуулиуд нийтийн эрх зvйн хэм хэмжээ.",
    "administrative:act:3-public-law-scope",
    "Зөрчлийн тухай хуулийн §11.19",
  ),
  act4: supportPair(
    "c1:act:4",
    "Актын vйлчлэл 'У' ХХК-д буюу татварын байгууллагын гадна орших хуулийн этгээдэд чиглэсэн.",
    "administrative:act:4-outward-facing",
    "Шийтгэлийн хуудас хаяглагдсан этгээд",
  ),
  act5: supportPair(
    "c1:act:5",
    "Шийтгэлийн хуудсаар 'У' ХХК-д 15.0 сая төгрөгийн төлбөрийн vvрэг vvссэн — эрх зvйн шууд vр дагавар.",
    "administrative:act:5-direct-legal-effect",
    "Торгуулийн дvн 15.0 сая төгрөг",
  ),
  act6: supportPair(
    "c1:act:6",
    "Шийтгэлийн хуудас нь улсын байцаагчийн нэг талын хvсэл зоригийг илэрхийлсэн, төрийн албадлагаар хангагдах захирамжилсан шинжтэй.",
    "administrative:act:6-directive-measure",
    "Зөрчил шалган шийдвэрлэх тухай хуулийн §6.6.1.1",
  ),
  formalCompetenceTerritory: supportPair(
    "c1:formal:territory",
    "Зөрчил Сvхбаатар дvvргийн нутаг дэвсгэрт vйлдэгдсэн, Сvхбаатар дvvргийн татварын хэлтсийн байцаагч шалгасан — нутаг дэвсгэрийн хамаарал зөрчигдөөгvй.",
    "administrative:formal:1a-territory",
    "Зөрч.ШШтХ §1.8.1",
  ),
  formalCompetenceFunction: supportPair(
    "c1:formal:function",
    "Холбогдох зөрчлийг татварын улсын байцаагч шалган шийдвэрлэхээр Зөрчлийн тухай хуулийн §11.19.8.3, Зөрч.ШШтХ §1.8.6.12-т заасан — чиг vvргийн хамаарал зөрчигдөөгvй.",
    "administrative:formal:1b-function",
    "Зөрчлийн тухай хуулийн §11.19.8.3",
  ),
  formalCompetenceHierarchy: supportPair(
    "c1:formal:hierarchy",
    "Дvvргийн татварын улсын байцаагч тухайн зөрчлийг дээд шатны татварын байгууллагад тусгайлан заагаагvй тул шатлан захирах ёсны хамаарал зөрчигдөөгvй.",
    "administrative:formal:1c-hierarchy",
    "Зөрч.ШШтХ §1.8 харьцуулалт",
  ),
  formalProcedure: supportPair(
    "c1:formal:procedure",
    "Зөрчил гаргасан нь ил тодорхой байсан тул Зөрч.ШШтХ-д заасны дагуу хялбаршуулсан журмаар зохих ёсоор шийдвэрлэсэн.",
    "administrative:formal:2-decision-procedure",
    "Зөрч.ШШтХ §6.6.1.1",
  ),
  formalForm: supportPair(
    "c1:formal:form",
    "Зөрч.ШШтХ §7.2.1-д заасны дагуу шийтгэл оногдуулах шийдвэр шийтгэлийн хуудас хэлбэртэй байх ёстой бөгөөд маргаан бvхий акт яг энэ хэлбэрээр гарсан.",
    "administrative:formal:3-form",
    "Шийтгэлийн хуудас №17 хэлбэр",
  ),
  substantiveLegalBasis: {
    fact: fact(
      "c1:subst:legal-basis",
      "'У' ХХК картаа цэнэглэх vйлчилгээг 'борлуулалт' хийгээгvй атал (мөнгө нь хэрэглэгчийн картад vлдэж байгаа тул), Зөрчлийн тухай хуулийн §11.19.8.3-ыг буруу хэрэглэж торгууль оногдуулсан.",
      "administrative:substantive:1-legal-basis",
      FactElementRelation.NEGATES,
    ),
    evidence: evidence(
      "c1:subst:legal-basis:ev",
      "c1:subst:legal-basis",
      "У money картны цэнэглэлтийн зохицуулалт",
    ),
  },
  substantiveClarity: supportPair(
    "c1:subst:clarity",
    "Шийтгэлийн хуудасны агуулгыг ойлгомжгvй гэж маргасан тал байхгvй.",
    "administrative:substantive:2-content-clarity",
    "Шийтгэлийн хуудасны бичвэр",
  ),
};

export const CASE1_ADMISSIBILITY_FACTS: LegalFact[] = [
  c1.admissibility11.fact,
  c1.admissibility12.fact,
  c1.admissibility13.fact,
  c1.admissibility14.fact,
];
export const CASE1_ADMISSIBILITY_EVIDENCE: LegalEvidence[] = [
  c1.admissibility11.evidence,
  c1.admissibility12.evidence,
  c1.admissibility13.evidence,
  c1.admissibility14.evidence,
];

export const CASE1_ACT_FACTS: LegalFact[] = [
  c1.act1.fact,
  c1.act2.fact,
  c1.act3.fact,
  c1.act4.fact,
  c1.act5.fact,
  c1.act6.fact,
];
export const CASE1_ACT_EVIDENCE: LegalEvidence[] = [
  c1.act1.evidence,
  c1.act2.evidence,
  c1.act3.evidence,
  c1.act4.evidence,
  c1.act5.evidence,
  c1.act6.evidence,
];

export const CASE1_FORMAL_FACTS: LegalFact[] = [
  c1.formalCompetenceTerritory.fact,
  c1.formalCompetenceFunction.fact,
  c1.formalCompetenceHierarchy.fact,
  c1.formalProcedure.fact,
  c1.formalForm.fact,
];
export const CASE1_FORMAL_EVIDENCE: LegalEvidence[] = [
  c1.formalCompetenceTerritory.evidence,
  c1.formalCompetenceFunction.evidence,
  c1.formalCompetenceHierarchy.evidence,
  c1.formalProcedure.evidence,
  c1.formalForm.evidence,
];

export const CASE1_SUBSTANTIVE_FACTS: LegalFact[] = [
  c1.substantiveLegalBasis.fact,
  c1.substantiveClarity.fact,
];
export const CASE1_SUBSTANTIVE_EVIDENCE: LegalEvidence[] = [
  c1.substantiveLegalBasis.evidence,
  c1.substantiveClarity.evidence,
];

// ---------------------------------------------------------------------------
// Case 2 — Болд (p.24-33)
// ---------------------------------------------------------------------------

const c2 = {
  admissibility11: supportPair(
    "c2:adm:1.1",
    "Баянгол дvvргийн Засаг даргын 57 дугаар захирамжаар Болдын хvвьд хeдeлмeрлeж, цалин хeлс авах эрх нь хeндeгдсeн — эрх зvйн (сөрөг) vр дагавар vvссэн.",
    "administrative:admissibility:1.1-legal-dispute",
    "Засаг даргын 2021.12.02-ны 57 дугаар захирамж",
  ),
  admissibility12: supportPair(
    "c2:adm:1.2",
    "Маргааныг Тöрийн албаны тухай хууль, Тöсвийн тухай хууль, Боловсролын тухай хууль зэрэг нийтийн эрх зvйн хэм хэмжээ зохицуулна.",
    "administrative:admissibility:1.2-public-law-dispute",
    "Тöрийн албаны тухай хууль §4.3, §14.1",
  ),
  admissibility13: supportPair(
    "c2:adm:1.3",
    "Маргаан нь Vндсэн хуулийн §66.2-т тоочсон ҮХЦ-ийн харьяалах маргаанд хамаарахгvй.",
    "administrative:admissibility:1.3-not-constitutional-court",
    "ҮХЦтХ §8.2 харьцуулалт",
  ),
  admissibility14: supportPair(
    "c2:adm:1.4",
    "Маргаан нь эрvvгийн, иргэний шvvхийн харьяалалд хамаарахгvй, харин Тöрийн албаны хeдeлмeрийн харилцаатай холбоотой тул захиргааны хэргийн шvvхийн харьяалал.",
    "administrative:admissibility:1.4-not-other-court",
    "ЗХШХШтХ §13.1 харьцуулалт",
  ),
  act1: supportPair(
    "c2:act:1",
    "57 дугаар захирамжийг Баянгол дvvргийн Засаг дарга гаргасан — захиргааны байгууллагаас гаргасан.",
    "administrative:act:1-issuing-body",
    "Засаг даргын захирамж",
  ),
  act2: supportPair(
    "c2:act:2",
    "Захирамж Л.Болдод чиглэсэн, тодорхой нэг тохиолдлыг зохицуулсан.",
    "administrative:act:2-definite-occasion",
    "57 дугаар захирамж, огноо 2021.12.02",
  ),
  act3: supportPair(
    "c2:act:3",
    "Захирамжийн vндэслэл болсон Тöрийн албаны тухай хууль, Тöсвийн тухай хууль, Хeдeлмeрийн тухай хууль нийтийн эрх зvйн хэм хэмжээ.",
    "administrative:act:3-public-law-scope",
    "Хeдeлмeрийн тухай хуулийн §40.1.4",
  ),
  act4: supportPair(
    "c2:act:4",
    "Захирамжийн vйлчлэл Болдын хувьд хeдeлмeрлeх, цалин хeлс авах эрхэд чиглэсэн — гадагш чиглэсэн.",
    "administrative:act:4-outward-facing",
    "Болдын хeдeлмeрийн харилцаа",
  ),
  act5: supportPair(
    "c2:act:5",
    "Захирамжаар Болдын хeдeлмeрлeх, цалин хeлс авах эрх дуусгавар болж, тeлбeр тeлeх vvрэг vvссэн — эрх зvйн шууд vр дагавар.",
    "administrative:act:5-direct-legal-effect",
    "5.0 сая тeгрeгийн суутгал",
  ),
  act6: supportPair(
    "c2:act:6",
    "Захирамж нь Засаг даргын нэг талын хvсэл зоригийг илэрхийлсэн, тeрийн албадлагаар хангагдах захирамжилсан шинжтэй.",
    "administrative:act:6-directive-measure",
    "МУ-ын Засаг захиргаа, нутаг дэвсгэрийн нэгжийн тухай хууль",
  ),
  formalCompetenceTerritory: supportPair(
    "c2:formal:territory",
    "77 дугаар сургууль Баянгол дvvргийн нутаг дэвсгэрт оршдог тул нутаг дэвсгэрийн хамаарал зeрчигдeeгvй.",
    "administrative:formal:1a-territory",
    "Боловсролын тухай хуулийн §31.1",
  ),
  formalCompetenceFunction: supportPair(
    "c2:formal:function",
    "Боловсролын тухай хуулийн §31.1-д Дvvргийн Засаг даргад сургуулийн захирлыг чeлeeлeх бvрэн эрх олгосон — чиг vvргийн хамаарал зeрчигдeeгvй.",
    "administrative:formal:1b-function",
    "Боловсролын тухай хуулийн §31.1",
  ),
  formalCompetenceHierarchy: supportPair(
    "c2:formal:hierarchy",
    "Захирамж заавал биелэгдэх шинжтэй, хуулиар олгосон бvрэн эрхийн хvрээнд Дvvргийн Засаг дарга гаргасан — шатлан захирах ёс зeрчигдeeгvй.",
    "administrative:formal:1c-hierarchy",
    "Боловсролын тухай хуулийн §31.1",
  ),
  formalProcedure: {
    fact: fact(
      "c2:formal:procedure",
      "Дотоод аудитын улсын байцаагчийн 155 дугаар актаар Тeсвийн хуулийн зeрчил тогтоогдсон байсан ч Сангийн сайдын 15 дугаар албан бичгээр хvчингvй болсон тул хариуцагч актаа гаргахдаа vvргээ зeрчсeн эсэхийг дахин нягтлаагvй — бодит нeхцeл байдлыг бvрэн тогтоогоогvй.",
      "administrative:formal:2-decision-procedure",
      FactElementRelation.NEGATES,
    ),
    evidence: evidence(
      "c2:formal:procedure:ev",
      "c2:formal:procedure",
      "Сангийн сайдын 2021.12.10-ны 15 дугаар албан бичиг",
    ),
  },
  formalForm: supportPair(
    "c2:formal:form",
    "МУ-ын Засаг захиргаа, нутаг дэвсгэрийн нэгж, тvvний удирдлагын тухай хуулийн дагуу Дvvргийн Засаг дарга захирамж гаргадаг тул хэлбэрийн шаардлага хангасан.",
    "administrative:formal:3-form",
    "МУ-ын Засаг захиргаа, нутаг дэвсгэрийн нэгжийн тухай хууль",
  ),
  formalParticipation: supportPair(
    "c2:formal:participation",
    "Боловсролын тухай хуулийн §31.1.12-ийн 'Нийслэлийн боловсролын газрын саналыг авах' шаардлага нь энэ тохиолдолд хамаарахгvй — Засаг дарга үр дvнгийн гэрээний vvргийг eeрee дvгнэх бvрэн эрхтэй тул зeвшeeрлийн шаардлага зeрчигдeeгvй.",
    "administrative:formal:4-participation",
    "Боловсролын тухай хуулийн §31.1.12",
  ),
  substantiveLegalBasis: {
    fact: fact(
      "c2:subst:legal-basis",
      "Болд эд хeрeнгe хариуцсан ажилтан биш, хулгайд 'ноцтой зeрчил гаргасан' гэдэг Хeдeлмeрийн тухай хуулийн §40.1.4-ийн vндэслэл тогтоогдоогvй атал хариуцагч уг зvйлээр цуцалсан.",
      "administrative:substantive:1-legal-basis",
      FactElementRelation.NEGATES,
    ),
    evidence: evidence(
      "c2:subst:legal-basis:ev",
      "c2:subst:legal-basis",
      "Дотоод аудитын 155 дугаар акт, Сангийн сайдын 15 дугаар албан бичиг",
    ),
  },
  substantiveClarity: supportPair(
    "c2:subst:clarity",
    "Захирамжийн утга агуулгыг ойлгомжгvй гэж vзэх vндэслэл eгeгдeeгvй.",
    "administrative:substantive:2-content-clarity",
    "57 дугаар захирамжийн бичвэр",
  ),
  substantiveDiscretion: {
    fact: fact(
      "c2:subst:discretion",
      "Засаг дарга Хeдeлмeрийн тухай хуулийн §40 дугаар зvйлээр олгогдсон сонгох боломжоо (халах эсэх) буруу хэрэглэсэн.",
      "administrative:substantive:3-discretion",
      FactElementRelation.NEGATES,
    ),
    evidence: evidence(
      "c2:subst:discretion:ev",
      "c2:subst:discretion",
      "Хeдeлмeрийн тухай хуулийн §40 сонголтын харьцуулалт",
    ),
  },
};

export const CASE2_ADMISSIBILITY_FACTS: LegalFact[] = [
  c2.admissibility11.fact,
  c2.admissibility12.fact,
  c2.admissibility13.fact,
  c2.admissibility14.fact,
];
export const CASE2_ADMISSIBILITY_EVIDENCE: LegalEvidence[] = [
  c2.admissibility11.evidence,
  c2.admissibility12.evidence,
  c2.admissibility13.evidence,
  c2.admissibility14.evidence,
];

export const CASE2_ACT_FACTS: LegalFact[] = [
  c2.act1.fact,
  c2.act2.fact,
  c2.act3.fact,
  c2.act4.fact,
  c2.act5.fact,
  c2.act6.fact,
];
export const CASE2_ACT_EVIDENCE: LegalEvidence[] = [
  c2.act1.evidence,
  c2.act2.evidence,
  c2.act3.evidence,
  c2.act4.evidence,
  c2.act5.evidence,
  c2.act6.evidence,
];

export const CASE2_FORMAL_FACTS: LegalFact[] = [
  c2.formalCompetenceTerritory.fact,
  c2.formalCompetenceFunction.fact,
  c2.formalCompetenceHierarchy.fact,
  c2.formalProcedure.fact,
  c2.formalForm.fact,
  c2.formalParticipation.fact,
];
export const CASE2_FORMAL_EVIDENCE: LegalEvidence[] = [
  c2.formalCompetenceTerritory.evidence,
  c2.formalCompetenceFunction.evidence,
  c2.formalCompetenceHierarchy.evidence,
  c2.formalProcedure.evidence,
  c2.formalForm.evidence,
  c2.formalParticipation.evidence,
];

export const CASE2_SUBSTANTIVE_FACTS: LegalFact[] = [
  c2.substantiveLegalBasis.fact,
  c2.substantiveClarity.fact,
  c2.substantiveDiscretion.fact,
];
export const CASE2_SUBSTANTIVE_EVIDENCE: LegalEvidence[] = [
  c2.substantiveLegalBasis.evidence,
  c2.substantiveClarity.evidence,
  c2.substantiveDiscretion.evidence,
];

// ---------------------------------------------------------------------------
// Micro-example 1 — presidential pardon (p.8): NOT a legal dispute.
// ---------------------------------------------------------------------------

export const MICRO1_PARDON_FACTS: LegalFact[] = [
  fact(
    "micro1:1.1",
    "'Уучлал vзvvлэх' эсэх нь тeрийн тэргvvнд Vндсэн хуулиар шалгуургvйгээр олгосон бvрэн эрх тул Ерeнхийлeгчeeс тодорхой этгээдэд уучлал vзvvлсэн, эс vзvvлсэн асуудлыг эрх зvйн хvвьд шалгах боломжгvй.",
    "administrative:admissibility:1.1-legal-dispute",
    FactElementRelation.NEGATES,
  ),
];
export const MICRO1_PARDON_EVIDENCE: LegalEvidence[] = [
  evidence("micro1:1.1:ev", "micro1:1.1", "Vндсэн хуулийн Ерeнхийлeгчийн бvрэн эрхийн заалт"),
];

// ---------------------------------------------------------------------------
// Micro-example 2 — MP / police officer (p.8-9): public-law but criminal
// court jurisdiction (fails 1.4, not 1.1/1.2).
// ---------------------------------------------------------------------------

const micro2 = {
  a11: supportPair(
    "micro2:1.1",
    "Цагдаагийн ажилтан Б-ийн А-д хэрэг vvсгэн шалгасан vйл ажиллагаа нь А-ийн хувьд vзэл бодлоо чeлeeтэй илэрхийлэх эрхэд эрх зvйн сeрeг vр дагавар vvсгэсэн.",
    "administrative:admissibility:1.1-legal-dispute",
    "Зeрчлийн хэрэг vvсгэсэн тухай",
  ),
  a12: supportPair(
    "micro2:1.2",
    "Маргааны зvйл болох цагдаагийн ажилтан Б-ийн vйл ажиллагааг Цагдаагийн байгууллагын тухай хууль, Зeрчлийн тухай хууль — нийтийн эрх зvйн хэм хэмжээ зохицуулна.",
    "administrative:admissibility:1.2-public-law-dispute",
    "ЦБтХ, ЗтХ",
  ),
  a13: supportPair(
    "micro2:1.3",
    "А eeрийн vндсэн эрх зeрчигдсeн гэж маргаж байгаа боловч энэ асуудал Vндсэн хуулийн §66.2, ҮХЦтХ §8.2-т тоочсон ҮХЦ-ийн эрх хэмжээнд огт хамаарахгvй.",
    "administrative:admissibility:1.3-not-constitutional-court",
    "Vндсэн хуулийн §66.2 харьцуулалт",
  ),
};

export const MICRO2_MP_POLICE_FACTS: LegalFact[] = [
  micro2.a11.fact,
  micro2.a12.fact,
  micro2.a13.fact,
  fact(
    "micro2:1.4",
    "А, цагдаагийн ажилтан Б хоёрын хоорондын маргаан нь Зeрчил шалган шийдвэрлэх тухай хуулийн §1.8.6.8, §2.1.1-ийн дагуу эрvvгийн хэргийн шvvхийн шийдвэрлэх маргаан тул бусад шvvхэд харьяалуулсан.",
    "administrative:admissibility:1.4-not-other-court",
    FactElementRelation.NEGATES,
  ),
];
export const MICRO2_MP_POLICE_EVIDENCE: LegalEvidence[] = [
  micro2.a11.evidence,
  micro2.a12.evidence,
  micro2.a13.evidence,
  evidence("micro2:1.4:ev", "micro2:1.4", "Зeрчил шалган шийдвэрлэх тухай хуулийн §1.8.6.8"),
];
