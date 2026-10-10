import { createHash } from "node:crypto";

/**
 * TORE Spell user feedback (domain). Feedback is a REAL-WORLD SIGNAL from a licensed user. It is not linguistic authority:
 *   user feedback → PENDING → engineer review → (NEEDS_NATIVE_REVIEW) → ACCEPTED / REJECTED / DUPLICATE
 * Nothing in this module (or any feedback use case) writes to the language engine, a lexicon pack, a review gold set, or a data tier.
 * ACCEPTED means «a valid report that deserves action»; acting on it is a separate, reviewed, tested change to language data.
 */
export const SPELL_FEEDBACK_TYPES = ["WRONG_CORRECTION", "MISSING_ERROR", "WRONG_SUGGESTION", "MISSING_WORD", "GENERAL"] as const;
export type SpellFeedbackType = (typeof SPELL_FEEDBACK_TYPES)[number];

export const SPELL_FEEDBACK_STATUSES = ["PENDING", "ACCEPTED", "REJECTED", "NEEDS_NATIVE_REVIEW", "DUPLICATE"] as const;
export type SpellFeedbackStatus = (typeof SPELL_FEEDBACK_STATUSES)[number];

/** What a reviewer may decide. A submitter has NO way to choose a status: `create` always starts at PENDING. */
export const SPELL_FEEDBACK_DECISIONS = ["ACCEPT", "REJECT", "DUPLICATE", "NEEDS_NATIVE_REVIEW"] as const;
export type SpellFeedbackDecision = (typeof SPELL_FEEDBACK_DECISIONS)[number];
export const DECISION_STATUS: Readonly<Record<SpellFeedbackDecision, SpellFeedbackStatus>> = {
  ACCEPT: "ACCEPTED",
  REJECT: "REJECTED",
  DUPLICATE: "DUPLICATE",
  NEEDS_NATIVE_REVIEW: "NEEDS_NATIVE_REVIEW",
};

/** Statuses a group review may still change. ACCEPTED / REJECTED / DUPLICATE rows are final (no silent rewriting). */
export const REVIEWABLE_STATUSES: readonly SpellFeedbackStatus[] = ["PENDING", "NEEDS_NATIVE_REVIEW"];

export type SpellFeedback = {
  id: string;
  /** Owner of the licence activation the report came from. Reports are only accepted from an ACTIVE activation. */
  userId: string;
  feedbackType: SpellFeedbackType;
  /** The single word the report is about (empty for GENERAL). Never a sentence. */
  token: string;
  engineSuggestion: string | null;
  userSuggestion: string | null;
  /** Optional short note (≤ 200 characters). */
  comment: string | null;
  reasonCode: string | null;
  engineVersion: string;
  dataVersion: string;
  /** Identical reports share a key; see `feedbackGroupKey`. */
  groupKey: string;
  status: SpellFeedbackStatus;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  reviewReason: string | null;
};

export type FeedbackInput = {
  feedbackType: SpellFeedbackType;
  token?: string;
  engineSuggestion?: string | null;
  userSuggestion?: string | null;
  comment?: string | null;
  reasonCode?: string | null;
  engineVersion: string;
  dataVersion: string;
};

export const WORD_RE = /^[\p{L}\p{M}'’-]{1,40}$/u;
export const MAX_COMMENT = 200;
/** Per-user cap: a spam brake, not a quota for honest users. */
export const MAX_FEEDBACK_PER_USER_PER_DAY = 50;

export class FeedbackValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`invalid feedback: ${problems.join("; ")}`);
    this.name = "FeedbackValidationError";
  }
}

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFC").trim().toLowerCase();
const clean = (s: string | null | undefined) => (s ?? "").normalize("NFC").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();

/** Validate and normalise a report. Returns exactly the fields we store; unknown input never gets through. */
export function normalizeFeedback(input: FeedbackInput): Omit<SpellFeedback, "id" | "userId" | "groupKey" | "status" | "createdAt" | "reviewedAt" | "reviewedBy" | "reviewReason"> {
  const p: string[] = [];
  if (!SPELL_FEEDBACK_TYPES.includes(input.feedbackType)) p.push("feedbackType is invalid");
  const token = clean(input.token);
  const engineSuggestion = clean(input.engineSuggestion) || null;
  const userSuggestion = clean(input.userSuggestion) || null;
  const comment = clean(input.comment).slice(0, MAX_COMMENT) || null;
  const needsToken = input.feedbackType !== "GENERAL";
  if (needsToken && !WORD_RE.test(token)) p.push("token must be a single word (never a sentence)");
  if (!needsToken && token) p.push("general feedback carries no token");
  if (engineSuggestion && !WORD_RE.test(engineSuggestion) && engineSuggestion !== "(устгах)") p.push("engineSuggestion must be a single word");
  if (userSuggestion && !WORD_RE.test(userSuggestion)) p.push("userSuggestion must be a single word");
  if (input.feedbackType === "MISSING_ERROR" && !userSuggestion) p.push("a missing-error report needs the correct form");
  if (input.feedbackType === "GENERAL" && !comment) p.push("general feedback needs a comment");
  if (!input.engineVersion || input.engineVersion.length > 40) p.push("engineVersion is required");
  if (!input.dataVersion || input.dataVersion.length > 200) p.push("dataVersion is required");
  if (input.reasonCode && !/^[A-Z0-9_]{1,40}$/.test(input.reasonCode)) p.push("reasonCode is invalid");
  if (p.length) throw new FeedbackValidationError(p);
  return {
    feedbackType: input.feedbackType,
    token,
    engineSuggestion,
    userSuggestion,
    comment,
    reasonCode: input.reasonCode ?? null,
    engineVersion: input.engineVersion,
    dataVersion: input.dataVersion,
  };
}

/** Identical reports (same kind, word, engine suggestion, user suggestion) share a key — so 20 users are ONE issue, not 20 rules. */
export function feedbackGroupKey(f: Pick<SpellFeedback, "feedbackType" | "token" | "engineSuggestion" | "userSuggestion" | "comment">): string {
  const parts = [f.feedbackType, norm(f.token), norm(f.engineSuggestion), norm(f.userSuggestion), f.feedbackType === "GENERAL" ? norm(f.comment) : ""];
  return createHash("sha256").update(parts.join("\u0001"), "utf8").digest("hex").slice(0, 32);
}

export type FeedbackGroup = {
  groupKey: string;
  feedbackType: SpellFeedbackType;
  token: string;
  engineSuggestion: string | null;
  userSuggestion: string | null;
  reasonCode: string | null;
  /** DISTINCT users who reported it — a real count: one user repeating a report counts once. */
  distinctUsers: number;
  reports: number;
  /** Status of each report row, counted. */
  statuses: Partial<Record<SpellFeedbackStatus, number>>;
  engineVersions: string[];
  dataVersions: string[];
  firstReportedAt: Date;
  lastReportedAt: Date;
  /** A few distinct comments (only the text users chose to write). */
  comments: string[];
  reviewReason: string | null;
};

export function groupFeedback(rows: readonly SpellFeedback[]): FeedbackGroup[] {
  const byKey = new Map<string, SpellFeedback[]>();
  for (const r of rows) (byKey.get(r.groupKey) ?? byKey.set(r.groupKey, []).get(r.groupKey)!).push(r);
  const out: FeedbackGroup[] = [];
  for (const [groupKey, list] of byKey) {
    const first = list[0]!;
    const statuses: FeedbackGroup["statuses"] = {};
    for (const r of list) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
    const times = list.map((r) => r.createdAt.getTime());
    out.push({
      groupKey,
      feedbackType: first.feedbackType,
      token: first.token,
      engineSuggestion: first.engineSuggestion,
      userSuggestion: first.userSuggestion,
      reasonCode: first.reasonCode,
      distinctUsers: new Set(list.map((r) => r.userId)).size,
      reports: list.length,
      statuses,
      engineVersions: [...new Set(list.map((r) => r.engineVersion))].sort(),
      dataVersions: [...new Set(list.map((r) => r.dataVersion))].sort(),
      firstReportedAt: new Date(Math.min(...times)),
      lastReportedAt: new Date(Math.max(...times)),
      comments: [...new Set(list.map((r) => r.comment).filter((c): c is string => !!c))].slice(0, 5),
      reviewReason: list.find((r) => r.reviewReason)?.reviewReason ?? null,
    });
  }
  // Most independent reporters first, then newest; deterministic tie-break on the key.
  return out.sort((a, b) => b.distinctUsers - a.distinctUsers || b.lastReportedAt.getTime() - a.lastReportedAt.getTime() || (a.groupKey < b.groupKey ? -1 : 1));
}

export type ContributionStats = {
  /** Distinct reports the user has made (the same report repeated counts once). Informational: NOT credit. */
  submitted: number;
  /** Distinct reports a reviewer ACCEPTED. The only number that counts as a contribution. */
  accepted: number;
  rejected: number;
  pending: number;
};

export function contributionStats(rows: readonly SpellFeedback[]): ContributionStats {
  const by = new Map<string, Set<SpellFeedbackStatus>>();
  for (const r of rows) (by.get(r.groupKey) ?? by.set(r.groupKey, new Set()).get(r.groupKey)!).add(r.status);
  let accepted = 0;
  let rejected = 0;
  let pending = 0;
  for (const s of by.values()) {
    if (s.has("ACCEPTED")) accepted += 1;
    else if (s.has("REJECTED") || s.has("DUPLICATE")) rejected += s.has("REJECTED") ? 1 : 0;
    else pending += 1;
  }
  return { submitted: by.size, accepted, rejected, pending };
}
