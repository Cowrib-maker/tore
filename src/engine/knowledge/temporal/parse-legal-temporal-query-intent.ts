/**
 * Universal temporal intent of a legal question.
 *
 * Does not invent a day or month when the user did not supply one.
 * Does not treat catalog membership as current force.
 */

export const LegalTemporalQueryKind = {
  CURRENT: "CURRENT",
  HISTORICAL: "HISTORICAL",
  UNSPECIFIED: "UNSPECIFIED",
} as const;

export type LegalTemporalQueryKind =
  (typeof LegalTemporalQueryKind)[keyof typeof LegalTemporalQueryKind];

export const LegalTemporalQueryPrecision = {
  DAY: "DAY",
  YEAR: "YEAR",
  NONE: "NONE",
  CURRENT: "CURRENT",
} as const;

export type LegalTemporalQueryPrecision =
  (typeof LegalTemporalQueryPrecision)[keyof typeof LegalTemporalQueryPrecision];

export type LegalTemporalQueryIntent = {
  kind: LegalTemporalQueryKind;
  /**
   * Exact evaluation day when the user named one (`YYYY-MM-DD`).
   * Null for year-level, current, unspecified, or insufficient phrases.
   */
  asOfDate: string | null;
  precision: LegalTemporalQueryPrecision;
  /** Inclusive calendar bounds for a year-level query. Not an invented as-of day. */
  yearRange: { from: string; to: string } | null;
  year: number | null;
};

const FULL_MN_DATE =
  /(\d{4})\s*оны\s*(\d{1,2})\s*(?:дуг[аэ]ар|дүгээр|дугаар)?\s*сарын\s*(\d{1,2})(?:\s*[-–]?\s*нд)?/i;
const ISO_DATE = /(\d{4})-(\d{2})-(\d{2})/;
const DOTTED_DATE = /(\d{4})\.(\d{1,2})\.(\d{1,2})/;
const YEAR_AT_TIME = /(\d{4})\s*оны\s*үед/i;
const YEAR_OND = /(\d{4})\s*онд(?=$|[^\p{L}])/iu;
const CURRENT_WORD =
  /(?:^|[^\p{L}])(?:одоогийн|одоо|current)(?=$|[^\p{L}])/iu;
const THAT_TIME = /тухайн\s+үед/i;

/**
 * Removes temporal qualifiers so citation title matching is not polluted
 * by dates. Does not invent a remaining date.
 */
export function stripLegalTemporalQueryPhrases(message: string): string {
  let text = message.replace(/\s+/g, " ").trim();
  text = text.replace(
    /(\d{4})\s*оны\s*(\d{1,2})\s*(?:дуг[аэ]ар|дүгээр|дугаар)?\s*сарын\s*(\d{1,2})(?:\s*[-–]?\s*нд)?/gi,
    " ",
  );
  text = text.replace(/(\d{4})-(\d{2})-(\d{2})/g, " ");
  text = text.replace(/(\d{4})\.(\d{1,2})\.(\d{1,2})/g, " ");
  text = text.replace(/(\d{4})\s*оны\s*үед/gi, " ");
  text = text.replace(/(\d{4})\s*онд(?=$|[^\p{L}])/giu, " ");
  text = text.replace(
    /(?:^|[^\p{L}])(?:одоогийн|одоо|current)(?=$|[^\p{L}])/giu,
    " ",
  );
  text = text.replace(/тухайн\s+үед/gi, " ");
  return text.replace(/\s+/g, " ").trim();
}

export function parseLegalTemporalQueryIntent(
  message: string,
): LegalTemporalQueryIntent {
  const text = message.replace(/\s+/g, " ").trim();
  if (!text) {
    return unspecified();
  }

  const full = matchFullDate(text);
  if (full) {
    return {
      kind: LegalTemporalQueryKind.HISTORICAL,
      asOfDate: full,
      precision: LegalTemporalQueryPrecision.DAY,
      yearRange: null,
      year: Number.parseInt(full.slice(0, 4), 10),
    };
  }

  const year = matchYearOnly(text);
  if (year != null) {
    return {
      kind: LegalTemporalQueryKind.HISTORICAL,
      asOfDate: null,
      precision: LegalTemporalQueryPrecision.YEAR,
      yearRange: { from: `${year}-01-01`, to: `${year}-12-31` },
      year,
    };
  }

  if (CURRENT_WORD.test(text)) {
    return {
      kind: LegalTemporalQueryKind.CURRENT,
      asOfDate: null,
      precision: LegalTemporalQueryPrecision.CURRENT,
      yearRange: null,
      year: null,
    };
  }

  if (THAT_TIME.test(text)) {
    return {
      kind: LegalTemporalQueryKind.HISTORICAL,
      asOfDate: null,
      precision: LegalTemporalQueryPrecision.NONE,
      yearRange: null,
      year: null,
    };
  }

  return unspecified();
}

function unspecified(): LegalTemporalQueryIntent {
  return {
    kind: LegalTemporalQueryKind.UNSPECIFIED,
    asOfDate: null,
    precision: LegalTemporalQueryPrecision.NONE,
    yearRange: null,
    year: null,
  };
}

function matchFullDate(text: string): string | null {
  const mn = text.match(FULL_MN_DATE);
  if (mn?.[1] && mn[2] && mn[3]) {
    return toIsoDate(mn[1], mn[2], mn[3]);
  }
  const iso = text.match(ISO_DATE);
  if (iso?.[1] && iso[2] && iso[3]) {
    return toIsoDate(iso[1], iso[2], iso[3]);
  }
  const dotted = text.match(DOTTED_DATE);
  if (dotted?.[1] && dotted[2] && dotted[3]) {
    return toIsoDate(dotted[1], dotted[2], dotted[3]);
  }
  return null;
}

function matchYearOnly(text: string): number | null {
  const atTime = text.match(YEAR_AT_TIME);
  if (atTime?.[1]) {
    return Number.parseInt(atTime[1], 10);
  }
  const ond = text.match(YEAR_OND);
  if (ond?.[1]) {
    return Number.parseInt(ond[1], 10);
  }
  return null;
}

function toIsoDate(year: string, month: string, day: string): string | null {
  const y = Number.parseInt(year, 10);
  const m = Number.parseInt(month, 10);
  const d = Number.parseInt(day, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }
  return `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(d)}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
