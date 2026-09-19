/**
 * Захиргааны vйл ажиллагааны эрх зvйн хэлбэрvvд (5 ангилал).
 *
 * Source: methodology handbook p.9, verbatim:
 * "нэхэмжлэлийн зvйл нь 'захиргааны акт', 'захиргааны гэрээ', 'захиргааны
 * хэм хэмжээний акт', 'эрх зvйн харилцаа', эсхvл бусад 'захиргааны хууль
 * бус vйл ажиллагаа'-ны аль нь болохыг ЗЕХ-ийн холбогдох зvйл, заалтыг
 * хэрэглэн шалгасан байвал зохилтой."
 *
 * Classification branch only. Only ADMINISTRATIVE_ACT has a source-backed
 * operational test (see act-classification-test.ts, ЗЕХ §37.1's 6 features,
 * applied identically in both Case 1 and Case 2). The other four values are
 * enum labels only — this module does not invent substantive doctrine for
 * захиргааны гэрээ / захиргааны хэм хэмжээний акт / эрх зvйн харилцаа /
 * бусад захиргааны хууль бус vйл ажиллагаа, because the source provides no
 * worked criteria for them.
 */
export const AdministrativeDisputeSubject = {
  ADMINISTRATIVE_ACT: "ADMINISTRATIVE_ACT",
  ADMINISTRATIVE_CONTRACT: "ADMINISTRATIVE_CONTRACT",
  ADMINISTRATIVE_NORMATIVE_ACT: "ADMINISTRATIVE_NORMATIVE_ACT",
  LEGAL_RELATIONSHIP: "LEGAL_RELATIONSHIP",
  OTHER_UNLAWFUL_ADMINISTRATIVE_ACTIVITY:
    "OTHER_UNLAWFUL_ADMINISTRATIVE_ACTIVITY",
} as const;

export type AdministrativeDisputeSubject =
  (typeof AdministrativeDisputeSubject)[keyof typeof AdministrativeDisputeSubject];

/** Mongolian labels as used verbatim in the source (p.9). */
export const ADMINISTRATIVE_DISPUTE_SUBJECT_LABELS: Record<
  AdministrativeDisputeSubject,
  string
> = {
  [AdministrativeDisputeSubject.ADMINISTRATIVE_ACT]: "захиргааны акт",
  [AdministrativeDisputeSubject.ADMINISTRATIVE_CONTRACT]: "захиргааны гэрээ",
  [AdministrativeDisputeSubject.ADMINISTRATIVE_NORMATIVE_ACT]:
    "захиргааны хэм хэмжээний акт",
  [AdministrativeDisputeSubject.LEGAL_RELATIONSHIP]: "эрх зvйн харилцаа",
  [AdministrativeDisputeSubject.OTHER_UNLAWFUL_ADMINISTRATIVE_ACTIVITY]:
    "бусад захиргааны хууль бус vйл ажиллагаа",
};
