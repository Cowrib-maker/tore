/**
 * Deterministic, offline vocabulary-extraction pipeline for growing the
 * hand-curated Mongolian orthography dictionary from TORE's own ingested
 * legal corpus, instead of more one-off manual word additions.
 *
 * Pipeline: authoritative legal text → tokenize → normalize → frequency
 * count (+ document-coverage count) → classify → filter out anything that
 * isn't safely reusable as spelling-dictionary vocabulary → deterministic,
 * versioned candidate list for a human to review.
 *
 * This module is PURE and takes plain `{ id, text }` documents — it has no
 * dependency on the database, HTTP, or the knowledge engine, and nothing
 * in `dictionary.ts` / `suggestions.ts` imports it. Runtime spellchecking
 * stays exactly as fast and network-free as before; this only supports an
 * offline, human-reviewed regeneration step (see scripts/extract-legal-
 * vocabulary.ts) that is NOT wired into the build or into any request path.
 *
 * Nothing here is auto-merged into the shipped dictionary. Extraction
 * produces a *candidate* list; promoting entries into
 * dictionary.ts/legal-lexicon.ts is a separate, human-reviewed step.
 */

import {
  boundaryWouldGeminate,
  isKnownMongolianWord,
  MORPHOLOGICAL_SUFFIXES,
} from "@/domain/mongolian-orthography/dictionary";
import { normalizeMongolianWord } from "@/domain/mongolian-orthography/engine";

export type CorpusDocumentInput = {
  /** Stable id for provenance only — never used as vocabulary itself. */
  id: string;
  text: string;
};

export type VocabularyCategory =
  | "COMMON"
  | "LEGAL"
  | "PROPER_NOUN"
  | "ABBREVIATION"
  | "MORPHOLOGICAL_STEM";

export type RejectionReason =
  | "contains_digit"
  | "non_mongolian_characters"
  | "length_out_of_range"
  | "insufficient_evidence";

export type VocabularyCandidate = {
  word: string;
  category: VocabularyCategory;
  /** Total occurrences across the corpus. */
  occurrenceCount: number;
  /** Number of distinct documents the word appears in. */
  documentFrequency: number;
  /** documentFrequency / total documents — the COMMON/LEGAL split signal. */
  documentCoverageRatio: number;
  /** True if isKnownMongolianWord() already accepts this — lets a reviewer
   * focus on genuinely new coverage instead of re-confirming what already
   * works. */
  alreadyKnown: boolean;
  /** Only set for MORPHOLOGICAL_STEM: the surface forms whose suffix-
   * stripping produced this stem, i.e. the evidence for it. */
  derivedFrom?: readonly string[];
};

export type RejectedToken = {
  word: string;
  reason: RejectionReason;
  occurrenceCount: number;
};

export type VocabularyExtractionResult = {
  documentCount: number;
  candidates: readonly VocabularyCandidate[];
  /** Deduped, sorted, evidence for why tokens were dropped — for audit and
   * for the "corpus-derived entries cannot cause obvious false positives"
   * test suite, not for shipping anywhere. */
  rejected: readonly RejectedToken[];
};

const MIN_TOKEN_LENGTH = 2;
const MAX_TOKEN_LENGTH = 24;
/** A token seen in only one document could be that document's own typo or
 * an OCR artifact baked into the source — never promote it on that alone. */
const MIN_DOCUMENT_FREQUENCY_TO_CONSIDER = 2;
/** A word present in at least this share of documents behaves like general
 * vocabulary/grammar rather than a domain-specific legal term. Document-
 * coverage ratio (a standard corpus-linguistics signal, the DF half of
 * TF-IDF) is used rather than raw frequency so one very repetitive
 * document can't make a rare word look "common". */
const COMMON_COVERAGE_RATIO = 0.5;

const ALL_CAPS_ABBREVIATION_RE = /^[А-ЯӨҮЁ]{2,6}$/u;
const CAPITALIZED_WORD_RE = /^[А-ЯӨҮЁ][а-яөүё]+$/u;
const ONLY_MONGOLIAN_LETTERS_RE = /^[а-яА-ЯөҮүөЁёъЪьЬыЫ]+$/u;
/** Split on anything that isn't a letter or digit, so punctuation, dashes,
 * citation slashes ("5.1.2"), and glued numbers already act as token
 * boundaries before any classification runs. */
const RAW_TOKEN_RE = /[\p{L}\p{N}]+/gu;
const SENTENCE_END_RE = /[.!?]$/;

type RawToken = { raw: string; sentenceInitial: boolean };

function tokenizeRaw(text: string): RawToken[] {
  const tokens: RawToken[] = [];
  for (const match of text.matchAll(RAW_TOKEN_RE)) {
    const index = match.index ?? 0;
    const before = text.slice(0, index).trimEnd();
    tokens.push({
      raw: match[0],
      sentenceInitial: before.length === 0 || SENTENCE_END_RE.test(before),
    });
  }
  return tokens;
}

/**
 * Classifies one raw (still-cased) token in isolation. Case is inspected
 * here, before normalization, because it's the primary signal for
 * abbreviations and proper nouns; ordinary words are folded to lowercase
 * for counting immediately after this returns.
 *
 * A capitalized word at the START of a sentence is not proper-noun
 * evidence — every sentence-initial word is capitalized regardless of
 * what it is, so treating that as a name/place signal would misclassify
 * huge amounts of ordinary vocabulary. Only a capital in the *middle* of
 * a sentence is genuine evidence of a proper noun.
 */
function classifyRawToken(
  token: RawToken,
): { category: VocabularyCategory | "ORDINARY"; normalized: string } | { rejected: RejectionReason } {
  const { raw, sentenceInitial } = token;
  if (/\d/.test(raw)) {
    return { rejected: "contains_digit" };
  }
  if (raw.length < MIN_TOKEN_LENGTH || raw.length > MAX_TOKEN_LENGTH) {
    return { rejected: "length_out_of_range" };
  }
  if (!ONLY_MONGOLIAN_LETTERS_RE.test(raw)) {
    return { rejected: "non_mongolian_characters" };
  }
  if (ALL_CAPS_ABBREVIATION_RE.test(raw)) {
    return { category: "ABBREVIATION", normalized: raw };
  }
  if (CAPITALIZED_WORD_RE.test(raw) && !sentenceInitial) {
    return { category: "PROPER_NOUN", normalized: normalizeMongolianWord(raw) };
  }
  const normalized = normalizeMongolianWord(raw);
  if (normalized.length < MIN_TOKEN_LENGTH) {
    return { rejected: "length_out_of_range" };
  }
  return { category: "ORDINARY", normalized };
}

type AccumulatorCategory = "ORDINARY" | "PROPER_NOUN" | "ABBREVIATION";

type Accumulator = {
  occurrenceCount: number;
  documents: Set<string>;
  /** Lowercase evidence overrides an earlier capitalized-only reading —
   * a word that ever appears lowercase in the corpus is not a proper
   * noun, whatever a sentence-initial capital elsewhere suggested. */
  seenLowercase: boolean;
  category: AccumulatorCategory;
};

/**
 * Runs the full pipeline (tokenize → normalize → count → classify) over
 * `documents` and returns a deterministically ordered candidate list plus
 * a deduped rejection log. Two calls with the same input always produce
 * byte-identical output — sorting never depends on Map/Set iteration
 * order or on wall-clock time.
 */
export function extractVocabularyCandidates(
  documents: readonly CorpusDocumentInput[],
): VocabularyExtractionResult {
  const ordinary = new Map<string, Accumulator>();
  const abbreviations = new Map<string, Accumulator>();
  const rejectedCounts = new Map<string, { reason: RejectionReason; count: number }>();

  for (const doc of documents) {
    for (const token of tokenizeRaw(doc.text)) {
      const classified = classifyRawToken(token);
      if ("rejected" in classified) {
        const existing = rejectedCounts.get(token.raw);
        if (existing) existing.count += 1;
        else rejectedCounts.set(token.raw, { reason: classified.rejected, count: 1 });
        continue;
      }

      if (classified.category === "ABBREVIATION") {
        const acc = abbreviations.get(classified.normalized) ?? {
          occurrenceCount: 0,
          documents: new Set<string>(),
          seenLowercase: false,
          category: "ABBREVIATION" as const,
        };
        acc.occurrenceCount += 1;
        acc.documents.add(doc.id);
        abbreviations.set(classified.normalized, acc);
        continue;
      }

      const key = classified.normalized;
      const acc = ordinary.get(key) ?? {
        occurrenceCount: 0,
        documents: new Set<string>(),
        seenLowercase: false,
        category: "PROPER_NOUN" as const,
      };
      acc.occurrenceCount += 1;
      acc.documents.add(doc.id);
      // A word that ever appears lowercase anywhere in the corpus is
      // ordinary vocabulary, not a proper noun — sentence-initial capitals
      // on common words never override that once seen.
      if (classified.category === "ORDINARY") {
        acc.seenLowercase = true;
      }
      acc.category = acc.seenLowercase ? "ORDINARY" : "PROPER_NOUN";
      ordinary.set(key, acc);
    }
  }

  const documentCount = documents.length;
  const candidates: VocabularyCandidate[] = [];

  for (const [word, acc] of abbreviations) {
    candidates.push({
      word,
      category: "ABBREVIATION",
      occurrenceCount: acc.occurrenceCount,
      documentFrequency: acc.documents.size,
      documentCoverageRatio: documentCount > 0 ? acc.documents.size / documentCount : 0,
      alreadyKnown: isKnownMongolianWord(word),
    });
  }

  const survivingOrdinary = new Map<string, Accumulator & { documentFrequency: number }>();

  for (const [word, acc] of ordinary) {
    const documentFrequency = acc.documents.size;

    if (acc.category === "PROPER_NOUN") {
      candidates.push({
        word,
        category: "PROPER_NOUN",
        occurrenceCount: acc.occurrenceCount,
        documentFrequency,
        documentCoverageRatio: documentCount > 0 ? documentFrequency / documentCount : 0,
        alreadyKnown: isKnownMongolianWord(word),
      });
      continue;
    }

    if (documentFrequency < MIN_DOCUMENT_FREQUENCY_TO_CONSIDER) {
      const existing = rejectedCounts.get(word);
      rejectedCounts.set(word, {
        reason: "insufficient_evidence",
        count: (existing?.count ?? 0) + acc.occurrenceCount,
      });
      continue;
    }

    const coverageRatio = documentCount > 0 ? documentFrequency / documentCount : 0;
    const category: VocabularyCategory = coverageRatio >= COMMON_COVERAGE_RATIO ? "COMMON" : "LEGAL";
    candidates.push({
      word,
      category,
      occurrenceCount: acc.occurrenceCount,
      documentFrequency,
      documentCoverageRatio: coverageRatio,
      alreadyKnown: isKnownMongolianWord(word),
    });
    survivingOrdinary.set(word, { ...acc, documentFrequency });
  }

  candidates.push(...deriveMorphologicalStems(survivingOrdinary, documentCount));

  candidates.sort(compareCandidates);

  const rejected: RejectedToken[] = Array.from(rejectedCounts.entries())
    .map(([word, { reason, count }]) => ({ word, reason, occurrenceCount: count }))
    .sort((a, b) => a.reason.localeCompare(b.reason) || b.occurrenceCount - a.occurrenceCount || a.word.localeCompare(b.word));

  return { documentCount, candidates, rejected };
}

/**
 * Finds stems attested by 2+ distinct surviving surface forms (e.g.
 * "хуульчид" and "хуульчаас" both stripping to "хуульч") — a stem shared
 * by multiple independently-observed inflected forms is real morphological
 * evidence, not a coincidence, and is more valuable to add to
 * dictionary.ts than every individual surface form.
 */
function deriveMorphologicalStems(
  survivors: ReadonlyMap<string, Accumulator & { documentFrequency: number }>,
  documentCount: number,
): VocabularyCandidate[] {
  const byStem = new Map<string, { forms: string[]; occurrenceCount: number; documents: Set<string> }>();

  for (const [word, acc] of survivors) {
    for (const suffix of MORPHOLOGICAL_SUFFIXES) {
      if (!word.endsWith(suffix) || word.length - suffix.length < 2) continue;
      const stem = word.slice(0, -suffix.length);
      if (boundaryWouldGeminate(stem, suffix)) continue;

      const entry = byStem.get(stem) ?? { forms: [], occurrenceCount: 0, documents: new Set<string>() };
      entry.forms.push(word);
      entry.occurrenceCount += acc.occurrenceCount;
      for (const docId of acc.documents) entry.documents.add(docId);
      byStem.set(stem, entry);
      break; // longest-suffix-first isn't tracked here; one stripping per word is enough evidence
    }
  }

  const stems: VocabularyCandidate[] = [];
  for (const [stem, entry] of byStem) {
    const uniqueForms = Array.from(new Set(entry.forms)).sort();
    if (uniqueForms.length < 2) continue; // one form alone isn't independent evidence
    stems.push({
      word: stem,
      category: "MORPHOLOGICAL_STEM",
      occurrenceCount: entry.occurrenceCount,
      documentFrequency: entry.documents.size,
      documentCoverageRatio: documentCount > 0 ? entry.documents.size / documentCount : 0,
      alreadyKnown: isKnownMongolianWord(stem),
      derivedFrom: uniqueForms,
    });
  }
  return stems;
}

const CATEGORY_ORDER: Record<VocabularyCategory, number> = {
  COMMON: 0,
  LEGAL: 1,
  MORPHOLOGICAL_STEM: 2,
  PROPER_NOUN: 3,
  ABBREVIATION: 4,
};

function compareCandidates(a: VocabularyCandidate, b: VocabularyCandidate): number {
  return (
    CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] ||
    b.occurrenceCount - a.occurrenceCount ||
    a.word.localeCompare(b.word)
  );
}

/**
 * Filters extraction output down to entries that are actually safe to
 * hand-review for merging into the shipped dictionary: real, sufficiently-
 * attested COMMON/LEGAL words or MORPHOLOGICAL_STEM roots, excluding
 * anything already known and — by construction, not by an extra filter
 * here — every PROPER_NOUN and ABBREVIATION candidate, since names and
 * abbreviations carry a much higher false-positive-correction risk and
 * always require explicit human sign-off rather than bulk import.
 */
export function selectSafeDictionaryEntries(
  result: VocabularyExtractionResult,
  options?: { minOccurrence?: number; minDocumentFrequency?: number },
): VocabularyCandidate[] {
  const minOccurrence = options?.minOccurrence ?? 3;
  const minDocumentFrequency = options?.minDocumentFrequency ?? MIN_DOCUMENT_FREQUENCY_TO_CONSIDER;

  return result.candidates
    .filter((c) => c.category === "COMMON" || c.category === "LEGAL" || c.category === "MORPHOLOGICAL_STEM")
    .filter((c) => !c.alreadyKnown)
    .filter((c) => c.occurrenceCount >= minOccurrence && c.documentFrequency >= minDocumentFrequency)
    .sort(compareCandidates);
}

/** Shape actually needed from a {@link StoredKnowledgeDocument}-like
 * object, kept minimal and duck-typed so this module never needs to
 * import the knowledge engine's full type graph or its Prisma-backed
 * repository — only a thin, explicit adapter boundary. */
export type KnowledgeDocumentLike = {
  id: string;
  articles: readonly { text: string }[];
};

/**
 * Adapter from the knowledge engine's document shape to this pipeline's
 * plain `{ id, text }` input — concatenates all article text for a
 * document and strips residual HTML the same way the retriever already
 * does. Does not fetch anything: callers are responsible for getting
 * `documents` from wherever is appropriate (e.g. a `KnowledgeExport` JSON
 * snapshot on disk — see scripts/extract-legal-vocabulary.ts — never a
 * live repository call from this module).
 */
export function fromKnowledgeDocuments(
  documents: readonly KnowledgeDocumentLike[],
  stripHtml: (value: string) => string,
): CorpusDocumentInput[] {
  return documents.map((document) => ({
    id: document.id,
    text: document.articles.map((article) => stripHtml(article.text)).join("\n"),
  }));
}

/** Bumped whenever the extraction/classification rules change in a way
 * that could change which words a past artifact would have produced —
 * lets a loader (or a human) tell whether a committed artifact is stale
 * relative to the current pipeline. */
export const VOCABULARY_GENERATOR_VERSION = 1;

/** One entry in a committed generated-vocabulary artifact. Deliberately a
 * narrower shape than {@link VocabularyCandidate}: only what's needed to
 * explain *why* a word was included (category, frequency, document
 * count, generator version) travels with it. No document ids, no raw
 * corpus text, no per-document breakdown — that provenance lives in the
 * generation command that produced the file, not in the artifact
 * consumers load at runtime. */
export type GeneratedVocabularyEntry = {
  word: string;
  category: Extract<VocabularyCategory, "COMMON" | "LEGAL" | "MORPHOLOGICAL_STEM">;
  occurrenceCount: number;
  documentFrequency: number;
};

export type GeneratedVocabularyArtifact = {
  schemaVersion: 1;
  generatorVersion: number;
  generatedAt: string;
  /** Human-readable provenance for the whole file — which corpus, how
   * many documents — not per-entry document ids. */
  source: {
    description: string;
    documentCount: number;
  };
  /** Only entries a human has reviewed and approved for inclusion — this
   * file is never the raw, unreviewed extraction output. Sorted the same
   * way {@link extractVocabularyCandidates} sorts (category, then
   * frequency desc, then alphabetically) for a stable, reviewable diff. */
  entries: readonly GeneratedVocabularyEntry[];
};

/**
 * Builds the committed-artifact shape from a set of *already
 * human-approved* candidates (e.g. a reviewed subset of
 * {@link selectSafeDictionaryEntries}'s output). Does not do any
 * filtering or review itself — approval is a human decision made before
 * calling this, not something this function can determine.
 */
export function buildGeneratedVocabularyArtifact(
  approvedEntries: readonly VocabularyCandidate[],
  source: { description: string; documentCount: number },
  generatedAt: string,
): GeneratedVocabularyArtifact {
  const entries: GeneratedVocabularyEntry[] = approvedEntries
    .filter(
      (c): c is VocabularyCandidate & { category: GeneratedVocabularyEntry["category"] } =>
        c.category === "COMMON" || c.category === "LEGAL" || c.category === "MORPHOLOGICAL_STEM",
    )
    .map((c) => ({
      word: c.word,
      category: c.category,
      occurrenceCount: c.occurrenceCount,
      documentFrequency: c.documentFrequency,
    }))
    .sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || b.occurrenceCount - a.occurrenceCount || a.word.localeCompare(b.word));

  return { schemaVersion: 1, generatorVersion: VOCABULARY_GENERATOR_VERSION, generatedAt, source, entries };
}
