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

export function classifySourceCategory(
  documentType: string | null,
  version: number,
): LegalIntelligenceCategory | null {
  const type = documentType?.trim() ?? "";
  if (!type) return null;
  if (DRAFT_TYPE.test(type)) return LegalIntelligenceCategory.DRAFT_BILL;
  if (DISCUSSION_TYPE.test(type)) return LegalIntelligenceCategory.DISCUSSION;
  if (COURT_TYPE.test(type)) return LegalIntelligenceCategory.COURT_DECISION;
  if (AMEND_TYPE.test(type) || (LAW_TYPE.test(type) && version > 1)) {
    return LegalIntelligenceCategory.AMENDMENT;
  }
  if (LAW_TYPE.test(type)) return LegalIntelligenceCategory.ENACTED_LAW;
  return null;
}

export function statusForCategory(
  category: LegalIntelligenceCategory,
  version: number,
): LegalIntelligenceStatus {
  switch (category) {
    case LegalIntelligenceCategory.ENACTED_LAW:
      return LegalIntelligenceStatus.IN_FORCE;
    case LegalIntelligenceCategory.DRAFT_BILL:
      return LegalIntelligenceStatus.DRAFT;
    case LegalIntelligenceCategory.DISCUSSION:
      return LegalIntelligenceStatus.IN_DISCUSSION;
    case LegalIntelligenceCategory.AMENDMENT:
      return version > 1
        ? LegalIntelligenceStatus.AMENDED
        : LegalIntelligenceStatus.IN_FORCE;
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

  const category = classifySourceCategory(row.documentType, row.version);
  if (!category) return null;

  return {
    id: row.id,
    title,
    category,
    status: statusForCategory(category, row.version),
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

function compareDateDesc(
  a: LegalIntelligenceItem,
  b: LegalIntelligenceItem,
): number {
  const byDate = (b.date ?? "").localeCompare(a.date ?? "");
  if (byDate !== 0) return byDate;
  return a.title.localeCompare(b.title);
}
