import {
  CaseEvidenceType,
  CaseFactSourceType,
  CaseFileAnalysisStatus,
} from "@/domain/entities/case-file";
import {
  ConclusionDisposition,
  FactElementRelation,
  LegalDomain,
  MappingMethod,
  ReasoningSupportStatus,
  SubsumptionMatchStatus,
} from "@/engine/doctrine";

const DOMAIN_MN: Record<string, string> = {
  [LegalDomain.CIVIL]: "Иргэний",
  [LegalDomain.CRIMINAL]: "Эрүүгийн",
  [LegalDomain.ADMINISTRATIVE]: "Захиргааны",
  [LegalDomain.CONSTITUTIONAL]: "Үндсэн хуулийн",
  [LegalDomain.PROCEDURAL]: "Процессын",
  [LegalDomain.UNKNOWN]: "Бусад",
};

const STATUS_MN: Record<string, string> = {
  [CaseFileAnalysisStatus.NOT_ANALYZED]: "Шинжлээгүй",
  [CaseFileAnalysisStatus.ANALYZED]: "Шинжилсэн",
  [CaseFileAnalysisStatus.ANALYSIS_FAILED]: "Шинжилгээ амжилтгүй",
};

const FACT_SOURCE_MN: Record<string, string> = {
  [CaseFactSourceType.MANUAL]: "Гараар",
  [CaseFactSourceType.DOCUMENT]: "Баримт бичиг",
  [CaseFactSourceType.SYSTEM]: "Систем",
};

const EVIDENCE_TYPE_MN: Record<string, string> = {
  [CaseEvidenceType.DOCUMENT]: "Баримт бичиг",
  [CaseEvidenceType.PHOTO]: "Зураг",
  [CaseEvidenceType.VIDEO]: "Видео",
  [CaseEvidenceType.AUDIO]: "Аудио",
  [CaseEvidenceType.TESTIMONY]: "Гэрчийн мэдүүлэг",
  [CaseEvidenceType.RECORD]: "Бүртгэл",
  [CaseEvidenceType.OTHER]: "Бусад",
};

const RELATION_MN: Record<string, string> = {
  [FactElementRelation.SUPPORTS]: "Дэмжинэ",
  [FactElementRelation.NEGATES]: "Эсэргүүцэнэ",
  [FactElementRelation.UNCERTAIN]: "Тодорхойгүй",
  [FactElementRelation.IRRELEVANT]: "Холбоогүй",
};

const TRACE_KIND_MN: Record<string, string> = {
  ISSUE: "Асуудал",
  RULE: "Дүрэм / зүйл",
  ARTICLE: "Зүйл",
  LEGAL_TEST: "Хууль зүйн шалгуур",
  ELEMENT: "Шалгуурын элемент",
  FACT: "Нөхцөл байдал",
  EVIDENCE: "Нотлох баримт",
  MAPPING: "Холбоос",
  SUBSUMPTION: "Хамааруулалт",
  CONCLUSION: "Дүгнэлт",
};

const ENGINE_STATUS_MN: Record<string, string> = {
  [ConclusionDisposition.SUPPORTED]: "Дэмжигдсэн",
  [ConclusionDisposition.UNSUPPORTED]: "Дэмжигдээгүй",
  [ConclusionDisposition.INSUFFICIENT_FACTS]: "Баримт хүрэлцээгүй",
  [ConclusionDisposition.CONFLICTING_AUTHORITY]: "Эх сурвалж зөрчилтэй",
  [SubsumptionMatchStatus.SATISFIED]: "Хангагдсан",
  [SubsumptionMatchStatus.NOT_SATISFIED]: "Хангагдаагүй",
  [SubsumptionMatchStatus.INDETERMINATE]: "Тодорхойлох боломжгүй",
  [SubsumptionMatchStatus.UNCERTAIN]: "Тодорхойгүй",
  [SubsumptionMatchStatus.NOT_EVALUATED]: "Үнэлээгүй",
  [SubsumptionMatchStatus.MISSING_FACT]: "Нөхцөл байдал дутуу",
  [SubsumptionMatchStatus.MISSING_EVIDENCE]: "Баримт дутуу",
  [ReasoningSupportStatus.SOURCE_BACKED]: "Эх сурвалжтай",
  [ReasoningSupportStatus.PARTIAL]: "Хэсэгчилсэн",
  [ReasoningSupportStatus.INCOMPLETE]: "Дутуу",
  [ReasoningSupportStatus.CONFLICTED]: "Зөрчилтэй",
  [MappingMethod.EXPLICIT]: "Тодорхой",
  [MappingMethod.LEXICAL]: "Үгсийн",
  [MappingMethod.MANUAL]: "Гараар",
  NONE: "Байхгүй",
  UNKNOWN: "Тодорхойгүй",
};

/** Lawyer case-review UI copy (Mongolian). Internal keys stay English. */
export const caseReviewUi = {
  issuesTitle: "Хууль зүйн асуудлууд",
  issuesDescription: "Асуудал сонгож, үндэслэлийн мөрийг тодруулна уу.",
  noIssuesTitle: "Асуудал алга",
  noIssuesDescription: "Шинжилгээнд хууль зүйн асуудал бүртгэгдээгүй байна.",
  unclassified: "ангилаагүй",

  mappedFactsTitle: "Холбогдсон нөхцөл байдал",
  mappedFactsForElement: (elementId: string) =>
    `${elementId} элементэд холбогдсон нөхцөл байдал`,
  mappedFactsDefault: "Сүүлийн амжилттай шинжилгээний нөхцөл байдал",
  noMappedFacts: "Сонгосон элементэд холбогдсон нөхцөл байдал алга.",
  evidencePrefix: "Нотлох баримт:",
  none: "байхгүй",
  disputed: "маргаантай",

  ruleTitle: "Дүрэм / зүйл",
  ruleDescription:
    "Албан ёсны эх сурвалжийн мэдээлэл. Эх бичвэрийг өөрчилж тайлбарлахгүй.",
  noRuleTitle: "Дүрэм олдсонгүй",
  noRuleDescription:
    "Холбогдох эрх зүйн зохицуулалт одоогоор баталгаатай эх сурвалжаас олдсонгүй.",
  untitledDocument: "Гарчиггүй баримт бичиг",
  article: "Зүйл",
  sourceType: "Эх сурвалжийн төрөл",
  sourceVersion: "Эх сурвалжийн хувилбар",
  validity: "Хүчинтэй хугацаа",
  unknown: "тодорхойгүй",
  confidence: "итгэлцүүр",
  notAuthoritative: "Эрх зүйн эх сурвалж гэж харуулахгүй.",
  officialSourceUnavailable: "Албан ёсны эх сурвалж олдсонгүй",
  openOfficialSource: "Албан ёсны эх сурвалж нээх",
  validityNotRecorded: "Хүчинтэй хугацаа бүртгэгдээгүй",
  validityOpen: "нээлттэй",

  legalTestTitle: "Хууль зүйн шалгуур",
  noLegalTestTitle: "Шалгуур олдсонгүй",
  noLegalTestDescription: "Эх сурвалжаас үндэслэлтэй шалгуур гаргаагүй.",
  sourceText: "Эх бичвэр",
  status: "Төлөв",
  required: "заавал",
  optional: "заавал биш",

  mappingTitle: "Нөхцөл байдал → элементийн холбоос",
  mappingDescription:
    "EXPLICIT болон LEXICAL холбоос зөвхөн унших горимтой. MANUAL холбоос тусдаа харагдана.",
  noMappings: "Нөхцөл байдал–элементийн холбоос алга.",
  factCol: "Нөхцөл байдал",
  relationCol: "Хамаарал",
  elementCol: "Элемент",
  confidenceCol: "Итгэлцүүр",
  methodCol: "Арга",
  evidenceCol: "Нотлох баримт",

  subsumptionTitle: "Хамааруулалт",
  noElements: "Хамааруулах элемент алга.",
  elementOrdinal: (order: number) => `ЭЛЕМЕНТ ${order}`,
  supportingFacts: "Дэмжих нөхцөл байдал",
  negatingFacts: "Эсэргүүцэх нөхцөл байдал",
  unresolved: "Шийдэгдээгүй",

  conclusionTitle: "Дүгнэлт",
  conclusionDescription:
    "Хөдөлгүүрийн үр дүн. Энэ дэлгэц дүгнэлтийг дахин тооцоолохгүй.",
  noConclusion: "Дүгнэлт байхгүй",
  blockingElements: "Саатуулах элементүүд",

  traceSummary: "Үндэслэлийн мөр",
  unavailable: "боломжгүй",

  factsTitle: "Хэргийн нөхцөл байдал",
  factsDescription:
    "Бүртгэгдсэн нөхцөл байдал. Нэмэх нь хууль зүйн дүгнэлт гаргахгүй.",
  addFact: "Нөхцөл байдал нэмэх",
  factPlaceholder: "Хэрэгт болсон нөхцөл байдлыг бичнэ үү",
  sourceReferenceOptional: "Эх сурвалжийн лавлагаа (заавал биш)",
  sourceReference: "Эх сурвалжийн лавлагаа",
  exhibitOrNoteId: "Баримтын дугаар эсвэл тэмдэглэл",
  saving: "Хадгалж байна…",
  addFactSubmit: "Нэмэх",
  noFactsYet: "Одоогоор нөхцөл байдал бүртгэгдээгүй байна.",
  editFactAria: (id: string) => `Нөхцөл байдал засах ${id}`,
  sourceTypeForAria: (id: string) => `Эх сурвалжийн төрөл ${id}`,
  saveFact: "Хадгалах",
  deleteFact: "Устгах",
  linkedEvidence: "Холбосон нотлох баримт:",
  unlink: (title: string) => `Салгах: ${title}`,

  evidenceTitle: "Нотлох баримт",
  evidenceDescription:
    "Зөвхөн баримтын метадата. Файл хавсаргах нь тусдаа. Бүртгэх нь жинхэнэ эсвэл хүлээн зөвшөөрөгдөх байдлыг нотлохгүй.",
  addEvidence: "Баримт нэмэх",
  titlePlaceholder: "Гарчиг",
  descriptionOptional: "Тайлбар (заавал биш)",
  evidenceTypeAria: "Баримтын төрөл",
  addEvidenceSubmit: "Баримт нэмэх",
  noEvidenceYet: "Одоогоор нотлох баримт бүртгэгдээгүй байна.",
  saveEvidence: "Хадгалах",
  deleteEvidence: "Устгах",
  linkedFacts: "Холбосон нөхцөл байдал:",
  selectFact: "Нөхцөл байдал сонгох",
  selectEvidence: "Баримт сонгох",
  linkEvidenceToFact: "Баримтыг нөхцөл байдалтай холбох",

  manualMappingTitle: "Гараар холбох",
  manualMappingDescription:
    "MANUAL холбоос хадгалж, одоогийн хөдөлгүүрийг дахин ажиллуулна. Дүгнэлтийг локал засварлахгүй.",
  manualMappingRequires:
    "Гараар холбоход дор хаяж нэг нөхцөл байдал, нэг шалгуурын элемент хэрэгтэй.",
  factLabel: "Нөхцөл байдал",
  elementLabel: "Элемент",
  relationLabel: "Хамаарал",
  selectElement: "Элемент сонгох",
  evidenceIdsOptional: "Нотлох баримтын ID (заавал биш)",
  reRunningAnalysis: "Шинжилгээг дахин ажиллуулж байна…",
  saveMappingAndRerun: "Холбоос хадгалах, дахин шинжлэх",

  rerunTitle: "Шинжилгээг дахин ажиллуулах",
  rerunDescription:
    "Хадгалсан хүсэлтийг ачаалж, одоогийн хөдөлгүүрийг дуудна. Браузер дээр дүгнэлт тооцоолохгүй.",
  reRunning: "Дахин ажиллуулж байна…",
  rerunEngine: "Хөдөлгүүрийг дахин ажиллуулах",
  version: "хувилбар",

  analysisPreserved: "Өмнөх шинжилгээ хадгалагдана.",

  errorNoIssues:
    "Одоогоор хууль зүйн асуудал тогтоогдоогүй байна. Эргэлзээтэй нөхцөл байдлыг хадгаллаа.",
  errorNoRule:
    "Холбогдох эрх зүйн зохицуулалт одоогоор баталгаатай эх сурвалжаас олдсонгүй.",
  errorNoLegalTest: "Эх зүйлээс хууль зүйн шалгуур гаргаагүй.",
  errorInsufficientFacts: "Заавал шаардлагатай элементэд баримт хүрэлцээгүй.",
  errorConflictingAuthority:
    "Эх сурвалжийн зөрчил дэмжигдсэн дүгнэлтийг саатуулж байна.",
  errorMalformed:
    "Шинжилгээний өгөгдөл буруу бүтэцтэй тул эрх зүйн эх сурвалж гэж харуулах боломжгүй.",

  navAria: "Хэргийн ажлын орчин",
} as const;

export function legalDomainLabelMn(domain: string): string {
  return DOMAIN_MN[domain] ?? domain;
}

export function analysisStatusLabelMn(status: string): string {
  if (status === CaseFileAnalysisStatus.NOT_ANALYZED) return "Шинжлээгүй";
  if (status === CaseFileAnalysisStatus.ANALYSIS_FAILED) {
    return "Шинжилгээ амжилтгүй";
  }
  return STATUS_MN[status] ?? "Шинжилсэн";
}

export function factSourceTypeLabelMn(value: string): string {
  return FACT_SOURCE_MN[value] ?? value;
}

export function evidenceTypeLabelMn(value: string): string {
  return EVIDENCE_TYPE_MN[value] ?? value;
}

export function relationLabelMn(value: string): string {
  return RELATION_MN[value] ?? value;
}

export function traceKindLabelMn(kind: string): string {
  return TRACE_KIND_MN[kind] ?? kind;
}

/** Display label for engine/status badges. Keeps raw `value` for data attributes. */
export function engineStatusLabelMn(value: string): string {
  return ENGINE_STATUS_MN[value] ?? STATUS_MN[value] ?? value;
}

export function errorBannerMessageMn(
  key: string,
  statement?: string,
): string {
  switch (key) {
    case "no-issues":
      return caseReviewUi.errorNoIssues;
    case "no-rule":
      return caseReviewUi.errorNoRule;
    case "no-legal-test":
      return caseReviewUi.errorNoLegalTest;
    case "insufficient-facts":
      return statement ?? caseReviewUi.errorInsufficientFacts;
    case "conflicting-authority":
      return statement ?? caseReviewUi.errorConflictingAuthority;
    case "malformed":
      return caseReviewUi.errorMalformed;
    default:
      return statement ?? key;
  }
}

export function formatValidityPeriodMn(
  validFrom: string | null | undefined,
  validTo: string | null | undefined,
): string {
  if (!validFrom && !validTo) return caseReviewUi.validityNotRecorded;
  return `${validFrom ?? "—"} → ${validTo ?? caseReviewUi.validityOpen}`;
}
