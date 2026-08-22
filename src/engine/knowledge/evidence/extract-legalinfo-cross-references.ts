/**
 * Deterministic LegalInfo cross-reference harvest.
 *
 * Proves only that archived HTML contains an explicit detail URL to another
 * LegalInfo lawId. Does not classify AMENDS, REPEALS, SUPERSEDES, or force.
 * Does not invent targets from titles, article numbers, dates, or law names.
 */

import {
  isLegalInfoHostname,
  legalInfoDetailUrl,
} from "../crawler/legalinfo-url";

export const LegalInfoCrossReferenceKind = {
  CITES: "CITES",
} as const;

export type LegalInfoCrossReference = {
  relationType: "CITES";
  sourceLawId: string;
  targetLawId: string;
  sourceUrl: string;
  targetUrl: string;
  evidenceText: string;
  evidenceKind: "EXPLICIT_LEGALINFO_LAW_LINK";
};

export type ExtractLegalInfoCrossReferencesInput = {
  sourceLawId: string;
  sourceUrl: string;
  rawHtml: string;
};

const EVIDENCE_RADIUS = 80;
const EVIDENCE_SEPARATOR = "\n";

/**
 * href / src attribute, or a bare LegalInfo detail URL in HTML.
 * Path must be `/{mn|en}/detail` with a numeric `lawId` query param.
 */
const ATTRIBUTE_HREF =
  /\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi;
const BARE_DETAIL_URL =
  /(?:https?:\/\/(?:www\.)?legalinfo\.mn)?\/(?:mn|en)\/detail\?[^"'<>\s]*/gi;

export function extractLegalInfoCrossReferences(
  input: ExtractLegalInfoCrossReferencesInput,
): LegalInfoCrossReference[] {
  const sourceLawId = input.sourceLawId.trim();
  const sourceUrl = input.sourceUrl.trim();
  const rawHtml = input.rawHtml;
  if (!sourceLawId || !sourceUrl || !rawHtml) {
    return [];
  }

  const grouped = new Map<string, Set<string>>();

  for (const hit of collectDetailHits(rawHtml)) {
    if (hit.lawId === sourceLawId) {
      continue;
    }
    const evidence = evidenceContext(rawHtml, hit.start, hit.end, hit.href);
    const set = grouped.get(hit.lawId) ?? new Set<string>();
    set.add(evidence);
    grouped.set(hit.lawId, set);
  }

  return [...grouped.keys()]
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((targetLawId) => {
      const contexts = [...(grouped.get(targetLawId) ?? [])].sort((a, b) =>
        a.localeCompare(b),
      );
      return {
        relationType: LegalInfoCrossReferenceKind.CITES,
        sourceLawId,
        targetLawId,
        sourceUrl,
        targetUrl: legalInfoDetailUrl(targetLawId),
        evidenceText: contexts.join(EVIDENCE_SEPARATOR),
        evidenceKind: "EXPLICIT_LEGALINFO_LAW_LINK" as const,
      };
    });
}

type DetailHit = {
  lawId: string;
  start: number;
  end: number;
  href: string;
};

function collectDetailHits(html: string): DetailHit[] {
  const hits: DetailHit[] = [];
  const seen = new Set<string>();

  const push = (href: string, start: number, end: number) => {
    if (isInsideIdentityTag(html, start)) {
      return;
    }
    const lawId = lawIdFromDetailHref(href);
    if (!lawId) {
      return;
    }
    const key = `${lawId}:${start}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    hits.push({ lawId, start, end, href });
  };

  ATTRIBUTE_HREF.lastIndex = 0;
  let attr: RegExpExecArray | null;
  while ((attr = ATTRIBUTE_HREF.exec(html))) {
    const href = attr[2] ?? "";
    const start = attr.index;
    push(href, start, start + attr[0].length);
  }

  BARE_DETAIL_URL.lastIndex = 0;
  let bare: RegExpExecArray | null;
  while ((bare = BARE_DETAIL_URL.exec(html))) {
    const href = bare[0] ?? "";
    const start = bare.index;
    push(href, start, start + href.length);
  }

  return hits;
}

function lawIdFromDetailHref(rawHref: string): string | null {
  const decoded = rawHref.replace(/&amp;/gi, "&").trim();
  if (!decoded) {
    return null;
  }
  let parsed: URL;
  try {
    if (/^https?:\/\//i.test(decoded)) {
      parsed = new URL(decoded);
    } else if (decoded.startsWith("//")) {
      parsed = new URL(`https:${decoded}`);
    } else {
      parsed = new URL(decoded, "https://legalinfo.mn/");
    }
  } catch {
    return null;
  }
  if (!isLegalInfoHostname(parsed.hostname)) {
    return null;
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  if (!/^\/(mn|en)\/detail$/i.test(path)) {
    return null;
  }
  const lawId = parsed.searchParams.get("lawId")?.trim() ?? "";
  if (!/^\d+$/.test(lawId)) {
    return null;
  }
  return lawId;
}

/**
 * Canonical / Open Graph URLs identify this page; they are not citations.
 */
function isInsideIdentityTag(html: string, index: number): boolean {
  const from = Math.max(0, index - 300);
  const prefix = html.slice(from, index);
  const tagStart = prefix.lastIndexOf("<");
  if (tagStart < 0) {
    return false;
  }
  const tag = prefix.slice(tagStart).toLowerCase();
  if (/^<(?:link|meta)\b/.test(tag) && !tag.includes(">")) {
    return true;
  }
  return false;
}

function evidenceContext(
  html: string,
  start: number,
  end: number,
  href: string,
): string {
  const from = Math.max(0, start - EVIDENCE_RADIUS);
  const to = Math.min(html.length, end + EVIDENCE_RADIUS);
  const windowText = html
    .slice(from, to)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  const link = href.replace(/&amp;/gi, "&").trim();
  return [windowText, link].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
