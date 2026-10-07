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
const CODE_RE = /`[^`\n]+`/y;
const WIN_PATH_RE = /[A-Za-z]:\\[^\s<>"«»|?*]+/y;
const UNIX_PATH_RE = /(?:~|\.{1,2})?(?:\/[\w.@+-]+){2,}\/?/y;
const HASHTAG_RE = /#[\p{L}\p{N}_]+/uy;
const MENTION_RE = /@[\p{L}\p{N}_][\p{L}\p{N}_.]*/uy;
// Mongolian numbers: +976 9911 2233 / 976-99112233 / 9911 2233 (8 digits starting 5-9, optionally split 4+4)
const PHONE_RE = /(?:\+976[\s-]?)?[5-9]\d{3}[\s-]?\d{4}(?![\d.,:\/]|-\d)|\+976[\s-]?\d{8}/y;

const SENTENCE_END = /[.!?…]/u;

function clean(chunk: string): string {
  return chunk.replace(/[-'’ʼ]+$/u, "");
}

function caseShapeOf(text: string): CaseShape {
  // Hot path (once per chunk, twice per word before): basic Cyrillic + Ө/Ү are decided from the code unit with no allocation or regex; any other
  // character takes the original \p{L} / toLowerCase path. Behaviour is identical to the frozen Phase-2 version (differentially tested).
  let letters = 0;
  let upper = 0;
  let firstUpper = false;
  let restLower = true;
  for (let k = 0; k < text.length; k += 1) {
    let code = text.charCodeAt(k);
    let c: string | undefined;
    let isLetter: boolean;
    let isUp: boolean;
    if ((code >= 0x410 && code <= 0x44f) || code === 0x401 || code === 0x451 || code === 0x4ae || code === 0x4af || code === 0x4e8 || code === 0x4e9) {
      isLetter = true;
      isUp = code <= 0x42f || code === 0x401 || code === 0x4ae || code === 0x4e8;
    } else {
      // full code point (surrogate pairs) via the original path
      const cp = text.codePointAt(k)!;
      c = String.fromCodePoint(cp);
      if (cp > 0xffff) k += 1;
      code = cp;
      isLetter = /\p{L}/u.test(c);
      isUp = isLetter && c !== c.toLowerCase();
    }
    if (!isLetter) continue;
    if (letters === 0) firstUpper = isUp;
    else if (isUp) restLower = false;
    if (isUp) upper += 1;
    letters += 1;
  }
  if (letters === 0) return "NONE";
  if (upper === 0) return "LOWER";
  if (upper === letters) return letters === 1 ? "TITLE" : "UPPER";
  return firstUpper && restLower ? "TITLE" : "MIXED";
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
    // Cyrillic start (the overwhelmingly common case): none of the URL / email / path / hashtag / mention / phone / number / code / hyphen-suffix
    // patterns can begin here, so skip straight to the INITIAL and word-like handling.
    const cp0 = text.charCodeAt(i);
    const cyrStart = cp0 >= 0x400 && cp0 <= 0x4ff;
    if (!cyrStart && /\s/u.test(ch)) {
      SPACE_RE.lastIndex = i;
      const m = SPACE_RE.exec(text)!;
      raws.push({ kind: "SPACE", text: m[0], start: i });
      i += m[0].length;
      continue;
    }
    if (!cyrStart) {
      if (tryRe(URL_RE, "URL")) continue;
      if (ch === "`" && tryRe(CODE_RE, "CODE")) continue;
      if (/[A-Za-z]/u.test(ch) && text[i + 1] === ":" && tryRe(WIN_PATH_RE, "PATH")) continue;
      if ((ch === "/" || ch === "~" || ch === ".") && tryRe(UNIX_PATH_RE, "PATH")) continue;
      if (ch === "#" && tryRe(HASHTAG_RE, "HASHTAG")) continue;
      if (ch === "@" && tryRe(MENTION_RE, "MENTION")) continue;
      if ((ch === "+" || /\d/u.test(ch)) && (i === 0 || !/[\p{L}\p{N}]/u.test(text[i - 1]!)) && tryRe(PHONE_RE, "PHONE")) continue;
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
      // «хурим»-ыг, ”-ын, 2012-д : a hyphenated inflectional suffix after a closing quote/bracket/digit.
      if (ch === "-" && raws.length > 0) {
        const before = text[i - 1] ?? "";
        if (/["”»’)\]\d]/u.test(before)) {
          const m = /^-([а-яөүё]{1,5})(?![\p{L}\p{N}])/u.exec(text.slice(i, i + 7));
          if (m) {
            raws.push({ kind: "PUNCT", text: "-", start: i });
            raws.push({ kind: "SUFFIX", text: m[1]!, start: i + 1 });
            i += 1 + m[1]!.length;
            continue;
          }
        }
      }
    }
    // A name initial: one capital letter + dot, then a name or another initial (Б.Болд, Ч.Ж.Дорж).
    if (/\p{Lu}/u.test(ch) && text[i + 1] === "." && (/[\p{L}]/u.test(text[i + 2] ?? "") || (text[i + 2] === " " && /\p{Lu}/u.test(text[i + 3] ?? ""))) && (i === 0 || !/[\p{L}\p{N}]/u.test(text[i - 1]!))) {
      raws.push({ kind: "INITIAL", text: ch, start: i });
      i += 1;
      continue;
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
  let prev: Raw | undefined;
  let afterInitialDot = false;
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
      // the name after «Б.» is a name even at the start of a sentence
      sentenceInitial: isWordish && sentenceStart && !afterInitialDot,
    });
    if (raw.kind === "SPACE") {
      if (/\n/u.test(raw.text)) sentenceStart = true;
    } else if (raw.kind === "PUNCT") {
      if (SENTENCE_END.test(raw.text) && prev?.kind !== "INITIAL") sentenceStart = true;
      // opening quotes/brackets/dashes keep the current state
    } else if (raw.kind === "NUMBER") {
      sentenceStart = false;
    } else if (raw.kind === "INITIAL") {
      // keep the state: «Б.Болд» at sentence start stays one name unit
    } else {
      sentenceStart = false;
    }
    if (isWordish) afterInitialDot = false;
    if (raw.kind === "PUNCT" && raw.text === "." && prev?.kind === "INITIAL") afterInitialDot = true;
    prev = raw;
  }
  return tokens;
}
