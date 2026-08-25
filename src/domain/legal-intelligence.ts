/**
 * Public Legal Intelligence ("Тойм") feed.
 * Classifies existing knowledge-document metadata only — never invents items.
 */

export type LegalIntelligenceItem = {
  title: string;
  date: string | null;
  sourceUrl: string | null;
};

export type LegalIntelligenceSectionKey =
  | "enactedLaws"
  | "draftBills"
  | "discussion"
  | "courtDecisions"
  | "amendments"
  | "highlights";

export type LegalIntelligenceFeed = Record<
  LegalIntelligenceSectionKey,
  LegalIntelligenceItem[]
>;

export type LegalIntelligenceSourceRow = {
  title: string;
  sourceUrl: string;
  documentType: string | null;
  validFrom: string | null;
  version: number;
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

const LAW_TYPE = /^(LAW|CONSTITUTION|CRIMINAL_CODE|LABOR_LAW)$/i;
const COURT_TYPE = /court|decision|judgment|шуух/i;
const DRAFT_TYPE = /draft|bill|төсөл/i;
const DISCUSSION_TYPE = /discussion|хэлэлцүүлэг|debate/i;
const AMEND_TYPE = /amend|revision|өөрчлөлт/i;

export function emptyLegalIntelligenceFeed(): LegalIntelligenceFeed {
  return {
    enactedLaws: [],
    draftBills: [],
    discussion: [],
    courtDecisions: [],
    amendments: [],
    highlights: [],
  };
}

export function classifyLegalIntelligence(
  rows: readonly LegalIntelligenceSourceRow[],
): LegalIntelligenceFeed {
  const feed = emptyLegalIntelligenceFeed();

  for (const row of rows) {
    const item = toPublicItem(row);
    if (!item) continue;

    const type = row.documentType?.trim() ?? "";
    if (DRAFT_TYPE.test(type)) {
      feed.draftBills.push(item);
      continue;
    }
    if (DISCUSSION_TYPE.test(type)) {
      feed.discussion.push(item);
      continue;
    }
    if (COURT_TYPE.test(type)) {
      feed.courtDecisions.push(item);
      continue;
    }
    if (AMEND_TYPE.test(type) || (LAW_TYPE.test(type) && row.version > 1)) {
      feed.amendments.push(item);
      continue;
    }
    if (LAW_TYPE.test(type) && row.validFrom) {
      feed.enactedLaws.push(item);
    }
  }

  for (const key of LEGAL_INTELLIGENCE_SECTION_KEYS) {
    feed[key] = dedupeByTitle(feed[key])
      .sort(compareDateDesc)
      .slice(0, LEGAL_INTELLIGENCE_SECTION_LIMIT);
  }

  return feed;
}

function toPublicItem(
  row: LegalIntelligenceSourceRow,
): LegalIntelligenceItem | null {
  const title = row.title.trim();
  if (!title) return null;
  return {
    title,
    date: isoDateOnly(row.validFrom),
    sourceUrl: httpUrl(row.sourceUrl),
  };
}

function isoDateOnly(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return null;
  return trimmed.slice(0, 10);
}

function httpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function dedupeByTitle(list: LegalIntelligenceItem[]): LegalIntelligenceItem[] {
  const seen = new Set<string>();
  const result: LegalIntelligenceItem[] = [];
  for (const item of list) {
    if (seen.has(item.title)) continue;
    seen.add(item.title);
    result.push(item);
  }
  return result;
}

function compareDateDesc(
  a: LegalIntelligenceItem,
  b: LegalIntelligenceItem,
): number {
  return (b.date ?? "").localeCompare(a.date ?? "");
}
