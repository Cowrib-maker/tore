/**
 * Official LegalInfo.mn act-type categories (`filtercategorytypeid`).
 *
 * IDs and labels come from https://legalinfo.mn/mn/law — the "Эрх зүйн актын
 * төрөл" radios — not from subject-matter filters (1–21) which overlap the
 * same instruments. Do not invent extra category ids.
 */

export type LegalInfoSourceType =
  | "constitution"
  | "law"
  | "parliament_resolution"
  | "treaty"
  | "decree"
  | "constitutional_court"
  | "supreme_court"
  | "judicial_council"
  | "government_resolution"
  | "ministerial_order"
  | "agency_order"
  | "appointed_body"
  | "local_khural"
  | "governor_order"
  | "other";

export type LegalInfoActTypeCategory = {
  readonly categoryId: string;
  readonly mnLabel: string;
  readonly sourceType: LegalInfoSourceType;
  /** Stored on knowledge metadata so retrieval can label the act. */
  readonly documentType: string;
};

/**
 * Every LegalInfo act family that belongs in the TORE corpus.
 * Subject taxonomy radios (Үндсэн хуульт байгуулал, Иргэний эрх зүй, …)
 * are intentionally absent — those are filters, not source catalogs.
 */
export const LEGALINFO_ACT_TYPE_CATEGORIES: readonly LegalInfoActTypeCategory[] =
  [
    {
      categoryId: "26",
      mnLabel: "Монгол Улсын Үндсэн Хууль",
      sourceType: "constitution",
      documentType: "CONSTITUTION",
    },
    {
      categoryId: "27",
      mnLabel: "Монгол Улсын хууль",
      sourceType: "law",
      documentType: "LAW",
    },
    {
      categoryId: "28",
      mnLabel: "Улсын Их Хурлын тогтоол",
      sourceType: "parliament_resolution",
      documentType: "PARLIAMENT_RESOLUTION",
    },
    {
      categoryId: "29",
      mnLabel: "Монгол Улсын олон улсын гэрээ",
      sourceType: "treaty",
      documentType: "TREATY",
    },
    {
      categoryId: "30",
      mnLabel: "Ерөнхийлөгчийн зарлиг",
      sourceType: "decree",
      documentType: "PRESIDENTIAL_DECREE",
    },
    {
      categoryId: "31",
      mnLabel: "Үндсэн хуулийн цэцийн шийдвэр",
      sourceType: "constitutional_court",
      documentType: "CONSTITUTIONAL_COURT_DECISION",
    },
    {
      categoryId: "32",
      mnLabel: "Улсын дээд шүүхийн тогтоол",
      sourceType: "supreme_court",
      documentType: "SUPREME_COURT_RESOLUTION",
    },
    {
      categoryId: "16231124857801",
      mnLabel: "Шүүхийн ерөнхий зөвлөл",
      sourceType: "judicial_council",
      documentType: "JUDICIAL_COUNCIL_ACT",
    },
    {
      categoryId: "33",
      mnLabel: "Засгийн газрын тогтоол",
      sourceType: "government_resolution",
      documentType: "GOVERNMENT_RESOLUTION",
    },
    {
      categoryId: "34",
      mnLabel: "Сайдын тушаал",
      sourceType: "ministerial_order",
      documentType: "MINISTERIAL_ORDER",
    },
    {
      categoryId: "35",
      mnLabel: "Засгийн газрын агентлагийн даргын тушаал",
      sourceType: "agency_order",
      documentType: "AGENCY_ORDER",
    },
    {
      categoryId: "36",
      mnLabel:
        "УИХ-аас томилогддог байгууллагын дарга, түүнтэй адилтгах албан тушаалтны шийдвэр",
      sourceType: "appointed_body",
      documentType: "APPOINTED_BODY_DECISION",
    },
    {
      categoryId: "37",
      mnLabel: "Аймаг, нийслэлийн ИТХ-ын шийдвэр",
      sourceType: "local_khural",
      documentType: "LOCAL_KHURAL_DECISION",
    },
    {
      categoryId: "38",
      mnLabel: "Аймаг, нийслэлийн Засаг даргын захирамж",
      sourceType: "governor_order",
      documentType: "GOVERNOR_ORDER",
    },
    {
      categoryId: "180",
      mnLabel:
        "Төрийн зарим чиг үүргийг хууль болон гэрээний үндсэн дээр хэрэгжүүлж буй байгууллага",
      sourceType: "other",
      documentType: "DELEGATED_PUBLIC_ACT",
    },
    {
      categoryId: "186",
      mnLabel: "Зөвлөл, хороо, бусад байгууллага",
      sourceType: "other",
      documentType: "COUNCIL_COMMITTEE_ACT",
    },
    {
      categoryId: "390",
      mnLabel: "Хууль, хяналтын байгууллага",
      sourceType: "other",
      documentType: "LAW_ENFORCEMENT_ACT",
    },
  ] as const;

export const LEGALINFO_ACT_TYPE_CATEGORY_IDS: readonly string[] =
  LEGALINFO_ACT_TYPE_CATEGORIES.map((item) => item.categoryId);

const BY_ID = new Map(
  LEGALINFO_ACT_TYPE_CATEGORIES.map((item) => [item.categoryId, item]),
);

export function legalInfoActTypeCategory(
  categoryId: string | null | undefined,
): LegalInfoActTypeCategory | null {
  if (!categoryId) return null;
  return BY_ID.get(categoryId.trim()) ?? null;
}

export function sourceTypeForLegalInfoCategory(
  categoryId: string | null | undefined,
): LegalInfoSourceType {
  return legalInfoActTypeCategory(categoryId)?.sourceType ?? "other";
}

export function documentTypeForLegalInfoCategory(
  categoryId: string | null | undefined,
): string | null {
  return legalInfoActTypeCategory(categoryId)?.documentType ?? null;
}
