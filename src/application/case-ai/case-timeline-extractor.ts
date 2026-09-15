import type { CaseEvidenceRecord } from "@/domain/entities/case-file";
import {
  CaseTimelineConfidence,
  type CreateCaseTimelineEntryInput,
} from "@/domain/entities/case-timeline";

/**
 * Sprint 13 Phase 9 — purely deterministic (regex-based) date/event
 * detection over already-authorized CaseEvidence.extractedText. No LLM
 * involvement anywhere in this module: every produced entry's rawDateText
 * and sourceExcerpt are exact substrings of the source text, so a date can
 * never be invented, only found-or-not-found.
 */

const MAX_ENTRIES_PER_DOCUMENT = 50;
const EXCERPT_RADIUS = 90;
const EVENT_TEXT_MAX = 240;

/** "2024 оны 5 дугаар сарын 3", "2024 оны 05 сарын 3-ны өдөр", etc. */
const MN_FULL_DATE =
  /(\d{4})\s*оны?\s*(\d{1,2})\s*(?:дүгээр|дугаар)?\s*сарын\s*(\d{1,2})(?:[-\s]*(?:ны|ний)?\s*өдөр)?/gu;

/**
 * ISO-ish "2024-05-03", "2024.05.03", "2024/05/03". Boundaries use
 * \p{L}/\p{N} lookaround rather than \b — JS's \b is ASCII-only ([A-Za-z0-9_]),
 * so a plain \b would silently fail to bound a match against adjoining
 * Cyrillic text (Mongolian letters aren't "word" characters to \b).
 */
const ISO_DATE = /(?<![\p{L}\p{N}])(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})(?![\p{L}\p{N}])/gu;

/** Bare year mention with no day/month — "2024 онд" — kept as UNCERTAIN. */
const BARE_YEAR = /(?<![\p{L}\p{N}])(\d{4})\s*онд(?![\p{L}\p{N}])/gu;

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(text.length, index + length + EXCERPT_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function eventTextAround(text: string, index: number, length: number): string {
  const sentenceStart = Math.max(
    text.lastIndexOf(".", index),
    text.lastIndexOf("!", index),
    text.lastIndexOf("?", index),
    text.lastIndexOf("\n", index),
    0,
  );
  const sentenceEndCandidates = [".", "!", "?", "\n"]
    .map((mark) => text.indexOf(mark, index + length))
    .filter((pos) => pos !== -1);
  const sentenceEnd =
    sentenceEndCandidates.length > 0
      ? Math.min(...sentenceEndCandidates) + 1
      : text.length;
  const start = sentenceStart === 0 ? 0 : sentenceStart + 1;
  const raw = text.slice(start, sentenceEnd).trim();
  return raw.length > EVENT_TEXT_MAX ? `${raw.slice(0, EVENT_TEXT_MAX).trimEnd()}…` : raw;
}

type Candidate = {
  index: number;
  length: number;
  rawDateText: string;
  parsedDate: Date | null;
  confidence: CaseTimelineConfidence;
};

function findCandidates(text: string): Candidate[] {
  const candidates: Candidate[] = [];
  const claimed: Array<[number, number]> = [];

  const overlapsClaimed = (start: number, end: number) =>
    claimed.some(([s, e]) => start < e && end > s);

  for (const match of text.matchAll(MN_FULL_DATE)) {
    const [full, y, m, d] = match;
    if (!full || !y || !m || !d || match.index === undefined) continue;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    const start = match.index;
    const end = start + full.length;
    if (overlapsClaimed(start, end)) continue;
    claimed.push([start, end]);
    candidates.push({
      index: start,
      length: full.length,
      rawDateText: full.trim(),
      parsedDate: isValidCalendarDate(year, month, day)
        ? new Date(Date.UTC(year, month - 1, day))
        : null,
      confidence: isValidCalendarDate(year, month, day)
        ? CaseTimelineConfidence.HIGH
        : CaseTimelineConfidence.UNCERTAIN,
    });
  }

  for (const match of text.matchAll(ISO_DATE)) {
    const [full, y, m, d] = match;
    if (!full || !y || !m || !d || match.index === undefined) continue;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    const start = match.index;
    const end = start + full.length;
    if (overlapsClaimed(start, end)) continue;
    claimed.push([start, end]);
    const valid = isValidCalendarDate(year, month, day);
    candidates.push({
      index: start,
      length: full.length,
      rawDateText: full,
      parsedDate: valid ? new Date(Date.UTC(year, month - 1, day)) : null,
      confidence: valid ? CaseTimelineConfidence.MEDIUM : CaseTimelineConfidence.UNCERTAIN,
    });
  }

  for (const match of text.matchAll(BARE_YEAR)) {
    const [full, y] = match;
    if (!full || !y || match.index === undefined) continue;
    const start = match.index;
    const end = start + full.length;
    if (overlapsClaimed(start, end)) continue;
    claimed.push([start, end]);
    candidates.push({
      index: start,
      length: full.length,
      rawDateText: full.trim(),
      parsedDate: null,
      confidence: CaseTimelineConfidence.UNCERTAIN,
    });
  }

  candidates.sort((a, b) => a.index - b.index);
  return candidates.slice(0, MAX_ENTRIES_PER_DOCUMENT);
}

export function extractCaseTimelineEntries(
  evidence: readonly CaseEvidenceRecord[],
): CreateCaseTimelineEntryInput[] {
  const entries: CreateCaseTimelineEntryInput[] = [];
  for (const item of evidence) {
    if (item.extractStatus !== "OK" || !item.extractedText.trim()) continue;
    const candidates = findCandidates(item.extractedText);
    for (const candidate of candidates) {
      entries.push({
        caseFileId: item.caseFileId,
        caseEvidenceId: item.id,
        rawDateText: candidate.rawDateText,
        parsedDate: candidate.parsedDate,
        eventText: eventTextAround(item.extractedText, candidate.index, candidate.length),
        sourceExcerpt: excerptAround(item.extractedText, candidate.index, candidate.length),
        confidence: candidate.confidence,
      });
    }
  }
  return entries;
}
