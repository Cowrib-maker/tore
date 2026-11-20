/**
 * Review-queue generator (pure, deterministic: same candidates + same options → byte-identical queues; no randomness, no clocks, no locale).
 *
 * Every score is a plain sum with the weights below and comes with the reasons that produced it, so a reviewer can see WHY an item is near the
 * top: «if I validate this one word, how much real text does it affect?». Nothing here decides that a word is valid: a queue only orders
 * questions for humans. The estimates are UPPER BOUNDS (they assume every approved item is a genuine word) and are labelled as estimates.
 *
 *   score = ( occurrences + 2·documents + 5·fanOut ) × (1 + 0.5·professionalShare) × (1.1 when the engine ACCUSES the word)
 *   occurrences        UNKNOWN (or accused) tokens this word causes in the development corpus
 *   documents          distinct documents affected (general vocabulary is spread out; a one-document word is not)
 *   fanOut             other surface forms of the same stem seen in the corpus (a reviewed lemma unlocks them)
 *   professionalShare  share of the word's occurrences in legal / government / business documents (0..1)
 */
import { REVIEW_SCHEMA, itemState, type SpellReviewItem } from "./review";

export const QUEUE_IDS = [
  "HIGH_IMPACT_MISSING_LEMMAS", "MORPHOLOGY_VALIDATION", "MORPHOLOGY_CONTRADICTIONS", "HIGH_FREQUENCY_UNKNOWN", "POSSIBLE_FALSE_POSITIVE",
  "PROPER_NAMES", "LOANWORDS", "COMPOUNDS", "DERIVATIONS", "LEGAL_GOVERNMENT", "DISPUTED_ITEMS", "REVIEWED_REGRESSION",
] as const;
export type QueueId = (typeof QUEUE_IDS)[number];

export const SCORE_WEIGHTS = { documents: 2, fanOut: 5, professional: 0.5, accused: 1.1 } as const;
export const PROFESSIONAL_QUEUE_THRESHOLD = 0.4;

export type CandidateCategory =
  | "MISSING_LEMMA" | "MISSING_INFLECTION" | "PROPER_NAME" | "COMPOUND" | "DERIVATIONAL_FORM" | "LOANWORD" | "TECHNICAL_TERM" | "ABBREVIATION" | "TRUE_UNKNOWN" | "TOKENIZER_FAILURE";

/** One word type observed in the development corpus. Contains counts only — never text from the corpus. */
export type Candidate = {
  token: string;
  occurrences: number;
  documents: number;
  category: CandidateCategory;
  engineVerdict: "VALID" | "MISSPELLED" | "UNKNOWN";
  engineReason?: string;
  /** Other surface forms of the same stem observed in the corpus (approximate: same leading letters). */
  fanOut: number;
  /** Share (0..1) of occurrences in legal / government / business documents. */
  professionalShare: number;
  /** Local second-opinion dictionary (research QA only): used to RANK, never to approve. */
  secondOpinion: "ACCEPTS" | "REJECTS" | "NOT_AVAILABLE";
};

export type Scored<T> = T & { score: number; reasons: string[] };

const fmt = (n: number) => n.toLocaleString("en-US");
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function impactScore(c: Pick<Candidate, "occurrences" | "documents" | "fanOut" | "professionalShare" | "engineVerdict">): { score: number; reasons: string[] } {
  const reasons: string[] = [`${fmt(c.occurrences)} ${c.engineVerdict === "MISSPELLED" ? "accused" : "UNKNOWN"} occurrences`, `${fmt(c.documents)} documents affected`];
  if (c.fanOut > 0) reasons.push(`${fmt(c.fanOut)} other observed forms of the same stem`);
  let mult = 1 + SCORE_WEIGHTS.professional * c.professionalShare;
  if (c.professionalShare >= 0.05) reasons.push(`${Math.round(c.professionalShare * 100)}% of occurrences in legal/government/business documents`);
  if (c.engineVerdict === "MISSPELLED") {
    mult *= SCORE_WEIGHTS.accused;
    reasons.push("the engine accuses this word: a native judgment settles a possible false positive");
  }
  return { score: r3((c.occurrences + SCORE_WEIGHTS.documents * c.documents + SCORE_WEIGHTS.fanOut * c.fanOut) * mult), reasons };
}

/** Stable total order: score descending, then token by code point (no locale). */
const byScore = <T extends { score: number; token: string }>(a: T, b: T) => b.score - a.score || (a.token < b.token ? -1 : a.token > b.token ? 1 : 0);

export function queuesOf(c: Candidate): QueueId[] {
  const q: QueueId[] = [];
  const unknown = c.engineVerdict === "UNKNOWN" && c.category !== "TOKENIZER_FAILURE";
  if (unknown) q.push("HIGH_FREQUENCY_UNKNOWN");
  if (unknown && c.category === "MISSING_LEMMA" && c.secondOpinion !== "REJECTS") q.push("HIGH_IMPACT_MISSING_LEMMAS");
  if (c.engineVerdict === "MISSPELLED" && c.secondOpinion === "ACCEPTS") q.push("POSSIBLE_FALSE_POSITIVE");
  if (unknown && c.category === "PROPER_NAME") q.push("PROPER_NAMES");
  if (unknown && (c.category === "LOANWORD" || c.category === "TECHNICAL_TERM")) q.push("LOANWORDS");
  if (unknown && c.category === "COMPOUND") q.push("COMPOUNDS");
  if (unknown && (c.category === "DERIVATIONAL_FORM" || c.category === "MISSING_INFLECTION")) q.push("DERIVATIONS");
  if (unknown && c.professionalShare >= PROFESSIONAL_QUEUE_THRESHOLD) q.push("LEGAL_GOVERNMENT");
  return q;
}

/** A form the engine ACCEPTS through morphology although the second-opinion dictionary rejects it (or vice-versa): the questions most likely to expose an engine error. */
export type Contradiction = { token: string; occurrences: number; documents: number; engineSays: "VALID" | "MISSPELLED"; secondOpinion: "ACCEPTS" | "REJECTS"; lemma?: string };

/** A shipped lemma with the forms the corpus shows for it, for morphology validation (the reviewer judges forms, not just the lemma). */
export type MorphLemma = { lemma: string; pos: string; forms: { form: string; occurrences: number; engineSays: "VALID" | "MISSPELLED" | "UNKNOWN" }[] };

export type QueueItem = { queue: QueueId; rank: number; token: string; score: number; reasons: string[]; occurrences: number; documents: number; detail: string };

export type QueueInput = {
  candidates: readonly Candidate[];
  contradictions?: readonly Contradiction[];
  morphLemmas?: readonly MorphLemma[];
  /** Gold review items (disputed / flagged / reviewed). */
  gold?: readonly SpellReviewItem[];
};

export function buildQueues(input: QueueInput, opts: { limit?: number } = {}): Record<QueueId, QueueItem[]> {
  const out = Object.fromEntries(QUEUE_IDS.map((q) => [q, [] as (Scored<{ token: string }> & QueueItem)[]])) as unknown as Record<QueueId, (Scored<{ token: string }> & QueueItem)[]>;
  const push = (queue: QueueId, token: string, score: number, reasons: string[], occurrences: number, documents: number, detail: string) =>
    out[queue].push({ queue, rank: 0, token, score, reasons, occurrences, documents, detail });
  for (const c of input.candidates) {
    const { score, reasons } = impactScore(c);
    for (const q of queuesOf(c)) push(q, c.token, score, reasons, c.occurrences, c.documents, `${c.category}; second opinion ${c.secondOpinion}${c.engineReason ? `; engine ${c.engineReason}` : ""}`);
  }
  for (const k of input.contradictions ?? []) {
    const score = r3(k.occurrences + SCORE_WEIGHTS.documents * k.documents);
    push("MORPHOLOGY_CONTRADICTIONS", k.token, score, [`${fmt(k.occurrences)} occurrences`, `${fmt(k.documents)} documents`, `engine says ${k.engineSays} but the second-opinion dictionary ${k.secondOpinion === "REJECTS" ? "rejects" : "accepts"} it`], k.occurrences, k.documents, k.lemma ? `lemma ${k.lemma}` : "");
  }
  for (const m of input.morphLemmas ?? []) {
    const occ = m.forms.reduce((s, f) => s + f.occurrences, 0);
    const fan = Math.max(0, m.forms.length - 1);
    push("MORPHOLOGY_VALIDATION", m.lemma, r3(occ + SCORE_WEIGHTS.fanOut * fan), [`${fmt(occ)} occurrences across ${m.forms.length} observed forms`, `${m.pos} lemma: the reviewer judges every form, not only the lemma`], occ, 0, m.forms.slice(0, 8).map((f) => f.form).join(" "));
  }
  for (const it of input.gold ?? []) {
    const st = itemState(it);
    const pr = it.priority ?? 0;
    if (st.status === "DISPUTED" || st.status === "FLAGGED") push("DISPUTED_ITEMS", it.token, 1000 + pr, [st.status === "DISPUTED" ? "natives disagree: needs an additional native reviewer or an explicit adjudication" : "a native flagged it for further review"], 0, 0, it.id);
    if (st.status === "NATIVE_REVIEWED") push("REVIEWED_REGRESSION", it.token, pr, ["native-reviewed: must keep its judgment in every future run"], 0, 0, it.id);
  }
  const limit = opts.limit ?? Infinity;
  for (const q of QUEUE_IDS) {
    out[q].sort(byScore);
    out[q] = out[q].slice(0, limit);
    out[q].forEach((x, i) => (x.rank = i + 1));
  }
  return out;
}

/** UPPER-BOUND estimate (percentage points of all corpus tokens) if the top-K items of a queue were all approved. An ESTIMATE, not a result. */
export function maxCoverageGain(items: readonly Pick<QueueItem, "occurrences">[], k: number, totalTokens: number): number {
  let s = 0;
  for (let i = 0; i < Math.min(k, items.length); i += 1) s += items[i]!.occurrences;
  return totalTokens > 0 ? r3((100 * s) / totalTokens) : 0;
}

const CATEGORY_OF: Record<QueueId, SpellReviewItem["category"]> = {
  HIGH_IMPACT_MISSING_LEMMAS: "VALID", MORPHOLOGY_VALIDATION: "INFLECTION", MORPHOLOGY_CONTRADICTIONS: "INFLECTION", HIGH_FREQUENCY_UNKNOWN: "UNKNOWN",
  POSSIBLE_FALSE_POSITIVE: "MISSPELLED", PROPER_NAMES: "PROPER_NAME", LOANWORDS: "LOANWORD", COMPOUNDS: "COMPOUND", DERIVATIONS: "DERIVATIONAL",
  LEGAL_GOVERNMENT: "TECHNICAL_TERM", DISPUTED_ITEMS: "OTHER", REVIEWED_REGRESSION: "OTHER",
};

/**
 * Turn queue entries into review items so the standard sheet / import path (and its «a file cannot promote itself» guarantee) applies.
 * Provenance is AUTOMATIC: the only «decision» on file is the engine's own prediction, which carries no review weight.
 * The impact score and its reasons travel in `currentReason`, next to — never inside — the decision columns.
 */
export function queueToReviewItems(items: readonly QueueItem[], opts: { engineVersion: string; at: string; datasetVersion?: string }): SpellReviewItem[] {
  return items.map((x) => ({
    schema: REVIEW_SCHEMA,
    id: `QUEUE:${x.queue}:${x.token}`,
    datasetVersion: opts.datasetVersion ?? "spell-queue-local",
    token: x.token,
    sentenceOrigin: "NONE" as const,
    category: CATEGORY_OF[x.queue],
    currentVerdict: "UNKNOWN" as const,
    currentReason: `#${x.rank} score ${x.score}: ${x.reasons.join("; ")}${x.detail ? ` [${x.detail}]` : ""}`,
    source: `review queue ${x.queue} (engine ${opts.engineVersion}; local development corpus counts, no text)`,
    provenance: "AUTOMATIC" as const,
    priority: x.score,
    decisions: [{ seq: 1, reviewerId: "engine", reviewerKind: "AUTOMATIC" as const, verdict: "UNKNOWN" as const, at: opts.at }],
  }));
}
