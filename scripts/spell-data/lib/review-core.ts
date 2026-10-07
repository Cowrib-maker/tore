/**
 * Human-review consensus rules (pure, tested). The point of this module is what it REFUSES to do:
 *   • an AI judgment is never gold (status AI_ONLY);
 *   • one human is never enough (PENDING);
 *   • two humans who disagree are DISPUTED — the disagreement is kept, never resolved silently;
 *   • NATIVE_REVIEWED needs at least two DISTINCT native-speaker reviewers who agree.
 */
export type ReviewVerdict = "VALID" | "MISSPELLED" | "UNKNOWN";
export type ReviewerKind = "HUMAN_NATIVE" | "HUMAN_OTHER" | "AI_ASSISTANT";

export type ReviewRow = {
  id: string;
  reviewer: string;
  reviewerKind: ReviewerKind;
  verdict: ReviewVerdict;
  /** Best suggestion, when the verdict is MISSPELLED and a fix exists. */
  best?: string;
  /** Suggestions the engine offered that the reviewer marked wrong. */
  wrong?: string[];
  notes?: string;
  date: string;
};

export type ConsensusStatus = "NATIVE_REVIEWED" | "AGREED_NON_NATIVE" | "AI_ONLY" | "DISPUTED" | "PENDING";

export type Consensus = {
  id: string;
  status: ConsensusStatus;
  verdict?: ReviewVerdict;
  best?: string;
  reviewers: { reviewer: string; kind: ReviewerKind; verdict: ReviewVerdict; best?: string }[];
};

export function consensus(id: string, rows: readonly ReviewRow[]): Consensus {
  // latest row per reviewer wins (a reviewer may correct themselves)
  const latest = new Map<string, ReviewRow>();
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) latest.set(r.reviewer, r);
  const list = [...latest.values()];
  const reviewers = list.map((r) => ({ reviewer: r.reviewer, kind: r.reviewerKind, verdict: r.verdict, best: r.best }));
  const humans = list.filter((r) => r.reviewerKind !== "AI_ASSISTANT");
  if (humans.length === 0) return { id, status: list.length > 0 ? "AI_ONLY" : "PENDING", reviewers };
  if (humans.length < 2) return { id, status: "PENDING", reviewers };
  const v = humans[0]!.verdict;
  const same = humans.every((h) => h.verdict === v && (v !== "MISSPELLED" || (h.best ?? "") === (humans[0]!.best ?? "")));
  if (!same) return { id, status: "DISPUTED", reviewers };
  const natives = new Set(humans.filter((h) => h.reviewerKind === "HUMAN_NATIVE").map((h) => h.reviewer));
  return { id, status: natives.size >= 2 ? "NATIVE_REVIEWED" : "AGREED_NON_NATIVE", verdict: v, best: humans[0]!.best, reviewers };
}

export type ReviewItem = { id: string; token: string; context: string; source: string; reason: string };
export type GoldRecord = {
  id: string;
  token: string;
  expectedVerdict: ReviewVerdict;
  expectedSuggestion?: string;
  source: string;
  reason: string;
  reviewers: string[];
  reviewStatus: ConsensusStatus;
  date: string;
};

/** Gold = ONLY consensus that two humans agreed on. Native status is carried, never upgraded. */
export function buildGold(items: readonly ReviewItem[], consensuses: readonly Consensus[], date: string): { valid: GoldRecord[]; invalid: GoldRecord[]; unknown: GoldRecord[]; suggestions: GoldRecord[]; disputed: string[]; excluded: { pending: number; aiOnly: number } } {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out = { valid: [] as GoldRecord[], invalid: [] as GoldRecord[], unknown: [] as GoldRecord[], suggestions: [] as GoldRecord[], disputed: [] as string[], excluded: { pending: 0, aiOnly: 0 } };
  for (const c of consensuses) {
    const it = byId.get(c.id);
    if (!it) continue;
    if (c.status === "DISPUTED") out.disputed.push(c.id);
    else if (c.status === "PENDING") out.excluded.pending += 1;
    else if (c.status === "AI_ONLY") out.excluded.aiOnly += 1;
    else {
      const rec: GoldRecord = { id: c.id, token: it.token, expectedVerdict: c.verdict!, expectedSuggestion: c.best, source: it.source, reason: it.reason, reviewers: c.reviewers.map((r) => `${r.reviewer}:${r.kind}`), reviewStatus: c.status, date };
      (c.verdict === "VALID" ? out.valid : c.verdict === "MISSPELLED" ? out.invalid : out.unknown).push(rec);
      if (c.verdict === "MISSPELLED" && c.best) out.suggestions.push(rec);
    }
  }
  return out;
}
