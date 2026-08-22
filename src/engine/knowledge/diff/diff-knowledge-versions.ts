/**
 * Deterministic comparison of two stored knowledge documents.
 *
 * Proves only that stored texts differ. Does not classify AMENDS, REPEALS,
 * SUPERSEDES, IN_FORCE, repeal, or current force. Does not invent dates.
 * Does not call the temporal resolver.
 *
 * Alignment is printed `articleNumber` plus a structural role derived from
 * the parser's stored title/display:
 * - `… дүгээр/дугаар зүйл` → article heading
 * - title equal to a dotted number (e.g. `17.1`) → paragraph row
 *
 * Those two are never joined even when the printed number is the same.
 * Null article numbers are skipped (no invented locators). Duplicate
 * role+number rows in one document: first occurrence wins.
 */

import type {
  KnowledgeArticle,
  StoredKnowledgeDocument,
} from "../types";

export const LegalChangeType = {
  ADDED: "ADDED",
  REMOVED: "REMOVED",
  UNCHANGED: "UNCHANGED",
  MODIFIED: "MODIFIED",
} as const;

export type LegalChangeType =
  (typeof LegalChangeType)[keyof typeof LegalChangeType];

export const KnowledgeVersionDiffRejectReason = {
  SOURCE_URL_MISMATCH: "SOURCE_URL_MISMATCH",
  SAME_DOCUMENT_ID: "SAME_DOCUMENT_ID",
  SAME_CONTENT_SHA256: "SAME_CONTENT_SHA256",
  MISSING_CONTENT_SHA256: "MISSING_CONTENT_SHA256",
  MISSING_ARCHIVE_PROVENANCE: "MISSING_ARCHIVE_PROVENANCE",
} as const;

export type KnowledgeVersionDiffRejectReason =
  (typeof KnowledgeVersionDiffRejectReason)[keyof typeof KnowledgeVersionDiffRejectReason];

export type LegalVersionDiff = {
  fromDocumentId: string;
  toDocumentId: string;
  sourceUrl: string;
  fromContentSha256: string;
  toContentSha256: string;
  locator: string;
  changeType: LegalChangeType;
  beforeText: string | null;
  afterText: string | null;
  evidence: {
    kind: "CANONICAL_TEXT_DIFF";
    fromArchiveId: string;
    toArchiveId: string;
  };
};

export type DiffKnowledgeDocumentsResult =
  | { ok: true; diffs: LegalVersionDiff[] }
  | { ok: false; reason: KnowledgeVersionDiffRejectReason };

const ARTICLE_HEADING = /(?:дүгээр|дугаар|дэх)\s+зүйл/i;

type PrintedRole = "article" | "paragraph" | "provision";

/**
 * Comparison-only whitespace normalization. Does not rewrite legal words,
 * numbering, or substantive punctuation.
 */
export function normalizeComparableKnowledgeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function diffKnowledgeDocuments(
  fromDocument: StoredKnowledgeDocument,
  toDocument: StoredKnowledgeDocument,
): DiffKnowledgeDocumentsResult {
  if (fromDocument.sourceUrl.trim() !== toDocument.sourceUrl.trim()) {
    return {
      ok: false,
      reason: KnowledgeVersionDiffRejectReason.SOURCE_URL_MISMATCH,
    };
  }
  if (fromDocument.id === toDocument.id) {
    return {
      ok: false,
      reason: KnowledgeVersionDiffRejectReason.SAME_DOCUMENT_ID,
    };
  }

  const fromHash = contentHash(fromDocument);
  const toHash = contentHash(toDocument);
  if (!fromHash || !toHash) {
    return {
      ok: false,
      reason: KnowledgeVersionDiffRejectReason.MISSING_CONTENT_SHA256,
    };
  }
  if (fromHash === toHash) {
    return {
      ok: false,
      reason: KnowledgeVersionDiffRejectReason.SAME_CONTENT_SHA256,
    };
  }

  const fromArchiveId = fromDocument.provenance?.archiveId?.trim() ?? "";
  const toArchiveId = toDocument.provenance?.archiveId?.trim() ?? "";
  if (!fromArchiveId || !toArchiveId) {
    return {
      ok: false,
      reason: KnowledgeVersionDiffRejectReason.MISSING_ARCHIVE_PROVENANCE,
    };
  }

  const fromRows = indexArticles(fromDocument.articles);
  const toRows = indexArticles(toDocument.articles);
  const prefixNumbers = collidingPrintedNumbers(fromRows, toRows);

  const locators = new Set([...fromRows.keys(), ...toRows.keys()]);
  const diffs: LegalVersionDiff[] = [];
  const evidence = {
    kind: "CANONICAL_TEXT_DIFF" as const,
    fromArchiveId,
    toArchiveId,
  };
  const base = {
    fromDocumentId: fromDocument.id,
    toDocumentId: toDocument.id,
    sourceUrl: fromDocument.sourceUrl,
    fromContentSha256: fromHash,
    toContentSha256: toHash,
    evidence,
  };

  for (const key of [...locators].sort((a, b) => a.localeCompare(b))) {
    const fromArticle = fromRows.get(key);
    const toArticle = toRows.get(key);
    const locator = publicLocator(key, prefixNumbers);

    if (fromArticle && !toArticle) {
      diffs.push({
        ...base,
        locator,
        changeType: LegalChangeType.REMOVED,
        beforeText: fromArticle.text,
        afterText: null,
      });
      continue;
    }
    if (!fromArticle && toArticle) {
      diffs.push({
        ...base,
        locator,
        changeType: LegalChangeType.ADDED,
        beforeText: null,
        afterText: toArticle.text,
      });
      continue;
    }
    if (!fromArticle || !toArticle) {
      continue;
    }

    const same =
      normalizeComparableKnowledgeText(fromArticle.text) ===
      normalizeComparableKnowledgeText(toArticle.text);
    diffs.push({
      ...base,
      locator,
      changeType: same ? LegalChangeType.UNCHANGED : LegalChangeType.MODIFIED,
      beforeText: fromArticle.text,
      afterText: toArticle.text,
    });
  }

  return { ok: true, diffs };
}

function contentHash(document: StoredKnowledgeDocument): string | null {
  const hash = document.provenance?.contentSha256?.trim().toLowerCase();
  return hash && hash.length > 0 ? hash : null;
}

function printedRole(article: KnowledgeArticle): PrintedRole {
  const number = (article.articleNumber ?? "").trim();
  const title = (article.title ?? "").trim();
  if (ARTICLE_HEADING.test(title)) {
    return "article";
  }
  if (number.includes(".") && title === number) {
    return "paragraph";
  }
  return "provision";
}

function internalKey(article: KnowledgeArticle): string | null {
  const number = article.articleNumber?.trim() ?? "";
  if (!number) {
    return null;
  }
  return `${printedRole(article)}\0${number}`;
}

function indexArticles(
  articles: readonly KnowledgeArticle[],
): Map<string, KnowledgeArticle> {
  const rows = new Map<string, KnowledgeArticle>();
  const ordered = [...articles].sort((a, b) => a.order - b.order);
  for (const article of ordered) {
    const key = internalKey(article);
    if (!key || rows.has(key)) {
      continue;
    }
    rows.set(key, article);
  }
  return rows;
}

function collidingPrintedNumbers(
  fromRows: Map<string, KnowledgeArticle>,
  toRows: Map<string, KnowledgeArticle>,
): Set<string> {
  const roles = new Map<string, Set<PrintedRole>>();
  for (const key of [...fromRows.keys(), ...toRows.keys()]) {
    const [role, number] = splitKey(key);
    if (!number) {
      continue;
    }
    const set = roles.get(number) ?? new Set<PrintedRole>();
    set.add(role);
    roles.set(number, set);
  }
  const colliding = new Set<string>();
  for (const [number, set] of roles) {
    if (set.size > 1) {
      colliding.add(number);
    }
  }
  return colliding;
}

function splitKey(key: string): [PrintedRole, string] {
  const split = key.indexOf("\0");
  const role = key.slice(0, split) as PrintedRole;
  const number = key.slice(split + 1);
  return [role, number];
}

function publicLocator(key: string, prefixNumbers: Set<string>): string {
  const [role, number] = splitKey(key);
  if (prefixNumbers.has(number) && role !== "provision") {
    return `${role}:${number}`;
  }
  return number;
}
