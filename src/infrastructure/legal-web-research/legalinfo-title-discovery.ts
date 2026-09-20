/**
 * Discovers a law's official LegalInfo.mn detail page by title when its
 * lawId is not already known (i.e. not in canonical-law-titles.ts and not
 * already present in the local corpus).
 *
 * Uses ONLY the same official, captcha-free AJAX list endpoint the batch
 * discovery/ingestion pipeline already uses (`LegalInfoListClient` — see
 * legalinfo-list-client.ts). Confirmed live: the site's own "А Б В..."
 * alphabet navigation narrows a full category (956 laws) down to the
 * handful starting with one letter via a `useg` filter param, which is
 * what keeps this bounded to a few pages instead of scanning everything.
 *
 * Does NOT use the site's full-text search (`/mn/esearch`) — that page is
 * captcha-gated (confirmed live via a `/api/captcha` request on load) and
 * is not something this system should try to automate around.
 *
 * Matching (post-audit fix): a loose "every word of the hint appears
 * somewhere in the title" check is NOT sufficient to identify a document —
 * confirmed live that it also matches a law's own amendment, repeal-
 * declaration, and enactment-procedure satellite acts (e.g. "Төрийн
 * албаны тухай" matches "ТӨРИЙН АЛБАНЫ ТУХАЙ" the actual law, but also
 * "...ХУУЛИЙГ ДАГАЖ МӨРДӨХ ЖУРМЫН ТУХАЙ" and "...ХҮЧИНГҮЙ БОЛСОНД ТООЦОХ
 * ТУХАЙ", which are different documents). Acceptance now requires the
 * candidate's title to be canonically EQUAL to the citation's title hint
 * after normalizing case suffixes and cosmetic annotations — see
 * `canonicalizeLawTitle`. If more than one candidate is canonically equal,
 * or none is, this returns `not_found`/`ambiguous` rather than guessing.
 */
import {
  LegalInfoListClient,
  type LegalInfoListItem,
} from "@/engine/knowledge/discovery/legalinfo-list-client";
import { LEGALINFO_STATUTE_CATEGORY_ID } from "@/engine/knowledge/crawler/legalinfo-url";
import type { FetchLike } from "@/engine/knowledge/crawler/http-knowledge-crawler";

export type DiscoveredLegalInfoLaw = {
  lawId: string;
  officialUrl: string;
  title: string;
};

export type LegalInfoTitleDiscoveryResult =
  | { kind: "found"; law: DiscoveredLegalInfoLaw }
  | { kind: "not_found" }
  | { kind: "ambiguous"; candidates: readonly DiscoveredLegalInfoLaw[] };

export type LegalInfoTitleDiscoveryOptions = {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** Bounds worst-case latency/requests for one discovery attempt. */
  maxPages?: number;
  categoryId?: string;
};

const DEFAULT_MAX_PAGES = 4;

/** First letter, Mongolian-Cyrillic-aware, uppercased — matches the site's own `useg` filter values. */
function firstAlphabetLetter(titleHint: string): string | null {
  const trimmed = titleHint.trim();
  const match = trimmed.match(/[A-Za-zА-Яа-яӨөҮүЁё]/);
  return match ? match[0].toLocaleUpperCase("mn-MN") : null;
}

/** Trailing tokens that are cosmetic/grammatical noise on either a citation's title hint or an official title. */
const LAW_SUFFIX_WORD = /^(?:хууль|хуулийн|хуулийг|хуулиар|хуультай|тухай)$/u;

/**
 * Normalizes a law title (or a citation's title hint) to a stable identity
 * key: lowercased, cosmetic bracket annotations stripped (e.g. the
 * "/Шинэчилсэн найруулга/" revision note legalinfo.mn appends to many
 * titles), then trailing "хууль"/"тухай"-family tokens stripped
 * iteratively so "X тухай", "X хууль", "X тухай хууль", and a citation's
 * "X хуулийн" all normalize to the same "x".
 *
 * Deliberately does NOT strip or ignore anything else — a genuinely
 * different law (even one sharing a title prefix, like an amendment or
 * repeal-declaration act) normalizes to a different, longer string and
 * will not compare equal. That asymmetry is the whole point: false
 * negatives (a real match rejected) are safe and fall through to an
 * honest refusal; false positives (the wrong law accepted) are not.
 */
export function canonicalizeLawTitle(value: string): string {
  let normalized = value
    .toLocaleLowerCase("mn-MN")
    .replace(/\/[^/]*\/\s*$/u, "")
    .replace(/[«»"'’“”,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (;;) {
    const words = normalized.split(" ");
    const last = words[words.length - 1];
    if (words.length <= 1 || !last || !LAW_SUFFIX_WORD.test(last)) {
      break;
    }
    words.pop();
    normalized = words.join(" ");
  }
  return normalized;
}

/**
 * Exact document-identity match — see the module and canonicalizeLawTitle
 * doc comments for why this replaced a loose substring check. Both sides
 * are canonicalized the same way, so "Төрийн албаны тухай хуулийн" (a raw
 * citation title lead-in) equals "ТӨРИЙН АЛБАНЫ ТУХАЙ /Шинэчилсэн
 * найруулга/" (an official title) but not any of its satellite acts.
 */
export function canonicalLawTitlesMatch(title: string, titleHint: string): boolean {
  const a = canonicalizeLawTitle(title);
  const b = canonicalizeLawTitle(titleHint);
  return a.length > 0 && a === b;
}

/**
 * Scans the official statute category, letter-filtered, for a law whose
 * title is canonically identical to `titleHint`. Never throws for a
 * genuine miss — network/timeout/parse failure and "hint has no usable
 * leading letter" both resolve to `not_found`, exactly like finding zero
 * candidates. Scans every page up to `maxPages` (or until the site
 * reports no more pages) rather than stopping at the first hit, so a
 * second, ambiguous candidate elsewhere in the category is still found
 * and correctly turns the result into `ambiguous` rather than silently
 * picking the first page's hit.
 */
export async function discoverLegalInfoLawByTitle(
  titleHint: string,
  options: LegalInfoTitleDiscoveryOptions = {},
): Promise<LegalInfoTitleDiscoveryResult> {
  const letter = firstAlphabetLetter(titleHint);
  if (!letter) {
    return { kind: "not_found" };
  }

  const client = new LegalInfoListClient({
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
  const categoryId = options.categoryId ?? LEGALINFO_STATUTE_CATEGORY_ID;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

  const matches: DiscoveredLegalInfoLaw[] = [];
  const seenLawIds = new Set<string>();

  try {
    let page = 1;
    let totalPages = maxPages;
    while (page <= Math.min(totalPages, maxPages)) {
      const result = await client.fetchPage(categoryId, page, letter);
      totalPages = result.totalPages;
      for (const item of result.items) {
        if (
          item.title &&
          canonicalLawTitlesMatch(item.title, titleHint) &&
          !seenLawIds.has(item.lawId)
        ) {
          seenLawIds.add(item.lawId);
          matches.push({ lawId: item.lawId, officialUrl: item.officialUrl, title: item.title });
        }
      }
      page += 1;
    }
  } catch {
    // Network/timeout/parse failure — a genuine miss for this attempt, not
    // a thrown error the caller has to special-case.
    return { kind: "not_found" };
  }

  if (matches.length === 0) {
    return { kind: "not_found" };
  }
  if (matches.length > 1) {
    return { kind: "ambiguous", candidates: matches };
  }
  return { kind: "found", law: matches[0]! };
}
