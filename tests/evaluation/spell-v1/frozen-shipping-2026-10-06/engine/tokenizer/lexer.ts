import type { CaseShape, Token, TokenKind } from "../core/types";
import { hasCyrillic, hasLatin } from "./normalize";

/**
 * Case-aware, offset-preserving lexer.
 *
 * Splits text into SPACE / PUNCT / NUMBER / URL / EMAIL / WORD / ACRONYM /
 * LATIN / MIXED tokens. Nothing is discarded or rewritten: concatenating
 * `token.text` over the result reproduces the input exactly.
 */

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"«»]+/iy;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/y;
// Bare domain-like identifiers, e.g. TORE.MN, tore.mn/path. Needs a Latin letter.
const DOMAIN_RE = /[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)+(?:\/[^\s<>"«»]*)?/y;
// 2026, 2026.10.05, 12:30, 3,5, №12, 10-р, 5-ны, 2.1
const NUMBER_RE =
  /№?\d+(?:[.,:/]\d+)*(?:-[а-яөүёА-ЯӨҮЁ]{1,4}(?![\p{L}\p{N}]))?/uy;
const WORDLIKE_RE = /[\p{L}\p{M}][\p{L}\p{M}\p{N}'’ʼ-]*/uy;
const SPACE_RE = /\s+/y;

const SENTENCE_END = /[.!?…]/u;

function clean(chunk: string): string {
  return chunk.replace(/[-'’ʼ]+$/u, "");
}

function caseShapeOf(text: string): CaseShape {
  const letters = Array.from(text).filter((c) => /\p{L}/u.test(c));
  if (letters.length === 0) return "NONE";
  const upper = letters.filter((c) => c !== c.toLowerCase()).length;
  if (upper === 0) return "LOWER";
  if (upper === letters.length) {
    return letters.length === 1 ? "TITLE" : "UPPER";
  }
  const first = letters[0]!;
  const firstUpper = first !== first.toLowerCase();
  const restLower = letters.slice(1).every((c) => c === c.toLowerCase());
  if (firstUpper && restLower) return "TITLE";
  return "MIXED";
}

type Raw = { kind: TokenKind; text: string; start: number };

/** Classify a letters/digits/hyphen chunk. */
function classifyChunk(chunk: string): TokenKind {
  const cyr = hasCyrillic(chunk);
  const lat = hasLatin(chunk);
  const digits = /\d/u.test(chunk);
  if (cyr && (lat || digits)) return "MIXED";
  if (lat && digits) return "MIXED";
  if (lat) return "LATIN";
  return caseShapeOf(chunk) === "UPPER" && chunk.replace(/[^\p{L}]/gu, "").length >= 2
    ? "ACRONYM"
    : "WORD";
}

export function lex(text: string): Token[] {
  const raws: Raw[] = [];
  let i = 0;
  const n = text.length;

  const tryRe = (re: RegExp, kind: TokenKind): boolean => {
    re.lastIndex = i;
    const m = re.exec(text);
    if (!m || m.index !== i || m[0].length === 0) return false;
    // Strip trailing sentence punctuation from URLs/emails.
    let matched = m[0];
    if (kind === "URL" || kind === "EMAIL") {
      matched = matched.replace(/[.,;:!?)\]]+$/u, "");
    }
    raws.push({ kind, text: matched, start: i });
    i += matched.length;
    return true;
  };

  while (i < n) {
    const ch = text[i]!;
    if (/\s/u.test(ch)) {
      SPACE_RE.lastIndex = i;
      const m = SPACE_RE.exec(text)!;
      raws.push({ kind: "SPACE", text: m[0], start: i });
      i += m[0].length;
      continue;
    }
    if (tryRe(URL_RE, "URL")) continue;
    if (/[A-Za-z0-9]/u.test(ch) && tryRe(EMAIL_RE, "EMAIL")) continue;
    if (/[A-Za-z]/u.test(ch)) {
      DOMAIN_RE.lastIndex = i;
      const m = DOMAIN_RE.exec(text);
      // Require a plausible TLD (2+ letters) so "e.g." is not a URL.
      if (m && m.index === i && /\.[A-Za-z]{2,}(?:\/|$)/u.test(m[0])) {
        const cleaned = m[0].replace(/[.,;:!?)\]]+$/u, "");
        raws.push({ kind: "URL", text: cleaned, start: i });
        i += cleaned.length;
        continue;
      }
    }
    if ((/\d/u.test(ch) || ch === "№") && tryRe(NUMBER_RE, "NUMBER")) {
      // A number glued to letters ("2026он") is a MIXED chunk, not a number.
      const last = raws[raws.length - 1]!;
      const nextCh = text[i];
      if (nextCh && /[\p{L}]/u.test(nextCh) && !/-/u.test(last.text)) {
        raws.pop();
        i = last.start;
        // fall through to wordlike handling below
      } else {
        continue;
      }
    }
    WORDLIKE_RE.lastIndex = i;
    const wm = WORDLIKE_RE.exec(text);
    if (wm && wm.index === i) {
      const chunk = clean(wm[0]);
      const consumed = chunk.length === 0 ? wm[0].length : chunk.length;
      const kind = classifyChunk(chunk || wm[0]);
      // Acronym + hyphenated suffix: НҮБ-ын, УИХ-ын (kept as ONE token).
      if (/^[A-ZА-ЯӨҮЁ]{2,}-[а-яөүё]{1,4}$/u.test(chunk)) {
        raws.push({ kind: "ACRONYM", text: chunk, start: i });
        i += consumed;
        continue;
      }
      // Hyphenated compounds are split into parts so each is judged alone.
      if (chunk.includes("-") && kind !== "MIXED" && kind !== "LATIN") {
        let offset = i;
        for (const part of chunk.split("-")) {
          if (part.length > 0) {
            raws.push({ kind: classifyChunk(part), text: part, start: offset });
          }
          offset += part.length;
          if (offset < i + chunk.length) {
            raws.push({ kind: "PUNCT", text: "-", start: offset });
            offset += 1;
          }
        }
        i += consumed;
        continue;
      }
      raws.push({ kind, text: chunk || wm[0], start: i });
      i += consumed;
      continue;
    }
    // Any other single character (punctuation, symbols, emoji code point).
    const cp = text.codePointAt(i)!;
    const len = cp > 0xffff ? 2 : 1;
    raws.push({ kind: "PUNCT", text: text.slice(i, i + len), start: i });
    i += len;
  }

  // Second pass: case shape + sentence-initial flag.
  const tokens: Token[] = [];
  let sentenceStart = true;
  for (const raw of raws) {
    const isWordish =
      raw.kind === "WORD" ||
      raw.kind === "ACRONYM" ||
      raw.kind === "LATIN" ||
      raw.kind === "MIXED";
    tokens.push({
      kind: raw.kind,
      text: raw.text,
      range: { start: raw.start, end: raw.start + raw.text.length },
      caseShape: isWordish ? caseShapeOf(raw.text) : "NONE",
      sentenceInitial: isWordish && sentenceStart,
    });
    if (raw.kind === "SPACE") {
      if (/\n/u.test(raw.text)) sentenceStart = true;
    } else if (raw.kind === "PUNCT") {
      if (SENTENCE_END.test(raw.text)) sentenceStart = true;
      // opening quotes/brackets/dashes keep the current state
    } else if (raw.kind === "NUMBER") {
      sentenceStart = false;
    } else {
      sentenceStart = false;
    }
  }
  return tokens;
}
