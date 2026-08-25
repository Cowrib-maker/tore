/**
 * Public Legal Intelligence ("Тойм") domain.
 *
 * Records come only from authoritative source adapters.
 * Never invent dates, statuses, summaries, or source URLs.
 */

export const LegalIntelligenceCategory = {
  ENACTED_LAW: "ENACTED_LAW",
  DRAFT_BILL: "DRAFT_BILL",
  DISCUSSION: "DISCUSSION",
  AMENDMENT: "AMENDMENT",
  COURT_DECISION: "COURT_DECISION",
  HIGHLIGHT: "HIGHLIGHT",
} as const;

export type LegalIntelligenceCategory =
  (typeof LegalIntelligenceCategory)[keyof typeof LegalIntelligenceCategory];

/** Homepage section keys — stable for i18n. */
export type LegalIntelligenceSectionKey =
  | "enactedLaws"
  | "draftBills"
  | "discussion"
  | "courtDecisions"
  | "amendments"
  | "highlights";

export const CATEGORY_TO_SECTION: Record<
  LegalIntelligenceCategory,
  LegalIntelligenceSectionKey
> = {
  ENACTED_LAW: "enactedLaws",
  DRAFT_BILL: "draftBills",
  DISCUSSION: "discussion",
  COURT_DECISION: "courtDecisions",
  AMENDMENT: "amendments",
  HIGHLIGHT: "highlights",
};

export const SECTION_TO_CATEGORY: Record<
  LegalIntelligenceSectionKey,
  LegalIntelligenceCategory
> = {
  enactedLaws: "ENACTED_LAW",
  draftBills: "DRAFT_BILL",
  discussion: "DISCUSSION",
  courtDecisions: "COURT_DECISION",
  amendments: "AMENDMENT",
  highlights: "HIGHLIGHT",
};

export const LEGAL_INTELLIGENCE_SECTION_KEYS = [
  "enactedLaws",
  "draftBills",
  "discussion",
  "courtDecisions",
  "amendments",
  "highlights",
] as const satisfies readonly LegalIntelligenceSectionKey[];

export const LEGAL_INTELLIGENCE_SECTION_LIMIT = 5;
export const LEGAL_INTELLIGENCE_FEED_LIMIT = 12;

export const LegalIntelligenceStatus = {
  UNKNOWN: "UNKNOWN",
  IN_FORCE: "IN_FORCE",
  DRAFT: "DRAFT",
  IN_DISCUSSION: "IN_DISCUSSION",
  AMENDED: "AMENDED",
  DECIDED: "DECIDED",
} as const;

export type LegalIntelligenceStatus =
  (typeof LegalIntelligenceStatus)[keyof typeof LegalIntelligenceStatus];

export const LegalIntelligenceAuthority = {
  LEGALINFO: "LEGALINFO",
  PARLIAMENT: "PARLIAMENT",
  COURT: "COURT",
  GOVERNMENT: "GOVERNMENT",
} as const;

export type LegalIntelligenceAuthority =
  (typeof LegalIntelligenceAuthority)[keyof typeof LegalIntelligenceAuthority];

/**
 * Canonical public intelligence record.
 * `summary` is only a source excerpt when available — never an AI-invented claim.
 */
export type LegalIntelligenceRecord = {
  id: string;
  title: string;
  category: LegalIntelligenceCategory;
  status: LegalIntelligenceStatus;
  sourceName: string;
  sourceUrl: string;
  authority: LegalIntelligenceAuthority;
  publishedAt: string | null;
  effectiveAt: string | null;
  summary: string | null;
  sourceReference: string | null;
};

/** Compact list item for homepage feed. */
export type LegalIntelligenceItem = {
  id: string;
  title: string;
  category: LegalIntelligenceCategory;
  section: LegalIntelligenceSectionKey;
  date: string | null;
  summary: string | null;
  sourceName: string;
  sourceUrl: string;
  detailHref: string;
};

export type LegalIntelligenceFeed = {
  latest: LegalIntelligenceItem[];
  bySection: Record<LegalIntelligenceSectionKey, LegalIntelligenceItem[]>;
  availableCategories: LegalIntelligenceSectionKey[];
  totalCount: number;
};

/** Raw row from a knowledge / source adapter before classification. */
export type LegalIntelligenceSourceRow = {
  id: string;
  title: string;
  sourceUrl: string;
  documentType: string | null;
  validFrom: string | null;
  validTo: string | null;
  version: number;
  sourceId: string | null;
  lawId: string | null;
  /** Factual excerpt from source text only (e.g. first article). */
  sourceExcerpt: string | null;
};

export function emptyLegalIntelligenceFeed(): LegalIntelligenceFeed {
  return {
    latest: [],
    bySection: {
      enactedLaws: [],
      draftBills: [],
      discussion: [],
      courtDecisions: [],
      amendments: [],
      highlights: [],
    },
    availableCategories: [],
    totalCount: 0,
  };
}

export function intelligenceDetailHref(id: string): string {
  return `/intelligence/${encodeURIComponent(id)}`;
}

const LAW_TYPE = /^(LAW|CONSTITUTION|CRIMINAL_CODE|LABOR_LAW)$/i;
const COURT_TYPE = /court|decision|judgment|шуух/i;
const DRAFT_TYPE = /draft|bill|төсөл/i;
const DISCUSSION_TYPE = /discussion|хэлэлцүүлэг|debate/i;
const AMEND_TYPE = /amend|revision|өөрчлөлт/i;

/**
 * Source-title / excerpt signals that the instrument repeals, invalidates,
 * or otherwise ends another act — never "newly enacted" substantive law.
 */
const REPEAL_SIGNAL =
  /хүчингүй\s*болсонд\s*тооцох|хүчингүй\s*болгох|хүчингүй\s*болсон|repeal|invalidat|supersed/i;

/**
 * Source-title / excerpt signals of amendment or change (including repeal acts).
 */
const AMENDMENT_SIGNAL =
  /нэмэлт\s*,?\s*өөрчлөлт|өөрчлөлт\s*оруулах|хуульд\s*нэмэлт|amend|revision|хүчингүй\s*болсонд\s*тооцох/i;

function sourceTextSignals(row: LegalIntelligenceSourceRow): string {
  return `${row.title}\n${row.sourceExcerpt ?? ""}`;
}

/**
 * Classify using documentType plus existing title/excerpt/version/temporal
 * metadata. Ambiguous rows return null rather than a misleading category.
 */
export function classifySourceCategory(
  row: Pick<
    LegalIntelligenceSourceRow,
    "documentType" | "version" | "title" | "sourceExcerpt"
  >,
): LegalIntelligenceCategory | null {
  const type = row.documentType?.trim() ?? "";
  if (!type) return null;

  const signals = sourceTextSignals(
    row as LegalIntelligenceSourceRow,
  );

  if (DRAFT_TYPE.test(type)) return LegalIntelligenceCategory.DRAFT_BILL;
  if (DISCUSSION_TYPE.test(type)) return LegalIntelligenceCategory.DISCUSSION;
  if (COURT_TYPE.test(type)) return LegalIntelligenceCategory.COURT_DECISION;

  if (AMEND_TYPE.test(type)) return LegalIntelligenceCategory.AMENDMENT;

  if (LAW_TYPE.test(type)) {
    // Title/excerpt metadata wins over raw documentType for repeal/change acts.
    if (REPEAL_SIGNAL.test(signals) || AMENDMENT_SIGNAL.test(signals)) {
      return LegalIntelligenceCategory.AMENDMENT;
    }
    if (row.version > 1) {
      return LegalIntelligenceCategory.AMENDMENT;
    }
    return LegalIntelligenceCategory.ENACTED_LAW;
  }

  return null;
}

export function statusForCategory(
  category: LegalIntelligenceCategory,
  row: Pick<LegalIntelligenceSourceRow, "version" | "title" | "sourceExcerpt">,
): LegalIntelligenceStatus {
  const signals = sourceTextSignals(row as LegalIntelligenceSourceRow);

  switch (category) {
    case LegalIntelligenceCategory.ENACTED_LAW:
      return LegalIntelligenceStatus.IN_FORCE;
    case LegalIntelligenceCategory.DRAFT_BILL:
      return LegalIntelligenceStatus.DRAFT;
    case LegalIntelligenceCategory.DISCUSSION:
      return LegalIntelligenceStatus.IN_DISCUSSION;
    case LegalIntelligenceCategory.AMENDMENT:
      if (REPEAL_SIGNAL.test(signals)) {
        // Do not invent "in force" / "amended" for repeal instruments.
        return LegalIntelligenceStatus.UNKNOWN;
      }
      return row.version > 1
        ? LegalIntelligenceStatus.AMENDED
        : LegalIntelligenceStatus.UNKNOWN;
    case LegalIntelligenceCategory.COURT_DECISION:
      return LegalIntelligenceStatus.DECIDED;
    default:
      return LegalIntelligenceStatus.UNKNOWN;
  }
}

export function sourceNameForAuthority(
  authority: LegalIntelligenceAuthority,
): string {
  switch (authority) {
    case LegalIntelligenceAuthority.LEGALINFO:
      return "Хууль зүйн мэдээллийн нэгдсэн систем";
    case LegalIntelligenceAuthority.PARLIAMENT:
      return "Монгол Улсын Их Хурал";
    case LegalIntelligenceAuthority.COURT:
      return "Монгол Улсын шүүх";
    case LegalIntelligenceAuthority.GOVERNMENT:
      return "Албан ёсны эх сурвалж";
  }
}

export function toLegalIntelligenceRecord(
  row: LegalIntelligenceSourceRow,
  authority: LegalIntelligenceAuthority = LegalIntelligenceAuthority.LEGALINFO,
): LegalIntelligenceRecord | null {
  const title = row.title.trim();
  const sourceUrl = httpUrl(row.sourceUrl);
  if (!title || !sourceUrl) return null;

  const category = classifySourceCategory(row);
  if (!category) return null;

  return {
    id: row.id,
    title,
    category,
    status: statusForCategory(category, row),
    sourceName: sourceNameForAuthority(authority),
    sourceUrl,
    authority,
    publishedAt: isoDateOnly(row.validFrom),
    effectiveAt: isoDateOnly(row.validFrom),
    summary: truncateExcerpt(row.sourceExcerpt),
    sourceReference: row.lawId
      ? `lawId=${row.lawId}`
      : row.sourceId
        ? `sourceId=${row.sourceId}`
        : null,
  };
}

export function toFeedItem(record: LegalIntelligenceRecord): LegalIntelligenceItem {
  return {
    id: record.id,
    title: record.title,
    category: record.category,
    section: CATEGORY_TO_SECTION[record.category],
    date: record.publishedAt ?? record.effectiveAt,
    summary: record.summary,
    sourceName: record.sourceName,
    sourceUrl: record.sourceUrl,
    detailHref: intelligenceDetailHref(record.id),
  };
}

export function buildLegalIntelligenceFeed(
  records: readonly LegalIntelligenceRecord[],
): LegalIntelligenceFeed {
  const bySection = emptyLegalIntelligenceFeed().bySection;
  const items = records.map(toFeedItem);

  for (const item of items) {
    bySection[item.section].push(item);
  }

  for (const key of LEGAL_INTELLIGENCE_SECTION_KEYS) {
    bySection[key] = dedupeById(bySection[key])
      .sort(compareDateDesc)
      .slice(0, LEGAL_INTELLIGENCE_SECTION_LIMIT);
  }

  const latest = dedupeById(items)
    .sort(compareDateDesc)
    .slice(0, LEGAL_INTELLIGENCE_FEED_LIMIT);

  const availableCategories = LEGAL_INTELLIGENCE_SECTION_KEYS.filter(
    (key) => bySection[key].length > 0,
  );

  return {
    latest,
    bySection,
    availableCategories,
    totalCount: latest.length,
  };
}

/** @deprecated Prefer buildLegalIntelligenceFeed — kept for transitional tests. */
export function classifyLegalIntelligence(
  rows: readonly LegalIntelligenceSourceRow[],
): LegalIntelligenceFeed {
  const records = rows
    .map((row) => toLegalIntelligenceRecord(row))
    .filter((row): row is LegalIntelligenceRecord => row !== null);
  return buildLegalIntelligenceFeed(records);
}

export function isoDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return null;
  return trimmed.slice(0, 10);
}

export function httpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function truncateExcerpt(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length < 24) return null;
  if (cleaned.length <= 220) return cleaned;
  return `${cleaned.slice(0, 217).trimEnd()}…`;
}

function dedupeById(list: LegalIntelligenceItem[]): LegalIntelligenceItem[] {
  const seen = new Set<string>();
  const result: LegalIntelligenceItem[] = [];
  for (const item of list) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

/** Locale-independent ordering so Node SSR and browser hydration stay aligned. */
function compareAscii(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function compareDateDesc(
  a: LegalIntelligenceItem,
  b: LegalIntelligenceItem,
): number {
  const byDate = compareAscii(b.date ?? "", a.date ?? "");
  if (byDate !== 0) return byDate;
  return compareAscii(a.title, b.title);
}
