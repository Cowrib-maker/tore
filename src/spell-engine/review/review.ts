/**
 * Spell review pipeline (pure, dependency-free). The point of this module is what it REFUSES to do:
 *   • a model/assistant judgment is never native review (MODEL_ADJUDICATED);
 *   • an engineer's judgment is never native review (ENGINEER_REVIEWED);
 *   • one native reviewer is never enough (NATIVE_PENDING);
 *   • two natives who disagree are DISPUTED — the disagreement is kept, never resolved silently;
 *   • NATIVE_REVIEWED needs ≥2 DISTINCT native reviewers who agree (verdict, and the correction when MISSPELLED);
 *   • decisions are an append-only log: a correction is a NEW decision, history is never rewritten.
 * Data created by the engine itself is AUTO_GENERATED and carries no review weight at all.
 */

export const REVIEW_SCHEMA = "tore-spell-review/1";

export type ReviewCategory =
  | "VALID" | "MISSPELLED" | "UNKNOWN" | "PROPER_NAME" | "LOANWORD" | "ABBREVIATION" | "COMPOUND"
  | "DERIVATIONAL" | "INFLECTION" | "TECHNICAL_TERM" | "TOKENIZATION" | "HOMOGRAPH" | "OTHER";
export const REVIEW_CATEGORIES: readonly ReviewCategory[] = [
  "VALID", "MISSPELLED", "UNKNOWN", "PROPER_NAME", "LOANWORD", "ABBREVIATION", "COMPOUND",
  "DERIVATIONAL", "INFLECTION", "TECHNICAL_TERM", "TOKENIZATION", "HOMOGRAPH", "OTHER",
];

export type Verdict = "VALID" | "MISSPELLED" | "UNKNOWN";

/** Who judged. Only NATIVE_HUMAN can ever produce native-reviewed data. */
export type ReviewerKind = "NATIVE_HUMAN" | "ENGINEER_HUMAN" | "MODEL_ASSISTANT" | "AUTOMATIC";

/** The honest label of a dataset item's trust (never inflated by counting reviewers of a weaker kind). */
export type ReviewStatus =
  | "NATIVE_REVIEWED"    // ≥2 distinct native reviewers agree
  | "NATIVE_PENDING"     // exactly one native reviewer so far
  | "DISPUTED"           // natives (or engineers, when no natives) disagree
  | "ENGINEER_REVIEWED"  // ≥1 engineer, no natives
  | "MODEL_ADJUDICATED"  // only model/assistant judgments
  | "AUTO_GENERATED"     // only engine/automatic output
  | "UNREVIEWED";

/** Where the SENTENCE text came from. LOCAL_CORPUS_D text must never be written to a tracked file. */
export type SentenceOrigin = "MODEL_AUTHORED" | "ENGINEER_AUTHORED" | "NATIVE_AUTHORED" | "LOCAL_CORPUS_D" | "NONE";

export type ReviewDecision = {
  /** Monotonic sequence inside the item's log. */
  seq: number;
  reviewerId: string;
  reviewerKind: ReviewerKind;
  verdict: Verdict;
  /** The correct spelling when verdict is MISSPELLED and a fix exists. */
  suggestion?: string;
  /** Suggestions the engine offered that the reviewer marked wrong. */
  rejectedSuggestions?: string[];
  note?: string;
  /** ISO date-time. */
  at: string;
};

/** A proposed lexicon lemma awaiting review (controlled missing-lemma pipeline). */
export type LemmaProposal = {
  pos: "N" | "V" | "ADJ" | "NUM" | "PRON" | "PART" | "X";
  /** Morphology class flags (hidden-g, vstem, loan, soft-i, cvb:ж …); facts the spelling does not reveal. */
  flags?: string[];
  /** Lexicon layer / domain (GENERAL, LEGAL, GOVERNMENT, BUSINESS, ACADEMIC, TECH, MEDICAL, PROPER_NOUN). */
  domain: string;
  kind: "COMMON" | "PROPER" | "LOAN" | "ABBREVIATION" | "TECHNICAL";
  /** Coarse corpus-frequency bucket 0–5 (log scale; an aggregate, never text). */
  freqBucket?: number;
  /** Confidence of the PROPOSER (not of any reviewer): LOW | MEDIUM | HIGH. */
  confidence: "LOW" | "MEDIUM" | "HIGH";
  /** Where the lemma entered the pipeline (e.g. "vocab/general-p2c.tsv", "local-corpus candidate"). */
  origin: string;
};

export type SpellReviewItem = {
  schema: typeof REVIEW_SCHEMA;
  id: string;
  /** Dataset version this item belongs to (e.g. "spell-gold-v3.0"). */
  datasetVersion: string;
  token: string;
  sentence?: string;
  sentenceOrigin: SentenceOrigin;
  category: ReviewCategory;
  currentVerdict: Verdict;
  currentSuggestion?: string;
  currentReason?: string;
  proposedVerdict?: Verdict;
  proposedSuggestion?: string;
  /** Where the ITEM came from (generator / script / report). */
  source: string;
  /** How trustworthy the item's EXPECTATION is before any review: who proposed it. */
  provenance: ReviewerKind;
  /** Queue priority (higher = review first); derived from frequency / risk, never from the verdict. */
  priority?: number;
  /** For LEMMA review items (token = the lemma): the proposed lexicon record. A native VALID decision approves exactly this record. */
  lemma?: LemmaProposal;
  decisions: ReviewDecision[];
};

export type ItemState = {
  id: string;
  status: ReviewStatus;
  /** The agreed verdict, only when status is NATIVE_REVIEWED / ENGINEER_REVIEWED / MODEL_ADJUDICATED / AUTO_GENERATED with a single view. */
  verdict?: Verdict;
  suggestion?: string;
  /** Distinct reviewers per kind that currently stand (latest decision per reviewer). */
  reviewers: { reviewerId: string; kind: ReviewerKind; verdict: Verdict; suggestion?: string }[];
};

/** Latest decision per reviewer (a reviewer may correct themselves; the old decision stays in the log). */
export function standingDecisions(item: Pick<SpellReviewItem, "decisions">): ReviewDecision[] {
  const latest = new Map<string, ReviewDecision>();
  for (const d of [...item.decisions].sort((a, b) => a.seq - b.seq)) latest.set(d.reviewerId, d);
  return [...latest.values()];
}

const agree = (ds: readonly ReviewDecision[]): boolean => {
  const first = ds[0];
  if (!first) return false;
  return ds.every((d) => d.verdict === first.verdict && (first.verdict !== "MISSPELLED" || (d.suggestion ?? "") === (first.suggestion ?? "")));
};

export function itemState(item: Pick<SpellReviewItem, "id" | "decisions">): ItemState {
  const standing = standingDecisions(item);
  const reviewers = standing.map((d) => ({ reviewerId: d.reviewerId, kind: d.reviewerKind, verdict: d.verdict, suggestion: d.suggestion }));
  const of = (k: ReviewerKind) => standing.filter((d) => d.reviewerKind === k);
  const natives = of("NATIVE_HUMAN");
  const engineers = of("ENGINEER_HUMAN");
  if (natives.length >= 2) {
    return agree(natives)
      ? { id: item.id, status: "NATIVE_REVIEWED", verdict: natives[0]!.verdict, suggestion: natives[0]!.suggestion, reviewers }
      : { id: item.id, status: "DISPUTED", reviewers };
  }
  if (natives.length === 1) return { id: item.id, status: "NATIVE_PENDING", verdict: natives[0]!.verdict, suggestion: natives[0]!.suggestion, reviewers };
  if (engineers.length >= 1) {
    return agree(engineers)
      ? { id: item.id, status: "ENGINEER_REVIEWED", verdict: engineers[0]!.verdict, suggestion: engineers[0]!.suggestion, reviewers }
      : { id: item.id, status: "DISPUTED", reviewers };
  }
  const models = of("MODEL_ASSISTANT");
  if (models.length >= 1) return { id: item.id, status: "MODEL_ADJUDICATED", verdict: agree(models) ? models[0]!.verdict : undefined, suggestion: agree(models) ? models[0]!.suggestion : undefined, reviewers };
  if (of("AUTOMATIC").length >= 1) return { id: item.id, status: "AUTO_GENERATED", reviewers };
  return { id: item.id, status: "UNREVIEWED", reviewers };
}

/** Append a decision WITHOUT mutating the input item (history is append-only). Throws on an invalid decision. */
export function appendDecision(item: SpellReviewItem, d: Omit<ReviewDecision, "seq">): SpellReviewItem {
  const problems = validateDecision(d);
  if (problems.length) throw new Error(`invalid decision for ${item.id}: ${problems.join("; ")}`);
  const seq = item.decisions.reduce((m, x) => Math.max(m, x.seq), 0) + 1;
  return { ...item, decisions: [...item.decisions, { ...d, seq }] };
}

export function validateDecision(d: Omit<ReviewDecision, "seq">): string[] {
  const p: string[] = [];
  if (!d.reviewerId?.trim()) p.push("reviewerId is required");
  if (!["NATIVE_HUMAN", "ENGINEER_HUMAN", "MODEL_ASSISTANT", "AUTOMATIC"].includes(d.reviewerKind)) p.push("reviewerKind is invalid");
  if (!["VALID", "MISSPELLED", "UNKNOWN"].includes(d.verdict)) p.push("verdict is invalid");
  if (d.verdict !== "MISSPELLED" && d.suggestion) p.push("a suggestion is only allowed with verdict MISSPELLED");
  if (!d.at || Number.isNaN(Date.parse(d.at))) p.push("at must be an ISO date-time");
  // an assistant must never present itself as a human reviewer
  if (d.reviewerKind === "MODEL_ASSISTANT" && /^(native|human|reviewer)/i.test(d.reviewerId)) p.push("a model reviewer id must not look like a human id");
  return p;
}

export function validateItem(item: unknown): string[] {
  const p: string[] = [];
  const i = item as Partial<SpellReviewItem> | null;
  if (!i || typeof i !== "object") return ["item is not an object"];
  if (i.schema !== REVIEW_SCHEMA) p.push(`schema must be ${REVIEW_SCHEMA}`);
  if (!i.id) p.push("id is required");
  if (!i.token) p.push("token is required");
  if (!i.datasetVersion) p.push("datasetVersion is required");
  if (!i.category || !REVIEW_CATEGORIES.includes(i.category)) p.push("category is invalid");
  if (!i.source) p.push("source is required");
  if (!i.provenance) p.push("provenance is required");
  if (i.sentence && (!i.sentenceOrigin || i.sentenceOrigin === "NONE")) p.push("a sentence needs a sentenceOrigin");
  if (i.sentence && !i.sentence.includes(i.token ?? "\u0000")) p.push("the sentence must contain the token");
  if (!Array.isArray(i.decisions)) p.push("decisions must be an array");
  else {
    const seqs = new Set<number>();
    for (const d of i.decisions) {
      p.push(...validateDecision(d).map((x) => `decision ${d.seq}: ${x}`));
      if (seqs.has(d.seq)) p.push(`duplicate decision seq ${d.seq}`);
      seqs.add(d.seq);
    }
  }
  return p;
}

/** Counts by honest status (the numbers a report may quote). */
export function summarize(items: readonly SpellReviewItem[]): Record<ReviewStatus, number> & { total: number } {
  const out: Record<string, number> = { NATIVE_REVIEWED: 0, NATIVE_PENDING: 0, DISPUTED: 0, ENGINEER_REVIEWED: 0, MODEL_ADJUDICATED: 0, AUTO_GENERATED: 0, UNREVIEWED: 0, total: items.length };
  for (const it of items) out[itemState(it).status] += 1;
  return out as Record<ReviewStatus, number> & { total: number };
}

/**
 * Review queue: items still needing native review, most valuable first. Priority is the stored `priority` (frequency / risk), ties by id.
 * An item leaves the queue only when two natives have agreed (NATIVE_REVIEWED); DISPUTED items stay (they need a third native).
 */
export function reviewQueue(items: readonly SpellReviewItem[], opts: { category?: ReviewCategory; limit?: number } = {}): SpellReviewItem[] {
  return items
    .filter((i) => (!opts.category || i.category === opts.category) && itemState(i).status !== "NATIVE_REVIEWED")
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id))
    .slice(0, opts.limit ?? Infinity);
}

/** A gold record is ONLY a NATIVE_REVIEWED item. Everything else is provisional and must be labelled so. */
export const isNativeGold = (i: Pick<SpellReviewItem, "id" | "decisions">): boolean => itemState(i).status === "NATIVE_REVIEWED";

/** Tab-separated export for a reviewer's spreadsheet. The reviewer fills `decision` (VALID|MISSPELLED|UNKNOWN), `correction`, `note`. */
export const EXPORT_COLUMNS = ["id", "category", "token", "sentence", "engineVerdict", "engineSuggestion", "engineReason", "proposedVerdict", "proposedSuggestion", "decision", "correction", "note"] as const;
export function exportQueueTsv(items: readonly SpellReviewItem[], opts: { includeLocalCorpusSentences?: boolean } = {}): string {
  const esc = (s: string | undefined) => (s ?? "").replace(/[\t\r\n]+/g, " ");
  const rows = items.map((i) => [i.id, i.category, i.token, i.sentenceOrigin === "LOCAL_CORPUS_D" && !opts.includeLocalCorpusSentences ? "" : i.sentence, i.currentVerdict, i.currentSuggestion, i.currentReason, i.proposedVerdict, i.proposedSuggestion, "", "", ""].map((x) => esc(x as string | undefined)).join("\t"));
  return [EXPORT_COLUMNS.join("\t"), ...rows].join("\n") + "\n";
}

export type ImportResult = { applied: number; skipped: { line: number; reason: string }[]; items: SpellReviewItem[] };

/**
 * Import a reviewer's filled TSV (columns of EXPORT_COLUMNS). Rows with an empty `decision` are skipped; unknown ids and invalid
 * decisions are reported, never guessed. The reviewer identity and KIND are supplied by the CALLER (a file cannot promote itself to native).
 */
export function importDecisionsTsv(items: readonly SpellReviewItem[], tsv: string, reviewer: { id: string; kind: ReviewerKind }, at: string): ImportResult {
  const lines = tsv.split(/\r?\n/).filter((l) => l.length > 0);
  const header = (lines.shift() ?? "").split("\t");
  const col = (n: string) => header.indexOf(n);
  const byId = new Map(items.map((i) => [i.id, i] as const));
  const skipped: ImportResult["skipped"] = [];
  let applied = 0;
  lines.forEach((l, n) => {
    const f = l.split("\t");
    const id = f[col("id")] ?? "";
    const decision = (f[col("decision")] ?? "").trim().toUpperCase();
    if (!decision) return;
    const item = byId.get(id);
    if (!item) return void skipped.push({ line: n + 2, reason: `unknown id ${id}` });
    if (!["VALID", "MISSPELLED", "UNKNOWN"].includes(decision)) return void skipped.push({ line: n + 2, reason: `invalid decision "${decision}"` });
    const correction = (f[col("correction")] ?? "").trim();
    try {
      byId.set(id, appendDecision(item, { reviewerId: reviewer.id, reviewerKind: reviewer.kind, verdict: decision as Verdict, suggestion: decision === "MISSPELLED" && correction ? correction : undefined, note: (f[col("note")] ?? "").trim() || undefined, at }));
      applied += 1;
    } catch (e) {
      skipped.push({ line: n + 2, reason: (e as Error).message });
    }
  });
  return { applied, skipped, items: [...byId.values()] };
}
