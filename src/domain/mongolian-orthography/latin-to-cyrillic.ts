/**
 * Informal Mongolian Latin → Cyrillic (chat/QWERTY style).
 * Longest digraph match; ö/ü and o'/u' map to ө/ү.
 * Ambiguous o/u vs ө/ү defaults to о/у — user reviews each suggestion.
 */

const DIGRAPHS: ReadonlyArray<readonly [string, string]> = [
  ["shh", "щ"],
  ["sch", "щ"],
  ["sh", "ш"],
  ["ch", "ч"],
  ["ts", "ц"],
  ["kh", "х"],
  ["zh", "ж"],
  ["yu", "ю"],
  ["ya", "я"],
  ["yo", "ё"],
  ["ye", "е"],
  ["ii", "ий"],
  ["o'", "ө"],
  ["u'", "ү"],
  ["ö", "ө"],
  ["ü", "ү"],
];

const SINGLES: Record<string, string> = {
  a: "а",
  b: "б",
  v: "в",
  g: "г",
  d: "д",
  e: "э",
  j: "ж",
  z: "з",
  i: "и",
  y: "й",
  k: "к",
  l: "л",
  m: "м",
  n: "н",
  o: "о",
  p: "п",
  r: "р",
  s: "с",
  t: "т",
  u: "у",
  f: "ф",
  h: "х",
  c: "с",
  w: "в",
  x: "кс",
  q: "к",
  "'": "ь",
};

const LATIN_WORD_RE =
  /[A-Za-zÖÜöü][A-Za-zÖÜöü']*(?:-[A-Za-zÖÜöü']+)*/gu;

/** Tokens that are almost certainly not Mongolian Latin spellings. */
const SKIP_LATIN = new Set([
  "ai",
  "api",
  "id",
  "url",
  "http",
  "https",
  "www",
  "pdf",
  "doc",
  "ok",
  "vs",
  "etc",
  "tore",
  "legal",
  "info",
]);

export type LatinToCyrillicSuggestion = {
  sourceWord: string;
  suggestedWord: string;
  label: string;
};

export function isMostlyLatinToken(word: string): boolean {
  if (!word) return false;
  if (/[А-Яа-яӨөҮүЁё]/.test(word)) return false;
  return /[A-Za-zÖÜöü]/.test(word);
}

/**
 * Convert one Latin token to Cyrillic. Returns null if unchanged / empty.
 */
export function latinTokenToCyrillic(raw: string): string | null {
  const word = raw.trim();
  if (!word || !isMostlyLatinToken(word)) return null;

  let i = 0;
  let out = "";
  const lower = word.toLowerCase();

  while (i < lower.length) {
    let matched = false;
    for (const [from, to] of DIGRAPHS) {
      if (lower.startsWith(from, i)) {
        out += to;
        i += from.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const ch = lower[i]!;
    const mapped = SINGLES[ch];
    if (mapped) {
      out += mapped;
      i += 1;
      continue;
    }
    // Unknown char — keep as-is (should be rare).
    out += ch;
    i += 1;
  }

  if (!out || out === lower) return null;
  return preserveCapitalization(word, out);
}

function preserveCapitalization(source: string, cyrillic: string): string {
  if (!source[0] || !cyrillic[0]) return cyrillic;
  if (source[0] === source[0].toUpperCase() && /[A-Za-zÖÜöü]/.test(source[0])) {
    return cyrillic[0]!.toUpperCase() + cyrillic.slice(1);
  }
  return cyrillic;
}

export function findLatinToCyrillicSuggestions(
  text: string,
): LatinToCyrillicSuggestion[] {
  const seen = new Set<string>();
  const out: LatinToCyrillicSuggestion[] = [];

  for (const match of text.matchAll(LATIN_WORD_RE)) {
    const sourceWord = match[0] ?? "";
    const key = sourceWord.toLowerCase();
    if (!key || seen.has(key)) continue;
    if (SKIP_LATIN.has(key)) continue;
    if (key.length < 2) continue;

    const suggestedWord = latinTokenToCyrillic(sourceWord);
    if (!suggestedWord || suggestedWord.toLowerCase() === key) continue;

    seen.add(key);
    out.push({
      sourceWord,
      suggestedWord,
      label: `Латин → кирилл: «${sourceWord}» → «${suggestedWord}»`,
    });
  }

  return out;
}
