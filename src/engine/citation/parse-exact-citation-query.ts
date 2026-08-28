import { stripLegalTemporalQueryPhrases } from "@/engine/knowledge/temporal/parse-legal-temporal-query-intent";

import { resolveCanonicalLawIdentity } from "./canonical-law-titles";
import { parseDottedPinpoint } from "./pinpoint";

export type DetectedExactCitation = {
  /** Phrase sent to the legal-data-engine as `citations[].query`. */
  query: string;
  titleHint: string;
  article: string;
  paragraph: string | null;
  locator: string;
  dottedArticle: boolean;
  preferredLawIds: string[];
};

/**
 * Detects a deterministic Mongolian statute pinpoint in user text.
 *
 * Aligns with the legal-data-engine exact-citation parser
 * (`parseExactCitationQuery`): title + «хуулийн» + article, optionally
 * dotted paragraph and «зүйл». Not NLP. Requires a law title and an
 * article number — a bare «17.1» is not enough.
 */
export function detectExactCitation(message: string): DetectedExactCitation | null {
  const normalized = stripLegalTemporalQueryPhrases(
    message.replace(/\s+/g, " ").trim(),
  );
  if (!normalized) return null;

  return matchStatuteArticle(normalized) ?? matchDottedStatute(normalized);
}

function matchStatuteArticle(text: string): DetectedExactCitation | null {
  // Full Mongolian pinpoint: `хуулийн 17 дугаар зүйлийн 1 дэх хэсэг`.
  const matches = text.matchAll(
    /([\p{L}][\p{L}\p{N}\s]{0,100}?)\s+хуулийн\s+(\d+)\s*(?:-\s*р|дүгээр|дугаар)?\s*зүй(?:л(?:ийн|д|ээс)?|лийн)\s*(?:(\d+)\s*дэх\s*хэсэг|(?:[\u2013\u2014-]\s*)?(\d+)\s*дэх\s*заалт)?/giu,
  );

  let last: RegExpMatchArray | undefined;
  for (const match of matches) last = match;
  if (!last?.[1] || !last[2]) return null;

  const titleHint = normalizeTitleHint(last[1]);
  if (!titleHint || isInvalidTitleHint(titleHint)) return null;

  return toDetected(
    last[0],
    last[1],
    last[2],
    last[3] ?? last[4] ?? null,
    false,
  );
}

function matchDottedStatute(text: string): DetectedExactCitation | null {
  const matches = [
    ...text.matchAll(
      /([\p{L}][\p{L}\p{N}\s]{0,100}?)\s+хуулийн\s+(\d+)\s*\.\s*(\d+)/giu,
    ),
  ];

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    if (!match?.[1] || !match[2] || !match[3]) {
      continue;
    }

    const titleHint = normalizeTitleHint(match[1]);
    if (!titleHint || isInvalidTitleHint(titleHint)) {
      continue;
    }

    const identity = resolveCanonicalLawIdentity({ titleHint });
    const article = `${Number(match[2])}.${Number(match[3])}`;
    return {
      query: match[0].replace(/\s+/g, " ").trim(),
      titleHint,
      article,
      paragraph: null,
      locator: `art-${article}`,
      dottedArticle: true,
      preferredLawIds: identity.preferredLawIds,
    };
  }

  return null;
}

function normalizeTitleHint(rawTitle: string): string {
  return rawTitle
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+хуулийн$/iu, "");
}

function isInvalidTitleHint(titleHint: string): boolean {
  return /(?:^|\s)(?:зүйл|дүгээр|дугаар)(?:\s|$)/iu.test(titleHint);
}

function toDetected(
  query: string,
  rawTitle: string,
  article: string,
  paragraph: string | null,
  dottedArticle: boolean,
): DetectedExactCitation | null {
  const titleHint = normalizeTitleHint(rawTitle);
  if (titleHint.length < 2) return null;

  const pinpoint = parseDottedPinpoint(article);
  if (!pinpoint?.article) return null;

  const normalizedArticle = paragraph ? String(Number(article)) : pinpoint.article;
  const identity = resolveCanonicalLawIdentity({ titleHint });
  return {
    query: query.replace(/\s+/g, " ").trim(),
    titleHint,
    article: normalizedArticle,
    paragraph,
    locator: paragraph
      ? `art-${normalizedArticle}/p-${paragraph}`
      : `art-${pinpoint.article}`,
    dottedArticle,
    preferredLawIds: identity.preferredLawIds,
  };
}
