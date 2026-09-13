import { normalizeMongolianWord } from "@/domain/mongolian-orthography/engine";
import {
  LEGAL_LEXICON_STEMS,
  LEGAL_LEXICON_WORDS,
} from "@/domain/mongolian-orthography/legal-lexicon";
import {
  levenshteinDistance,
  weightedLevenshteinDistance,
} from "@/domain/mongolian-orthography/levenshtein";

/** High-confidence typo to correction pairs (spellcheck.mn-style daily errors). */
const COMMON_TYPO_CORRECTIONS: Record<string, string> = {
  хунэтаи: "хүнтэй",
  хүнэтаи: "хүнтэй",
  хунэтэй: "хүнтэй",
  гэрээсэй: "гэрээсээ",
  өчигдр: "өчигдөр",
  өчигдөөр: "өчигдөр",
  очидөр: "өчигдөр",
  хувцаа: "хувцас",
  хувцаса: "хувцас",
  явч: "яавч",
  явач: "яавч",
};

const CORE_DICTIONARY_WORDS = [
  "би", "чи", "та", "тэр", "энэ", "тэд", "бид", "минь", "чинь", "нь",
  "намайг", "чамайг", "түүнийг", "биднийг", "танайг", "тэднийг",
  "надад", "чамд", "түүнд", "бидэнд", "танд", "тэдэнд",
  "бол", "бай", "байна", "байсан", "байгаа", "байж", "байх", "болно", "болсон",
  "юм", "вэ", "уу", "үү", "бэ", "бүү", "ч", "харин", "гэхдээ", "учир нь",
  "мөн", "эсвэл", "болон", "тэгээд", "дараа", "өмнө", "одоо", "өнөөдөр",
  "өчигдөр", "маргааш", "яагаад", "хэрхэн", "хэн", "юу", "хаана",
  "манай", "гэр", "гэрт", "гэртээ", "гэрээ", "гэрээс", "гэрээсээ", "гэртэй",
  "хүн", "хүний", "хүнд", "хүнтэй", "хүмүүс", "хоёр", "гурав", "дөрөв",
  "анх", "удаа", "анх удаа", "танил", "танилцах", "танилцаж", "танилцсан",
  "хувцас", "солилцох", "солилцож", "солилцсон",
  "явах", "яав", "яавч", "явсан", "ирэх", "ирсэн", "буцаж", "буцах",
  "өглөө", "орой", "шөнө", "өдөр", "цаг", "минут", "жил", "сар",
  "хууль", "хуулийн", "хууль зүй", "эрх", "эрх зүй", "эрх зүйн", "эрхтэй",
  "хэрэг", "хэргийн", "шүүх", "шүүгч", "шийдвэр", "нэхэмжлэл", "хариу",
  "хариуцлага", "гэмт", "гэмт хэрэг", "гэмт үйлдэл", "баримт", "баримт бичиг",
  "нотлох", "нотлох баримт", "гэрч", "мэдүүлэг", "өмгөөлөгч", "хохирогч",
  "шинжилгээ", "шинжлэх", "дүгнэлт", "санал", "гэрээ", "зөрчил", "маргаан",
  "бодлого", "бодох", "бодож", "заалт", "зүйл", "тогтоол", "ял", "торгууль",
  "хийх", "хийж", "хийсэн", "өгөх", "авах", "авч", "авсан", "хэлэх", "хэлсэн",
  "бичих", "бичсэн", "унших", "уншсэн", "сурах", "сурсан", "ажиллах", "ажил",
  "олох", "олсон", "мэдэх", "мэдсэн", "харах", "харсан", "шалгах", "шалгаж",
  "зөв", "буруу", "сайн", "муу", "их", "бага", "шинэ", "хуучин", "том", "жижиг",
  "улс", "хот", "аймаг", "сум", "байр", "зам", "гудамж",
  "нэг", "тав", "зургаа", "долоо", "найм", "ес", "арав",
  "асуудал", "асуулт", "хариулт", "тайлбар", "жишээ", "утга", "үг", "үгс",
  "өгүүлбэр", "бичиг", "ном", "сургалт", "сургууль", "багш", "оюутан",
  "иргэн", "иргэд", "захиргаа", "захиргааны", "иргэний", "эрүүгийн", "мөнгө", "төлбөр",
  "үнэ", "үнэгүй", "төлбөртэй", "багц", "үйлчилгээ", "систем", "програм",
  "мэдээлэл", "технологи", "интернет", "файл", "хавсралт",
  "ширхэг", "хаалт", "хүүхэд", "миний", "эсэх",
] as const;

/** Longest-first suffixes for morphological recognition (not typo correction). */
export const MORPHOLOGICAL_SUFFIXES = [
  "аас", "ээс", "оос", "өөс", "оор", "өөр", "аар", "ээр", "гээр", "руу", "рүү",
  "лаас", "лээс", "гаар", "гээр", "тай", "тэй", "гүй", "гүйгээр", "гүйгээр",
  "ын", "ийн", "ны", "ний", "ыг", "ийг", "г", "г", "д", "т", "нд", "н", "с",
  "сэн", "сон", "сан", "дсон", "той", "ж", "в", "х", "өө", "өх",
  "л", "р", "м", "к", "даа", "дээ", "уу", "үү", "ууд", "үүд",
  // Verb tense/converb suffixes (vowel-harmony variants of each) — closed-
  // class Mongolian verbal morphology, not vocabulary: past perfective
  // (-лаа/-лоо/-лээ/-лөө, e.g. явлаа), non-past (-на/-но/-нэ/-нө, e.g.
  // явна), and the "until" converb (-тал/-тол/-тэл/-төл, e.g. явтал).
  // Without these, a correctly conjugated verb on an already-known stem
  // (e.g. "яв") registered as unknown and risked a wrong fuzzy "fix".
  "лаа", "лоо", "лээ", "лөө", "на", "но", "нэ", "нө", "тал", "тол", "тэл", "төл",
  // Plural for person-nouns after ч/ж/ш/г (e.g. хуульч→хуульчид,
  // шүүгч→шүүгчид) — a standard, closed-class Mongolian plural marker.
  "ид",
  // Habitual/customary aspect (vowel-harmony variants) — e.g. "хамаарах"
  // (to pertain, already known) → "хамаардаг" (customarily pertains).
  // Found missing via the larger evaluation-corpus scan: "хамаардаг",
  // "боддог", "заадаг" all registered unknown and got wrong fuzzy
  // "corrections" despite sitting on already-known stems.
  "даг", "дог", "дэг", "дөг",
] as const;

const DICTIONARY = new Set<string>();
const STEMS = new Set<string>();
/** Fully-formed words only (never a bare morphological stem) — the only
 * pool fuzzy typo-matching may suggest from, so a suggestion is always a
 * real, complete word. */
const COMPLETE_WORDS = new Set<string>();
/** Everyday core vocabulary (as opposed to legal-domain-only terms) — a
 * cheap commonness proxy used to break ties in candidate ranking, since we
 * have no real corpus frequency data. */
const COMMON_WORDS = new Set<string>();

function addWord(raw: string, options?: { common?: boolean }) {
  const normalized = normalizeMongolianWord(raw);
  if (normalized.length >= 2) {
    DICTIONARY.add(normalized);
    COMPLETE_WORDS.add(normalized);
    if (options?.common) COMMON_WORDS.add(normalized);
  }
}

function addStem(raw: string) {
  const normalized = normalizeMongolianWord(raw);
  if (normalized.length >= 2) {
    STEMS.add(normalized);
    DICTIONARY.add(normalized);
  }
}

for (const raw of CORE_DICTIONARY_WORDS) {
  for (const part of raw.split(/\s+/u)) {
    addWord(part, { common: true });
  }
}

for (const word of LEGAL_LEXICON_WORDS) {
  addWord(word);
}

for (const stem of LEGAL_LEXICON_STEMS) {
  addStem(stem);
}

/** Bare verb stems, registered separately from STEM_EXPANSIONS since noun
 * case-suffixes (SHORT_SUFFIXES) don't apply to them — only the verb tense/
 * converb suffixes above do. "явах"/"явсан"/etc. were already known as
 * whole words, but "яв" itself wasn't, so any tense not already spelled
 * out as a complete word (явлаа, явна, явтал, ...) registered as unknown. */
const VERB_STEMS = ["яв"] as const;
for (const stem of VERB_STEMS) {
  addStem(stem);
}

const STEM_EXPANSIONS = [
  "гэр", "хүн", "хувцас", "хууль", "хуульч", "хэрэг", "баримт", "эрх", "асуудал",
  "шүүх", "гэрээ", "ажил", "бичиг", "асуулт", "хариулт", "шинжилгээ",
  "заалт", "зүйл", "хэсэг", "ял", "хариуцлага", "хохирол", "нөхөн",
] as const;

const SHORT_SUFFIXES = [
  "", "т", "д", "аас", "ээс", "руу", "тай", "тэй", "ийн", "ын", "ийг", "ыг",
  "д", "г", "с", "нд",
];

for (const stem of STEM_EXPANSIONS) {
  addStem(stem);
  for (const suffix of SHORT_SUFFIXES) {
    // Mongolian doesn't geminate a stem-final consonant with an
    // identical-starting suffix (e.g. "хэрэг" + "г" is not a word:
    // "хэрэгг"). Skipping this case is what caught it: without the guard,
    // isKnownMongolianWord("хэрэгг") mechanically came back true, and the
    // same non-word was eligible as a fuzzy-match suggestion target.
    if (suffix && stem.endsWith(suffix[0]!)) continue;
    addWord(`${stem}${suffix}`);
  }
}

for (const [, correction] of Object.entries(COMMON_TYPO_CORRECTIONS)) {
  addWord(correction, { common: true });
}

/** Frozen snapshot of every literal DICTIONARY word from hand-curation
 * alone, taken once, right after the last hand-curated initialization
 * loop above and before any generated-vocabulary registration can
 * possibly run. registerGeneratedVocabulary's "did this already exist"
 * check must use this fixed snapshot, not a live DICTIONARY.has() check —
 * otherwise registering the same generated word twice would make the
 * second call think it "already existed" (because the first call just
 * added it) and wrongly treat it as hand-curated, so cleanup would never
 * remove it. */
const HAND_CURATED_WORDS = new Set(DICTIONARY);

const ELISION_VOWELS = ["а", "о", "у", "ы", "э", "и", "ө", "ү"] as const;
const ELISION_CONSONANT_PAIR_RE = /^[бвгджзклмнпрстфхцчшщ]{2}$/u;

/**
 * Many 2+ syllable Mongolian nouns drop the stem's last short vowel when a
 * vowel-initial suffix follows: хэрэг+ээс → хэргээс, асуудал+ыг → асуудлыг,
 * ажил+аас → ажлаас. Plain suffix-stripping leaves a stem ending in two
 * consonants ("хэрг", "асуудл", "ажл") that never matches the dictionary,
 * so those perfectly correct forms looked unknown. This reconstructs the
 * elided vowel — try each vowel between the stem's last two consonants and
 * accept only an unambiguous dictionary hit, so an actual typo (which
 * would need the same lucky, unique reconstruction) is very unlikely to
 * be mistaken for one of these.
 */
function matchesElidedStem(stem: string): boolean {
  if (stem.length < 3) return false;
  const lastTwo = stem.slice(-2);
  if (!ELISION_CONSONANT_PAIR_RE.test(lastTwo)) return false;
  const before = stem.slice(0, -2);

  let found: string | null = null;
  for (const vowel of ELISION_VOWELS) {
    const candidate = `${before}${lastTwo[0]}${vowel}${lastTwo[1]}`;
    if (DICTIONARY.has(candidate) || STEMS.has(candidate)) {
      if (found && found !== candidate) return false;
      found = candidate;
    }
  }
  return found !== null;
}

/**
 * The bare single-letter case markers in MORPHOLOGICAL_SUFFIXES (г/д/т/с/н)
 * stand for dative-locative-type case allomorphs, and Mongolian always
 * picks a *different* allomorph rather than doubling when the stem already
 * ends in that exact consonant (there's no case ending "...тт" or "...гг").
 * So if stripping one of these leaves a stem ending in the same letter,
 * the match is coincidental, not genuine agglutination — "хэрэгг" isn't
 * "хэрэг" + "г", it's "хэрэг" with a stray extra letter.
 *
 * This does NOT apply to longer, independent word-forming suffixes like
 * the comitative "-тай/-тэй" ("has/with"), which freely attach regardless
 * of the stem's final consonant and legitimately do double it: "хаалт"
 * (a lock) + "тай" = "хаалттай" (locked) is a completely ordinary word,
 * not a typo — narrowing this guard to length-1 suffixes is what keeps
 * that case (the original false-positive report) working.
 */
export function boundaryWouldGeminate(stem: string, suffix: string): boolean {
  if (suffix.length !== 1) return false;
  const stemLast = stem[stem.length - 1];
  return stemLast !== undefined && stemLast === suffix;
}

function matchesMorphology(word: string): boolean {
  if (DICTIONARY.has(word) || STEMS.has(word)) {
    return true;
  }

  for (const suffix of MORPHOLOGICAL_SUFFIXES) {
    if (!word.endsWith(suffix) || word.length <= suffix.length + 1) {
      continue;
    }
    const stem = word.slice(0, -suffix.length);
    if (boundaryWouldGeminate(stem, suffix)) {
      continue;
    }
    if (DICTIONARY.has(stem) || STEMS.has(stem)) {
      return true;
    }
    if (matchesElidedStem(stem)) {
      return true;
    }
    for (const suffix2 of MORPHOLOGICAL_SUFFIXES) {
      if (!stem.endsWith(suffix2) || stem.length <= suffix2.length + 1) {
        continue;
      }
      const stem2 = stem.slice(0, -suffix2.length);
      if (boundaryWouldGeminate(stem2, suffix2)) {
        continue;
      }
      if (DICTIONARY.has(stem2) || STEMS.has(stem2)) {
        return true;
      }
      if (matchesElidedStem(stem2)) {
        return true;
      }
    }
  }

  return false;
}

export function isKnownMongolianWord(word: string): boolean {
  const normalized = normalizeMongolianWord(word);
  if (!normalized || normalized.length < 2) return true;
  if (!/[а-яөүё]/u.test(normalized)) return true;
  return matchesMorphology(normalized);
}

const FUZZY_MIN_WORD_LENGTH = 4;
const FUZZY_MAX_DISTANCE = 2;
const FUZZY_MAX_LENGTH_DIFF = 2;
/** Minimum score (see {@link scoreCandidate}) for the *top* candidate before
 * we suggest anything at all — below this we stay silent rather than risk
 * an overcorrection (requirement: never guess when unsure). */
const MIN_SUGGESTION_CONFIDENCE = 0.4;

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i += 1;
  return i;
}

/** Strip the longest known morphological suffix that matches the end of
 * `word` (leaving at least a 2-letter stem); returns `word` unchanged if
 * none match. */
function stripKnownSuffix(word: string): string {
  let bestSuffixLength = 0;
  for (const suffix of MORPHOLOGICAL_SUFFIXES) {
    if (
      suffix.length > bestSuffixLength &&
      word.endsWith(suffix) &&
      word.length - suffix.length >= 2 &&
      !boundaryWouldGeminate(word.slice(0, -suffix.length), suffix)
    ) {
      bestSuffixLength = suffix.length;
    }
  }
  return bestSuffixLength > 0 ? word.slice(0, -bestSuffixLength) : word;
}

/** True when both words reduce to the same known stem once a suffix is
 * stripped — the strongest possible "same root" signal available from this
 * hand-curated dictionary (no full morphological analyzer). */
function sharesKnownStem(a: string, b: string): boolean {
  if (a === b) return true;
  const stemA = stripKnownSuffix(a);
  const stemB = stripKnownSuffix(b);
  if (stemA.length < 2 || stemB.length < 2) return false;
  if (stemA === stemB) return true;
  return stemA === b || stemB === a;
}

export type RankedCandidate = {
  word: string;
  /** 0..1, higher = more likely correction. See {@link scoreCandidate}. */
  score: number;
};

/**
 * Scores how plausible `candidate` is as the intended word for `input`,
 * combining (in the order the product spec calls for):
 *  1. edit distance (weighted: same-category letter slips are cheaper)
 *  2. shared root/stem (suffix-stripped equality against known morphology)
 *  3. common-prefix overlap — Mongolian roots are word-initial, so two
 *     words that only agree on a *suffix* are usually unrelated, while
 *     agreeing on a *prefix* usually means a shared stem
 *  4. commonness (core-vocabulary vs. legal-jargon-only) as a cheap
 *     frequency proxy
 *  5. local-document context — a candidate already used elsewhere in the
 *     same text is more likely the intended word than a coincidental
 *     near-miss
 * A candidate whose only resemblance to the input is a shared *tail*
 * (e.g. "ирэх" inside "ширэх") gets no prefix credit and no stem credit,
 * so it is heavily penalized even at edit distance 1 — this is what stops
 * a structurally unrelated word from outranking a same-root candidate
 * that happens to need a larger edit (e.g. "ширхэг" for "ширэх").
 */
export function scoreCandidate(
  input: string,
  candidate: string,
  context?: { documentWords?: ReadonlySet<string> },
): number {
  const distance = weightedLevenshteinDistance(input, candidate);
  const maxLen = Math.max(input.length, candidate.length);
  const distanceScore = Math.max(0, 1 - distance / maxLen);

  const prefixLen = commonPrefixLength(input, candidate);
  const prefixRatio = prefixLen / Math.min(input.length, candidate.length);
  const stemShared = sharesKnownStem(input, candidate);
  const isCommon = COMMON_WORDS.has(candidate);
  const inContext = context?.documentWords?.has(candidate) ?? false;

  let score =
    0.3 * distanceScore +
    0.45 * prefixRatio +
    (stemShared ? 0.15 : 0) +
    (isCommon ? 0.07 : 0) +
    (inContext ? 0.08 : 0);

  // Mongolian roots are word-initial: a candidate that shares nothing with
  // the input's first letter(s) and no known stem is very likely a
  // different word entirely, whatever its raw edit distance is.
  if (prefixLen === 0 && !stemShared) {
    score *= 0.3;
  }

  return Math.min(1, Math.max(0, score));
}

/**
 * Root/stem-aware fuzzy match against COMPLETE_WORDS: unlike a plain
 * "closest edit distance" search, candidates are scored (see
 * {@link scoreCandidate}) so a structurally related word that needs a
 * larger edit can outrank a structurally unrelated word that needs a
 * smaller one. Only returned when the best candidate clears
 * {@link MIN_SUGGESTION_CONFIDENCE} — otherwise we say nothing rather than
 * present a low-confidence guess.
 */
function rankFuzzyCandidates(
  normalized: string,
  limit: number,
  context?: { documentWords?: ReadonlySet<string> },
): readonly string[] {
  if (normalized.length < FUZZY_MIN_WORD_LENGTH) return [];

  const ranked: RankedCandidate[] = [];
  for (const candidate of COMPLETE_WORDS) {
    if (Math.abs(candidate.length - normalized.length) > FUZZY_MAX_LENGTH_DIFF) {
      continue;
    }
    const distance = levenshteinDistance(normalized, candidate);
    if (distance === 0 || distance > FUZZY_MAX_DISTANCE) continue;
    ranked.push({ word: candidate, score: scoreCandidate(normalized, candidate, context) });
  }

  if (ranked.length === 0) return [];

  ranked.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
  if ((ranked[0]?.score ?? 0) < MIN_SUGGESTION_CONFIDENCE) return [];

  return ranked.slice(0, limit).map((item) => item.word);
}

/**
 * Suggest spelling fixes, best candidate first: the high-confidence typo
 * map takes priority, then (unless `highConfidenceOnly` is set, e.g. the
 * word already triggered a harmony warning) root/stem-aware ranked fuzzy
 * matching against known complete words. Fuzzy matching against the *full*
 * legal lexicon used to be disabled outright because naive closest-edit
 * matching produced false positives like нөхөн→хэрхэн; scoring by shared
 * root/prefix instead of raw distance keeps that failure mode out while
 * still allowing multi-edit, same-root corrections (e.g. ширэх→ширхэг).
 */
export function suggestDictionaryWords(
  word: string,
  limit = 3,
  options?: {
    highConfidenceOnly?: boolean;
    documentWords?: ReadonlySet<string>;
  },
): readonly string[] {
  const normalized = normalizeMongolianWord(word);
  if (!normalized || normalized.length < 2) return [];
  if (isKnownMongolianWord(normalized)) return [];

  const mapped = COMMON_TYPO_CORRECTIONS[normalized];
  if (mapped && isKnownMongolianWord(mapped)) {
    return [mapped];
  }

  if (options?.highConfidenceOnly) return [];

  return rankFuzzyCandidates(normalized, limit, {
    documentWords: options?.documentWords,
  });
}

export function dictionarySizeForTests(): number {
  return DICTIONARY.size;
}

/** Minimal, structural shape a generated-vocabulary entry must have to be
 * registered — deliberately not importing corpus-vocabulary.ts's
 * `GeneratedVocabularyEntry` type here (that module imports *from*
 * dictionary.ts already; importing back would be circular). Any object
 * matching this shape — including a real `GeneratedVocabularyEntry` —
 * satisfies it structurally. */
export type RegisterableVocabularyEntry = {
  word: string;
  category: "COMMON" | "LEGAL" | "MORPHOLOGICAL_STEM";
  occurrenceCount: number;
  documentFrequency: number;
};

export type GeneratedVocabularyProvenance = {
  category: RegisterableVocabularyEntry["category"];
  occurrenceCount: number;
  documentFrequency: number;
  source: string;
};

type GeneratedProvenanceRecord = GeneratedVocabularyProvenance & {
  /** True if this exact word was already a literal DICTIONARY entry
   * (hand-curated, or from an earlier registration) before this
   * registration ran. Lets clearGeneratedVocabularyForTests() avoid ever
   * deleting a word that has hand-curated meaning too — re-registering an
   * already-known word (harmless: addWord/addStem are idempotent) must
   * never make cleanup erase the hand-curated original. */
  existedBeforeRegistration: boolean;
};

/** Side-channel record of every word registered via
 * {@link registerGeneratedVocabulary}, keyed by normalized word — kept
 * separate from DICTIONARY/COMPLETE_WORDS/COMMON_WORDS so a generated
 * word matches and ranks exactly like a hand-curated one (no special
 * casing anywhere in matchesMorphology/scoreCandidate), while still
 * letting a caller ask "where did this word come from?" without losing
 * that provenance. Never read by the runtime matching/ranking path. */
const GENERATED_PROVENANCE = new Map<string, GeneratedProvenanceRecord>();

/**
 * Merges reviewed, corpus-derived vocabulary into the same runtime
 * structures hand-curated words live in (DICTIONARY/COMPLETE_WORDS, plus
 * COMMON_WORDS for the COMMON category) — a registered word is
 * indistinguishable from a hand-curated one to isKnownMongolianWord/
 * suggestDictionaryWords, so it needs no separate matching or ranking
 * logic. NOT called anywhere in this module or at import time: dictionary
 * initialization stays exactly hand-curated-only unless a caller (a
 * server bootstrap step, a test, a future opt-in) explicitly invokes
 * this. Calling it twice with the same entries is safe (Set/Map
 * semantics — no duplicate words, provenance is overwritten not
 * appended).
 */
export function registerGeneratedVocabulary(
  entries: readonly RegisterableVocabularyEntry[],
  options?: { source?: string },
): void {
  const source = options?.source ?? "generated";
  for (const entry of entries) {
    const normalized = normalizeMongolianWord(entry.word);
    if (!normalized || normalized.length < 2) continue;

    const existedBeforeRegistration = HAND_CURATED_WORDS.has(normalized);

    if (entry.category === "MORPHOLOGICAL_STEM") {
      addStem(normalized);
    } else {
      addWord(normalized, { common: entry.category === "COMMON" });
    }

    GENERATED_PROVENANCE.set(normalized, {
      category: entry.category,
      occurrenceCount: entry.occurrenceCount,
      documentFrequency: entry.documentFrequency,
      source,
      existedBeforeRegistration,
    });
  }
}

/** True only for words added via {@link registerGeneratedVocabulary} —
 * never true for hand-curated dictionary words, even after the same word
 * is also registered as generated (hand-curation isn't tracked here
 * because it doesn't need a "why is this known" answer the way a
 * corpus-derived word does). */
export function generatedVocabularyProvenance(word: string): GeneratedVocabularyProvenance | null {
  const normalized = normalizeMongolianWord(word);
  return GENERATED_PROVENANCE.get(normalized) ?? null;
}

/** Test/introspection only — undoes every registration made via
 * {@link registerGeneratedVocabulary} (removing the words from
 * DICTIONARY/COMPLETE_WORDS/COMMON_WORDS/STEMS too, not just the
 * provenance record), so tests in the same file can register, assert,
 * and reset without leaking state into later tests. Skips any word that
 * already had hand-curated (or earlier-registered) meaning before this
 * registration, so cleanup can never erase real dictionary data. */
export function clearGeneratedVocabularyForTests(): void {
  for (const [word, record] of GENERATED_PROVENANCE) {
    if (record.existedBeforeRegistration) continue;
    DICTIONARY.delete(word);
    COMPLETE_WORDS.delete(word);
    COMMON_WORDS.delete(word);
    STEMS.delete(word);
  }
  GENERATED_PROVENANCE.clear();
}
